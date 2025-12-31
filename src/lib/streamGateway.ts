/**
 * Stream Gateway Utilities
 * Provides dynamic gateway routing, request interception, and M3U8 link rewriting
 */

export type StreamMode = 'direct' | 'edge-optimized';

export interface GatewayConfig {
  gatewayUrl?: string;
  mode: StreamMode;
  region?: string;
  customHeaders?: Record<string, string>;
}

const STORAGE_KEY = 'stream_gateway_config';

/**
 * Get persisted gateway configuration from localStorage
 */
export function getPersistedGatewayConfig(): GatewayConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load gateway config from localStorage');
  }
  return { mode: 'direct' };
}

/**
 * Save gateway configuration to localStorage
 */
export function persistGatewayConfig(config: GatewayConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save gateway config to localStorage');
  }
}

/**
 * Rewrite a stream URL to route through the gateway
 */
export function rewriteStreamUrl(originalUrl: string, config: GatewayConfig): string {
  if (config.mode === 'direct' || !config.gatewayUrl) {
    return originalUrl;
  }

  try {
    const gatewayBase = config.gatewayUrl.replace(/\/$/, '');
    const encodedUrl = encodeURIComponent(originalUrl);
    return `${gatewayBase}/proxy?url=${encodedUrl}`;
  } catch (e) {
    console.warn('Failed to rewrite stream URL:', e);
    return originalUrl;
  }
}

/**
 * Rewrite M3U8 manifest content to route segment URLs through the gateway
 */
export function rewriteM3U8Content(
  content: string, 
  baseUrl: string, 
  config: GatewayConfig
): string {
  if (config.mode === 'direct' || !config.gatewayUrl) {
    return content;
  }

  const lines = content.split('\n');
  const rewrittenLines = lines.map(line => {
    const trimmed = line.trim();
    
    // Skip empty lines, comments, and M3U8 tags
    if (!trimmed || trimmed.startsWith('#')) {
      return line;
    }

    // This is a URL line (segment or playlist reference)
    let absoluteUrl: string;
    
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      absoluteUrl = trimmed;
    } else {
      // Relative URL - resolve against base
      try {
        absoluteUrl = new URL(trimmed, baseUrl).toString();
      } catch {
        return line; // Keep original if URL parsing fails
      }
    }

    return rewriteStreamUrl(absoluteUrl, config);
  });

  return rewrittenLines.join('\n');
}

/**
 * Build CDN headers for gateway requests
 */
export function buildCdnHeaders(config: GatewayConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Stream-Mode': config.mode,
  };

  if (config.region) {
    headers['X-Forwarded-For'] = getRegionIp(config.region);
    headers['X-Edge-Region'] = config.region;
  }

  // Add custom headers if provided
  if (config.customHeaders) {
    Object.assign(headers, config.customHeaders);
  }

  return headers;
}

/**
 * Get a simulated IP for a region (for CDN cache simulation)
 */
function getRegionIp(region: string): string {
  const regionIps: Record<string, string> = {
    'us-east': '54.235.1.1',
    'us-west': '52.94.1.1',
    'eu-west': '52.95.1.1',
    'eu-central': '52.59.1.1',
    'ap-northeast': '52.68.1.1',
    'ap-southeast': '52.74.1.1',
    'ap-south': '52.66.1.1',
    'sa-east': '52.67.1.1',
  };
  return regionIps[region] || '0.0.0.0';
}

/**
 * Available regions for edge optimization
 */
export const AVAILABLE_REGIONS = [
  { id: 'us-east', label: 'US East (Virginia)' },
  { id: 'us-west', label: 'US West (Oregon)' },
  { id: 'eu-west', label: 'EU West (Ireland)' },
  { id: 'eu-central', label: 'EU Central (Frankfurt)' },
  { id: 'ap-northeast', label: 'Asia Pacific (Tokyo)' },
  { id: 'ap-southeast', label: 'Asia Pacific (Singapore)' },
  { id: 'ap-south', label: 'Asia Pacific (Mumbai)' },
  { id: 'sa-east', label: 'South America (São Paulo)' },
] as const;

/**
 * Create a fetch wrapper that adds gateway headers
 */
export function createGatewayFetch(config: GatewayConfig): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    
    // Add CDN headers
    const cdnHeaders = buildCdnHeaders(config);
    Object.entries(cdnHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });

    // Rewrite URL if in edge-optimized mode
    let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    
    if (config.mode === 'edge-optimized' && config.gatewayUrl) {
      url = rewriteStreamUrl(url, config);
    }

    return fetch(url, {
      ...init,
      headers,
    });
  };
}
