import { useState, useEffect, useRef, useCallback } from "react";
import { Media, useMedia } from "@/hooks/useMedia";
import { useTVMode } from "@/hooks/useTVMode";
import { useBrowseHere } from "@/hooks/useBrowseHere";
import { useTorBoxStatus } from "@/hooks/useTorBoxStatus";
import { usePredictivePrefetch } from "@/hooks/usePredictivePrefetch";
import { useQuickPlay } from "@/hooks/useQuickPlay";
import { usePlaybackSettings } from "@/hooks/usePlaybackSettings";

import { searchTorrentio, getImdbIdFromTmdb, parseStreamInfo, TorrentioStream, isMagnetLink, extractMagnetFromTorrentioUrl, parseSizeToBytes, calculateOptimalMaxSize, sortStreamsByPopularity } from "@/lib/torrentio";
import { addMagnetAndWait, listDownloads, getStreamableUrl as getTorBoxStreamUrl, TorBoxTorrent, StreamUnavailableError, checkInstantAvailability, isHashCached, findLargestVideoFile } from "@/lib/torbox";
import { getImageUrl } from "@/lib/tmdb";
import { prepareStreamUrl } from "@/lib/streamUtils";
import { addDebugLog, classifyError } from "@/lib/streamDebugLog";
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
import { Input } from "@/components/ui/input";
import { Loader2, Play, Film, Tv, RefreshCw, Star, Calendar, Zap, AlertCircle, Clock, Download, Search, X, HardDrive, Wifi, ChevronDown, ChevronUp, Users, Filter } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { StreamCardSkeleton } from "@/components/ui/media-skeleton";

export interface StreamQualityInfo {
  quality: string;
  size?: string;
  qualityRank?: number;
}

export interface EpisodeContext {
  seasonNumber: number;
  episodeNumber: number;
}

interface StreamSelectionDialogProps {
  media: Media | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStreamSelected: (media: Media, streamUrl: string, qualityInfo?: StreamQualityInfo, tryNextStream?: () => void, episodeContext?: EpisodeContext) => void;
  defaultSeason?: number;
  defaultEpisode?: number;
}

export function StreamSelectionDialog({
  media,
  open,
  onOpenChange,
  onStreamSelected,
  defaultSeason,
  defaultEpisode,
}: StreamSelectionDialogProps) {
  const { updateMedia } = useMedia();
  const { isTVMode } = useTVMode();
  const { isBrowseHere } = useBrowseHere();
  const { status: torBoxStatus, error: torBoxError, refresh: refreshTorBoxStatus } = useTorBoxStatus();
  const { getCachedStreams, prefetchStreams } = usePredictivePrefetch();
  const { quickPlay, isQuickPlaying } = useQuickPlay();
  const { settings: playbackSettings, updateSetting } = usePlaybackSettings();
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
  
  // Scroll refs for vertical scrolling
  const streamsScrollRef = useRef<HTMLDivElement>(null);
  const downloadsScrollRef = useRef<HTMLDivElement>(null);
  
  // Scroll boundary state for streams (vertical)
  const [streamsCanScrollUp, setStreamsCanScrollUp] = useState(false);
  const [streamsCanScrollDown, setStreamsCanScrollDown] = useState(false);
  
  // Scroll boundary state for downloads (vertical)
  const [downloadsCanScrollUp, setDownloadsCanScrollUp] = useState(false);
  const [downloadsCanScrollDown, setDownloadsCanScrollDown] = useState(false);
  
  // Scroll progress percentage (0-100)
  const [streamsScrollProgress, setStreamsScrollProgress] = useState(0);
  const [downloadsScrollProgress, setDownloadsScrollProgress] = useState(0);
  
  // Check scroll boundaries for streams (vertical)
  const updateStreamsScrollState = useCallback(() => {
    const el = streamsScrollRef.current;
    if (!el) return;
    setStreamsCanScrollUp(el.scrollTop > 0);
    setStreamsCanScrollDown(el.scrollTop < el.scrollHeight - el.clientHeight - 1);
    // Calculate scroll progress percentage (vertical)
    const maxScroll = el.scrollHeight - el.clientHeight;
    const progress = maxScroll > 0 ? (el.scrollTop / maxScroll) * 100 : 0;
    setStreamsScrollProgress(progress);
  }, []);
  
  // Check scroll boundaries for downloads (vertical)
  const updateDownloadsScrollState = useCallback(() => {
    const el = downloadsScrollRef.current;
    if (!el) return;
    setDownloadsCanScrollUp(el.scrollTop > 0);
    setDownloadsCanScrollDown(el.scrollTop < el.scrollHeight - el.clientHeight - 1);
    // Calculate scroll progress percentage (vertical)
    const maxScroll = el.scrollHeight - el.clientHeight;
    const progress = maxScroll > 0 ? (el.scrollTop / maxScroll) * 100 : 0;
    setDownloadsScrollProgress(progress);
  }, []);
  
  // Refs to track streams for auto-retry when player reports playback error
  const filteredStreamsRef = useRef<TorrentioStream[]>([]);
  const currentStreamIndexRef = useRef<number>(0);

  // Refs for header navigation buttons (D-pad focus)
  const streamsNavUpRef = useRef<HTMLButtonElement>(null);
  const streamsNavDownRef = useRef<HTMLButtonElement>(null);
  const downloadsNavUpRef = useRef<HTMLButtonElement>(null);
  const downloadsNavDownRef = useRef<HTMLButtonElement>(null);

  const scrollBehavior: ScrollBehavior = isBrowseHere ? "auto" : "smooth";

  // Helper to scroll container vertically with fallback for TV browsers that may not support scrollBy
  const scrollContainerByVertical = useCallback((container: HTMLElement | null, delta: number) => {
    if (!container) return;
    if (typeof container.scrollBy === 'function') {
      container.scrollBy({ top: delta, behavior: scrollBehavior });
    } else {
      // Fallback for older browsers
      container.scrollTop += delta;
    }
  }, [scrollBehavior]);

  const centerElementInScrollVertical = useCallback(
    (container: HTMLElement | null, el: HTMLElement | null) => {
      if (!container || !el) return;
      const top = el.offsetTop - (container.clientHeight - el.clientHeight) / 2;
      container.scrollTo({ top, behavior: scrollBehavior });
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
        centerElementInScrollVertical(streamsScrollRef.current, btn);
      });
    },
    [centerElementInScrollVertical, streamsScrollRef],
  );

  // Downloads state (TorBox torrents)
  const [myDownloads, setMyDownloads] = useState<TorBoxTorrent[]>([]);
  const [isLoadingDownloads, setIsLoadingDownloads] = useState(false);
  const [downloadsError, setDownloadsError] = useState<string | null>(null);
  const [downloadSearchQuery, setDownloadSearchQuery] = useState("");
  const downloadButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [downloadFocusedIndex, setDownloadFocusedIndex] = useState(0);
  
  // Track failed streams for visual indicator
  const [failedStreams, setFailedStreams] = useState<Set<string>>(new Set());
  
  // Cache checking state for "only show cached" filter
  const [cachedHashes, setCachedHashes] = useState<Set<string>>(new Set());
  const [isCheckingCache, setIsCheckingCache] = useState(false);
  const [cacheCheckFailed, setCacheCheckFailed] = useState(false);

  // Extract hash from stream URL or infoHash
  const extractHash = useCallback((stream: TorrentioStream): string | null => {
    if (stream.infoHash) return stream.infoHash.toLowerCase();
    const url = stream.url || "";
    const hashMatch = url.match(/\/([a-f0-9]{40})\//i) || url.match(/btih:([a-f0-9]{40})/i);
    return hashMatch ? hashMatch[1].toLowerCase() : null;
  }, []);

  // Check cache availability when streams are loaded
  useEffect(() => {
    if (streams.length === 0 || !playbackSettings.onlyShowCachedStreams) {
      setCachedHashes(new Set());
      setCacheCheckFailed(false);
      return;
    }

    const checkCache = async () => {
      setIsCheckingCache(true);
      setCacheCheckFailed(false);
      
      const hashes: string[] = [];
      for (const stream of streams) {
        const hash = extractHash(stream);
        if (hash && !hashes.includes(hash)) {
          hashes.push(hash);
        }
      }

      if (hashes.length === 0) {
        setIsCheckingCache(false);
        return;
      }

      try {
        const availabilityData = await checkInstantAvailability(hashes);
        
        // If empty result with hashes, endpoint is disabled
        if (Object.keys(availabilityData).length === 0 && hashes.length > 0) {
          console.log("[StreamDialog] Cache check returned empty - endpoint may be disabled");
          setCacheCheckFailed(true);
          setCachedHashes(new Set());
        } else {
        const cached = new Set(hashes.filter(hash => isHashCached(hash, availabilityData)));
          setCachedHashes(cached);
          console.log(`[StreamDialog] ${cached.size}/${hashes.length} streams cached on TorBox`);
        }
      } catch (err) {
        console.warn("[StreamDialog] Cache check failed:", err);
        setCacheCheckFailed(true);
        setCachedHashes(new Set());
      }
      
      setIsCheckingCache(false);
    };

    checkCache();
  }, [streams, playbackSettings.onlyShowCachedStreams, extractHash]);

  // Filter streams based on quality, language, and cache status
  const filteredStreams = (() => {
    let result = streams.filter((stream) => {
      const info = parseStreamInfo(stream);
      const title = stream.title?.toLowerCase() || "";
      
      // "Only show cached" filter (when enabled and cache data is available)
      if (playbackSettings.onlyShowCachedStreams && !cacheCheckFailed && cachedHashes.size > 0) {
        const hash = extractHash(stream);
        if (!hash || !cachedHashes.has(hash)) return false;
      }
      
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
    
    // When cache check failed (endpoint disabled), sort by popularity (seeders) as fallback
    if (cacheCheckFailed || (playbackSettings.onlyShowCachedStreams && cachedHashes.size === 0)) {
      result = sortStreamsByPopularity(result);
    }
    
    return result;
  })();
  
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
    
    const filename = download.name.toLowerCase();
    const mediaTitle = media.title.toLowerCase();
    
    const normalizeForMatch = (str: string) => 
      str.replace(/[^\w\s]/g, '').replace(/\s+/g, '.').toLowerCase();
    
    const normalizedFilename = normalizeForMatch(download.name);
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
      
      return episodePatterns.some(pattern => pattern.test(download.name));
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
        centerElementInScrollVertical(downloadsScrollRef.current, btn);
      });
    },
    [centerElementInScrollVertical, downloadsScrollRef, filteredDownloads.length],
  );

  // Update scroll state on mount and when content changes
  useEffect(() => {
    if (!open || activeTab !== "streams") return;
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
  }, [open, activeTab, updateStreamsScrollState, filteredStreams.length]);
  
  useEffect(() => {
    if (!open || activeTab !== "downloads") return;
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
  }, [open, activeTab, updateDownloadsScrollState, filteredDownloads.length]);

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

  // Keyboard navigation for TV remotes - vertical scrolling
  const handleKeyDown = (e: React.KeyboardEvent, index: number, stream: TorrentioStream) => {
    if (isResolving) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusStreamAtIndex(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (index === 0) {
          // Focus header navigation arrows
          streamsNavDownRef.current?.focus();
        } else {
          focusStreamAtIndex(index - 1);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleStreamSelect(stream);
        break;
    }
  };

  // Keyboard navigation for header arrow buttons (streams - vertical)
  const handleStreamsNavKeyDown = (e: React.KeyboardEvent, isUp: boolean) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (isUp) {
          streamsNavDownRef.current?.focus();
        } else {
          focusStreamAtIndex(focusedIndex);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isUp) {
          streamsNavUpRef.current?.focus();
        } else {
          scrollContainerByVertical(streamsScrollRef.current, -300);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        scrollContainerByVertical(streamsScrollRef.current, isUp ? -300 : 300);
        break;
    }
  };

  // Keyboard navigation for downloads - vertical scrolling
  const handleDownloadKeyDown = (e: React.KeyboardEvent, index: number, download: TorBoxTorrent) => {
    if (isResolving) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusDownloadAtIndex(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (index === 0) {
          downloadsNavDownRef.current?.focus();
        } else {
          focusDownloadAtIndex(index - 1);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleDownloadSelect(download);
        break;
    }
  };

  // Keyboard navigation for header arrow buttons (downloads - vertical)
  const handleDownloadsNavKeyDown = (e: React.KeyboardEvent, isUp: boolean) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (isUp) {
          downloadsNavDownRef.current?.focus();
        } else {
          focusDownloadAtIndex(downloadFocusedIndex);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isUp) {
          downloadsNavUpRef.current?.focus();
        } else {
          scrollContainerByVertical(downloadsScrollRef.current, -300);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        scrollContainerByVertical(downloadsScrollRef.current, isUp ? -300 : 300);
        break;
    }
  };

  // Reset state when dialog opens with new media
  useEffect(() => {
    if (open && media) {
      setStreams([]);
      setError(null);
      // Use default values if provided (for "play next episode")
      setSelectedSeason(defaultSeason ?? 1);
      setSelectedEpisode(defaultEpisode ?? 1);
      setQualityFilter("best");
      setActiveTab("streams");
      setDownloadSearchQuery("");
      setFailedStreams(new Set());
      handleSearch();
      loadDownloadsInBackground();
    }
  }, [open, media?.id, defaultSeason, defaultEpisode]);

  // Load downloads in background (non-blocking)
  const loadDownloadsInBackground = async () => {
    setIsLoadingDownloads(true);
    setDownloadsError(null);
    
    try {
      const downloads = await listDownloads();
      // TorBox downloads are torrents that are ready (download_present = true)
      const videoDownloads = downloads.filter(d => {
        // Check if has video files
        const hasVideoFiles = d.files?.some(f => 
          f.name?.match(/\.(mp4|mkv|avi|m4v|webm)$/i)
        );
        return hasVideoFiles;
      });
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
      // TorBox downloads are torrents that are ready (download_present = true)
      const videoDownloads = downloads.filter(d => {
        // Check if has video files
        const hasVideoFiles = d.files?.some(f => 
          f.name?.match(/\.(mp4|mkv|avi|m4v|webm)$/i)
        );
        return hasVideoFiles;
      });
      setMyDownloads(videoDownloads);
    } catch (err: any) {
      console.error("Failed to load downloads:", err);
      setDownloadsError(err.message || "Failed to load TorBox downloads");
    }
    
    setIsLoadingDownloads(false);
  };

  const handleSearch = async () => {
    if (!media) return;
    
    // Check for cached streams first (instant load)
    if (media.tmdb_id) {
      const cachedStreams = getCachedStreams(
        media.tmdb_id, 
        media.media_type as 'movie' | 'tv',
        media.media_type === 'tv' ? selectedSeason : undefined,
        media.media_type === 'tv' ? selectedEpisode : undefined
      );
      
      if (cachedStreams && cachedStreams.length > 0) {
        console.log(`[StreamDialog] Using ${cachedStreams.length} cached streams`);
        setStreams(cachedStreams);
        setIsSearching(false);
        toast.success(`Found ${cachedStreams.length} stream(s) (cached)`);
        return;
      }
    }
    
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

  // For TorBox, we get CDN streaming URLs directly via getStreamableUrl from lib/torbox
  const getStreamableUrlForTorBox = async (torrentId: number, fileId: number): Promise<string> => {
    try {
      setResolveStatus("Getting streaming URL...");
      const cdnUrl = await getTorBoxStreamUrl(torrentId, fileId);
      console.log("Got TorBox CDN URL");
      return prepareStreamUrl(cdnUrl);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn("Could not get TorBox streaming URL:", errorMessage);
      throw err;
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
      // For TorBox, all streams from Torrentio need to be processed as magnets
      // Extract magnet from stream URL
      const magnetLink = extractMagnetFromTorrentioUrl(stream.url) || (isMagnetLink(stream.url) ? stream.url : null);
      
      if (!magnetLink) {
        throw new Error("Could not extract magnet link from stream");
      }
      
      setResolveStatus("Adding to TorBox...");
      setResolveProgress(20);
      
      const result = await addMagnetAndWait(magnetLink, (progress) => {
        setResolveProgress(20 + Math.floor(progress * 0.6));
        setResolveStatus(`Processing: ${progress}%`);
      });
      
      // Find the largest video file in the torrent
      const videoFile = findLargestVideoFile(result);
      
      if (!videoFile) {
        throw new Error("No video files found in torrent");
      }
      
      setResolveProgress(85);
      setResolveStatus("Getting stream URL...");
      
      const streamUrl = await getStreamableUrlForTorBox(result.id, videoFile.id);
      
      setResolveProgress(100);
      setResolveStatus("Ready!");
      
      setTimeout(() => {
        onOpenChange(false);
        const episodeContext = media.media_type === "tv" 
          ? { seasonNumber: selectedSeason, episodeNumber: selectedEpisode }
          : undefined;
        onStreamSelected(media, streamUrl, qualityInfo, createTryNextStream(), episodeContext);
      }, 300);
      
    } catch (err: any) {
      console.error("Stream selection error:", err);
      
      // Log to debug system
      const { type: errorType, message: errorMessage } = classifyError(err);
      addDebugLog({
        mediaTitle: media.title,
        streamTitle: stream.title || stream.name,
        streamUrl: stream.url?.substring(0, 100),
        errorType,
        errorMessage,
        errorDetails: err.stack || JSON.stringify(err, null, 2),
        action: 'retry',
      });
      
      // Mark this stream as failed
      setFailedStreams(prev => {
        const newSet = new Set(prev);
        newSet.add(stream.url);
        return newSet;
      });
      
      // Check if this is a recoverable error that should trigger auto-fallback
      const errorMsg = err.message || "";
      const isStreamUnavailable = err instanceof StreamUnavailableError;
      const isRecoverableError = 
        isStreamUnavailable ||
        errorMsg.includes("Not cached") ||
        errorMsg.includes("trying next") ||
        errorMsg.includes("unavailable") ||
        errorMsg.includes("copyright") ||
        errorMsg.includes("blocked") ||
        errorMsg.includes("dead") ||
        errorMsg.includes("error") ||
        errorMsg.includes("virus") ||
        errorMsg.includes("infringing") ||
        errorMsg.includes("451");
      
      if (isRecoverableError) {
        // Auto-try next stream
        const tryNext = createTryNextStream();
        if (tryNext) {
          toast.info("Stream unavailable, trying next...");
          setTimeout(() => tryNext(), 100);
          return;
        }
      }
      
      // Update log action to 'failed' since we couldn't recover
      addDebugLog({
        mediaTitle: media.title,
        streamTitle: stream.title || stream.name,
        streamUrl: stream.url?.substring(0, 100),
        errorType,
        errorMessage: "All streams exhausted: " + errorMessage,
        action: 'failed',
      });
      
      // No more streams or non-recoverable error
      toast.error(err.message || "Failed to process stream");
    } finally {
      setIsResolving(false);
      setResolvingStream(null);
      setResolveProgress(0);
      setResolveStatus("");
    }
  };

  const handleDownloadSelect = async (download: TorBoxTorrent) => {
    if (!media || isResolving) return;
    
    setIsResolving(true);
    setResolveProgress(50);
    setResolveStatus("Getting stream URL...");
    
    // Find the largest video file
    const videoFile = findLargestVideoFile(download);
    
    if (!videoFile) {
      toast.error("No video files found in this download");
      setIsResolving(false);
      return;
    }
    
    setResolvingStream(String(download.id));
    
    const quality = extractQuality(download.name);
    const qualityInfo: StreamQualityInfo = {
      quality: quality || "Unknown",
      size: formatFileSize(download.size),
    };
    
    try {
      const streamUrl = await getStreamableUrlForTorBox(download.id, videoFile.id);
      
      setResolveProgress(100);
      setResolveStatus("Ready!");
      
      setTimeout(() => {
        onOpenChange(false);
        const episodeContext = media.media_type === "tv" 
          ? { seasonNumber: selectedSeason, episodeNumber: selectedEpisode }
          : undefined;
        onStreamSelected(media, streamUrl, qualityInfo, undefined, episodeContext);
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
        className="fixed inset-0 w-screen h-screen max-w-none max-h-none p-0 rounded-none border-none overflow-hidden bg-[#0a0a0f] translate-x-0 translate-y-0 left-0 top-0"
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

                {/* Season/Episode picker for TV - inline with Select dropdowns */}
                {media.media_type === "tv" && (
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Season Select */}
                    <Select 
                      value={selectedSeason.toString()} 
                      onValueChange={(val) => { setSelectedSeason(Number(val)); setSelectedEpisode(1); setStreams([]); }}
                    >
                      <SelectTrigger className="w-[80px] h-9 bg-white/5 border-white/10 text-white text-sm">
                        <SelectValue placeholder="Season" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a24] border-white/10 max-h-[300px]">
                        <div className="grid grid-cols-3 gap-1 p-1">
                          {Array.from({ length: media.seasons || 10 }, (_, i) => i + 1).map((s) => (
                            <SelectItem 
                              key={s} 
                              value={s.toString()}
                              className={cn(
                                "text-center justify-center cursor-pointer",
                                selectedSeason === s && "bg-primary text-white"
                              )}
                            >
                              S{s}
                            </SelectItem>
                          ))}
                        </div>
                      </SelectContent>
                    </Select>

                    {/* Episode Select */}
                    <Select 
                      value={selectedEpisode.toString()} 
                      onValueChange={(val) => { setSelectedEpisode(Number(val)); setStreams([]); }}
                    >
                      <SelectTrigger className="w-[80px] h-9 bg-white/5 border-white/10 text-white text-sm">
                        <SelectValue placeholder="Episode" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a24] border-white/10 max-h-[300px]">
                        <div className="grid grid-cols-3 gap-1 p-1">
                          {Array.from({ length: 30 }, (_, i) => i + 1).map((e) => (
                            <SelectItem 
                              key={e} 
                              value={e.toString()}
                              className={cn(
                                "text-center justify-center cursor-pointer",
                                selectedEpisode === e && "bg-primary text-white"
                              )}
                            >
                              E{e}
                            </SelectItem>
                          ))}
                        </div>
                      </SelectContent>
                    </Select>

                    <Button onClick={handleSearch} disabled={isSearching} variant="outline" size="icon" className="h-9 w-9 bg-white/5 border-white/10 hover:bg-white/10 text-white">
                      {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </Button>
                  </div>
                )}

                {/* Quick Play Button */}
                <Button
                  onClick={() => {
                    if (!media) return;
                    const season = media.media_type === "tv" ? selectedSeason : undefined;
                    const episode = media.media_type === "tv" ? selectedEpisode : undefined;
                    quickPlay(media, (streamUrl, qualityInfo, tryNextStream) => {
                      const updatedMedia = { ...media, source_url: streamUrl };
                      const episodeContext = media.media_type === "tv" 
                        ? { seasonNumber: selectedSeason, episodeNumber: selectedEpisode }
                        : undefined;
                      onStreamSelected(updatedMedia, streamUrl, qualityInfo, tryNextStream, episodeContext);
                      onOpenChange(false);
                    }, season, episode);
                  }}
                  disabled={isQuickPlaying || isResolving}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80 shrink-0"
                  size="sm"
                >
                  {isQuickPlaying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  Quick Play
                </Button>
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
              
              {/* Cached Only Toggle */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <Filter className="w-3.5 h-3.5 text-white/60" />
                <span className="text-xs text-white/80 whitespace-nowrap">Cached Only</span>
                <Switch
                  checked={playbackSettings.onlyShowCachedStreams}
                  onCheckedChange={(checked) => updateSetting('onlyShowCachedStreams', checked)}
                  className="scale-75 data-[state=checked]:bg-primary"
                />
                {isCheckingCache && (
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                )}
              </div>
            </div>

            {/* Stream count - right aligned */}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm text-white/40">
                {activeTab === "streams" ? (
                  isSearching ? "Searching..." : 
                  isCheckingCache ? "Checking cache..." :
                  playbackSettings.onlyShowCachedStreams && cachedHashes.size > 0 
                    ? `${filteredStreams.length} cached`
                    : `${filteredStreams.length} streams`
                ) : (
                  isLoadingDownloads ? "Loading..." : `${filteredDownloads.length} downloads`
                )}
              </span>
              
              {/* Cache status indicator */}
              {!isSearching && !isCheckingCache && cachedHashes.size > 0 && activeTab === "streams" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                  {cachedHashes.size} instant
                </span>
              )}
            </div>

            {/* TorBox status indicator */}
            {(torBoxStatus === "service_unavailable" || torBoxStatus === "error") && (
              <div className="flex items-center gap-2 text-xs text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span>TorBox unavailable</span>
              </div>
            )}
          </div>

          {/* Main Content Area - Stream List */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0f]">
            {activeTab === "streams" ? (
              <>
                {/* Loading state with skeleton cards - no spinner, just skeletons for instant feel */}
                {isSearching && (
                  <div className="flex-1 flex flex-col p-6 gap-3 overflow-hidden">
                    {/* Subtle loading indicator at top */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-white/40 text-xs">Finding best streams...</span>
                      </div>
                      <div className="h-1 w-24 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-full animate-[loading_1.5s_ease-in-out_infinite]" 
                             style={{ width: '60%' }} />
                      </div>
                    </div>
                    {/* Skeleton stream cards - staggered animation for visual polish */}
                    <div className="flex flex-col gap-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <StreamCardSkeleton 
                          key={i} 
                          className="animate-pulse"
                          style={{ animationDelay: `${i * 100}ms` } as React.CSSProperties}
                        />
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

                {/* Stream list - VERTICAL SCROLL */}
                {!isSearching && !error && (
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Header with stream count and navigation arrows */}
                    {filteredStreams.length > 0 && (
                      <div className="flex flex-col items-center gap-3 px-6 py-3">
                        <span className="text-lg font-semibold text-white">
                          {filteredStreams.length} stream{filteredStreams.length !== 1 ? 's' : ''} available
                        </span>
                        
                        {/* Scroll Up/Down buttons */}
                        {(streamsCanScrollUp || streamsCanScrollDown) && (
                          <div className="flex items-center justify-center gap-4">
                            <Button
                              ref={streamsNavUpRef}
                              variant="default"
                              size="lg"
                              onClick={() => {
                                if (!streamsCanScrollUp) return;
                                scrollContainerByVertical(streamsScrollRef.current, -300);
                              }}
                              onKeyDown={(e) => handleStreamsNavKeyDown(e, true)}
                              className={cn(
                                "h-12 w-28 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary transition-all flex items-center justify-center gap-2",
                                !streamsCanScrollUp && "opacity-30 cursor-not-allowed"
                              )}
                            >
                              <span className="text-sm font-medium">Up</span>
                              <ChevronUp className="w-5 h-5" />
                            </Button>
                            <Button
                              ref={streamsNavDownRef}
                              variant="default"
                              size="lg"
                              onClick={() => {
                                if (!streamsCanScrollDown) return;
                                scrollContainerByVertical(streamsScrollRef.current, 300);
                              }}
                              onKeyDown={(e) => handleStreamsNavKeyDown(e, false)}
                              className={cn(
                                "h-12 w-28 rounded-lg bg-primary hover:bg-primary/80 text-white border border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all flex items-center justify-center gap-2",
                                !streamsCanScrollDown && "opacity-30 cursor-not-allowed"
                              )}
                            >
                              <span className="text-sm font-medium">Down</span>
                              <ChevronDown className="w-5 h-5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Scrollable content with edge fades */}
                    <div className="flex-1 relative min-h-0">
                      {/* Top edge fade */}
                      {streamsCanScrollUp && (
                        <div className="absolute left-0 right-0 top-0 h-12 bg-gradient-to-b from-[#0a0a0f] to-transparent z-10 pointer-events-none" />
                      )}
                      {/* Bottom edge fade */}
                      {streamsCanScrollDown && (
                        <div className="absolute left-0 right-0 bottom-0 h-12 bg-gradient-to-t from-[#0a0a0f] to-transparent z-10 pointer-events-none" />
                      )}
                      <div 
                        ref={streamsScrollRef}
                        className="h-full overflow-y-auto scrollbar-hide px-6 py-4"
                        style={{ touchAction: 'pan-y', overscrollBehaviorY: 'contain' }}
                        onScroll={updateStreamsScrollState}
                      >
                        {filteredStreams.length === 0 && streams.length > 0 ? (
                          <div className="flex items-center justify-center h-full text-white/40">
                            No streams match the selected filters
                          </div>
                        ) : filteredStreams.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-white/40">
                            No streams found
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3">
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
                                    "w-full text-left p-4 rounded-xl transition-all duration-150 group",
                                    hasFailed
                                      ? "bg-red-500/10 border-2 border-red-500/30 opacity-60"
                                      : isCurrentlyResolving
                                      ? "bg-primary/20 border-2 border-primary ring-2 ring-primary/50"
                                      : isFocused
                                      ? "bg-white/10 border-2 border-primary"
                                      : "bg-white/[0.03] border-2 border-transparent hover:bg-white/[0.08] hover:border-white/20",
                                    "focus:outline-none focus:bg-white/10 focus:border-primary",
                                    isResolving && !isCurrentlyResolving && "opacity-40 pointer-events-none"
                                  )}
                                >
                                  <div className="flex items-center gap-4">
                                    {/* Left: Provider icon */}
                                    <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                      {details.isDirectLink ? (
                                        <Zap className="w-6 h-6 text-green-400" />
                                      ) : (
                                        <Wifi className="w-6 h-6 text-white/40" />
                                      )}
                                    </div>
                                    
                                    {/* Center: Stream info */}
                                    <div className="flex-1 min-w-0">
                                      {/* Quality badges row */}
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
                                      <p className="text-sm text-white/80 leading-tight line-clamp-2">
                                        {stream.title || stream.name}
                                      </p>

                                      {/* Bottom row - Size and provider */}
                                      <div className="flex items-center gap-3 mt-1.5 text-xs text-white/40">
                                        {details.size && (
                                          <span className="flex items-center gap-1">
                                            <HardDrive className="w-3.5 h-3.5" />
                                            {details.size}
                                          </span>
                                        )}
                                        <span className="truncate">{details.provider}</span>
                                      </div>
                                    </div>
                                    
                                    {/* Right: Play button */}
                                    {isCurrentlyResolving ? (
                                      <div className="flex flex-col items-center gap-1 shrink-0">
                                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                        {resolveStatus && (
                                          <span className="text-[10px] text-primary">{resolveStatus}</span>
                                        )}
                                      </div>
                                    ) : (
                                      <div className={cn(
                                        "w-12 h-12 rounded-full flex items-center justify-center transition-all shrink-0",
                                        isFocused ? "bg-primary text-white scale-110" : "bg-white/5 text-white/40 group-hover:bg-white/10 group-hover:text-white/60"
                                      )}>
                                        <Play className="w-6 h-6 ml-0.5" />
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Scroll progress indicator */}
                    {filteredStreams.length > 0 && (streamsCanScrollUp || streamsCanScrollDown) && (
                      <div className="px-6 pb-4">
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all duration-150"
                            style={{ 
                              width: `${Math.max(20, 100 / Math.max(1, filteredStreams.length / 5))}%`,
                              marginLeft: `${streamsScrollProgress * (100 - Math.max(20, 100 / Math.max(1, filteredStreams.length / 5))) / 100}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
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

                {/* Loading state with skeleton cards - no spinner, just skeletons for instant feel */}
                {isLoadingDownloads && (
                  <div className="flex-1 flex flex-col p-6 gap-3 overflow-hidden">
                    {/* Subtle loading indicator at top */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-white/40 text-xs">Loading your downloads...</span>
                      </div>
                    </div>
                    {/* Skeleton download cards - staggered animation */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <StreamCardSkeleton 
                          key={i} 
                          className="animate-pulse"
                          style={{ animationDelay: `${i * 80}ms` }}
                        />
                      ))}
                    </div>
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

                {/* Downloads list - VERTICAL SCROLL */}
                {!isLoadingDownloads && filteredDownloads.length > 0 && (
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Header with count and scroll down button */}
                    <div className="flex flex-col items-center gap-3 px-6 py-3">
                      <span className="text-lg font-semibold text-white">
                        {filteredDownloads.length} download{filteredDownloads.length !== 1 ? 's' : ''} available
                      </span>
                      
                      {/* Scroll Up/Down buttons */}
                      {(downloadsCanScrollUp || downloadsCanScrollDown) && (
                        <div className="flex items-center justify-center gap-4">
                          <Button
                            variant="default"
                            size="lg"
                            onClick={() => {
                              if (!downloadsCanScrollUp) return;
                              downloadsScrollRef.current?.scrollBy({ top: -300, behavior: 'smooth' });
                            }}
                            className={cn(
                              "h-12 w-28 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary transition-all flex items-center justify-center gap-2",
                              !downloadsCanScrollUp && "opacity-30 cursor-not-allowed"
                            )}
                          >
                            <span className="text-sm font-medium">Up</span>
                            <ChevronUp className="w-5 h-5" />
                          </Button>
                          <Button
                            variant="default"
                            size="lg"
                            onClick={() => {
                              if (!downloadsCanScrollDown) return;
                              downloadsScrollRef.current?.scrollBy({ top: 300, behavior: 'smooth' });
                            }}
                            className={cn(
                              "h-12 w-28 rounded-lg bg-primary hover:bg-primary/80 text-white border border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all flex items-center justify-center gap-2",
                              !downloadsCanScrollDown && "opacity-30 cursor-not-allowed"
                            )}
                          >
                            <span className="text-sm font-medium">Down</span>
                            <ChevronDown className="w-5 h-5" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Scrollable content with edge fades */}
                    <div className="flex-1 relative min-h-0">
                      {/* Top edge fade */}
                      {downloadsCanScrollUp && (
                        <div className="absolute left-0 right-0 top-0 h-12 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
                      )}
                      {/* Bottom edge fade */}
                      {downloadsCanScrollDown && (
                        <div className="absolute left-0 right-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none" />
                      )}
                      
                      <div 
                        ref={downloadsScrollRef}
                        className="h-full overflow-y-auto scrollbar-hide px-6 py-4"
                        style={{ overscrollBehaviorY: 'contain' }}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {filteredDownloads.map((download, index) => {
                            const quality = extractQuality(download.name);
                            const isCurrentlyResolving = resolvingStream === String(download.id);
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
                                  "w-full text-left p-4 rounded-xl transition-all duration-150 group",
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
                                  {download.name}
                                </p>

                                {/* File size */}
                                <div className="flex items-center text-xs text-white/40">
                                  <span className="flex items-center gap-1">
                                    <HardDrive className="w-3.5 h-3.5" />
                                    {formatFileSize(download.size)}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    
                    {/* Vertical scroll progress indicator */}
                    {(downloadsCanScrollUp || downloadsCanScrollDown) && (
                      <div className="px-6 pb-4">
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all duration-150"
                            style={{ 
                              width: `${Math.max(20, 100 / Math.max(1, Math.ceil(filteredDownloads.length / 3)))}%`,
                              marginLeft: `${downloadsScrollProgress * (100 - Math.max(20, 100 / Math.max(1, Math.ceil(filteredDownloads.length / 3)))) / 100}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
