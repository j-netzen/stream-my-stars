import { useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';

export type OrientationType = 'portrait' | 'landscape' | 'any';

export function useScreenOrientation() {
  const isNative = Capacitor.isNativePlatform();
  const lockedRef = useRef(false);

  const lockOrientation = useCallback(async (orientation: OrientationType) => {
    if (!isNative) {
      // For web, try using the Screen Orientation API if available
      try {
        const screen = window.screen as any;
        if (screen.orientation?.lock) {
          if (orientation === 'landscape') {
            await screen.orientation.lock('landscape');
          } else if (orientation === 'portrait') {
            await screen.orientation.lock('portrait');
          }
        }
      } catch (e) {
        console.warn('Screen orientation lock not supported on web:', e);
      }
      return;
    }

    try {
      if (orientation === 'landscape') {
        await ScreenOrientation.lock({ orientation: 'landscape' });
        lockedRef.current = true;
      } else if (orientation === 'portrait') {
        await ScreenOrientation.lock({ orientation: 'portrait' });
        lockedRef.current = true;
      } else {
        await ScreenOrientation.unlock();
        lockedRef.current = false;
      }
    } catch (e) {
      console.warn('Failed to lock orientation:', e);
    }
  }, [isNative]);

  const unlockOrientation = useCallback(async () => {
    if (!isNative) {
      try {
        const screen = window.screen as any;
        if (screen.orientation?.unlock) {
          screen.orientation.unlock();
        }
      } catch (e) {
        console.warn('Screen orientation unlock not supported on web:', e);
      }
      return;
    }

    try {
      await ScreenOrientation.unlock();
      lockedRef.current = false;
    } catch (e) {
      console.warn('Failed to unlock orientation:', e);
    }
  }, [isNative]);

  const getCurrentOrientation = useCallback(async (): Promise<OrientationType> => {
    if (!isNative) {
      const isLandscape = window.matchMedia('(orientation: landscape)').matches;
      return isLandscape ? 'landscape' : 'portrait';
    }

    try {
      const result = await ScreenOrientation.orientation();
      if (result.type.includes('landscape')) {
        return 'landscape';
      } else if (result.type.includes('portrait')) {
        return 'portrait';
      }
    } catch (e) {
      console.warn('Failed to get orientation:', e);
    }
    return 'portrait';
  }, [isNative]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (lockedRef.current) {
        unlockOrientation();
      }
    };
  }, [unlockOrientation]);

  return {
    lockOrientation,
    unlockOrientation,
    getCurrentOrientation,
    isNative,
  };
}

// Hook specifically for video players - auto locks to landscape on mount
export function useVideoPlayerOrientation(enabled: boolean = true) {
  const { lockOrientation, unlockOrientation, isNative } = useScreenOrientation();
  const wasLockedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const lockToLandscape = async () => {
      await lockOrientation('landscape');
      wasLockedRef.current = true;
    };

    lockToLandscape();

    return () => {
      if (wasLockedRef.current) {
        unlockOrientation();
        wasLockedRef.current = false;
      }
    };
  }, [enabled, lockOrientation, unlockOrientation]);

  return { isNative };
}
