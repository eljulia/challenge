/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// DEVELOPMENT-ONLY NOTIFICATION DEBUG UTILITIES
// ============================================================================
// This section is for testing purposes and should be removed in production.
// All debug functionality is encapsulated in the NotificationDebugUtils object
// for easy removal during deployment.
// ============================================================================

import { isCapacitorNative } from './mobileUtils';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Ensure notification permissions are granted, request if needed
 * For iOS, guide user to settings if permissions were denied
 */
async function ensureNotificationPermissions(): Promise<boolean> {
  if (!isCapacitorNative()) {
    console.log('Not on native platform, skipping permissions');
    return false;
  }

  try {
    // Check current permissions first
    const currentPermissions = await LocalNotifications.checkPermissions();
    console.log('📱 Current notification permissions:', currentPermissions);
    
    if (currentPermissions.display === 'granted') {
      console.log('✅ Notification permissions already granted');
      return true;
    }

    // Request permissions if not granted
    console.log('🔒 Requesting notification permissions...');
    const requestResult = await LocalNotifications.requestPermissions();
    console.log('📋 Permission request result:', requestResult);
    
    if (requestResult.display === 'granted') {
      console.log('✅ Notification permissions granted');
      return true;
    } else if (requestResult.display === 'denied') {
      console.log('❌ Notification permissions denied by user');
      console.log('💡 User needs to enable notifications in Settings > Notifications > KOL');
      return false;
    }
    
    console.log('⚠️ Unexpected permission status:', requestResult.display);
    return false;
  } catch (error) {
    console.error('❌ Error checking/requesting notification permissions:', error);
    return false;
  }
}

/**
 * Development utility to send daily test notifications
 * Only works in development/debug mode
 */
async function sendTestNotification(): Promise<void> {
  if (!isCapacitorNative()) {
    console.log('Test notifications only work on mobile devices');
    return;
  }

  // Ensure permissions first
  const hasPermissions = await ensureNotificationPermissions();
  if (!hasPermissions) {
    console.log('❌ Cannot send test notifications without permissions');
    return;
  }

  try {
    // Cancel any existing test notifications first
    await cancelTestNotifications();

    // Schedule daily test notifications for next 7 days
    const notifications = [];
    for (let i = 1; i <= 7; i++) {
      const testTime = new Date();
      testTime.setDate(testTime.getDate() + i);
      testTime.setHours(9, 30, 0, 0); // 9:30 AM each day
      
      notifications.push({
        id: 9990 + i,
        title: '🧪 Daily Test Notification',
        body: 'Daily test notification - Day ' + i,
        schedule: { at: testTime },
        sound: 'default',
        actionTypeId: 'REMINDER',
        extra: {
          action: 'open_app',
          page: 'dashboard',
          type: 'daily_test'
        }
      });
    }

    await LocalNotifications.schedule({ notifications });
    console.log(`✅ Scheduled ${notifications.length} daily test notifications`);
    
    // Show what was scheduled
    notifications.forEach((n, index) => {
      const scheduleTime = new Date(n.schedule.at);
      console.log(`📅 Test ${index + 1}: ${scheduleTime.toLocaleDateString()} at ${scheduleTime.toLocaleTimeString()}`);
    });
  } catch (error) {
    console.error('❌ Failed to send test notifications:', error);
  }
}

/**
 * Cancel all test notifications (ID range 9980-9999)
 */
async function cancelTestNotifications(): Promise<void> {
  if (!isCapacitorNative()) return;
  
  try {
    const pending = await LocalNotifications.getPending();
    const testNotifications = pending.notifications.filter((n: any) => 
      n.id >= 9980 && n.id <= 9999
    );
    
    if (testNotifications.length > 0) {
      const ids = testNotifications.map((n: any) => ({ id: n.id as number }));
      await LocalNotifications.cancel({ notifications: ids });
      console.log(`🗑️ Cancelled ${ids.length} test notifications`);
    }
  } catch (error) {
    console.error('❌ Error cancelling test notifications:', error);
  }
}

/**
 * Schedule a test notification for 1 hour from now
 * Returns the scheduled time for UI display
 */
async function scheduleOneHourTest(): Promise<{ success: boolean; scheduledTime?: Date; error?: string }> {
  console.log('🧪 scheduleOneHourTest called');
  
  const isNative = isCapacitorNative();
  console.log('🧪 isCapacitorNative:', isNative);
  
  if (!isNative) {
    return { success: false, error: `Not native platform. isCapacitorNative()=${isNative}` };
  }

  console.log('🧪 Checking permissions...');
  const hasPermissions = await ensureNotificationPermissions();
  console.log('🧪 Has permissions:', hasPermissions);
  
  if (!hasPermissions) {
    return { success: false, error: 'Notification permissions not granted' };
  }

  try {
    // Cancel any existing 1-hour test notification
    const pending = await LocalNotifications.getPending();
    console.log('🧪 Pending notifications:', pending.notifications.length);
    
    const existingTest = pending.notifications.filter((n: any) => n.id === 9980);
    if (existingTest.length > 0) {
      await LocalNotifications.cancel({ notifications: [{ id: 9980 }] });
    }

    const scheduledTime = new Date();
    scheduledTime.setHours(scheduledTime.getHours() + 1);

    console.log('🧪 Scheduling notification for:', scheduledTime.toISOString());
    
    await LocalNotifications.schedule({
      notifications: [{
        id: 9980,
        title: '🧪 Local Notification Test',
        body: 'This is a test notification scheduled 1 hour ago. Local notifications work!',
        schedule: { at: scheduledTime },
        sound: 'default',
        actionTypeId: 'REMINDER',
        extra: {
          action: 'open_app',
          page: 'dashboard',
          type: 'one_hour_test'
        }
      }]
    });

    console.log(`✅ Test notification scheduled for ${scheduledTime.toLocaleTimeString()}`);
    return { success: true, scheduledTime };
  } catch (error) {
    console.error('❌ Failed to schedule 1-hour test:', error);
    return { success: false, error: `Schedule failed: ${error}` };
  }
}

/**
 * Get info about scheduled notifications for UI display
 */
interface NotificationInfo {
  mondayCount: number;
  thursdayCount: number;
  nextMonday: Date | null;
  nextThursday: Date | null;
  testCount: number;
  nextTest: Date | null;
}

async function getScheduledNotificationsInfo(): Promise<NotificationInfo | null> {
  if (!isCapacitorNative()) return null;

  try {
    const pending = await LocalNotifications.getPending();
    
    const mondayNotifications = pending.notifications.filter((n: any) => n.id >= 1001 && n.id <= 1008);
    const thursdayNotifications = pending.notifications.filter((n: any) => n.id >= 2001 && n.id <= 2008);
    const testNotifications = pending.notifications.filter((n: any) => n.id >= 9980 && n.id <= 9999);

    const getNextTime = (notifications: any[]): Date | null => {
      if (notifications.length === 0) return null;
      const times = notifications
        .map((n: any) => new Date(n.schedule?.at))
        .filter((d: Date) => d.getTime() > Date.now())
        .sort((a: Date, b: Date) => a.getTime() - b.getTime());
      return times.length > 0 ? times[0] : null;
    };

    return {
      mondayCount: mondayNotifications.length,
      thursdayCount: thursdayNotifications.length,
      nextMonday: getNextTime(mondayNotifications),
      nextThursday: getNextTime(thursdayNotifications),
      testCount: testNotifications.length,
      nextTest: getNextTime(testNotifications)
    };
  } catch (error) {
    console.error('❌ Error getting notification info:', error);
    return null;
  }
}

/**
 * Get detailed notification status for debugging
 */
async function getNotificationStatus(): Promise<void> {
  if (!isCapacitorNative()) {
    console.log('Notification status only available on mobile devices');
    return;
  }

  try {
    // Check permissions
    const permissions = await LocalNotifications.checkPermissions();
    console.log('📱 Notification Permissions:', permissions);

    // Get pending notifications
    const pending = await LocalNotifications.getPending();
    console.log(`📋 Pending Notifications: ${pending.notifications.length}`);
    
    // Group by type
    const regularNotifications = pending.notifications.filter((n: any) => n.id < 9980);
    const testNotifications = pending.notifications.filter((n: any) => n.id >= 9980);
    
    console.log(`📊 Regular: ${regularNotifications.length}, Test: ${testNotifications.length}`);
    
    pending.notifications.forEach((notification: any) => {
      const scheduleTime = new Date(notification.schedule?.at);
      const minutesUntil = Math.round((scheduleTime.getTime() - new Date().getTime()) / 1000 / 60);
      const isTest = notification.id >= 9980 ? '🧪' : '📌';
      console.log(`  ${isTest} ID ${notification.id}: "${notification.title}" → ${scheduleTime.toLocaleString()} (${minutesUntil}min)`);
    });

    // Get delivered notifications (recent)
    const delivered = await LocalNotifications.getDeliveredNotifications();
    console.log(`📬 Recently Delivered: ${delivered.notifications.length}`);
    
  } catch (error) {
    console.error('❌ Error checking notification status:', error);
  }
}

// ============================================================================
// NOTIFICATION DEBUG UTILITIES - ENCAPSULATED FOR EASY REMOVAL
// ============================================================================
// Remove this entire object and the section above for production deployment
// ============================================================================

export const NotificationDebugUtils = {
  sendTest: sendTestNotification,
  getStatus: getNotificationStatus,
  cancelTests: cancelTestNotifications,
  checkPermissions: ensureNotificationPermissions,
  scheduleOneHourTest,
  getScheduledNotificationsInfo
};

// Make debug functions available globally in development
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).debugNotifications = NotificationDebugUtils;
  
  console.log('🛠️ Debug utilities available:');
  console.log('  window.debugNotifications.sendTest() - Send daily test notifications');
  console.log('  window.debugNotifications.getStatus() - Check notification status'); 
  console.log('  window.debugNotifications.cancelTests() - Cancel all test notifications');
  console.log('  window.debugNotifications.checkPermissions() - Check/request permissions');
  console.log('  window.debugNotifications.scheduleOneHourTest() - Schedule 1-hour test');
  console.log('  window.debugNotifications.getScheduledNotificationsInfo() - Get scheduled info');
}