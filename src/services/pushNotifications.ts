/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/integrations/supabase/client';
import { isCapacitorNative } from '@/utils/mobileUtils';
import { navigateTo, isNavigationReady } from '@/utils/navigationHandler';
import { PushNotifications } from '@capacitor/push-notifications';

// Types for push notifications
interface Token {
  value: string;
}

interface PushNotificationSchema {
  id: string;
  title: string;
  body: string;
  data: Record<string, any>;
}

interface ActionPerformed {
  actionId: string;
  notification: PushNotificationSchema;
}

interface DeviceToken {
  token: string;
  platform: 'android' | 'ios';
  user_id: string;
}

export class PushNotificationService {
  private static instance: PushNotificationService;
  private initialized = false;
  private lastError: string | null = null;
  private debugLogs: string[] = [];

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString().slice(11, 19);
    const logEntry = `[${timestamp}] ${message}`;
    // Silent logging - only store for debug info
    this.debugLogs.push(logEntry);
    // Keep only last 50 logs
    if (this.debugLogs.length > 50) this.debugLogs.shift();
  }

  getDebugInfo(): { logs: string[]; lastError: string | null; initialized: boolean; isNative: boolean } {
    return {
      logs: [...this.debugLogs],
      lastError: this.lastError,
      initialized: this.initialized,
      isNative: isCapacitorNative()
    };
  }

  async initialize(): Promise<{ success: boolean; error?: string }> {
    this.lastError = null;
    
    if (!isCapacitorNative()) {
      const msg = 'Not on native platform';
      this.log(msg);
      return { success: false, error: msg };
    }

    if (this.initialized) {
      this.log('Already initialized');
      return { success: true };
    }

    // Check if user is authenticated before proceeding
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const msg = 'No authenticated user';
      this.log(msg);
      this.lastError = msg;
      return { success: false, error: msg };
    }

    try {
      this.log('Starting initialization for user: ' + user.id);
      
      // Request permission
      this.log('Requesting permissions...');
      const permission = await PushNotifications.requestPermissions();
      this.log('Permission result: ' + JSON.stringify(permission));
      
      if (permission.receive !== 'granted') {
        const msg = 'Permissions not granted: ' + permission.receive;
        this.log(msg);
        this.lastError = msg;
        return { success: false, error: msg };
      }

      this.log('Permissions granted, setting up listeners...');

      // Set up listeners FIRST (before register triggers the token event)
      this.setupListeners();

      // THEN register for push notifications (this triggers APNS to send the token)
      this.log('Calling register()...');
      await PushNotifications.register();
      this.log('Register called, waiting for token callback...');
      
      this.initialized = true;
      this.log('Initialization complete');
      return { success: true };
    } catch (error) {
      const msg = 'Error: ' + (error instanceof Error ? error.message : String(error));
      this.log(msg);
      this.lastError = msg;
      this.initialized = false;
      return { success: false, error: msg };
    }
  }

  private setupListeners(): void {
    this.log('Setting up event listeners...');

    // Called when registration completes
    PushNotifications.addListener('registration', async (token: Token) => {
      this.log('TOKEN RECEIVED: ' + token.value.substring(0, 20) + '...');
      await this.saveDeviceToken(token.value);
    });

    // Called when registration fails
    PushNotifications.addListener('registrationError', (error: any) => {
      const msg = 'Registration error: ' + JSON.stringify(error);
      this.log(msg);
      this.lastError = msg;
    });

    // Called when device receives a push notification
    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        this.log('Notification received: ' + notification.title);
        this.handleNotificationReceived(notification);
      },
    );

    // Called when user taps on a notification
    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (notification: ActionPerformed) => {
        this.log('Notification tapped: ' + notification.notification.title);
        this.handleNotificationAction(notification);
      },
    );
    
    this.log('All listeners set up');
  }

  private async saveDeviceToken(token: string): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        this.log('ERROR: No user when saving token');
        this.lastError = 'No authenticated user for token save';
        return;
      }

      const platform = this.getPlatform();
      this.log(`Saving token for ${platform}, user: ${user.id.substring(0, 8)}...`);
      
      // Simple direct database insert
      const { error } = await supabase
        .from('device_tokens' as any)
        .upsert({
          token,
          platform,
          user_id: user.id,
          is_active: true
        }, {
          onConflict: 'token,user_id'
        });

      if (error) {
        const msg = 'DB error: ' + error.message;
        this.log(msg);
        this.lastError = msg;
      } else {
        this.log('TOKEN SAVED SUCCESSFULLY');
        await this.enablePushNotifications();
      }
    } catch (error) {
      const msg = 'Save error: ' + (error instanceof Error ? error.message : String(error));
      this.log(msg);
      this.lastError = msg;
    }
  }

  private async enablePushNotifications(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        this.log('Enabling push notifications in profile for user: ' + user.id);
        
        // Call the database function to enable push notifications
        const { error } = await supabase.rpc('enable_push_notifications', { 
          p_user_id: user.id 
        });
        
        if (error) {
          const msg = 'Error enabling push in DB: ' + error.message;
          this.log(msg);
          this.lastError = msg;
        } else {
          this.log('Push enabled in profile successfully');
        }
      }
    } catch (error) {
      const msg = 'Error enabling push: ' + (error instanceof Error ? error.message : String(error));
      this.log(msg);
      this.lastError = msg;
    }
  }

  private getPlatform(): 'android' | 'ios' {
    // Detect platform based on user agent or Capacitor platform
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.includes('android') ? 'android' : 'ios';
  }

  private handleNotificationReceived(notification: PushNotificationSchema): void {
    // Handle notification received while app is in foreground
    // Silent - no console logging
  }

  private handleNotificationAction(notification: ActionPerformed): void {
    // Handle notification tap/action - silent
    const data = notification.notification.data;
    
    const performNavigation = (path: string) => {
      const attemptNavigation = (retries = 5) => {
        setTimeout(() => {
          if (isNavigationReady()) {
            navigateTo(path);
          } else if (retries > 0) {
            attemptNavigation(retries - 1);
          } else {
            // Fallback to window.location if React navigation never becomes ready
            window.location.href = path;
          }
        }, 200);
      };
      attemptNavigation();
    };
    
    if (data?.page) {
      // Use page from notification data
      performNavigation(`/${data.page}`);
    } else if (data?.type === 'post_reminder') {
      performNavigation('/dashboard');
    } else if (data?.type === 'streak_reminder') {
      performNavigation('/profile');
    } else {
      // Default to dashboard
      performNavigation('/dashboard');
    }
  }

  async disablePushNotifications(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      // Deactivate device tokens
      await supabase
        .from('device_tokens' as any)
        .update({ is_active: false })
        .eq('user_id', user.id);

      // Reset initialization flag to allow re-initialization
      this.initialized = false;
    } catch (error) {
      // Silent error handling
    }
  }

  async getRegistrationStatus(): Promise<boolean> {
    if (!isCapacitorNative()) return false;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Push enabled functionality removed - using database function instead
      const { data, error } = await supabase.rpc('get_push_registration_status', { 
        p_user_id: user.id 
      });
      
      if (error) {
        return false;
      }
      
      return data || false;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const pushNotificationService = PushNotificationService.getInstance();