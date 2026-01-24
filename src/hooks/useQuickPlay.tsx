import { useState, useCallback } from "react";
import { Media } from "@/hooks/useMedia";
import { searchTorrentio, getImdbIdFromTmdb, parseStreamInfo, TorrentioStream, isMagnetLink, extractMagnetFromTorrentioUrl, parseSizeToBytes, calculateOptimalMaxSize, sortStreamsByPopularity } from "@/lib/torrentio";
import { addMagnetAndWait, getStreamableUrl, StreamUnavailableError, checkInstantAvailability, isHashCached, findLargestVideoFile } from "@/lib/torbox";
import { prepareStreamUrl } from "@/lib/streamUtils";
import { addDebugLog, classifyError } from "@/lib/streamDebugLog";
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

  // Get streamable URL from TorBox CDN
  const getTorBoxCdnUrl = async (torrentId: number, fileId: number): Promise<string> => {
    try {
      const cdnUrl = await getStreamableUrl(torrentId, fileId);
      return prepareStreamUrl(cdnUrl);
    } catch (err) {
      console.error("Failed to get TorBox CDN URL:", err);
      throw err;
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

  // Resolve a single stream via TorBox
  const resolveStream = async (stream: TorrentioStream, media: Media): Promise<{ url: string; qualityInfo: StreamQualityInfo }> => {
    const info = parseStreamInfo(stream);
    const qualityInfo: StreamQualityInfo = {
      quality: info.quality || "Unknown",
      size: info.size,
      qualityRank: info.qualityRank
    };

    // For TorBox, all Torrentio streams need to be processed as magnets
    // Extract magnet from stream URL
    const magnetLink = extractMagnetFromTorrentioUrl(stream.url) || (isMagnetLink(stream.url) ? stream.url : null);
    
    if (!magnetLink) {
      throw new Error("Could not extract magnet link from stream");
    }
    
    const result = await addMagnetAndWait(magnetLink, () => {});
    
    // Find the largest video file
    const videoFile = findLargestVideoFile(result);
    
    if (!videoFile) {
      throw new Error("No video files found in torrent");
    }
    
    const streamUrl = await getTorBoxCdnUrl(result.id, videoFile.id);
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
      let cacheCheckFailed = false;
      if (hashes.length > 0) {
        try {
          toast.info("Checking cached streams...", { duration: 1500 });
          const availabilityData = await checkInstantAvailability(hashes);
          
          // If availabilityData is empty, the endpoint might be disabled
          if (Object.keys(availabilityData).length === 0 && hashes.length > 0) {
            console.log("[Quick Play] Cache check returned empty - endpoint may be disabled, using popularity sort");
            cacheCheckFailed = true;
          } else {
            cachedHashes = new Set(
              hashes.filter(hash => isHashCached(hash, availabilityData))
            );
            console.log(`[Quick Play] ${cachedHashes.size}/${hashes.length} streams are cached on RD`);
          }
        } catch (err) {
          console.warn("[Quick Play] Cache check failed, using popularity sort as fallback:", err);
          cacheCheckFailed = true;
        }
      }

      // Create a mutable index for auto-fallback
      let currentIndex = 0;
      let allStreams = [...streams];
      
      // If cache check failed, sort by popularity (seeders) as fallback
      if (cacheCheckFailed) {
        console.log("[Quick Play] Using popularity sort (seeders) as fallback");
        allStreams = sortStreamsByPopularity(allStreams);
      }
      
      // Filter for best quality, prioritizing cached streams (if available)
      const durationMinutes = media.runtime || 90;
      const bestStream = findBestStream(allStreams, durationMinutes, cacheCheckFailed ? undefined : cachedHashes);
      
      if (bestStream) {
        // Move best stream to front if not already
        const bestIdx = allStreams.findIndex(s => s.url === bestStream.url);
        if (bestIdx > 0) {
          allStreams.splice(bestIdx, 1);
          allStreams.unshift(bestStream);
        }
      }
      
      // If cache info is available, reorder remaining streams: cached first, then uncached
      if (!cacheCheckFailed && cachedHashes.size > 0) {
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
          
          // Log to debug system
          const { type: errorType, message: errorMessage } = classifyError(err);
          addDebugLog({
            mediaTitle: media.title,
            streamTitle: stream.title || stream.name,
            streamUrl: stream.url?.substring(0, 100),
            errorType,
            errorMessage,
            errorDetails: `Quick Play attempt ${index + 1}/${allStreams.length}`,
            action: index + 1 < allStreams.length ? 'retry' : 'failed',
          });
          
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
