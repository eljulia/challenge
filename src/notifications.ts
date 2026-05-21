/* eslint-disable @typescript-eslint/no-explicit-any */
// src/notifications.ts
import { isCapacitorNative } from './utils/mobileUtils';
import { supabase } from '@/integrations/supabase/client';
import { navigateTo, isNavigationReady } from '@/utils/navigationHandler';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';

/**
 * Simple notification system for mobile devices only
 * - Welcome notification on first run
 * - Monday morning reminders between 8-10 AM
 */

const STORAGE_KEY = 'firstRunDone';

async function isFirstRun(): Promise<boolean> {
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  return value !== 'true';
}

async function setFirstRunDone(): Promise<void> {
  await Preferences.set({ key: STORAGE_KEY, value: 'true' });
}

// Predictable notification times - Monday and Thursday at 9:15 AM
const getNotificationHour = (): number => 9;
const getNotificationMinute = (): number => 15;

// iOS-compatible notification scheduling functions
/**
 * Returns `count` FUTURE dates that fall on the given weekday (0=Sun..6=Sat),
 * each between 08:00–10:59 (random minute). Guarantees the first date is not in the past,
 * including "same-day" mornings (e.g., Monday before 11:00).
 */
const nextWeekdayDates = (weekday: number, count = 8): Date[] => {
  const out: Date[] = [];
  const now = new Date();
  const nowHour = now.getHours();
  const weekdayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday];

  console.log(`📅 Calculating next ${count} ${weekdayName}s from now: ${now.toLocaleString()}`);

  // days until target weekday
  const delta = (weekday + 7 - now.getDay()) % 7;

  // Build the first date - reset to midnight first for clean calculation
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (delta === 0) {
    // Today is the target weekday. Check if 9:15 AM has passed
    if (nowHour < 9 || (nowHour === 9 && now.getMinutes() < 15)) {
      // Schedule for 9:15 AM today
      first.setHours(getNotificationHour(), getNotificationMinute(), 0, 0);
      console.log(`📅 Today is ${weekdayName}, scheduling for today at 9:15 AM`);
    } else {
      // It's already past 9:15 AM today → go to next week
      first.setDate(first.getDate() + 7);
      first.setHours(getNotificationHour(), getNotificationMinute(), 0, 0);
      console.log(`📅 Today is ${weekdayName} but past 9:15 AM, scheduling for next week`);
    }
  } else {
    // A future day this week
    first.setDate(first.getDate() + delta);
    first.setHours(getNotificationHour(), getNotificationMinute(), 0, 0);
    console.log(`📅 Next ${weekdayName} is in ${delta} days`);
  }

  // Use getTime() for reliable date cloning on iOS
  const firstTimestamp = first.getTime();
  for (let i = 0; i < count; i++) {
    const d = new Date(firstTimestamp + i * 7 * 24 * 60 * 60 * 1000);
    out.push(d);
    console.log(`  📌 ${weekdayName} ${i + 1}: ${d.toLocaleString()}`);
  }

  return out;
};

// Wire your specific helpers to the generic function:
const getNextMondays = (count: number = 8): Date[] => nextWeekdayDates(1, count); // Monday
const getNextThursdays = (count: number = 8): Date[] => nextWeekdayDates(4, count); // Thursday


const scheduleMondayReminder = async (): Promise<void> => {
  if (!isCapacitorNative()) return;

  try {
    console.log('🔄 Starting Monday reminder scheduling...');
    
    // Cancel existing Monday reminders first
    const pending = await LocalNotifications.getPending();
    const mondayReminders = pending.notifications.filter((n: any) => 
      n.id >= 1001 && n.id <= 1008
    );
    
    if (mondayReminders.length > 0) {
      const ids = mondayReminders.map((n: any) => ({ id: n.id as number }));
      await LocalNotifications.cancel({ notifications: ids });
      console.log('🗑️ Cancelled existing Monday reminders:', ids.length);
    }

    // Schedule multiple Monday notifications (iOS-compatible approach)
    const mondayDates = getNextMondays(8);
    const mondayNotifications = mondayDates.map((date, index) => ({
      title: '📝 Monday Planning Session',
      body: 'Ready to turn news into posts? Pick your top content priorities for the week.',
      id: 1001 + index,
      schedule: { at: date },
      sound: 'default',
      actionTypeId: 'REMINDER',
      extra: {
        action: 'open_app',
        page: 'dashboard',
        type: 'monday_reminder',
        scheduledAt: new Date().toISOString()
      }
    }));

    await LocalNotifications.schedule({
      notifications: mondayNotifications
    });

    console.log(`✅ Scheduled ${mondayNotifications.length} Monday reminders`);

    // VERIFICATION: Confirm notifications were actually scheduled
    const verifyPending = await LocalNotifications.getPending();
    const scheduledMondays = verifyPending.notifications.filter((n: any) => 
      n.id >= 1001 && n.id <= 1008
    );
    
    console.log(`🔍 VERIFICATION: ${scheduledMondays.length} Monday notifications confirmed in system`);
    scheduledMondays.forEach((n: any) => {
      const scheduleTime = n.schedule?.at ? new Date(n.schedule.at) : null;
      console.log(`  ✓ ID ${n.id}: ${scheduleTime?.toLocaleString() || 'unknown time'}`);
    });

    if (scheduledMondays.length !== mondayNotifications.length) {
      console.warn(`⚠️ WARNING: Expected ${mondayNotifications.length} but only ${scheduledMondays.length} confirmed!`);
    }
  } catch (error) {
    console.error('❌ Error scheduling Monday reminder:', error);
  }
};

const scheduleThursdayReminder = async (): Promise<void> => {
  if (!isCapacitorNative()) return;

  try {
    console.log('🔄 Starting Thursday reminder scheduling...');
    
    // Cancel existing Thursday reminders first
    const pending = await LocalNotifications.getPending();
    const thursdayReminders = pending.notifications.filter((n: any) => 
      n.id >= 2001 && n.id <= 2008
    );
    
    if (thursdayReminders.length > 0) {
      const ids = thursdayReminders.map((n: any) => ({ id: n.id as number }));
      await LocalNotifications.cancel({ notifications: ids });
      console.log('🗑️ Cancelled existing Thursday reminders:', ids.length);
    }

    // Schedule multiple Thursday notifications (iOS-compatible approach)
    const thursdayDates = getNextThursdays(8);
    const thursdayNotifications = thursdayDates.map((date, index) => ({
      title: '🚀 Thursday Momentum',
      body: 'Keep your content flowing! Check out fresh insights for engaging posts.',
      id: 2001 + index,
      schedule: { at: date },
      sound: 'default',
      actionTypeId: 'REMINDER',
      extra: {
        action: 'open_app',
        page: 'dashboard',
        type: 'thursday_reminder',
        scheduledAt: new Date().toISOString()
      }
    }));

    await LocalNotifications.schedule({
      notifications: thursdayNotifications
    });

    console.log(`✅ Scheduled ${thursdayNotifications.length} Thursday reminders`);

    // VERIFICATION: Confirm notifications were actually scheduled
    const verifyPending = await LocalNotifications.getPending();
    const scheduledThursdays = verifyPending.notifications.filter((n: any) => 
      n.id >= 2001 && n.id <= 2008
    );
    
    console.log(`🔍 VERIFICATION: ${scheduledThursdays.length} Thursday notifications confirmed in system`);
    scheduledThursdays.forEach((n: any) => {
      const scheduleTime = n.schedule?.at ? new Date(n.schedule.at) : null;
      console.log(`  ✓ ID ${n.id}: ${scheduleTime?.toLocaleString() || 'unknown time'}`);
    });

    if (scheduledThursdays.length !== thursdayNotifications.length) {
      console.warn(`⚠️ WARNING: Expected ${thursdayNotifications.length} but only ${scheduledThursdays.length} confirmed!`);
    }
  } catch (error) {
    console.error('❌ Error scheduling Thursday reminder:', error);
  }
};

/**
 * Check and ensure Monday reminder is scheduled
 */
const ensureMondayReminderExists = async (): Promise<void> => {
  try {
    if (!isCapacitorNative()) {
      return;
    }

    const pending = await LocalNotifications.getPending();
    const mondayCount = pending.notifications.filter((n: any) => 
      n.id >= 1001 && n.id <= 1008
    ).length;
    
    if (mondayCount < 4) {
      console.log(`Low Monday notifications (${mondayCount}), rescheduling`);
      await scheduleMondayReminder();
    } else {
      console.log(`Monday notifications OK (${mondayCount} scheduled)`);
    }
  } catch (error) {
    console.error('Error checking Monday reminder:', error);
  }
};

/**
 * Check and ensure Thursday reminder is scheduled
 */
const ensureThursdayReminderExists = async (): Promise<void> => {
  try {
    if (!isCapacitorNative()) {
      return;
    }

    const pending = await LocalNotifications.getPending();
    const thursdayCount = pending.notifications.filter((n: any) => 
      n.id >= 2001 && n.id <= 2008
    ).length;
    
    if (thursdayCount < 4) {
      console.log(`Low Thursday notifications (${thursdayCount}), rescheduling`);
      await scheduleThursdayReminder();
    } else {
      console.log(`Thursday notifications OK (${thursdayCount} scheduled)`);
    }
  } catch (error) {
    console.error('Error checking Thursday reminder:', error);
  }
};

/**
 * Initialize smart notification system for mobile devices only
 */
export async function initReminders(): Promise<void> {
  try {
    // Only initialize notifications for mobile apps
    if (!isCapacitorNative()) {
      console.log('Skipping notifications for desktop/web');
      return;
    }

    // Enhanced permission handling with better iOS compatibility
    let permission;
    
    try {
      // First check existing permissions
      const existingPermissions = await LocalNotifications.checkPermissions();
      console.log('📱 Checking existing notification permissions:', existingPermissions);
      
      if (existingPermissions.display === 'granted') {
        console.log('✅ Notification permissions already granted');
        permission = existingPermissions;
      } else {
        // Request permissions
        console.log('🔒 Requesting notification permissions...');
        permission = await LocalNotifications.requestPermissions();
        console.log('📋 Permission request result:', permission);
      }
    } catch (permError) {
      console.error('❌ Error handling notification permissions:', permError);
      return;
    }
    
    if (permission.display !== 'granted') {
      console.log('❌ Notification permissions not granted. Status:', permission.display);
      
      // Enhanced feedback for different permission states
      switch (permission.display) {
        case 'denied':
          console.log('🚫 Notification permissions denied by user');
          console.log('💡 To enable: Settings > Notifications > KOL > Allow Notifications');
          break;
        case 'prompt':
        case 'prompt-with-rationale':
          console.log('❓ Notification permissions need to be requested again');
          break;
        default:
          console.log('❔ Unexpected permission status:', permission.display);
      }
      
      // Don't return here - we still want to set up listeners for when permissions are granted
      console.log('⚠️ Continuing setup without notifications until permissions are granted');
      return;
    }

    console.log('Notification permissions granted');

    //REGISTER ACTION TYPES
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'REMINDER',                 // must match actionTypeId used below
          actions: [
            { id: 'OPEN_APP', title: 'Open App', foreground: true }
          ]
        }
      ]
    });
    
    // Check if this is the first run
    const firstRun = await isFirstRun();
    
    if (firstRun) {
      // Schedule welcome notification for mobile
      const welcomeTime = new Date();
      welcomeTime.setSeconds(welcomeTime.getSeconds() + 5);
      
      await LocalNotifications.schedule({
        notifications: [{
          id: 100,
          title: '🎉 Welcome to KOL!',
          body: 'Get ready to elevate your professional content game!',
          schedule: { at: welcomeTime },
          sound: 'default',
          actionTypeId: 'REMINDER',
          extra: {
            action: 'open_app',
            page: 'dashboard',
            type: 'welcome'
          }
        }]
      });
      
      console.log('Welcome notification scheduled');
      await setFirstRunDone();
    }

    // Schedule recurring Monday and Thursday reminders
    await scheduleMondayReminder();
    await scheduleThursdayReminder();
    
    // Set up listeners for debugging and auto-rescheduling
    await LocalNotifications.addListener('localNotificationReceived', async (notification) => {
      console.log('Notification received in foreground:', notification);
      // Check and maintain notification buffer
      await checkAndRescheduleNotifications();
    });

    await LocalNotifications.addListener('localNotificationActionPerformed', async (notificationAction) => {
      console.log('📱 Notification tapped:', notificationAction);
      
      // Handle app navigation based on notification data
      const extra = notificationAction.notification.extra;
      if (extra?.action === 'open_app' && extra?.page) {
        console.log('🚀 Navigating to:', extra.page, 'type:', extra.type);
        
        // Small delay to ensure app is fully active and navigation is ready
        const attemptNavigation = (retries = 5) => {
          setTimeout(() => {
            if (isNavigationReady()) {
              navigateTo(`/${extra.page}`);
            } else if (retries > 0) {
              console.log('⏳ Navigation not ready, retrying...', retries);
              attemptNavigation(retries - 1);
            } else {
              // Fallback to window.location if React navigation never becomes ready
              console.log('⚠️ Using fallback navigation');
              window.location.href = `/${extra.page}`;
            }
          }, 200);
        };
        
        attemptNavigation();
      }
      
      // Check if we need to reschedule more notifications (maintain the 8-week buffer)
      await checkAndRescheduleNotifications();
    });

    // Show current pending notifications for debugging
    setTimeout(async () => {
      await showPendingNotifications();
      await ensureMondayReminderExists();
      await ensureThursdayReminderExists();
    }, 3000);

  } catch (error) {
    console.error('Error initializing reminders:', error);
  }
}

/**
 * Show all pending notifications for debugging
 */
const showPendingNotifications = async (): Promise<void> => {
  try {
    if (!isCapacitorNative()) {
      return;
    }

    const pending = await LocalNotifications.getPending();
    console.log(`📋 Total pending notifications: ${pending.notifications.length}`);
    
    pending.notifications.forEach((notification: any) => {
      const scheduleTime = new Date(notification.schedule?.at);
      const minutesUntil = Math.round((scheduleTime.getTime() - new Date().getTime()) / 1000 / 60);
      console.log(`📌 ID ${notification.id}: "${notification.title}" scheduled for ${scheduleTime.toLocaleString()} (in ${minutesUntil} min)`);
    });
  } catch (error) {
    console.error('Error showing pending notifications:', error);
  }
};

/**
 * Call this when app becomes active to ensure reminders are still scheduled
 */
export async function checkMondayReminder(): Promise<void> {
  await showPendingNotifications();
  await ensureMondayReminderExists();
  await ensureThursdayReminderExists();
}

/**
 * Check and maintain our notification buffer - iOS compatibility function
 */
const checkAndRescheduleNotifications = async (): Promise<void> => {
  if (!isCapacitorNative()) return;

  try {
    const pending = await LocalNotifications.getPending();
    const mondayCount = pending.notifications.filter((n: any) => 
      n.id >= 1001 && n.id <= 1008
    ).length;
    
    const thursdayCount = pending.notifications.filter((n: any) => 
      n.id >= 2001 && n.id <= 2008
    ).length;

    console.log(`📊 Current notifications: ${mondayCount} Mondays, ${thursdayCount} Thursdays`);

    // If we're running low on notifications, reschedule
    if (mondayCount < 4) {
      console.log('🔄 Rescheduling Monday reminders...');
      await scheduleMondayReminder();
    }

    if (thursdayCount < 4) {
      console.log('🔄 Rescheduling Thursday reminders...');
      await scheduleThursdayReminder();
    }
  } catch (error) {
    console.error('❌ Error checking notifications:', error);
  }
};

/**
 * Debug function - call this to see what's currently scheduled
 */
export async function debugNotifications(): Promise<void> {
  await showPendingNotifications();
}

/**
 * Get comprehensive notification debug info - useful for in-app debugging
 */
export async function getNotificationDebugInfo(): Promise<{
  mondayNotifications: Array<{id: number, scheduledFor: string, dayOfWeek: string}>,
  thursdayNotifications: Array<{id: number, scheduledFor: string, dayOfWeek: string}>,
  otherNotifications: Array<{id: number, scheduledFor: string, title: string}>,
  totalPending: number,
  permissionStatus: string,
  currentTime: string,
  timezone: string
}> {
  const result = {
    mondayNotifications: [] as Array<{id: number, scheduledFor: string, dayOfWeek: string}>,
    thursdayNotifications: [] as Array<{id: number, scheduledFor: string, dayOfWeek: string}>,
    otherNotifications: [] as Array<{id: number, scheduledFor: string, title: string}>,
    totalPending: 0,
    permissionStatus: 'unknown',
    currentTime: new Date().toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };

  if (!isCapacitorNative()) {
    result.permissionStatus = 'not_native';
    return result;
  }

  try {
    const permissions = await LocalNotifications.checkPermissions();
    result.permissionStatus = permissions.display;

    const pending = await LocalNotifications.getPending();
    result.totalPending = pending.notifications.length;

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    pending.notifications.forEach((n: any) => {
      const scheduleTime = n.schedule?.at ? new Date(n.schedule.at) : null;
      const dayOfWeek = scheduleTime ? dayNames[scheduleTime.getDay()] : 'unknown';
      
      if (n.id >= 1001 && n.id <= 1008) {
        result.mondayNotifications.push({
          id: n.id,
          scheduledFor: scheduleTime?.toLocaleString() || 'unknown',
          dayOfWeek
        });
      } else if (n.id >= 2001 && n.id <= 2008) {
        result.thursdayNotifications.push({
          id: n.id,
          scheduledFor: scheduleTime?.toLocaleString() || 'unknown',
          dayOfWeek
        });
      } else {
        result.otherNotifications.push({
          id: n.id,
          scheduledFor: scheduleTime?.toLocaleString() || 'unknown',
          title: n.title || 'No title'
        });
      }
    });

    // Sort by date
    result.mondayNotifications.sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
    result.thursdayNotifications.sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

    console.log('📊 Notification Debug Info:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error getting notification debug info:', error);
  }

  return result;
}