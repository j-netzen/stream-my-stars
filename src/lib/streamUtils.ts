/**
 * Stream URL Utilities
 * 
 * Provides helpers for preparing stream URLs for playback,
 * including HTTPS forcing, CORS proxy wrapping, and provider-specific fixes.
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Public CORS proxy URL - used to bypass provider restrictions
 */
export const CORS_PROXY_URL = 'https://corsproxy.io/?url=';

/**
 * Proxy mode for stream handling
 */
export type ProxyMode = 'none' | 'public' | 'backend';

/**
 * Stream source types for smart proxy decision
 */
export type StreamSourceType = 'torbox' | 'hls' | 'direct' | 'unknown';

/**
 * Debug info for stream URL analysis
 */
export interface StreamDebugInfo {
  originalUrl: string;
  preparedUrl: string;
  sourceType: StreamSourceType;
  isHls: boolean;
  usedCorsProxy: boolean;
  usedBackendProxy: boolean;
  playerMode: 'native-hls' | 'hls.js' | 'direct';
}

/**
 * Detect the source type of a stream URL
 */
export function detectStreamSourceType(url: string): StreamSourceType {
  if (!url) return 'unknown';
  
  const lowerUrl = url.toLowerCase();
  
  // TorBox URLs
  if (
    lowerUrl.includes('torbox.app') || 
    lowerUrl.includes('api.torbox') ||
    lowerUrl.includes('.torbox.') ||
    lowerUrl.includes('/torbox/')
  ) {
    return 'torbox';
  }
  
  // HLS manifests
  if (lowerUrl.includes('.m3u8') || lowerUrl.includes('m3u8')) {
    return 'hls';
  }
  
  // Direct file URLs (mp4, mkv, etc.)
  const directExtensions = ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.ts'];
  if (directExtensions.some(ext => lowerUrl.includes(ext))) {
    return 'direct';
  }
  
  return 'unknown';
}

/**
 * Check if URL is an HLS manifest
 */
export function isHlsUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes('.m3u8') || lowerUrl.includes('m3u8');
}

/**
 * Force HTTPS on stream URLs to avoid mixed-content blocks
 * Returns the HTTPS version of the URL, or original if already HTTPS
 */
export function forceHttps(url: string): string {
  if (!url) return url;
  
  // Already HTTPS
  if (url.startsWith('https://')) {
    return url;
  }
  
  // Upgrade HTTP to HTTPS
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  
  // Protocol-relative URLs
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  
  // Assume HTTPS for URLs without protocol
  if (!url.includes('://')) {
    return 'https://' + url;
  }
  
  return url;
}

/**
 * Check if a URL is using HTTP (not HTTPS)
 */
export function isHttpUrl(url: string): boolean {
  return url?.startsWith('http://') ?? false;
}

/**
 * Check if a URL is already proxied
 */
export function isProxiedUrl(url: string): boolean {
  return url?.includes('corsproxy.io') ?? false;
}

/**
 * Check if URL needs CORS proxy based on source type
 * Real-Debrid URLs typically don't need proxy as they have proper CORS headers
 */
export function shouldUseCorsProxy(url: string, forceCorsProxy: boolean, useSmartProxy: boolean): boolean {
  if (!url) return false;
  
  // If CORS proxy is disabled entirely
  if (!forceCorsProxy) return false;
  
  // If smart proxy is disabled, always use CORS proxy when enabled
  if (!useSmartProxy) return true;
  
  const sourceType = detectStreamSourceType(url);
  
  // Smart proxy decisions:
  // - TorBox: No proxy needed (they set proper CORS headers)
  // - HLS: Usually needs proxy for fragment requests
  // - Direct: Often needs proxy for cross-origin
  switch (sourceType) {
    case 'torbox':
      return false; // TorBox has proper CORS
    case 'hls':
      return true; // HLS typically needs proxy
    case 'direct':
      return true; // Direct URLs often need proxy
    default:
      return true; // Unknown sources get proxy
  }
}

/**
 * Wrap a URL with the CORS proxy
 * Only wraps if not already proxied
 */
export function wrapWithCorsProxy(url: string): string {
  if (!url) return url;
  
  // Don't double-proxy
  if (isProxiedUrl(url)) {
    return url;
  }
  
  // Force HTTPS first
  const httpsUrl = forceHttps(url);
  
  // Wrap with proxy
  return `${CORS_PROXY_URL}${encodeURIComponent(httpsUrl)}`;
}

/**
 * Unwrap a proxied URL to get the original
 */
export function unwrapProxiedUrl(url: string): string {
  if (!isProxiedUrl(url)) {
    return url;
  }
  
  try {
    const originalEncoded = url.replace(CORS_PROXY_URL, '');
    return decodeURIComponent(originalEncoded);
  } catch {
    return url;
  }
}

/**
 * Extract the provider domain from a stream URL
 * Used for setting appropriate Referer headers
 */
export function extractProviderDomain(url: string): string {
  try {
    // Unwrap if proxied to get original domain
    const actualUrl = unwrapProxiedUrl(url);
    const urlObj = new URL(actualUrl);
    return urlObj.origin;
  } catch {
    return '';
  }
}

/**
 * Standard browser headers to bypass provider restrictions
 */
export const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'video',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'cross-site',
};

/**
 * Get headers for fetching a stream URL
 * Includes browser UA and appropriate Referer
 */
export function getStreamFetchHeaders(url: string): Record<string, string> {
  const referer = extractProviderDomain(url);
  return {
    ...BROWSER_HEADERS,
    'Referer': referer ? referer + '/' : '',
    'Origin': referer,
  };
}

/**
 * Mask a URL for debug display (show domain and partial path)
 */
export function maskUrlForDebug(url: string): string {
  if (!url) return '';
  try {
    const actualUrl = unwrapProxiedUrl(url);
    const urlObj = new URL(actualUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const maskedPath = pathParts.length > 2 
      ? `/${pathParts[0]}/.../${pathParts[pathParts.length - 1]}`
      : urlObj.pathname;
    return `${urlObj.host}${maskedPath}`;
  } catch {
    return url.substring(0, 50) + '...';
  }
}

/**
 * Get the backend proxy URL for a given stream URL
 */
export async function getBackendProxyUrl(url: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.warn('[StreamUtils] No auth session for backend proxy, falling back to public');
    return wrapWithCorsProxy(forceHttps(url));
  }
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn('[StreamUtils] No Supabase URL configured');
    return wrapWithCorsProxy(forceHttps(url));
  }
  
  const encodedUrl = encodeURIComponent(forceHttps(url));
  return `${supabaseUrl}/functions/v1/stream-proxy?url=${encodedUrl}`;
}

/**
 * Prepare a stream URL for playback with smart proxy detection
 * Returns both the prepared URL and debug info
 */
export function prepareStreamUrlWithDebug(
  url: string, 
  useCorsProxy: boolean, 
  useSmartProxy: boolean,
  proxyMode: ProxyMode = 'public'
): StreamDebugInfo {
  if (!url) {
    return {
      originalUrl: '',
      preparedUrl: '',
      sourceType: 'unknown',
      isHls: false,
      usedCorsProxy: false,
      usedBackendProxy: false,
      playerMode: 'direct',
    };
  }
  
  const sourceType = detectStreamSourceType(url);
  const isHls = isHlsUrl(url);
  
  // Determine if we should proxy based on smart detection
  const shouldProxy = shouldUseCorsProxy(url, useCorsProxy, useSmartProxy);
  
  // Force HTTPS first
  const httpsUrl = forceHttps(url);
  
  // Determine which proxy to use
  let preparedUrl = httpsUrl;
  let usedCorsProxy = false;
  let usedBackendProxy = false;
  
  if (shouldProxy) {
    if (proxyMode === 'backend') {
      // For backend proxy, we build the URL synchronously but the actual auth happens at request time
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (supabaseUrl) {
        preparedUrl = `${supabaseUrl}/functions/v1/stream-proxy?url=${encodeURIComponent(httpsUrl)}`;
        usedBackendProxy = true;
      } else {
        // Fallback to public proxy
        preparedUrl = wrapWithCorsProxy(httpsUrl);
        usedCorsProxy = true;
      }
    } else {
      preparedUrl = wrapWithCorsProxy(httpsUrl);
      usedCorsProxy = true;
    }
  }
  
  // Determine player mode
  let playerMode: StreamDebugInfo['playerMode'] = 'direct';
  if (isHls) {
    // Check if browser has native HLS support (Safari)
    const video = document.createElement('video');
    const canPlayNativeHls = !!video.canPlayType('application/vnd.apple.mpegurl');
    playerMode = canPlayNativeHls ? 'native-hls' : 'hls.js';
  }
  
  return {
    originalUrl: url,
    preparedUrl,
    sourceType,
    isHls,
    usedCorsProxy,
    usedBackendProxy,
    playerMode,
  };
}

/**
 * Prepare a stream URL for playback (simple version)
 * - Forces HTTPS
 * - Wraps with CORS proxy for bypass
 * - Validates URL format
 */
export function prepareStreamUrl(url: string, useCorsProxy: boolean = true): string {
  if (!url) return '';
  
  // Force HTTPS first
  const httpsUrl = forceHttps(url);
  
  // Validate the URL is well-formed
  try {
    new URL(httpsUrl);
  } catch {
    console.warn('[StreamUtils] Invalid URL format:', url);
  }
  
  // Wrap with CORS proxy if enabled
  if (useCorsProxy) {
    return wrapWithCorsProxy(httpsUrl);
  }
  
  return httpsUrl;
}

/**
 * Prepare a URL for HLS fragment requests via CORS proxy
 * Used in hls.js xhrSetup
 */
export function proxyFragmentUrl(url: string): string {
  // Don't proxy if already proxied
  if (isProxiedUrl(url)) {
    return url;
  }
  
  // Force HTTPS and proxy
  const httpsUrl = forceHttps(url);
  return wrapWithCorsProxy(httpsUrl);
}
