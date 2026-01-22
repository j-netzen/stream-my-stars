import { useState, useCallback } from "react";
import { Media } from "@/hooks/useMedia";
import { searchTorrentio, getImdbIdFromTmdb, parseStreamInfo, TorrentioStream, isDirectRdLink, isMagnetLink, extractMagnetFromTorrentioUrl, parseSizeToBytes, calculateOptimalMaxSize } from "@/lib/torrentio";
import { unrestrictLink, addMagnetAndWait, getStreamingLinks, StreamUnavailableError, checkInstantAvailability, isHashCached } from "@/lib/realDebrid";
import { toast } from "sonner";

export interface StreamQualityInfo {
  quality: string;
  size?: string;
  qualityRank?: number;
}

interface QuickPlayResult {
  streamUrl: string;
  qualityInfo: StreamQualityInfo;
  tryNextStream: () => void;
}

export function useQuickPlay() {
  const [isQuickPlaying, setIsQuickPlaying] = useState(false);
  const [quickPlayMedia, setQuickPlayMedia] = useState<Media | null>(null);

  // Get streamable URL from Real-Debrid
  const getStreamableUrl = async (fileId: string, downloadUrl: string): Promise<string> => {
    if (!fileId || fileId.length < 5) {
      return downloadUrl;
    }

    try {
      const streamingLinks = await getStreamingLinks(fileId);
      
      if (streamingLinks?.streaming_not_supported) {
        return downloadUrl;
      }
      
      if (!streamingLinks || typeof streamingLinks !== 'object') {
        return downloadUrl;
      }
      
      const qualityOrder = ['full', 'original', '1080p', '720p', '480p', '360p'];
      for (const quality of qualityOrder) {
        if (streamingLinks[quality]?.full) {
          return streamingLinks[quality].full;
        }
      }
      
      const availableQualities = Object.keys(streamingLinks).filter(k => k !== 'streaming_not_supported');
      if (availableQualities.length > 0) {
        const firstQuality = availableQualities[0];
        if (streamingLinks[firstQuality]?.full) {
          return streamingLinks[firstQuality].full;
        }
      }
      
      return downloadUrl;
    } catch {
      return downloadUrl;
    }
  };

  // Extract hash from stream URL or infoHash
  const extractHash = (stream: TorrentioStream): string | null => {
    if (stream.infoHash) return stream.infoHash.toLowerCase();
    
    // Try to extract from URL
    const url = stream.url || "";
    const hashMatch = url.match(/\/([a-f0-9]{40})\//i) || url.match(/btih:([a-f0-9]{40})/i);
    return hashMatch ? hashMatch[1].toLowerCase() : null;
  };

  // Filter and find best stream, with optional cache prioritization
  const findBestStream = (
    streams: TorrentioStream[], 
    durationMinutes: number = 90,
    cachedHashes?: Set<string>
  ): TorrentioStream | null => {
    // Filter by English language
    const englishStreams = streams.filter(stream => {
      const title = stream.title?.toLowerCase() || "";
      const hasEnglish = title.includes("english") || 
                         title.includes("eng") || 
                         title.includes("en ") ||
                         title.includes("[en]") ||
                         title.includes("(en)") ||
                         (!title.includes("hindi") && 
                          !title.includes("spanish") && 
                          !title.includes("french") && 
                          !title.includes("german") &&
                          !title.includes("italian") &&
                          !title.includes("portuguese") &&
                          !title.includes("russian") &&
                          !title.includes("chinese") &&
                          !title.includes("japanese") &&
                          !title.includes("korean") &&
                          !title.includes("tamil") &&
                          !title.includes("telugu") &&
                          !title.includes("dual audio"));
      return hasEnglish;
    });

    // Apply "best" quality filter
    const universalMaxSize = 3072; // 3GB in MB
    const optimalMaxSize = calculateOptimalMaxSize(durationMinutes);

    const filteredStreams = englishStreams.filter(stream => {
      const info = parseStreamInfo(stream);
      if (!info.size) return false;
      const sizeInMB = parseSizeToBytes(info.size);
      if (sizeInMB === 0) return false;
      if (sizeInMB <= universalMaxSize) return true;
      return sizeInMB <= optimalMaxSize;
    });

    // If no streams match filters, fallback to all English streams
    let streamsToUse = filteredStreams.length > 0 ? filteredStreams : englishStreams.length > 0 ? englishStreams : streams;
    
    // If we have cache info, prioritize cached streams
    if (cachedHashes && cachedHashes.size > 0) {
      const cachedStreams = streamsToUse.filter(stream => {
        const hash = extractHash(stream);
        return hash && cachedHashes.has(hash);
      });
      
      if (cachedStreams.length > 0) {
        console.log(`[Quick Play] Found ${cachedStreams.length} cached streams out of ${streamsToUse.length}`);
        streamsToUse = cachedStreams;
      } else {
        console.log("[Quick Play] No cached streams found, using all filtered streams");
      }
    }
    
    return streamsToUse.length > 0 ? streamsToUse[0] : null;
  };

  // Resolve a single stream
  const resolveStream = async (stream: TorrentioStream, media: Media): Promise<{ url: string; qualityInfo: StreamQualityInfo }> => {
    const info = parseStreamInfo(stream);
    const qualityInfo: StreamQualityInfo = {
      quality: info.quality || "Unknown",
      size: info.size,
      qualityRank: info.qualityRank
    };

    // Direct RD link
    if (isDirectRdLink(stream.url)) {
      return { url: stream.url, qualityInfo };
    }

    // Magnet link
    if (isMagnetLink(stream.url)) {
      const result = await addMagnetAndWait(stream.url, () => {});
      
      if (result.links && result.links.length > 0) {
        const videoLink = result.links.find((l: string) => 
          /\.(mp4|mkv|avi|m4v|webm)$/i.test(l)
        ) || result.links[0];
        
        const unrestricted = await unrestrictLink(videoLink);
        const streamUrl = await getStreamableUrl(unrestricted.id, unrestricted.download);
        return { url: streamUrl, qualityInfo };
      }
      throw new Error("Not cached - trying next stream");
    }

    // Torrentio URL with embedded magnet
    const magnetLink = extractMagnetFromTorrentioUrl(stream.url);
    if (magnetLink) {
      const result = await addMagnetAndWait(magnetLink, () => {});
      
      if (result.links && result.links.length > 0) {
        const videoLink = result.links.find((l: string) => 
          /\.(mp4|mkv|avi|m4v|webm)$/i.test(l)
        ) || result.links[0];
        
        const unrestricted = await unrestrictLink(videoLink);
        const streamUrl = await getStreamableUrl(unrestricted.id, unrestricted.download);
        return { url: streamUrl, qualityInfo };
      }
      throw new Error("Not cached - trying next stream");
    }

    // HTTP URL
    const unrestricted = await unrestrictLink(stream.url);
    const streamUrl = await getStreamableUrl(unrestricted.id, unrestricted.download);
    return { url: streamUrl, qualityInfo };
  };

  // Main quick play function with auto-fallback
  const quickPlay = useCallback(async (
    media: Media,
    onStreamReady: (streamUrl: string, qualityInfo: StreamQualityInfo, tryNextStream: () => void) => void,
    season?: number,
    episode?: number
  ): Promise<boolean> => {
    if (isQuickPlaying) return false;
    
    setIsQuickPlaying(true);
    setQuickPlayMedia(media);
    
    try {
      toast.info("Finding best stream...", { duration: 2000 });
      
      // Get IMDB ID
      let imdbId: string | null = null;
      if (media.tmdb_id) {
        imdbId = await getImdbIdFromTmdb(media.tmdb_id, media.media_type as "movie" | "tv");
      }
      
      if (!imdbId) {
        toast.error("Could not find IMDB ID");
        setIsQuickPlaying(false);
        setQuickPlayMedia(null);
        return false;
      }

      // Search for streams
      const type = media.media_type === "movie" ? "movie" : "series";
      const streams = await searchTorrentio(
        imdbId,
        type,
        type === "series" ? (season || 1) : undefined,
        type === "series" ? (episode || 1) : undefined
      );

      if (streams.length === 0) {
        toast.error("No streams found");
        setIsQuickPlaying(false);
        setQuickPlayMedia(null);
        return false;
      }

      // Extract hashes from streams for instant availability check
      const hashToStream = new Map<string, TorrentioStream>();
      const hashes: string[] = [];
      for (const stream of streams) {
        const hash = extractHash(stream);
        if (hash && !hashToStream.has(hash)) {
          hashToStream.set(hash, stream);
          hashes.push(hash);
        }
      }

      // Check which streams are cached on Real-Debrid
      let cachedHashes = new Set<string>();
      if (hashes.length > 0) {
        try {
          toast.info("Checking cached streams...", { duration: 1500 });
          const availabilityData = await checkInstantAvailability(hashes);
          cachedHashes = new Set(
            hashes.filter(hash => isHashCached(hash, availabilityData))
          );
          console.log(`[Quick Play] ${cachedHashes.size}/${hashes.length} streams are cached on RD`);
        } catch (err) {
          console.warn("[Quick Play] Cache check failed, continuing without cache info:", err);
        }
      }

      // Create a mutable index for auto-fallback
      let currentIndex = 0;
      const allStreams = [...streams];
      
      // Filter for best quality, prioritizing cached streams
      const durationMinutes = media.runtime || 90;
      const bestStream = findBestStream(allStreams, durationMinutes, cachedHashes);
      
      if (bestStream) {
        // Move best stream to front if not already
        const bestIdx = allStreams.findIndex(s => s.url === bestStream.url);
        if (bestIdx > 0) {
          allStreams.splice(bestIdx, 1);
          allStreams.unshift(bestStream);
        }
      }
      
      // Reorder remaining streams: cached first, then uncached
      const sortedStreams = allStreams.slice(1).sort((a, b) => {
        const hashA = extractHash(a);
        const hashB = extractHash(b);
        const cachedA = hashA && cachedHashes.has(hashA);
        const cachedB = hashB && cachedHashes.has(hashB);
        if (cachedA && !cachedB) return -1;
        if (!cachedA && cachedB) return 1;
        return 0;
      });
      
      // Replace allStreams with best first, then sorted remaining
      if (bestStream) {
        allStreams.splice(1, allStreams.length - 1, ...sortedStreams);
      }

      // Try streams with auto-fallback
      const tryStream = async (index: number): Promise<boolean> => {
        if (index >= allStreams.length) {
          toast.error("All streams failed");
          setIsQuickPlaying(false);
          setQuickPlayMedia(null);
          return false;
        }

        const stream = allStreams[index];
        currentIndex = index;

        try {
          const { url, qualityInfo } = await resolveStream(stream, media);
          
          // Create tryNext function for the player to use on playback errors
          const tryNextStream = () => {
            toast.info(`Stream failed, trying next (${currentIndex + 2}/${allStreams.length})...`);
            tryStream(currentIndex + 1);
          };

          setIsQuickPlaying(false);
          setQuickPlayMedia(null);
          onStreamReady(url, qualityInfo, tryNextStream);
          return true;
        } catch (err: any) {
          const isStreamError = err instanceof StreamUnavailableError || 
            err.message?.includes("blocked") || 
            err.message?.includes("copyright") ||
            err.message?.includes("unavailable") ||
            err.message?.includes("Not cached");
          
          if (isStreamError) {
            console.log(`Quick Play: Stream ${index + 1} blocked/unavailable, trying next...`);
            toast.info(`Stream ${index + 1} unavailable, trying next...`, { duration: 1500 });
          } else {
            console.log(`Quick Play: Stream ${index + 1} failed, trying next...`, err.message);
          }
          // Auto-fallback to next stream
          return tryStream(index + 1);
        }
      };

      toast.info("Resolving stream...", { duration: 1500 });
      return await tryStream(0);
      
    } catch (err: any) {
      console.error("Quick play error:", err);
      toast.error(err.message || "Quick play failed");
      setIsQuickPlaying(false);
      setQuickPlayMedia(null);
      return false;
    }
  }, [isQuickPlaying]);

  return {
    quickPlay,
    isQuickPlaying,
    quickPlayMedia,
  };
}
