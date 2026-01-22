import { useState, useCallback } from "react";
import { Media } from "@/hooks/useMedia";
import { searchTorrentio, getImdbIdFromTmdb, parseStreamInfo, TorrentioStream, isDirectRdLink, isMagnetLink, extractMagnetFromTorrentioUrl, parseSizeToBytes, calculateOptimalMaxSize } from "@/lib/torrentio";
import { unrestrictLink, addMagnetAndWait, getStreamingLinks } from "@/lib/realDebrid";
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

  // Filter and find best stream
  const findBestStream = (streams: TorrentioStream[], durationMinutes: number = 90): TorrentioStream | null => {
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
    const streamsToUse = filteredStreams.length > 0 ? filteredStreams : englishStreams.length > 0 ? englishStreams : streams;
    
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

      // Create a mutable index for auto-fallback
      let currentIndex = 0;
      const allStreams = [...streams];
      
      // Filter for best quality first
      const durationMinutes = media.runtime || 90;
      const bestStream = findBestStream(allStreams, durationMinutes);
      
      if (bestStream) {
        // Move best stream to front if not already
        const bestIdx = allStreams.findIndex(s => s.url === bestStream.url);
        if (bestIdx > 0) {
          allStreams.splice(bestIdx, 1);
          allStreams.unshift(bestStream);
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
          console.log(`Quick Play: Stream ${index + 1} failed, trying next...`, err.message);
          // Auto-fallback to next stream
          return tryStream(index + 1);
        }
      };

      toast.success("Resolving stream...", { duration: 1500 });
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
