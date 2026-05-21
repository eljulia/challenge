
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mobile device utilities to help with platform-specific functionality
 */

import { Capacitor } from '@capacitor/core';

export const isMobileApp = (): boolean => {
  return (
    window.matchMedia('(display-mode: standalone)').matches || 
    (window.navigator as any).standalone === true || 
    window.location.href.includes('capacitor://') || 
    isCapacitorNative()
  );
};

export const isCapacitorNative = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * Get the current platform (ios, android, or web)
 * More reliable than just using Capacitor.getPlatform() as it checks multiple indicators
 */
export const getPlatform = (): 'ios' | 'android' | 'web' => {
  // First check if we're in a Capacitor native environment
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios' || platform === 'android') {
      return platform as 'ios' | 'android';
    }
  }
  
  // Check if we're in a mobile app context
  if (isMobileApp()) {
    // Fallback to user agent detection for mobile apps
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    
    if (/android/i.test(userAgent)) {
      return 'android';
    }
    
    // iOS detection
    if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) {
      return 'ios';
    }
  }
  
  return 'web';
};

export const isInStandaloneMode = (): boolean => 
  window.matchMedia('(display-mode: standalone)').matches || 
  (window.navigator as any).standalone === true;

/**
 * Check if we should use native OAuth flow
 */
export const shouldUseNativeAuth = (): boolean => {
  return isCapacitorNative() || isMobileApp();
};
