/**
 * Stream Utilities - Minimal stub for compatibility
 * Video player code was removed. These are placeholder utilities.
 */

export interface StreamDebugInfo {
  sourceType: 'torbox' | 'hls' | 'direct';
  usingProxy: boolean;
  streamUrl?: string;
  resolution?: string;
  codec?: string;
  fileSize?: string;
  playerMode?: 'native-hls' | 'hls.js';
}

/**
 * Prepare stream URL for playback - Returns URL as-is for now
 */
export function prepareStreamUrl(url: string): string {
  // Force HTTPS
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

/**
 * Force HTTPS on any URL
 */
export function forceHttps(url: string): string {
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

/**
 * Mask URL for debug display
 */
export function maskUrlForDebug(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/...`;
  } catch {
    return url.substring(0, 50) + "...";
  }
}
