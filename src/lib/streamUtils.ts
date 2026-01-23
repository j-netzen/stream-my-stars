/**
 * Stream URL Utilities
 * 
 * Provides helpers for preparing stream URLs for playback,
 * including HTTPS forcing and provider-specific fixes.
 */

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
 * Extract the provider domain from a stream URL
 * Used for setting appropriate Referer headers
 */
export function extractProviderDomain(url: string): string {
  try {
    const urlObj = new URL(url);
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
 * Prepare a stream URL for playback
 * - Forces HTTPS
 * - Validates URL format
 */
export function prepareStreamUrl(url: string): string {
  if (!url) return '';
  
  // Force HTTPS first
  const httpsUrl = forceHttps(url);
  
  // Validate the URL is well-formed
  try {
    new URL(httpsUrl);
    return httpsUrl;
  } catch {
    console.warn('[StreamUtils] Invalid URL format:', url);
    return httpsUrl;
  }
}
