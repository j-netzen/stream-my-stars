import { supabase } from "@/integrations/supabase/client";

export interface TorrentioStream {
  name: string;
  title: string;
  url: string;
  behaviorHints?: {
    bingeGroup?: string;
    filename?: string;
  };
}

export interface TorrentioResult {
  streams: TorrentioStream[];
}

// Quality ranking for sorting (higher = better)
const qualityRanking: Record<string, number> = {
  "2160P": 100,
  "4K": 100,
  "1080P": 80,
  "720P": 60,
  "480P": 40,
  "UNKNOWN": 20,
};

// Check if URL is already a direct Real-Debrid download link or cached debrid link
export function isDirectRdLink(url: string): boolean {
  // NEVER treat Torrentio resolve URLs as direct - they need to be resolved first
  if (url.includes("torrentio.strem.fun/resolve/") || 
      url.includes("torrentio.strem.fun/stream/")) {
    return false;
  }
  
  // Common Real-Debrid direct download patterns
  if (url.includes("real-debrid.com/d/") || 
      url.includes("rdb.so/") ||
      url.includes(".rdeb.io/") ||
      url.includes("download.real-debrid.com/")) {
    return true;
  }
  
  // Torrentio RD cached links - they use debrid.io or contain debrid patterns
  if (url.includes("debrid.io/") || 
      url.includes("/debrid/") ||
      url.includes("debrid-link")) {
    return true;
  }
  
  // Check for direct HTTP video file links (already unrestricted)
  // These are typically .mkv, .mp4, etc. on CDN domains
  // But exclude any strem.fun URLs as those need resolution
  if (url.includes("strem.fun")) {
    return false;
  }
  
  const videoExtensions = ['.mkv', '.mp4', '.avi', '.m4v', '.webm'];
  const isVideoFile = videoExtensions.some(ext => url.toLowerCase().includes(ext));
  const isHttps = url.startsWith('https://');
  
  // If it's an HTTPS link to a video file (not a magnet), it's likely already unrestricted
  if (isHttps && isVideoFile && !url.startsWith('magnet:')) {
    return true;
  }
  
  return false;
}

// Check if URL is a magnet link
export function isMagnetLink(url: string): boolean {
  return url.startsWith('magnet:');
}

// Extract torrent hash from Torrentio URL to create a magnet link as fallback
// Torrentio URLs look like: https://torrentio.strem.fun/resolve/realdebrid/TOKEN/HASH/null/0/filename.mp4
export function extractMagnetFromTorrentioUrl(url: string): string | null {
  // Pattern: look for a 40-character hex hash in the URL path
  const hashMatch = url.match(/\/([a-f0-9]{40})\//i);
  if (hashMatch) {
    const hash = hashMatch[1];
    // Extract filename for the magnet link name
    const filenameMatch = url.match(/\/([^\/]+\.(mp4|mkv|avi|m4v|webm))$/i);
    const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : 'Unknown';
    return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(filename)}`;
  }
  return null;
}

// Parse quality and size info from stream title
export function parseStreamInfo(stream: TorrentioStream): {
  quality: string;
  size: string;
  seeds?: number;
  source: string;
  qualityRank: number;
  isDirectLink: boolean;
} {
  const title = stream.title || "";
  const name = stream.name || "";
  const url = stream.url || "";
  
  // Extract quality (1080p, 720p, 4K, etc.)
  const qualityMatch = title.match(/(\d{3,4}p|4K|2160p)/i);
  const quality = qualityMatch ? qualityMatch[1].toUpperCase() : "Unknown";
  
  // Extract size
  const sizeMatch = title.match(/(\d+\.?\d*\s*(GB|MB))/i);
  const size = sizeMatch ? sizeMatch[1] : "";
  
  // Extract seeds if available (format: 👤 123 or Seeds: 123)
  const seedsMatch = title.match(/👤\s*(\d+)/);
  const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : undefined;
  
  // Get source name from stream name (first line typically)
  const source = name.split("\n")[0] || "Unknown";
  
  // Get quality rank for sorting
  const qualityRank = qualityRanking[quality] || qualityRanking["UNKNOWN"];
  
  // Check if it's a direct RD link
  const isDirectLink = isDirectRdLink(url);
  
  return { quality, size, seeds, source, qualityRank, isDirectLink };
}

// Parse file size string to bytes for comparison
export function parseSizeToBytes(sizeStr: string): number {
  if (!sizeStr) return 0; // No size = sort to end
  const match = sizeStr.match(/(\d+\.?\d*)\s*(GB|MB)/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  return unit === 'GB' ? value * 1024 : value; // Convert to MB for comparison
}

// Calculate optimal max file size (in MB) based on duration in minutes
// Pattern: ≤30min=500MB, 45min=750MB, 90min=1500MB, 120min=1900MB, 150min=2000MB, 180min=2500MB
export function calculateOptimalMaxSize(durationMinutes: number): number {
  if (durationMinutes <= 0) return 2500; // Default max if no duration
  
  // Shows 30 minutes or less cap at 500MB
  if (durationMinutes <= 30) {
    return 500;
  }
  
  // Define breakpoints: [minutes, maxSizeMB]
  const breakpoints = [
    { minutes: 45, sizeMB: 750 },
    { minutes: 90, sizeMB: 1500 },
    { minutes: 120, sizeMB: 1900 },
    { minutes: 150, sizeMB: 2000 },
    { minutes: 180, sizeMB: 2500 },
  ];
  
  // If duration is between 30 and 45, interpolate from 500MB to 750MB
  if (durationMinutes < breakpoints[0].minutes) {
    const ratio = (durationMinutes - 30) / (breakpoints[0].minutes - 30);
    return 500 + ratio * (breakpoints[0].sizeMB - 500);
  }
  
  // If duration exceeds last breakpoint, cap at max
  if (durationMinutes >= breakpoints[breakpoints.length - 1].minutes) {
    return breakpoints[breakpoints.length - 1].sizeMB;
  }
  
  // Find the two breakpoints to interpolate between
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const lower = breakpoints[i];
    const upper = breakpoints[i + 1];
    
    if (durationMinutes >= lower.minutes && durationMinutes <= upper.minutes) {
      // Linear interpolation between breakpoints
      const ratio = (durationMinutes - lower.minutes) / (upper.minutes - lower.minutes);
      return lower.sizeMB + ratio * (upper.sizeMB - lower.sizeMB);
    }
  }
  
  return 2500; // Fallback to max
}

// Check if stream uses browser-compatible codecs (H264/AAC/MP4 preferred)
function isBrowserCompatible(stream: TorrentioStream): boolean {
  const title = (stream.title || "").toLowerCase();
  const filename = stream.behaviorHints?.filename?.toLowerCase() || "";
  const combined = title + " " + filename;
  
  // x265/HEVC and problematic audio codecs are less compatible
  const hasProblematicCodec = 
    combined.includes('x265') || 
    combined.includes('hevc') || 
    combined.includes('hdr') ||
    combined.includes('dts') ||
    combined.includes('truehd') ||
    combined.includes('atmos');
  
  // H264 and AAC are most compatible
  const hasCompatibleCodec = 
    combined.includes('x264') || 
    combined.includes('h264') || 
    combined.includes('aac') ||
    combined.includes('.mp4');
  
  if (hasProblematicCodec) return false;
  if (hasCompatibleCodec) return true;
  return true; // Assume compatible if unknown
}

// Sort streams by browser compatibility first, then file size (largest to smallest)
export function sortStreams(streams: TorrentioStream[]): TorrentioStream[] {
  return [...streams].sort((a, b) => {
    const infoA = parseStreamInfo(a);
    const infoB = parseStreamInfo(b);
    
    // First, prioritize browser-compatible streams
    const compatA = isBrowserCompatible(a);
    const compatB = isBrowserCompatible(b);
    if (compatA !== compatB) {
      return compatA ? -1 : 1; // Compatible streams first
    }
    
    // Then sort by file size (largest to smallest)
    const sizeA = parseSizeToBytes(infoA.size);
    const sizeB = parseSizeToBytes(infoB.size);
    
    return sizeB - sizeA;
  });
}

export async function searchTorrentio(
  imdbId: string,
  type: "movie" | "series",
  season?: number,
  episode?: number
): Promise<TorrentioStream[]> {
  const { data, error } = await supabase.functions.invoke("torrentio", {
    body: { action: "search", imdbId, type, season, episode },
  });

  // Always throw a normal Error (not a FunctionsHttpError) so callers can safely catch/display it.
  if (error) throw new Error(error.message);

  const payload = (data || {}) as any;
  if (payload.error) {
    throw new Error(payload.message || payload.error);
  }

  // Sort streams by quality and seeds
  const streams: TorrentioStream[] = payload.streams || [];
  return sortStreams(streams);
}

// Get IMDB ID from TMDB
export async function getImdbIdFromTmdb(
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("tmdb", {
    body: { action: "get_imdb_id", id: tmdbId, media_type: mediaType },
  });

  if (error) throw error;
  return data.imdb_id || null;
}
