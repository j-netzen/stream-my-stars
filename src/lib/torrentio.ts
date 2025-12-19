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

// Parse quality and size info from stream title
export function parseStreamInfo(stream: TorrentioStream): {
  quality: string;
  size: string;
  seeds?: string;
  source: string;
} {
  const title = stream.title || "";
  const name = stream.name || "";
  
  // Extract quality (1080p, 720p, 4K, etc.)
  const qualityMatch = title.match(/(\d{3,4}p|4K|2160p)/i);
  const quality = qualityMatch ? qualityMatch[1].toUpperCase() : "Unknown";
  
  // Extract size
  const sizeMatch = title.match(/(\d+\.?\d*\s*(GB|MB))/i);
  const size = sizeMatch ? sizeMatch[1] : "";
  
  // Extract seeds if available
  const seedsMatch = title.match(/👤\s*(\d+)/);
  const seeds = seedsMatch ? seedsMatch[1] : undefined;
  
  // Get source name from stream name (first line typically)
  const source = name.split("\n")[0] || "Unknown";
  
  return { quality, size, seeds, source };
}

export async function searchTorrentio(
  imdbId: string,
  type: "movie" | "series"
): Promise<TorrentioStream[]> {
  const { data, error } = await supabase.functions.invoke("torrentio", {
    body: { action: "search", imdbId, type },
  });

  if (error) throw error;
  return data.streams || [];
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
