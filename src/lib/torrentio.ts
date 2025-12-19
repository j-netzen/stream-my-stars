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

// Sort streams by quality (descending) then by seeds (descending)
export function sortStreams(streams: TorrentioStream[]): TorrentioStream[] {
  return [...streams].sort((a, b) => {
    const infoA = parseStreamInfo(a);
    const infoB = parseStreamInfo(b);
    
    // First sort by quality
    if (infoB.qualityRank !== infoA.qualityRank) {
      return infoB.qualityRank - infoA.qualityRank;
    }
    
    // Then by seeds (if available)
    const seedsA = infoA.seeds || 0;
    const seedsB = infoB.seeds || 0;
    return seedsB - seedsA;
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

  if (error) throw error;
  
  // Sort streams by quality and seeds
  const streams = data.streams || [];
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
