import { useState, useEffect, useRef, useCallback } from "react";
import { Media, useMedia } from "@/hooks/useMedia";
import { useTVMode } from "@/hooks/useTVMode";
import { useRealDebridStatus } from "@/hooks/useRealDebridStatus";
import { useRealDebridConfirmation } from "@/hooks/useRealDebridConfirmation";
import { searchTorrentio, getImdbIdFromTmdb, parseStreamInfo, TorrentioStream, isDirectRdLink, isMagnetLink, extractMagnetFromTorrentioUrl, parseSizeToBytes, calculateOptimalMaxSize } from "@/lib/torrentio";
import { unrestrictLink, addMagnetAndWait, getStreamingLinks, listDownloads, RealDebridUnrestrictedLink } from "@/lib/realDebrid";
import { getImageUrl } from "@/lib/tmdb";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollAreaWithArrows } from "@/components/ui/scroll-area-with-arrows";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Loader2, Play, Film, Tv, RefreshCw, Star, Calendar, Zap, AlertCircle, Clock, Download, Search, X, HardDrive, Wifi, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface StreamQualityInfo {
  quality: string;
  size?: string;
  qualityRank?: number;
}

interface StreamSelectionDialogProps {
  media: Media | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStreamSelected: (media: Media, streamUrl: string, qualityInfo?: StreamQualityInfo, tryNextStream?: () => void) => void;
}

export function StreamSelectionDialog({
  media,
  open,
  onOpenChange,
  onStreamSelected,
}: StreamSelectionDialogProps) {
  const { updateMedia } = useMedia();
  const { isTVMode } = useTVMode();
  const { status: rdStatus, error: rdError, refresh: refreshRdStatus } = useRealDebridStatus();
  const { confirmAddToRealDebrid, ConfirmationDialog } = useRealDebridConfirmation();
  const [activeTab, setActiveTab] = useState<string>("streams");
  const [isSearching, setIsSearching] = useState(false);
  const [streams, setStreams] = useState<TorrentioStream[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
  const [isResolving, setIsResolving] = useState(false);
  const [resolvingStream, setResolvingStream] = useState<string | null>(null);
  const [resolveProgress, setResolveProgress] = useState<number>(0);
  const [resolveStatus, setResolveStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [qualityFilter, setQualityFilter] = useState<string>("best");
  const [languageFilter, setLanguageFilter] = useState<string>("english");
  const streamButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  
  // Refs to track streams for auto-retry when player reports playback error
  const filteredStreamsRef = useRef<TorrentioStream[]>([]);
  const currentStreamIndexRef = useRef<number>(0);

  // Fail-Safe state
  const [myDownloads, setMyDownloads] = useState<RealDebridUnrestrictedLink[]>([]);
  const [isLoadingDownloads, setIsLoadingDownloads] = useState(false);
  const [downloadsError, setDownloadsError] = useState<string | null>(null);
  const [downloadSearchQuery, setDownloadSearchQuery] = useState("");
  const downloadButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [downloadFocusedIndex, setDownloadFocusedIndex] = useState(0);
  
  // Track failed streams for visual indicator
  const [failedStreams, setFailedStreams] = useState<Set<string>>(new Set());

  // Filter streams based on quality and language selection
  const filteredStreams = streams.filter((stream) => {
    const info = parseStreamInfo(stream);
    const title = stream.title?.toLowerCase() || "";
    
    // Language filter
    if (languageFilter !== "all") {
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
      
      if (languageFilter === "english" && !hasEnglish) return false;
    }
    
    // Quality filter
    if (qualityFilter === "all") return true;
    const quality = info.quality?.toLowerCase() || "";
    
    // "Best" filter: optimal file size based on duration, but always include ≤3GB files
    if (qualityFilter === "best") {
      if (!info.size) return false;
      const sizeInMB = parseSizeToBytes(info.size);
      if (sizeInMB === 0) return false;
      
      const universalMaxSize = 3072; // 3GB in MB
      if (sizeInMB <= universalMaxSize) return true;
      
      const durationMinutes = media?.runtime || 90;
      const optimalMaxSize = calculateOptimalMaxSize(durationMinutes);
      
      return sizeInMB <= optimalMaxSize;
    }
    
    switch (qualityFilter) {
      case "4k":
        return quality.includes("2160") || quality.includes("4k");
      case "1080p":
        return quality.includes("1080");
      case "720p":
        return quality.includes("720");
      case "480p":
        return quality.includes("480") || quality.includes("sd");
      default:
        return true;
    }
  });
  
  // Keep ref in sync with filteredStreams for auto-retry functionality
  useEffect(() => {
    filteredStreamsRef.current = filteredStreams;
  }, [filteredStreams]);

  // Auto-fallback to "all" filter if "best" filter yields no results
  useEffect(() => {
    if (qualityFilter === "best" && streams.length > 0 && filteredStreams.length === 0) {
      setQualityFilter("all");
      toast.info("No streams matched 'Best' filter, showing all streams");
    }
  }, [qualityFilter, streams.length, filteredStreams.length]);

  // Filter downloads based on media title and episode
  const filteredDownloads = myDownloads.filter((download) => {
    if (!media) return true;
    
    const filename = download.filename.toLowerCase();
    const mediaTitle = media.title.toLowerCase();
    
    const normalizeForMatch = (str: string) => 
      str.replace(/[^\w\s]/g, '').replace(/\s+/g, '.').toLowerCase();
    
    const normalizedFilename = normalizeForMatch(download.filename);
    const normalizedTitle = normalizeForMatch(media.title);
    
    const titleWords = media.title.toLowerCase().split(/\s+/);
    const titleMatches = titleWords.every(word => 
      filename.includes(word.replace(/[^\w]/g, ''))
    ) || normalizedFilename.includes(normalizedTitle);
    
    if (!titleMatches) return false;
    
    if (media.media_type === "tv") {
      const episodePatterns = [
        new RegExp(`s0?${selectedSeason}e0?${selectedEpisode}\\b`, 'i'),
        new RegExp(`${selectedSeason}x0?${selectedEpisode}\\b`, 'i'),
        new RegExp(`season\\s*${selectedSeason}.*episode\\s*${selectedEpisode}`, 'i'),
      ];
      
      return episodePatterns.some(pattern => pattern.test(download.filename));
    }
    
    if (downloadSearchQuery.trim()) {
      const query = downloadSearchQuery.toLowerCase();
      return filename.includes(query);
    }
    
    return true;
  });

  // Auto-focus first stream when list loads or filter changes
  useEffect(() => {
    if (filteredStreams.length > 0 && !isSearching && activeTab === "streams") {
      setFocusedIndex(0);
      setTimeout(() => {
        streamButtonsRef.current[0]?.focus();
      }, 100);
    }
  }, [filteredStreams.length, isSearching, qualityFilter, activeTab]);

  // Auto-focus first download when list loads
  useEffect(() => {
    if (filteredDownloads.length > 0 && !isLoadingDownloads && activeTab === "downloads") {
      setDownloadFocusedIndex(0);
      setTimeout(() => {
        downloadButtonsRef.current[0]?.focus();
      }, 100);
    }
  }, [filteredDownloads.length, isLoadingDownloads, activeTab]);

  // Keyboard navigation for TV remotes
  const handleKeyDown = (e: React.KeyboardEvent, index: number, stream: TorrentioStream) => {
    if (isResolving) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        const nextIndex = Math.min(index + 1, filteredStreams.length - 1);
        setFocusedIndex(nextIndex);
        streamButtonsRef.current[nextIndex]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        const prevIndex = Math.max(index - 1, 0);
        setFocusedIndex(prevIndex);
        streamButtonsRef.current[prevIndex]?.focus();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleStreamSelect(stream);
        break;
    }
  };

  // Keyboard navigation for downloads
  const handleDownloadKeyDown = (e: React.KeyboardEvent, index: number, download: RealDebridUnrestrictedLink) => {
    if (isResolving) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        const nextIndex = Math.min(index + 1, filteredDownloads.length - 1);
        setDownloadFocusedIndex(nextIndex);
        downloadButtonsRef.current[nextIndex]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        const prevIndex = Math.max(index - 1, 0);
        setDownloadFocusedIndex(prevIndex);
        downloadButtonsRef.current[prevIndex]?.focus();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleDownloadSelect(download);
        break;
    }
  };

  // Reset state when dialog opens with new media
  useEffect(() => {
    if (open && media) {
      setStreams([]);
      setError(null);
      setSelectedSeason(1);
      setSelectedEpisode(1);
      setQualityFilter("best");
      setActiveTab("streams");
      setDownloadSearchQuery("");
      setFailedStreams(new Set());
      handleSearch();
      loadDownloadsInBackground();
    }
  }, [open, media?.id]);

  // Load downloads in background (non-blocking)
  const loadDownloadsInBackground = async () => {
    setIsLoadingDownloads(true);
    setDownloadsError(null);
    
    try {
      const downloads = await listDownloads();
      const videoDownloads = downloads.filter(d => 
        d.streamable === 1 && 
        (d.mimeType?.startsWith('video/') || 
         d.filename?.match(/\.(mp4|mkv|avi|m4v|webm)$/i))
      );
      setMyDownloads(videoDownloads);
    } catch (err: any) {
      console.error("Failed to load downloads:", err);
      setDownloadsError(err.message || "Failed to load downloads");
    }
    
    setIsLoadingDownloads(false);
  };

  // Load downloads when manually switching to downloads tab
  useEffect(() => {
    if (activeTab === "downloads" && myDownloads.length === 0 && !isLoadingDownloads) {
      loadMyDownloads();
    }
  }, [activeTab]);

  const loadMyDownloads = async () => {
    setIsLoadingDownloads(true);
    setDownloadsError(null);
    
    try {
      const downloads = await listDownloads();
      const videoDownloads = downloads.filter(d => 
        d.streamable === 1 && 
        (d.mimeType?.startsWith('video/') || 
         d.filename?.match(/\.(mp4|mkv|avi|m4v|webm)$/i))
      );
      setMyDownloads(videoDownloads);
    } catch (err: any) {
      console.error("Failed to load downloads:", err);
      setDownloadsError(err.message || "Failed to load Real-Debrid downloads");
    }
    
    setIsLoadingDownloads(false);
  };

  const handleSearch = async () => {
    if (!media) return;
    
    setIsSearching(true);
    setError(null);
    setStreams([]);
    
    try {
      let imdbId: string | null = null;
      
      if (media.tmdb_id) {
        imdbId = await getImdbIdFromTmdb(media.tmdb_id, media.media_type as "movie" | "tv");
      }
      
      if (!imdbId) {
        setError("Could not find IMDB ID for this title. Please add it manually in Add Media.");
        setIsSearching(false);
        return;
      }

      const type = media.media_type === "movie" ? "movie" : "series";
      const results = await searchTorrentio(
        imdbId,
        type,
        type === "series" ? selectedSeason : undefined,
        type === "series" ? selectedEpisode : undefined
      );
      
      if (results.length === 0) {
        setError("No streams found for this title. Try a different episode or check back later.");
      } else {
        setStreams(results);
        toast.success(`Found ${results.length} stream(s)`);
      }
    } catch (err: any) {
      console.error("Stream search error:", err);
      setError(err.message || "Failed to search for streams");
    }
    
    setIsSearching(false);
  };

  const getStreamableUrl = async (fileId: string, downloadUrl: string): Promise<string> => {
    if (!fileId || fileId.length < 5) {
      console.log("Invalid file ID, using direct download URL");
      return downloadUrl;
    }

    try {
      setResolveStatus("Getting streaming URL...");
      const streamingLinks = await getStreamingLinks(fileId);
      
      if (streamingLinks?.streaming_not_supported) {
        console.log("Streaming not supported for this file, using download URL");
        return downloadUrl;
      }
      
      if (!streamingLinks || typeof streamingLinks !== 'object') {
        console.log("No valid streaming response, using download URL");
        return downloadUrl;
      }
      
      const qualityOrder = ['full', 'original', '1080p', '720p', '480p', '360p'];
      for (const quality of qualityOrder) {
        if (streamingLinks[quality]?.full) {
          console.log(`Using ${quality} streaming link`);
          return streamingLinks[quality].full;
        }
      }
      
      const availableQualities = Object.keys(streamingLinks).filter(k => k !== 'streaming_not_supported');
      if (availableQualities.length > 0) {
        const firstQuality = availableQualities[0];
        if (streamingLinks[firstQuality]?.full) {
          console.log(`Using ${firstQuality} streaming link`);
          return streamingLinks[firstQuality].full;
        }
      }
      
      console.log("No streaming links available, using download URL");
      return downloadUrl;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes("wrong_parameter") || errorMessage.includes("invalid")) {
        console.log("File doesn't support transcoding, using direct download URL");
      } else {
        console.warn("Could not get streaming links, using download URL:", errorMessage);
      }
      return downloadUrl;
    }
  };

  const handleStreamSelect = async (stream: TorrentioStream) => {
    if (!media || isResolving) return;
    
    const streamIndex = filteredStreamsRef.current.findIndex(s => s.url === stream.url);
    currentStreamIndexRef.current = streamIndex >= 0 ? streamIndex : 0;
    
    const createTryNextStream = () => {
      return () => {
        const currentIdx = currentStreamIndexRef.current;
        const streams = filteredStreamsRef.current;
        
        setFailedStreams(prev => {
          const newSet = new Set(prev);
          if (streams[currentIdx]) {
            newSet.add(streams[currentIdx].url);
          }
          return newSet;
        });
        
        const nextIndex = currentIdx + 1;
        if (nextIndex < streams.length) {
          currentStreamIndexRef.current = nextIndex;
          const nextStream = streams[nextIndex];
          toast.info(`Trying next stream (${nextIndex + 1}/${streams.length})...`);
          handleStreamSelect(nextStream);
        } else {
          toast.error("No more streams to try. Please select a different one manually.");
          onOpenChange(true);
        }
      };
    };
    
    setIsResolving(true);
    setResolvingStream(stream.url);
    setResolveProgress(0);
    setResolveStatus("Resolving...");
    
    const info = parseStreamInfo(stream);
    const qualityInfo: StreamQualityInfo = {
      quality: info.quality || "Unknown",
      size: info.size,
      qualityRank: info.qualityRank
    };
    
    try {
      if (isDirectRdLink(stream.url)) {
        setResolveProgress(100);
        setResolveStatus("Ready!");
        setTimeout(() => {
          onOpenChange(false);
          onStreamSelected(media, stream.url, qualityInfo, createTryNextStream());
        }, 300);
        return;
      }
      
      if (isMagnetLink(stream.url)) {
        setResolveStatus("Processing magnet...");
        
        const shouldAdd = await confirmAddToRealDebrid(stream.title || stream.name || "Unknown");
        if (!shouldAdd) {
          setIsResolving(false);
          setResolvingStream(null);
          setResolveProgress(0);
          setResolveStatus("");
          return;
        }
        
        setResolveProgress(20);
        
        const result = await addMagnetAndWait(stream.url, (progress) => {
          setResolveProgress(20 + Math.floor(progress * 0.6));
          setResolveStatus(status);
        });
        
        if (result.status === "downloaded" && result.links && result.links.length > 0) {
          setResolveProgress(85);
          setResolveStatus("Unrestricting link...");
          
          const videoLink = result.links.find((l: string) => 
            /\.(mp4|mkv|avi|m4v|webm)$/i.test(l)
          ) || result.links[0];
          
          const unrestricted = await unrestrictLink(videoLink);
          
          setResolveProgress(95);
          const streamUrl = await getStreamableUrl(unrestricted.id, unrestricted.download);
          
          setResolveProgress(100);
          setResolveStatus("Ready!");
          
          setTimeout(() => {
            onOpenChange(false);
            onStreamSelected(media, streamUrl, qualityInfo, createTryNextStream());
          }, 300);
        } else {
          throw new Error("Download not ready. Please try again later.");
        }
        return;
      }
      
      // Handle Torrentio URL with embedded magnet
      const magnetLink = extractMagnetFromTorrentioUrl(stream.url);
      if (magnetLink) {
        setResolveStatus("Processing stream...");
        
        const shouldAdd = await confirmAddToRealDebrid(stream.title || stream.name || "Unknown");
        if (!shouldAdd) {
          setIsResolving(false);
          setResolvingStream(null);
          setResolveProgress(0);
          setResolveStatus("");
          return;
        }
        
        setResolveProgress(20);
        
        const result = await addMagnetAndWait(magnetLink, (progress) => {
          setResolveProgress(20 + Math.floor(progress * 0.6));
          setResolveStatus(status);
        });
        
        if (result.status === "downloaded" && result.links && result.links.length > 0) {
          setResolveProgress(85);
          setResolveStatus("Unrestricting link...");
          
          const videoLink = result.links.find((l: string) => 
            /\.(mp4|mkv|avi|m4v|webm)$/i.test(l)
          ) || result.links[0];
          
          const unrestricted = await unrestrictLink(videoLink);
          
          setResolveProgress(95);
          const streamUrl = await getStreamableUrl(unrestricted.id, unrestricted.download);
          
          setResolveProgress(100);
          setResolveStatus("Ready!");
          
          setTimeout(() => {
            onOpenChange(false);
            onStreamSelected(media, streamUrl, qualityInfo, createTryNextStream());
          }, 300);
        } else {
          throw new Error("Download not ready. Please try again later.");
        }
        return;
      }
      
      // Handle as HTTP URL
      setResolveStatus("Unrestricting link...");
      setResolveProgress(40);
      
      const unrestricted = await unrestrictLink(stream.url);
      
      setResolveProgress(90);
      const streamUrl = await getStreamableUrl(unrestricted.id, unrestricted.download);
      
      setResolveProgress(100);
      setResolveStatus("Ready!");
      
      setTimeout(() => {
        onOpenChange(false);
        onStreamSelected(media, streamUrl, qualityInfo, createTryNextStream());
      }, 300);
      
    } catch (err: any) {
      console.error("Stream selection error:", err);
      
      setFailedStreams(prev => {
        const newSet = new Set(prev);
        newSet.add(stream.url);
        return newSet;
      });
      
      toast.error(err.message || "Failed to process stream");
    } finally {
      setIsResolving(false);
      setResolvingStream(null);
      setResolveProgress(0);
      setResolveStatus("");
    }
  };

  const handleDownloadSelect = async (download: RealDebridUnrestrictedLink) => {
    if (!media || isResolving) return;
    
    setIsResolving(true);
    setResolvingStream(download.download);
    setResolveProgress(50);
    setResolveStatus("Getting stream URL...");
    
    const quality = extractQuality(download.filename);
    const qualityInfo: StreamQualityInfo = {
      quality: quality || "Unknown",
      size: formatFileSize(download.filesize),
    };
    
    try {
      const streamUrl = await getStreamableUrl(download.id, download.download);
      
      setResolveProgress(100);
      setResolveStatus("Ready!");
      
      setTimeout(() => {
        onOpenChange(false);
        onStreamSelected(media, streamUrl, qualityInfo);
      }, 300);
      
    } catch (err: any) {
      console.error("Download stream error:", err);
      toast.error(err.message || "Failed to get stream URL");
    } finally {
      setIsResolving(false);
      setResolvingStream(null);
      setResolveProgress(0);
      setResolveStatus("");
    }
  };

  const posterUrl = media?.poster_path 
    ? (media.poster_path.startsWith('http') ? media.poster_path : getImageUrl(media.poster_path, "w200"))
    : null;

  const backdropUrl = media?.backdrop_path
    ? (media.backdrop_path.startsWith('http') ? media.backdrop_path : getImageUrl(media.backdrop_path, "w780"))
    : null;

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1073741824) {
      return (bytes / 1073741824).toFixed(2) + " GB";
    } else if (bytes >= 1048576) {
      return (bytes / 1048576).toFixed(1) + " MB";
    } else {
      return (bytes / 1024).toFixed(0) + " KB";
    }
  };

  const extractQuality = (filename: string): string => {
    const match = filename.match(/(\d{3,4}p|4K|2160p)/i);
    return match ? match[1].toUpperCase() : "";
  };

  // Extract additional info from stream title
  const extractStreamDetails = (stream: TorrentioStream) => {
    const info = parseStreamInfo(stream);
    const title = stream.title?.toLowerCase() || "";
    
    // Extract codec
    let codec = "";
    if (title.includes("hevc") || title.includes("x265") || title.includes("h.265") || title.includes("h265")) {
      codec = "HEVC";
    } else if (title.includes("x264") || title.includes("h.264") || title.includes("h264") || title.includes("avc")) {
      codec = "H.264";
    } else if (title.includes("av1")) {
      codec = "AV1";
    }
    
    // Extract audio
    let audio = "";
    if (title.includes("atmos")) {
      audio = "Atmos";
    } else if (title.includes("truehd")) {
      audio = "TrueHD";
    } else if (title.includes("dts-hd") || title.includes("dts hd")) {
      audio = "DTS-HD";
    } else if (title.includes("dts")) {
      audio = "DTS";
    } else if (title.includes("aac")) {
      audio = "AAC";
    } else if (title.includes("dd5.1") || title.includes("dd 5.1") || title.includes("dolby digital")) {
      audio = "DD5.1";
    }
    
    // Extract HDR info
    let hdr = "";
    if (title.includes("dolby vision") || title.includes("dv ") || title.includes("dovi")) {
      hdr = "DV";
    } else if (title.includes("hdr10+")) {
      hdr = "HDR10+";
    } else if (title.includes("hdr10") || title.includes("hdr")) {
      hdr = "HDR";
    }
    
    // Extract source/provider from stream name
    const provider = stream.name?.split("\n")[0] || "Unknown";
    
    return { ...info, codec, audio, hdr, provider };
  };

  // Quality badge color based on resolution
  const getQualityColor = (quality: string) => {
    const q = quality?.toLowerCase() || "";
    if (q.includes("2160") || q.includes("4k")) {
      return "bg-purple-600 text-white";
    } else if (q.includes("1080")) {
      return "bg-blue-600 text-white";
    } else if (q.includes("720")) {
      return "bg-green-600 text-white";
    }
    return "bg-muted text-muted-foreground";
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none p-0 rounded-none border-none overflow-hidden bg-[#0a0a0f]">
        {/* Stremio-style layout */}
        <div className="flex h-full">
          {/* Left Panel - Media Info */}
          <div className="w-[360px] shrink-0 flex flex-col bg-[#0d0d14] border-r border-white/5">
            {/* Header with close button */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h2 className="text-lg font-semibold text-white">Select Stream</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Media poster and info */}
            {media && (
              <div className="p-4 space-y-4">
                {/* Poster with backdrop */}
                <div className="relative aspect-video rounded-lg overflow-hidden bg-black/50">
                  {backdropUrl ? (
                    <img
                      src={backdropUrl}
                      alt={media.title}
                      className="w-full h-full object-cover opacity-60"
                    />
                  ) : posterUrl ? (
                    <img
                      src={posterUrl}
                      alt={media.title}
                      className="w-full h-full object-cover opacity-60"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {media.media_type === "movie" ? (
                        <Film className="w-12 h-12 text-white/20" />
                      ) : (
                        <Tv className="w-12 h-12 text-white/20" />
                      )}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d14] via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <h3 className="text-white font-bold text-xl leading-tight">{media.title}</h3>
                  </div>
                </div>

                {/* Meta info */}
                <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
                  <span className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded">
                    {media.media_type === "movie" ? <Film className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
                    {media.media_type === "movie" ? "Movie" : "TV Series"}
                  </span>
                  {media.release_date && (
                    <span className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded">
                      <Calendar className="w-3.5 h-3.5" />
                      {media.release_date.slice(0, 4)}
                    </span>
                  )}
                  {media.rating && media.rating > 0 && (
                    <span className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded">
                      <Star className="w-3.5 h-3.5 text-yellow-500" />
                      {media.rating.toFixed(1)}
                    </span>
                  )}
                  {media.runtime && media.runtime > 0 && (
                    <span className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded">
                      <Clock className="w-3.5 h-3.5" />
                      {media.media_type === "tv" ? `~${media.runtime}m` : `${Math.floor(media.runtime / 60)}h ${media.runtime % 60}m`}
                    </span>
                  )}
                </div>

                {/* Season/Episode picker for TV */}
                {media.media_type === "tv" && (
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="flex-1 justify-between bg-white/5 border-white/10 hover:bg-white/10 text-white">
                          <span>Season {selectedSeason}</span>
                          <ChevronDown className="w-4 h-4 opacity-60" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2 bg-[#1a1a24] border-white/10" align="start">
                        <div className="grid grid-cols-5 gap-1 max-h-[200px] overflow-y-auto">
                          {Array.from({ length: media.seasons || 10 }, (_, i) => i + 1).map((s) => (
                            <Button
                              key={s}
                              variant={selectedSeason === s ? "default" : "ghost"}
                              size="sm"
                              className={cn("h-8 w-10", selectedSeason !== s && "text-white/70 hover:text-white hover:bg-white/10")}
                              onClick={() => { setSelectedSeason(s); setSelectedEpisode(1); setStreams([]); }}
                            >
                              {s}
                            </Button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="flex-1 justify-between bg-white/5 border-white/10 hover:bg-white/10 text-white">
                          <span>Episode {selectedEpisode}</span>
                          <ChevronDown className="w-4 h-4 opacity-60" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2 bg-[#1a1a24] border-white/10" align="start">
                        <div className="grid grid-cols-5 gap-1 max-h-[200px] overflow-y-auto">
                          {Array.from({ length: 30 }, (_, i) => i + 1).map((e) => (
                            <Button
                              key={e}
                              variant={selectedEpisode === e ? "default" : "ghost"}
                              size="sm"
                              className={cn("h-8 w-10", selectedEpisode !== e && "text-white/70 hover:text-white hover:bg-white/10")}
                              onClick={() => { setSelectedEpisode(e); setStreams([]); }}
                            >
                              {e}
                            </Button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button onClick={handleSearch} disabled={isSearching} variant="outline" size="icon" className="bg-white/5 border-white/10 hover:bg-white/10 text-white">
                      {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Tabs */}
            <div className="px-4 border-b border-white/5">
              <div className="flex">
                <button
                  onClick={() => setActiveTab("streams")}
                  className={cn(
                    "flex-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                    activeTab === "streams" 
                      ? "text-white border-primary" 
                      : "text-white/50 border-transparent hover:text-white/80"
                  )}
                >
                  <Wifi className="w-4 h-4 inline-block mr-2" />
                  Streams
                </button>
                <button
                  onClick={() => setActiveTab("downloads")}
                  className={cn(
                    "flex-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                    activeTab === "downloads" 
                      ? "text-white border-primary" 
                      : "text-white/50 border-transparent hover:text-white/80"
                  )}
                >
                  <HardDrive className="w-4 h-4 inline-block mr-2" />
                  Downloads
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="p-4 space-y-3 border-b border-white/5">
              <div className="flex gap-2">
                <Select value={qualityFilter} onValueChange={setQualityFilter}>
                  <SelectTrigger className="flex-1 bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Quality" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a24] border-white/10">
                    <SelectItem value="all">All Quality</SelectItem>
                    <SelectItem value="best">Best</SelectItem>
                    <SelectItem value="4k">4K</SelectItem>
                    <SelectItem value="1080p">1080p</SelectItem>
                    <SelectItem value="720p">720p</SelectItem>
                    <SelectItem value="480p">480p/SD</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={languageFilter} onValueChange={setLanguageFilter}>
                  <SelectTrigger className="flex-1 bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a24] border-white/10">
                    <SelectItem value="all">All Languages</SelectItem>
                    <SelectItem value="english">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Stream count */}
              <div className="text-xs text-white/40">
                {activeTab === "streams" ? (
                  isSearching ? "Searching..." : `${filteredStreams.length} streams available`
                ) : (
                  isLoadingDownloads ? "Loading..." : `${filteredDownloads.length} downloads`
                )}
              </div>
            </div>

            {/* Real-Debrid status */}
            {(rdStatus === "service_unavailable" || rdStatus === "error") && (
              <div className="p-4 bg-red-500/10 border-b border-red-500/20">
                <p className="text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {rdError || "Real-Debrid unavailable"}
                </p>
              </div>
            )}
          </div>

          {/* Right Panel - Stream List */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0f]">
            {activeTab === "streams" ? (
              <>
                {/* Loading state */}
                {isSearching && (
                  <div className="flex-1 p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <span className="text-white/60">Searching for streams...</span>
                    </div>
                    <div className="space-y-2">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full bg-white/5" />
                      ))}
                    </div>
                  </div>
                )}

                {/* Error state */}
                {error && !isSearching && (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center">
                      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                      <p className="text-white/80 mb-4">{error}</p>
                      <Button onClick={handleSearch} variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Try Again
                      </Button>
                    </div>
                  </div>
                )}

                {/* Stream list */}
                {!isSearching && !error && (
                  <ScrollAreaWithArrows className="flex-1" scrollStep={100} isTVMode={isTVMode}>
                    <div className="p-2 space-y-1">
                      {filteredStreams.length === 0 && streams.length > 0 ? (
                        <div className="flex items-center justify-center py-12 text-white/40">
                          No streams match the selected filters
                        </div>
                      ) : filteredStreams.length === 0 ? (
                        <div className="flex items-center justify-center py-12 text-white/40">
                          No streams found
                        </div>
                      ) : (
                        filteredStreams.map((stream, index) => {
                          const details = extractStreamDetails(stream);
                          const isCurrentlyResolving = resolvingStream === stream.url;
                          const isFocused = focusedIndex === index;
                          const hasFailed = failedStreams.has(stream.url);
                          
                          return (
                            <button
                              key={index}
                              ref={(el) => (streamButtonsRef.current[index] = el)}
                              onClick={() => handleStreamSelect(stream)}
                              onKeyDown={(e) => handleKeyDown(e, index, stream)}
                              onFocus={() => setFocusedIndex(index)}
                              disabled={isResolving}
                              className={cn(
                                "w-full text-left p-3 rounded-lg transition-all duration-150 group",
                                hasFailed
                                  ? "bg-red-500/10 border border-red-500/30 opacity-60"
                                  : isCurrentlyResolving
                                  ? "bg-primary/20 border border-primary ring-1 ring-primary"
                                  : isFocused
                                  ? "bg-white/10 border border-primary"
                                  : "bg-white/[0.02] border border-transparent hover:bg-white/[0.06] hover:border-white/10",
                                "focus:outline-none focus:bg-white/10 focus:border-primary",
                                isResolving && !isCurrentlyResolving && "opacity-40 pointer-events-none"
                              )}
                            >
                              <div className="flex items-start gap-3">
                                {/* Provider icon placeholder */}
                                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                  {details.isDirectLink ? (
                                    <Zap className="w-5 h-5 text-green-400" />
                                  ) : (
                                    <Wifi className="w-5 h-5 text-white/40" />
                                  )}
                                </div>

                                {/* Stream info */}
                                <div className="flex-1 min-w-0">
                                  {/* Top row - Quality badges */}
                                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                    {details.quality && (
                                      <span className={cn("px-2 py-0.5 rounded text-xs font-bold", getQualityColor(details.quality))}>
                                        {details.quality}
                                      </span>
                                    )}
                                    {details.hdr && (
                                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400">
                                        {details.hdr}
                                      </span>
                                    )}
                                    {details.codec && (
                                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-white/10 text-white/70">
                                        {details.codec}
                                      </span>
                                    )}
                                    {details.audio && (
                                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-white/10 text-white/70">
                                        {details.audio}
                                      </span>
                                    )}
                                    {details.isDirectLink && (
                                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-400 flex items-center gap-1">
                                        <Zap className="w-3 h-3" />
                                        Cached
                                      </span>
                                    )}
                                    {hasFailed && (
                                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400">
                                        Failed
                                      </span>
                                    )}
                                  </div>

                                  {/* Title */}
                                  <p className="text-sm text-white/80 truncate leading-tight mb-1">
                                    {stream.title || stream.name}
                                  </p>

                                  {/* Bottom row - Size and provider */}
                                  <div className="flex items-center gap-3 text-xs text-white/40">
                                    {details.size && (
                                      <span className="flex items-center gap-1">
                                        <HardDrive className="w-3 h-3" />
                                        {details.size}
                                      </span>
                                    )}
                                    <span>{details.provider}</span>
                                  </div>
                                </div>

                                {/* Play button / Loading */}
                                <div className="shrink-0 self-center">
                                  {isCurrentlyResolving ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                      {resolveStatus && (
                                        <span className="text-[10px] text-primary">{resolveStatus}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className={cn(
                                      "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                                      isFocused ? "bg-primary text-white" : "bg-white/5 text-white/40 group-hover:bg-white/10 group-hover:text-white/60"
                                    )}>
                                      <Play className="w-5 h-5 ml-0.5" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </ScrollAreaWithArrows>
                )}
              </>
            ) : (
              /* Downloads tab */
              <>
                {/* Search box */}
                <div className="p-4 border-b border-white/5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      placeholder="Search downloads..."
                      value={downloadSearchQuery}
                      onChange={(e) => setDownloadSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-white placeholder:text-white/40"
                    />
                  </div>
                </div>

                {/* Loading state */}
                {isLoadingDownloads && (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                )}

                {/* Error state */}
                {downloadsError && !isLoadingDownloads && (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center">
                      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                      <p className="text-white/80 mb-4">{downloadsError}</p>
                      <Button onClick={loadMyDownloads} variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Try Again
                      </Button>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {!isLoadingDownloads && !downloadsError && filteredDownloads.length === 0 && (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-white/40">
                      <Download className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No downloads found</p>
                    </div>
                  </div>
                )}

                {/* Downloads list */}
                {!isLoadingDownloads && filteredDownloads.length > 0 && (
                  <ScrollAreaWithArrows className="flex-1" scrollStep={100} isTVMode={isTVMode}>
                    <div className="p-2 space-y-1">
                      {filteredDownloads.map((download, index) => {
                        const quality = extractQuality(download.filename);
                        const isCurrentlyResolving = resolvingStream === download.download;
                        const isFocused = downloadFocusedIndex === index;
                        
                        return (
                          <button
                            key={download.id}
                            ref={(el) => (downloadButtonsRef.current[index] = el)}
                            onClick={() => handleDownloadSelect(download)}
                            onKeyDown={(e) => handleDownloadKeyDown(e, index, download)}
                            onFocus={() => setDownloadFocusedIndex(index)}
                            disabled={isResolving}
                            className={cn(
                              "w-full text-left p-3 rounded-lg transition-all duration-150 group",
                              isCurrentlyResolving
                                ? "bg-primary/20 border border-primary ring-1 ring-primary"
                                : isFocused
                                ? "bg-white/10 border border-primary"
                                : "bg-white/[0.02] border border-transparent hover:bg-white/[0.06] hover:border-white/10",
                              "focus:outline-none focus:bg-white/10 focus:border-primary",
                              isResolving && !isCurrentlyResolving && "opacity-40 pointer-events-none"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              {/* Icon */}
                              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                                <HardDrive className="w-5 h-5 text-green-400" />
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                  {quality && (
                                    <span className={cn("px-2 py-0.5 rounded text-xs font-bold", getQualityColor(quality))}>
                                      {quality}
                                    </span>
                                  )}
                                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-400">
                                    Downloaded
                                  </span>
                                </div>
                                <p className="text-sm text-white/80 truncate leading-tight mb-1">
                                  {download.filename}
                                </p>
                                <div className="flex items-center gap-3 text-xs text-white/40">
                                  <span className="flex items-center gap-1">
                                    <HardDrive className="w-3 h-3" />
                                    {formatFileSize(download.filesize)}
                                  </span>
                                </div>
                              </div>

                              {/* Play button */}
                              <div className="shrink-0 self-center">
                                {isCurrentlyResolving ? (
                                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                ) : (
                                  <div className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                                    isFocused ? "bg-primary text-white" : "bg-white/5 text-white/40 group-hover:bg-white/10 group-hover:text-white/60"
                                  )}>
                                    <Play className="w-5 h-5 ml-0.5" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollAreaWithArrows>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmationDialog />
    </>
  );
}
