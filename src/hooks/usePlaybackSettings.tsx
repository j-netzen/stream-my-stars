import { useState, useEffect, useCallback } from 'react';

export interface PlaybackSettings {
  // Buffer settings
  bufferAhead: number; // seconds to buffer ahead (5-60)
  autoQualityDowngrade: boolean; // auto switch to lower quality on slow connection
  
  // Playback
  limitFps30: boolean; // optional 30 fps limit for slower devices
  
  // Network detection
  connectionSpeedMbps: number | null; // detected connection speed
  isSlowConnection: boolean;
}

const DEFAULT_SETTINGS: PlaybackSettings = {
  bufferAhead: 30,
  autoQualityDowngrade: true,
  limitFps30: false,
  connectionSpeedMbps: null,
  isSlowConnection: false,
};

const STORAGE_KEY = 'playback-settings';

export function usePlaybackSettings() {
  const [settings, setSettings] = useState<PlaybackSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Failed to load playback settings:', e);
    }
    return DEFAULT_SETTINGS;
  });

  // Detect connection speed on mount
  useEffect(() => {
    const connection = (navigator as any).connection;
    
    const updateConnectionInfo = () => {
      if (connection) {
        const speedMbps = connection.downlink || null;
        const isSlowConnection = speedMbps !== null && speedMbps < 5; // Less than 5 Mbps considered slow
        
        setSettings(prev => ({
          ...prev,
          connectionSpeedMbps: speedMbps,
          isSlowConnection,
        }));
      }
    };

    updateConnectionInfo();
    
    if (connection) {
      connection.addEventListener('change', updateConnectionInfo);
      return () => connection.removeEventListener('change', updateConnectionInfo);
    }
  }, []);

  // Persist settings to localStorage
  useEffect(() => {
    try {
      const { connectionSpeedMbps, isSlowConnection, ...persistable } = settings;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
    } catch (e) {
      console.warn('Failed to save playback settings:', e);
    }
  }, [settings]);

  const updateSetting = useCallback(<K extends keyof PlaybackSettings>(
    key: K,
    value: PlaybackSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  // Measure actual connection speed by downloading a test file
  const measureConnectionSpeed = useCallback(async (): Promise<number | null> => {
    try {
      // Use a reliable CDN file for speed test (Cloudflare's 1MB test file)
      const testUrl = 'https://speed.cloudflare.com/__down?bytes=500000';
      const startTime = performance.now();
      
      const response = await fetch(testUrl, { 
        cache: 'no-store',
        mode: 'cors',
      });
      
      if (!response.ok) {
        throw new Error('Speed test failed');
      }
      
      const blob = await response.blob();
      
      const endTime = performance.now();
      const durationSeconds = (endTime - startTime) / 1000;
      const fileSizeBytes = blob.size;
      const speedMbps = (fileSizeBytes * 8) / (durationSeconds * 1000000);
      
      setSettings(prev => ({
        ...prev,
        connectionSpeedMbps: speedMbps,
        isSlowConnection: speedMbps < 5,
      }));
      
      return speedMbps;
    } catch (e) {
      console.warn('Failed to measure connection speed:', e);
      
      // Fallback: use Navigator.connection API if available
      const connection = (navigator as any).connection;
      if (connection?.downlink) {
        const speedMbps = connection.downlink;
        setSettings(prev => ({
          ...prev,
          connectionSpeedMbps: speedMbps,
          isSlowConnection: speedMbps < 5,
        }));
        return speedMbps;
      }
      
      return null;
    }
  }, []);

  return {
    settings,
    updateSetting,
    resetSettings,
    measureConnectionSpeed,
  };
}

export default usePlaybackSettings;
