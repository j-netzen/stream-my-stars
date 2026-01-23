import { useState, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import VLCPlayer from '@/plugins/VLCPlayerPlugin';
import type { VLCPlayerOptions, VLCPlayerResult } from '@/plugins/VLCPlayerPlugin';

// File extensions that require native player for proper codec support
const NATIVE_REQUIRED_EXTENSIONS = ['mkv', 'avi', 'wmv', 'flv', 'ts', 'mts', 'm2ts'];

// Audio codecs that browsers typically don't support
const NATIVE_PREFERRED_PATTERNS = ['dts', 'truehd', 'atmos', 'eac3', 'ac3'];

export interface UseNativePlayerResult {
  isNativePlatform: boolean;
  isVLCAvailable: boolean;
  shouldUseNativePlayer: (url: string) => boolean;
  playWithVLC: (options: VLCPlayerOptions) => Promise<VLCPlayerResult | null>;
  getCompatibilityWarning: (url: string) => string | null;
}

/**
 * Hook to manage native VLC player integration for Capacitor apps
 * Handles platform detection, codec compatibility, and player selection
 */
export function useNativePlayer(): UseNativePlayerResult {
  const [isVLCAvailable, setIsVLCAvailable] = useState(false);
  const isNativePlatform = Capacitor.isNativePlatform();

  // Check VLC availability on mount
  useEffect(() => {
    if (isNativePlatform) {
      VLCPlayer.isAvailable()
        .then(({ available }) => {
          setIsVLCAvailable(available);
          console.log('[useNativePlayer] VLC available:', available);
        })
        .catch((err) => {
          console.warn('[useNativePlayer] VLC check failed:', err);
          setIsVLCAvailable(false);
        });
    }
  }, [isNativePlatform]);

  /**
   * Determine if the native player should be used based on URL/format
   */
  const shouldUseNativePlayer = useCallback((url: string): boolean => {
    if (!isNativePlatform || !isVLCAvailable) {
      return false;
    }

    const lowerUrl = url.toLowerCase();
    
    // Check file extension
    const urlWithoutQuery = lowerUrl.split('?')[0];
    const extension = urlWithoutQuery.split('.').pop() || '';
    
    if (NATIVE_REQUIRED_EXTENSIONS.includes(extension)) {
      return true;
    }

    // Check for codec patterns in URL (often in stream metadata)
    for (const pattern of NATIVE_PREFERRED_PATTERNS) {
      if (lowerUrl.includes(pattern)) {
        return true;
      }
    }

    return false;
  }, [isNativePlatform, isVLCAvailable]);

  /**
   * Play video using the native VLC player
   */
  const playWithVLC = useCallback(async (options: VLCPlayerOptions): Promise<VLCPlayerResult | null> => {
    if (!isNativePlatform) {
      console.warn('[useNativePlayer] Cannot use VLC on non-native platform');
      return null;
    }

    try {
      console.log('[useNativePlayer] Starting VLC playback:', options.url.substring(0, 80));
      const result = await VLCPlayer.playVideo(options);
      console.log('[useNativePlayer] VLC playback ended:', result);
      return result;
    } catch (error) {
      console.error('[useNativePlayer] VLC playback failed:', error);
      throw error;
    }
  }, [isNativePlatform]);

  /**
   * Get compatibility warning message for browser playback
   */
  const getCompatibilityWarning = useCallback((url: string): string | null => {
    if (isNativePlatform) {
      return null; // No warning needed on native
    }

    const lowerUrl = url.toLowerCase();
    const urlWithoutQuery = lowerUrl.split('?')[0];
    const extension = urlWithoutQuery.split('.').pop() || '';

    if (extension === 'mkv') {
      return 'MKV files may have limited browser support. Some codecs like DTS/TrueHD audio may not play.';
    }
    
    if (extension === 'avi') {
      return 'AVI format has limited browser support. Consider using the native app for best compatibility.';
    }

    if (['wmv', 'flv'].includes(extension)) {
      return `${extension.toUpperCase()} format is not supported in browsers. Use the native app for playback.`;
    }

    // Check for problematic audio codecs
    for (const pattern of NATIVE_PREFERRED_PATTERNS) {
      if (lowerUrl.includes(pattern)) {
        return `This stream contains ${pattern.toUpperCase()} audio which may not play in browsers.`;
      }
    }

    return null;
  }, [isNativePlatform]);

  return {
    isNativePlatform,
    isVLCAvailable,
    shouldUseNativePlayer,
    playWithVLC,
    getCompatibilityWarning,
  };
}
