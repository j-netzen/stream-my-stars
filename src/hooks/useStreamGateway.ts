import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  GatewayConfig,
  StreamMode,
  getPersistedGatewayConfig,
  persistGatewayConfig,
  rewriteStreamUrl,
  rewriteM3U8Content,
  buildCdnHeaders,
  createGatewayFetch,
  AVAILABLE_REGIONS,
} from '@/lib/streamGateway';

export interface UseStreamGatewayReturn {
  // Config state
  config: GatewayConfig;
  mode: StreamMode;
  isEdgeOptimized: boolean;
  
  // Actions
  setMode: (mode: StreamMode) => void;
  setGatewayUrl: (url: string | undefined) => void;
  setRegion: (region: string | undefined) => void;
  toggleMode: () => void;
  
  // Utilities
  rewriteUrl: (url: string) => string;
  rewriteManifest: (content: string, baseUrl: string) => string;
  getCdnHeaders: () => Record<string, string>;
  gatewayFetch: typeof fetch;
  
  // Available options
  availableRegions: typeof AVAILABLE_REGIONS;
}

export function useStreamGateway(initialGatewayUrl?: string): UseStreamGatewayReturn {
  const [config, setConfig] = useState<GatewayConfig>(() => {
    const persisted = getPersistedGatewayConfig();
    return {
      ...persisted,
      gatewayUrl: initialGatewayUrl || persisted.gatewayUrl,
    };
  });

  // Persist config changes
  useEffect(() => {
    persistGatewayConfig(config);
  }, [config]);

  // Update gateway URL if prop changes
  useEffect(() => {
    if (initialGatewayUrl && initialGatewayUrl !== config.gatewayUrl) {
      setConfig(prev => ({ ...prev, gatewayUrl: initialGatewayUrl }));
    }
  }, [initialGatewayUrl]);

  const setMode = useCallback((mode: StreamMode) => {
    setConfig(prev => ({ ...prev, mode }));
  }, []);

  const setGatewayUrl = useCallback((gatewayUrl: string | undefined) => {
    setConfig(prev => ({ ...prev, gatewayUrl }));
  }, []);

  const setRegion = useCallback((region: string | undefined) => {
    setConfig(prev => ({ ...prev, region }));
  }, []);

  const toggleMode = useCallback(() => {
    setConfig(prev => ({
      ...prev,
      mode: prev.mode === 'direct' ? 'edge-optimized' : 'direct',
    }));
  }, []);

  const rewriteUrl = useCallback((url: string) => {
    return rewriteStreamUrl(url, config);
  }, [config]);

  const rewriteManifest = useCallback((content: string, baseUrl: string) => {
    return rewriteM3U8Content(content, baseUrl, config);
  }, [config]);

  const getCdnHeaders = useCallback(() => {
    return buildCdnHeaders(config);
  }, [config]);

  const gatewayFetch = useMemo(() => {
    return createGatewayFetch(config);
  }, [config]);

  return {
    config,
    mode: config.mode,
    isEdgeOptimized: config.mode === 'edge-optimized',
    setMode,
    setGatewayUrl,
    setRegion,
    toggleMode,
    rewriteUrl,
    rewriteManifest,
    getCdnHeaders,
    gatewayFetch,
    availableRegions: AVAILABLE_REGIONS,
  };
}
