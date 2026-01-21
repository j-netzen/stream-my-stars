import { useState, useEffect, useRef, useCallback } from "react";
import { Media, useMedia } from "@/hooks/useMedia";
import { useTVMode } from "@/hooks/useTVMode";
import { useBrowseHere } from "@/hooks/useBrowseHere";
import { useRealDebridStatus } from "@/hooks/useRealDebridStatus";
import { useRealDebridConfirmation } from "@/hooks/useRealDebridConfirmation";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
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
import { Loader2, Play, Film, Tv, RefreshCw, Star, Calendar, Zap, AlertCircle, Clock, Download, Search, X, HardDrive, Wifi, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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
  const { isBrowseHere } = useBrowseHere();
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
  
  // Horizontal scroll refs for touch/mouse drag
  const streamsScrollRef = useHorizontalScroll<HTMLDivElement>();
  const downloadsScrollRef = useHorizontalScroll<HTMLDivElement>();
  
  // Scroll boundary state for hiding arrow buttons
  const [streamsCanScrollLeft, setStreamsCanScrollLeft] = useState(false);
  const [streamsCanScrollRight, setStreamsCanScrollRight] = useState(false);
  const [downloadsCanScrollLeft, setDownloadsCanScrollLeft] = useState(false);
  const [downloadsCanScrollRight, setDownloadsCanScrollRight] = useState(false);
  
  // Check scroll boundaries for streams
  const updateStreamsScrollState = useCallback(() => {
    const el = streamsScrollRef.current;
    if (!el) return;
    setStreamsCanScrollLeft(el.scrollLeft > 0);
    setStreamsCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);
  
  // Check scroll boundaries for downloads
  const updateDownloadsScrollState = useCallback(() => {
    const el = downloadsScrollRef.current;
    if (!el) return;
    setDownloadsCanScrollLeft(el.scrollLeft > 0);
    setDownloadsCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);
  
  // Refs to track streams for auto-retry when player reports playback error
  const filteredStreamsRef = useRef<TorrentioStream[]>([]);
  const currentStreamIndexRef = useRef<number>(0);

  // Refs for header navigation buttons (D-pad focus)
  const streamsNavLeftRef = useRef<HTMLButtonElement>(null);
  const streamsNavRightRef = useRef<HTMLButtonElement>(null);
  const downloadsNavLeftRef = useRef<HTMLButtonElement>(null);
  const downloadsNavRightRef = useRef<HTMLButtonElement>(null);

  const scrollBehavior: ScrollBehavior = isBrowseHere ? "auto" : "smooth";

  // Helper to scroll container with fallback for TV browsers that may not support scrollBy
  const scrollContainerBy = useCallback((container: HTMLElement | null, delta: number) => {
    if (!container) return;
    if (typeof container.scrollBy === 'function') {
      container.scrollBy({ left: delta, behavior: scrollBehavior });
    } else {
      // Fallback for older browsers
      container.scrollLeft += delta;
    }
  }, [scrollBehavior]);

  const centerElementInScroll = useCallback(
    (container: HTMLElement | null, el: HTMLElement | null) => {
      if (!container || !el) return;
      const left = el.offsetLeft - (container.clientWidth - el.clientWidth) / 2;
      container.scrollTo({ left, behavior: scrollBehavior });
    },
    [scrollBehavior],
  );

  const focusStreamAtIndex = useCallback(
    (index: number) => {
      const max = filteredStreamsRef.current.length - 1;
      if (max < 0) return;
      const clamped = Math.max(0, Math.min(index, max));
      setFocusedIndex(clamped);
      requestAnimationFrame(() => {
        const btn = streamButtonsRef.current[clamped];
        if (!btn) return;
        btn.focus();
        centerElementInScroll(streamsScrollRef.current, btn);
      });
    },
    [centerElementInScroll, streamsScrollRef],
  );

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

  const focusDownloadAtIndex = useCallback(
    (index: number) => {
      const max = filteredDownloads.length - 1;
      if (max < 0) return;
      const clamped = Math.max(0, Math.min(index, max));
      setDownloadFocusedIndex(clamped);
      requestAnimationFrame(() => {
        const btn = downloadButtonsRef.current[clamped];
        if (!btn) return;
        btn.focus();
        centerElementInScroll(downloadsScrollRef.current, btn);
      });
    },
    [centerElementInScroll, downloadsScrollRef, filteredDownloads.length],
  );

  // Update scroll state on mount and when content changes
  useEffect(() => {
    const el = streamsScrollRef.current;
    if (!el) return;
    
    // Multiple update attempts to catch post-paint layout
    const updateScroll = () => updateStreamsScrollState();
    updateScroll();
    
    el.addEventListener('scroll', updateScroll);
    
    // Also update on resize (fallback for TV browsers that may not support ResizeObserver)
    let resizeObserver: ResizeObserver | null = null;
    const handleResize = () => updateScroll();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateScroll);
      resizeObserver.observe(el);
    } else {
      window.addEventListener("resize", handleResize);
    }

    // Multiple RAF calls to ensure layout is complete
    const raf1 = requestAnimationFrame(updateScroll);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(updateScroll));
    // Also a short timeout for mobile browsers
    const timeout = setTimeout(updateScroll, 100);
    
    return () => {
      el.removeEventListener('scroll', updateScroll);
      if (resizeObserver) resizeObserver.disconnect();
      else window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timeout);
    };
  }, [updateStreamsScrollState, filteredStreams.length]);
  
  useEffect(() => {
    const el = downloadsScrollRef.current;
    if (!el) return;
    
    const updateScroll = () => updateDownloadsScrollState();
    updateScroll();
    
    el.addEventListener('scroll', updateScroll);
    let resizeObserver: ResizeObserver | null = null;
    const handleResize = () => updateScroll();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateScroll);
      resizeObserver.observe(el);
    } else {
      window.addEventListener("resize", handleResize);
    }

    const raf1 = requestAnimationFrame(updateScroll);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(updateScroll));
    const timeout = setTimeout(updateScroll, 100);
    
    return () => {
      el.removeEventListener('scroll', updateScroll);
      if (resizeObserver) resizeObserver.disconnect();
      else window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timeout);
    };
  }, [updateDownloadsScrollState, filteredDownloads.length]);

  // Auto-focus first stream when list loads or filter changes
  useEffect(() => {
    if (filteredStreams.length > 0 && !isSearching && activeTab === "streams") {
      focusStreamAtIndex(0);
    }
  }, [filteredStreams.length, isSearching, qualityFilter, activeTab, focusStreamAtIndex]);

  // Auto-focus first download when list loads
  useEffect(() => {
    if (filteredDownloads.length > 0 && !isLoadingDownloads && activeTab === "downloads") {
      focusDownloadAtIndex(0);
    }
  }, [filteredDownloads.length, isLoadingDownloads, activeTab, focusDownloadAtIndex]);

  // Keyboard navigation for TV remotes - horizontal scrolling
  const handleKeyDown = (e: React.KeyboardEvent, index: number, stream: TorrentioStream) => {
    if (isResolving) return;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusStreamAtIndex(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusStreamAtIndex(index - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        // Focus header navigation arrows
        streamsNavLeftRef.current?.focus();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleStreamSelect(stream);
        break;
    }
  };

  // Keyboard navigation for header arrow buttons (streams)
  const handleStreamsNavKeyDown = (e: React.KeyboardEvent, isLeft: boolean) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusStreamAtIndex(focusedIndex);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (isLeft) {
          streamsNavRightRef.current?.focus();
        } else {
          scrollContainerBy(streamsScrollRef.current, 400);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (!isLeft) {
          streamsNavLeftRef.current?.focus();
        } else {
          scrollContainerBy(streamsScrollRef.current, -400);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        scrollContainerBy(streamsScrollRef.current, isLeft ? -400 : 400);
        break;
    }
  };

  // Keyboard navigation for downloads - horizontal scrolling
  const handleDownloadKeyDown = (e: React.KeyboardEvent, index: number, download: RealDebridUnrestrictedLink) => {
    if (isResolving) return;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusDownloadAtIndex(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusDownloadAtIndex(index - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        // Focus header navigation arrows
        downloadsNavLeftRef.current?.focus();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleDownloadSelect(download);
        break;
    }
  };

  // Keyboard navigation for header arrow buttons (downloads)
  const handleDownloadsNavKeyDown = (e: React.KeyboardEvent, isLeft: boolean) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusDownloadAtIndex(downloadFocusedIndex);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (isLeft) {
          downloadsNavRightRef.current?.focus();
        } else {
          scrollContainerBy(downloadsScrollRef.current, 400);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (!isLeft) {
          downloadsNavLeftRef.current?.focus();
        } else {
          scrollContainerBy(downloadsScrollRef.current, -400);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        scrollContainerBy(downloadsScrollRef.current, isLeft ? -400 : 400);
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
      <DialogContent
        className="w-screen h-screen max-w-none max-h-none p-0 rounded-none border-none overflow-hidden bg-[#0a0a0f]"
        onKeyDown={(e) => {
          if (isResolving) return;
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

          const target = e.target as HTMLElement | null;
          const tag = target?.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA") return;

          const active = document.activeElement;
          if (activeTab === "streams" && filteredStreamsRef.current.length > 0) {
            const isOnCard = streamButtonsRef.current.some((b) => b && b === active);
            if (isOnCard) return;
            e.preventDefault();
            const delta = e.key === "ArrowRight" ? 1 : -1;
            focusStreamAtIndex(focusedIndex + delta);
          }

          if (activeTab === "downloads" && filteredDownloads.length > 0) {
            const isOnCard = downloadButtonsRef.current.some((b) => b && b === active);
            if (isOnCard) return;
            e.preventDefault();
            const delta = e.key === "ArrowRight" ? 1 : -1;
            focusDownloadAtIndex(downloadFocusedIndex + delta);
          }
        }}
      >
        {/* Stremio-style layout - Horizontal navigation */}
        <div className="flex flex-col h-full">
          {/* Top Header Bar */}
          <div className="flex items-center gap-4 px-6 py-4 bg-[#0d0d14] border-b border-white/5">
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-9 w-9 text-white/60 hover:text-white hover:bg-white/10 shrink-0"
            >
              <X className="h-5 w-5" />
            </Button>

            {/* Media info - horizontal */}
            {media && (
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {/* Small poster */}
                <div className="w-12 h-16 rounded overflow-hidden bg-white/5 shrink-0">
                  {posterUrl ? (
                    <img src={posterUrl} alt={media.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {media.media_type === "movie" ? <Film className="w-5 h-5 text-white/20" /> : <Tv className="w-5 h-5 text-white/20" />}
                    </div>
                  )}
                </div>

                {/* Title and meta */}
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-white truncate">{media.title}</h2>
                  <div className="flex items-center gap-3 text-sm text-white/50">
                    <span className="flex items-center gap-1">
                      {media.media_type === "movie" ? <Film className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
                      {media.media_type === "movie" ? "Movie" : "TV"}
                    </span>
                    {media.release_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {media.release_date.slice(0, 4)}
                      </span>
                    )}
                    {media.rating && media.rating > 0 && (
                      <span className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-yellow-500" />
                        {media.rating.toFixed(1)}
                      </span>
                    )}
                    {media.runtime && media.runtime > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {media.media_type === "tv" ? `~${media.runtime}m` : `${Math.floor(media.runtime / 60)}h ${media.runtime % 60}m`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Season/Episode picker for TV - inline */}
                {media.media_type === "tv" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10 text-white gap-1">
                          <span>S{selectedSeason}</span>
                          <ChevronDown className="w-3 h-3 opacity-60" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2 bg-[#1a1a24] border-white/10" align="end">
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
                        <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10 text-white gap-1">
                          <span>E{selectedEpisode}</span>
                          <ChevronDown className="w-3 h-3 opacity-60" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2 bg-[#1a1a24] border-white/10" align="end">
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
                    <Button onClick={handleSearch} disabled={isSearching} variant="outline" size="icon" className="h-8 w-8 bg-white/5 border-white/10 hover:bg-white/10 text-white">
                      {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Horizontal Navigation Bar - Stremio style */}
          <div className="flex items-center gap-6 px-6 py-3 bg-[#0d0d14]/80 border-b border-white/5">
            {/* Tabs - horizontal like Stremio */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab("streams")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-all",
                  activeTab === "streams" 
                    ? "bg-primary text-white" 
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <Wifi className="w-4 h-4 inline-block mr-2" />
                Streams
              </button>
              <button
                onClick={() => setActiveTab("downloads")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-all",
                  activeTab === "downloads" 
                    ? "bg-primary text-white" 
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <HardDrive className="w-4 h-4 inline-block mr-2" />
                Downloads
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-white/10" />

            {/* Filters - horizontal */}
            <div className="flex items-center gap-2">
              <Select value={qualityFilter} onValueChange={setQualityFilter}>
                <SelectTrigger className="w-[120px] h-9 bg-white/5 border-white/10 text-white text-sm">
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
                <SelectTrigger className="w-[120px] h-9 bg-white/5 border-white/10 text-white text-sm">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a24] border-white/10">
                  <SelectItem value="all">All Languages</SelectItem>
                  <SelectItem value="english">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Stream count - right aligned */}
            <div className="ml-auto text-sm text-white/40">
              {activeTab === "streams" ? (
                isSearching ? "Searching..." : `${filteredStreams.length} streams`
              ) : (
                isLoadingDownloads ? "Loading..." : `${filteredDownloads.length} downloads`
              )}
            </div>

            {/* Real-Debrid status indicator */}
            {(rdStatus === "service_unavailable" || rdStatus === "error") && (
              <div className="flex items-center gap-2 text-xs text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span>RD unavailable</span>
              </div>
            )}
          </div>

          {/* Main Content Area - Stream List */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0f]">
            {activeTab === "streams" ? (
              <>
                {/* Loading state */}
                {isSearching && (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <span className="text-white/60">Searching for streams...</span>
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

                {/* Stream list - HORIZONTAL SCROLL */}
                {!isSearching && !error && (
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Header with stream count and navigation arrows - Stremio style */}
                    {filteredStreams.length > 0 && (
                      <div className="flex items-center justify-between px-6 py-3">
                        <span className="text-lg font-semibold text-white">
                          {filteredStreams.length} stream{filteredStreams.length !== 1 ? 's' : ''} available
                        </span>
                        <div className="flex items-center gap-2">
                          {streamsCanScrollLeft && (
                            <Button
                              ref={streamsNavLeftRef}
                              variant="ghost"
                              size="icon"
                              onClick={() => scrollContainerBy(streamsScrollRef.current, -400)}
                              onKeyDown={(e) => handleStreamsNavKeyDown(e, true)}
                              className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </Button>
                          )}
                          {streamsCanScrollRight && (
                            <Button
                              ref={streamsNavRightRef}
                              variant="ghost"
                              size="icon"
                              onClick={() => scrollContainerBy(streamsScrollRef.current, 400)}
                              onKeyDown={(e) => handleStreamsNavKeyDown(e, false)}
                              className="h-10 w-10 rounded-full bg-primary hover:bg-primary/80 text-white border border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Scrollable content */}
                    <div className="flex-1 flex items-center">
                      <div 
                        ref={streamsScrollRef}
                        className="flex flex-row overflow-x-auto scrollbar-hide snap-x snap-mandatory gap-4 px-6 py-4 items-center w-full"
                        style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain' }}
                      >
                        {filteredStreams.length === 0 && streams.length > 0 ? (
                          <div className="flex-1 flex items-center justify-center text-white/40">
                            No streams match the selected filters
                          </div>
                        ) : filteredStreams.length === 0 ? (
                          <div className="flex-1 flex items-center justify-center text-white/40">
                            No streams found
                          </div>
                        ) : (
                          <>
                            {filteredStreams.map((stream, index) => {
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
                                    "flex-shrink-0 w-[280px] text-left p-4 rounded-xl transition-all duration-150 group snap-center",
                                    hasFailed
                                      ? "bg-red-500/10 border-2 border-red-500/30 opacity-60"
                                      : isCurrentlyResolving
                                      ? "bg-primary/20 border-2 border-primary ring-2 ring-primary/50 scale-105"
                                      : isFocused
                                      ? "bg-white/10 border-2 border-primary scale-105"
                                      : "bg-white/[0.03] border-2 border-transparent hover:bg-white/[0.08] hover:border-white/20 hover:scale-[1.02]",
                                    "focus:outline-none focus:bg-white/10 focus:border-primary focus:scale-105",
                                    isResolving && !isCurrentlyResolving && "opacity-40 pointer-events-none"
                                  )}
                                >
                                  {/* Top section - Provider icon and play button */}
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center">
                                      {details.isDirectLink ? (
                                        <Zap className="w-6 h-6 text-green-400" />
                                      ) : (
                                        <Wifi className="w-6 h-6 text-white/40" />
                                      )}
                                    </div>
                                    
                                    {isCurrentlyResolving ? (
                                      <div className="flex flex-col items-center gap-1">
                                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                        {resolveStatus && (
                                          <span className="text-[10px] text-primary">{resolveStatus}</span>
                                        )}
                                      </div>
                                    ) : (
                                      <div className={cn(
                                        "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                                        isFocused ? "bg-primary text-white scale-110" : "bg-white/5 text-white/40 group-hover:bg-white/10 group-hover:text-white/60"
                                      )}>
                                        <Play className="w-6 h-6 ml-0.5" />
                                      </div>
                                    )}
                                  </div>

                                  {/* Quality badges row */}
                                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                    {details.quality && (
                                      <span className={cn("px-2.5 py-1 rounded text-xs font-bold", getQualityColor(details.quality))}>
                                        {details.quality}
                                      </span>
                                    )}
                                    {details.hdr && (
                                      <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-500/20 text-amber-400">
                                        {details.hdr}
                                      </span>
                                    )}
                                    {details.isDirectLink && (
                                      <span className="px-2 py-1 rounded text-xs font-semibold bg-green-500/20 text-green-400 flex items-center gap-1">
                                        <Zap className="w-3 h-3" />
                                        Cached
                                      </span>
                                    )}
                                    {hasFailed && (
                                      <span className="px-2 py-1 rounded text-xs font-semibold bg-red-500/20 text-red-400">
                                        Failed
                                      </span>
                                    )}
                                  </div>

                                  {/* Codec/Audio badges */}
                                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
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
                                  </div>

                                  {/* Title - truncated to 2 lines */}
                                  <p className="text-sm text-white/80 leading-tight mb-2 line-clamp-2 h-10">
                                    {stream.title || stream.name}
                                  </p>

                                  {/* Bottom row - Size and provider */}
                                  <div className="flex items-center justify-between text-xs text-white/40">
                                    {details.size && (
                                      <span className="flex items-center gap-1">
                                        <HardDrive className="w-3.5 h-3.5" />
                                        {details.size}
                                      </span>
                                    )}
                                    <span className="truncate max-w-[120px]">{details.provider}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
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

                {/* Downloads list - HORIZONTAL SCROLL */}
                {!isLoadingDownloads && filteredDownloads.length > 0 && (
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Header with count and navigation arrows - Stremio style */}
                    <div className="flex items-center justify-between px-6 py-3">
                      <span className="text-lg font-semibold text-white">
                        {filteredDownloads.length} download{filteredDownloads.length !== 1 ? 's' : ''} available
                      </span>
                      <div className="flex items-center gap-2">
                        {downloadsCanScrollLeft && (
                          <Button
                            ref={downloadsNavLeftRef}
                            variant="ghost"
                            size="icon"
                            onClick={() => scrollContainerBy(downloadsScrollRef.current, -400)}
                            onKeyDown={(e) => handleDownloadsNavKeyDown(e, true)}
                            className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </Button>
                        )}
                        {downloadsCanScrollRight && (
                          <Button
                            ref={downloadsNavRightRef}
                            variant="ghost"
                            size="icon"
                            onClick={() => scrollContainerBy(downloadsScrollRef.current, 400)}
                            onKeyDown={(e) => handleDownloadsNavKeyDown(e, false)}
                            className="h-10 w-10 rounded-full bg-primary hover:bg-primary/80 text-white border border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Scrollable content */}
                    <div className="flex-1 flex items-center">
                      <div 
                        ref={downloadsScrollRef}
                        className="flex flex-row overflow-x-auto scrollbar-hide snap-x snap-mandatory gap-4 px-6 py-4 items-center w-full"
                        style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain' }}
                      >
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
                                "flex-shrink-0 w-[280px] text-left p-4 rounded-xl transition-all duration-150 group snap-center",
                                isCurrentlyResolving
                                  ? "bg-primary/20 border-2 border-primary ring-2 ring-primary/50 scale-105"
                                  : isFocused
                                  ? "bg-white/10 border-2 border-primary scale-105"
                                  : "bg-white/[0.03] border-2 border-transparent hover:bg-white/[0.08] hover:border-white/20 hover:scale-[1.02]",
                                "focus:outline-none focus:bg-white/10 focus:border-primary focus:scale-105",
                                isResolving && !isCurrentlyResolving && "opacity-40 pointer-events-none"
                              )}
                            >
                              {/* Top section - Icon and play button */}
                              <div className="flex items-center justify-between mb-3">
                                <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                                  <HardDrive className="w-6 h-6 text-green-400" />
                                </div>
                                
                                {isCurrentlyResolving ? (
                                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                ) : (
                                  <div className={cn(
                                    "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                                    isFocused ? "bg-primary text-white scale-110" : "bg-white/5 text-white/40 group-hover:bg-white/10 group-hover:text-white/60"
                                  )}>
                                    <Play className="w-6 h-6 ml-0.5" />
                                  </div>
                                )}
                              </div>

                              {/* Quality badges */}
                              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                {quality && (
                                  <span className={cn("px-2.5 py-1 rounded text-xs font-bold", getQualityColor(quality))}>
                                    {quality}
                                  </span>
                                )}
                                <span className="px-2 py-1 rounded text-xs font-semibold bg-green-500/20 text-green-400">
                                  Downloaded
                                </span>
                              </div>

                              {/* Filename - truncated to 2 lines */}
                              <p className="text-sm text-white/80 leading-tight mb-2 line-clamp-2 h-10">
                                {download.filename}
                              </p>

                              {/* File size */}
                              <div className="flex items-center text-xs text-white/40">
                                <span className="flex items-center gap-1">
                                  <HardDrive className="w-3.5 h-3.5" />
                                  {formatFileSize(download.filesize)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
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
