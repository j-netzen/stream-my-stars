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

// Parse size string to bytes for sorting
function parseSizeToBytes(sizeStr: string): number {
  if (!sizeStr) return Infinity; // No size = sort to end
  
  const match = sizeStr.match(/(\d+\.?\d*)\s*(GB|MB)/i);
  if (!match) return Infinity;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  if (unit === "GB") return value * 1024;
  if (unit === "MB") return value;
  return Infinity;
}

// Parse quality and size info from stream title
export function parseStreamInfo(stream: TorrentioStream): {
  quality: string;
  size: string;
  sizeInMB: number;
  seeds?: number;
  source: string;
  qualityRank: number;
} {
  const title = stream.title || "";
  const name = stream.name || "";
  
  // Extract quality (1080p, 720p, 4K, etc.)
  const qualityMatch = title.match(/(\d{3,4}p|4K|2160p)/i);
  const quality = qualityMatch ? qualityMatch[1].toUpperCase() : "Unknown";
  
  // Extract size
  const sizeMatch = title.match(/(\d+\.?\d*\s*(GB|MB))/i);
  const size = sizeMatch ? sizeMatch[1] : "";
  const sizeInMB = parseSizeToBytes(size);
  
  // Extract seeds if available (format: 👤 123 or Seeds: 123)
  const seedsMatch = title.match(/👤\s*(\d+)/);
  const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : undefined;
  
  // Get source name from stream name (first line typically)
  const source = name.split("\n")[0] || "Unknown";
  
  // Get quality rank for sorting
  const qualityRank = qualityRanking[quality] || qualityRanking["UNKNOWN"];
  
  return { quality, size, sizeInMB, seeds, source, qualityRank };
}

// Sort streams by file size (smallest to largest)
export function sortStreams(streams: TorrentioStream[]): TorrentioStream[] {
  return [...streams].sort((a, b) => {
    const infoA = parseStreamInfo(a);
    const infoB = parseStreamInfo(b);
    
    // Sort by file size (smallest first)
    return infoA.sizeInMB - infoB.sizeInMB;
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

// Resolve a Torrentio stream URL to get the actual download link
export async function resolveTorrentioUrl(url: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("torrentio", {
    body: { action: "resolve", url },
  });

  if (error) throw error;
  return data.url;
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
