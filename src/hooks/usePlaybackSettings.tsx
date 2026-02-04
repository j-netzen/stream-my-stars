import { useState, useEffect, useCallback } from 'react';

export type ProxyMode = 'none' | 'public' | 'backend';
export type PlayerType = 'simple-hls' | 'minimal';

export interface PlaybackSettings {
  // Player selection
  playerType: PlayerType; // which video player to use
  
  // Stream filtering
  onlyShowCachedStreams: boolean; // hide uncached streams in selection dialog
  
  // Network settings
  useCorsProxy: boolean; // route streams through CORS proxy to bypass restrictions
  useSmartProxy: boolean; // automatically detect when to use backend vs public proxy
  proxyMode: ProxyMode; // which proxy to use: none, public (corsproxy.io), or backend
  
  // Volume settings
  rememberVolume: boolean; // remember volume preference across sessions
  preferUnmuted: boolean; // user prefers unmuted playback (set when they unmute)
  lastVolume: number; // last volume level (0-1)
  
  // Network detection
  connectionSpeedMbps: number | null; // detected connection speed
  isSlowConnection: boolean;
  
  // Legacy settings kept for compatibility
  bufferAhead: number;
  autoQualityDowngrade: boolean;
  limitFps30: boolean;
}

const DEFAULT_SETTINGS: PlaybackSettings = {
  playerType: 'simple-hls',
  onlyShowCachedStreams: false,
  useCorsProxy: true,
  useSmartProxy: true,
  proxyMode: 'public',
  rememberVolume: true,
  preferUnmuted: false,
  lastVolume: 1,
  connectionSpeedMbps: null,
  isSlowConnection: false,
  bufferAhead: 30,
  autoQualityDowngrade: true,
  limitFps30: false,
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
        const isSlowConnection = speedMbps !== null && speedMbps < 5;
        
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

  // Measure actual connection speed with multiple samples for accuracy
  const measureConnectionSpeed = useCallback(async (): Promise<number | null> => {
    try {
      // Use larger file sizes for more accurate measurements
      // Cloudflare supports bytes parameter up to 100MB
      const testSizes = [
        { bytes: 1000000, name: '1MB' },   // Quick warmup
        { bytes: 5000000, name: '5MB' },   // Main test
      ];
      
      let totalBytes = 0;
      let totalTime = 0;
      
      for (const test of testSizes) {
        const testUrl = `https://speed.cloudflare.com/__down?bytes=${test.bytes}`;
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
        
        totalBytes += blob.size;
        totalTime += (endTime - startTime) / 1000;
      }
      
      // Calculate speed: bits / seconds = bps, then convert to Mbps
      const speedMbps = (totalBytes * 8) / (totalTime * 1000000);
      
      console.log(`[Speed Test] Downloaded ${(totalBytes / 1000000).toFixed(2)}MB in ${totalTime.toFixed(2)}s = ${speedMbps.toFixed(1)} Mbps`);
      
      setSettings(prev => ({
        ...prev,
        connectionSpeedMbps: speedMbps,
        isSlowConnection: speedMbps < 5,
      }));
      
      return speedMbps;
    } catch (e) {
      console.warn('Failed to measure connection speed:', e);
      
      // Fallback to Navigator connection API
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
