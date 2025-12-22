import { useState, useEffect, useRef, useCallback } from "react";
import { Media, useMedia } from "@/hooks/useMedia";
import { useTVMode } from "@/hooks/useTVMode";
import { searchTorrentio, getImdbIdFromTmdb, parseStreamInfo, TorrentioStream, isDirectRdLink, isMagnetLink, extractMagnetFromTorrentioUrl } from "@/lib/torrentio";
import { unrestrictLink, addMagnetAndWait, getStreamingLinks, listDownloads, RealDebridUnrestrictedLink } from "@/lib/realDebrid";
import { getImageUrl } from "@/lib/tmdb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollAreaWithArrows } from "@/components/ui/scroll-area-with-arrows";
import { Loader2, Play, Film, Tv, RefreshCw, Star, Calendar, Zap, AlertCircle, Clock, Filter, Download, Search, LayoutGrid, List, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StreamSelectionDialogProps {
  media: Media | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStreamSelected: (media: Media, streamUrl: string) => void;
}

export function StreamSelectionDialog({
  media,
  open,
  onOpenChange,
  onStreamSelected,
}: StreamSelectionDialogProps) {
  const { updateMedia } = useMedia();
  const { isTVMode } = useTVMode();
  const [activeTab, setActiveTab] = useState<string>("search");
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
  const [qualityFilter, setQualityFilter] = useState<string>("all");
  const [isCompactView, setIsCompactView] = useState(() => {
    const saved = localStorage.getItem("streamDialog-compactView");
    return saved !== null ? saved === "true" : true;
  });
  
  // Persist compact view preference
  useEffect(() => {
    localStorage.setItem("streamDialog-compactView", String(isCompactView));
  }, [isCompactView]);
  const streamButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // Fail-Safe state
  const [myDownloads, setMyDownloads] = useState<RealDebridUnrestrictedLink[]>([]);
  const [isLoadingDownloads, setIsLoadingDownloads] = useState(false);
  const [downloadsError, setDownloadsError] = useState<string | null>(null);
  const [downloadSearchQuery, setDownloadSearchQuery] = useState("");
  const downloadButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [downloadFocusedIndex, setDownloadFocusedIndex] = useState(0);

  // Filter streams based on quality selection
  const filteredStreams = streams.filter((stream) => {
    if (qualityFilter === "all") return true;
    const info = parseStreamInfo(stream);
    const quality = info.quality?.toLowerCase() || "";
    
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

  // Filter downloads based on media title and episode
  const filteredDownloads = myDownloads.filter((download) => {
    if (!media) return true;
    
    const filename = download.filename.toLowerCase();
    const mediaTitle = media.title.toLowerCase();
    
    // Normalize title for matching (remove special characters, convert spaces)
    const normalizeForMatch = (str: string) => 
      str.replace(/[^\w\s]/g, '').replace(/\s+/g, '.').toLowerCase();
    
    const normalizedFilename = normalizeForMatch(download.filename);
    const normalizedTitle = normalizeForMatch(media.title);
    
    // Check if filename contains the media title (with various formats)
    const titleWords = media.title.toLowerCase().split(/\s+/);
    const titleMatches = titleWords.every(word => 
      filename.includes(word.replace(/[^\w]/g, ''))
    ) || normalizedFilename.includes(normalizedTitle);
    
    if (!titleMatches) return false;
    
    // For TV shows, also match season and episode
    if (media.media_type === "tv") {
      // Common episode patterns: S01E01, S1E1, 1x01, Season 1 Episode 1
      const episodePatterns = [
        new RegExp(`s0?${selectedSeason}e0?${selectedEpisode}\\b`, 'i'),
        new RegExp(`${selectedSeason}x0?${selectedEpisode}\\b`, 'i'),
        new RegExp(`season\\s*${selectedSeason}.*episode\\s*${selectedEpisode}`, 'i'),
      ];
      
      return episodePatterns.some(pattern => pattern.test(download.filename));
    }
    
    // Additional search query filter if provided
    if (downloadSearchQuery.trim()) {
      const query = downloadSearchQuery.toLowerCase();
      return filename.includes(query);
    }
    
    return true;
  });

  // Auto-focus first stream when list loads or filter changes
  useEffect(() => {
    if (filteredStreams.length > 0 && !isSearching && activeTab === "search") {
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
      setQualityFilter("all");
      setActiveTab("search");
      setDownloadSearchQuery("");
      // Auto-search when dialog opens
      handleSearch();
    }
  }, [open, media?.id]);

  // Load downloads when tab changes to downloads
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
      // Filter to only show streamable video files
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
      
      // Try to get IMDB ID from TMDB if we have tmdb_id
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

  // Helper to get streaming URL from an unrestricted link
  const getStreamableUrl = async (unrestrictedLink: string): Promise<string> => {
    try {
      setResolveStatus("Getting streaming URL...");
      const streamingLinks = await getStreamingLinks(unrestrictedLink);
      
      // Prefer highest quality streaming link
      const qualityOrder = ['full', 'original', '1080p', '720p', '480p', '360p'];
      for (const quality of qualityOrder) {
        if (streamingLinks[quality]?.full) {
          console.log(`Using ${quality} streaming link`);
          return streamingLinks[quality].full;
        }
      }
      
      // Try any available quality
      const availableQualities = Object.keys(streamingLinks);
      if (availableQualities.length > 0) {
        const firstQuality = availableQualities[0];
        if (streamingLinks[firstQuality]?.full) {
          console.log(`Using ${firstQuality} streaming link`);
          return streamingLinks[firstQuality].full;
        }
      }
      
      // Fallback to the download URL
      console.log("No streaming links available, using download URL");
      return unrestrictedLink;
    } catch (err) {
      console.warn("Could not get streaming links, using download URL:", err);
      return unrestrictedLink;
    }
  };

  const handleStreamSelect = async (stream: TorrentioStream) => {
    if (!media) return;
    
    setIsResolving(true);
    setResolvingStream(stream.url);
    setResolveProgress(0);
    setResolveStatus("Starting...");
    
    try {
      let streamUrl: string;
      const isTorrentioResolveUrl = stream.url.includes("torrentio.strem.fun/resolve/");
      
      const handleProgress = (progress: number) => {
        setResolveProgress(progress);
        if (progress < 100) {
          setResolveStatus(`Preparing: ${progress}%`);
        } else {
          setResolveStatus("Finalizing...");
        }
      };
      
      if (isDirectRdLink(stream.url)) {
        // Already a direct link - try to get streaming version
        setResolveStatus("Getting streaming URL...");
        streamUrl = await getStreamableUrl(stream.url);
      } else if (isMagnetLink(stream.url)) {
        // Magnet link - add to RD and wait
        setResolveStatus("Adding to Real-Debrid...");
        const torrent = await addMagnetAndWait(stream.url, handleProgress);
        if (torrent.links && torrent.links.length > 0) {
          setResolveStatus("Generating streaming link...");
          const unrestricted = await unrestrictLink(torrent.links[0]);
          streamUrl = await getStreamableUrl(unrestricted.download);
        } else {
          throw new Error("No download links available from torrent");
        }
      } else if (isTorrentioResolveUrl) {
        // Torrentio resolve URLs can't be unrestricted directly - extract magnet and use that
        console.log("Torrentio resolve URL detected, extracting magnet...");
        const magnetLink = extractMagnetFromTorrentioUrl(stream.url);
        if (magnetLink) {
          setResolveStatus("Preparing stream...");
          const torrent = await addMagnetAndWait(magnetLink, handleProgress);
          if (torrent.links && torrent.links.length > 0) {
            setResolveStatus("Generating streaming link...");
            const unrestricted = await unrestrictLink(torrent.links[0]);
            streamUrl = await getStreamableUrl(unrestricted.download);
          } else {
            throw new Error("No download links available from torrent");
          }
        } else {
          throw new Error("Could not extract torrent hash from URL");
        }
      } else {
        // Try to unrestrict the link directly
        setResolveStatus("Unrestricting link...");
        const unrestricted = await unrestrictLink(stream.url);
        streamUrl = await getStreamableUrl(unrestricted.download);
      }
      
      // Don't save the URL to database - always prompt for stream selection
      toast.success("Stream ready!");
      onOpenChange(false);
      
      // Pass the media with the stream URL to play (without persisting)
      onStreamSelected({ ...media, source_url: streamUrl }, streamUrl);
      
    } catch (err: any) {
      console.error("Stream resolution error:", err);
      toast.error(err.message || "Failed to resolve stream");
    }
    
    setIsResolving(false);
    setResolvingStream(null);
    setResolveProgress(0);
    setResolveStatus("");
  };

  const handleDownloadSelect = async (download: RealDebridUnrestrictedLink) => {
    if (!media) return;
    
    setIsResolving(true);
    setResolvingStream(download.download);
    setResolveStatus("Getting streaming URL...");
    
    try {
      const streamUrl = await getStreamableUrl(download.download);
      toast.success("Stream ready!");
      onOpenChange(false);
      onStreamSelected({ ...media, source_url: streamUrl }, streamUrl);
    } catch (err: any) {
      console.error("Download stream error:", err);
      toast.error(err.message || "Failed to get streaming URL");
    }
    
    setIsResolving(false);
    setResolvingStream(null);
    setResolveStatus("");
  };

  const posterUrl = media?.poster_path
    ? getImageUrl(media.poster_path, "w200")
    : null;

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1073741824) {
      return (bytes / 1073741824).toFixed(2) + " GB";
    } else if (bytes >= 1048576) {
      return (bytes / 1048576).toFixed(1) + " MB";
    } else {
      return (bytes / 1024).toFixed(0) + " KB";
    }
  };

  // Extract quality from filename
  const extractQuality = (filename: string): string => {
    const match = filename.match(/(\d{3,4}p|4K|2160p)/i);
    return match ? match[1].toUpperCase() : "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none border-none overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0 flex flex-row items-center justify-between pr-2">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Select Stream
          </DialogTitle>
          <DialogClose asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-10 w-10 rounded-full bg-secondary hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <X className="h-6 w-6" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>

        {media && (
          <div className="flex gap-4 p-4 bg-secondary/30 rounded-lg">
            {posterUrl ? (
              <img
                src={posterUrl}
                alt={media.title}
                className="w-16 h-24 object-cover rounded-md shrink-0"
              />
            ) : (
              <div className="w-16 h-24 bg-muted rounded-md flex items-center justify-center shrink-0">
                {media.media_type === "movie" ? (
                  <Film className="w-6 h-6 text-muted-foreground" />
                ) : (
                  <Tv className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg leading-tight">{media.title}</h3>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  {media.media_type === "movie" ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
                  {media.media_type === "movie" ? "Movie" : "TV Series"}
                </span>
                {media.release_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {media.release_date.slice(0, 4)}
                  </span>
                )}
                {media.rating && media.rating > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-500" />
                    {media.rating.toFixed(1)}
                  </span>
                )}
                {media.runtime && media.runtime > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {Math.floor(media.runtime / 60) > 0 ? `${Math.floor(media.runtime / 60)}h ` : ''}{media.runtime % 60}m
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tabs for Search vs Fail-Safe */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2 shrink-0">
            <TabsTrigger value="search" className="gap-2">
              <Search className="w-4 h-4" />
              Search Streams
            </TabsTrigger>
            <TabsTrigger value="downloads" className="gap-2">
              <Download className="w-4 h-4" />
              Fail-Safe
            </TabsTrigger>
          </TabsList>

          {/* Search Tab */}
          <TabsContent value="search" className="flex-1 flex flex-col min-h-0 mt-4">
            {/* Season/Episode picker for TV shows */}
            {media?.media_type === "tv" && (
              <div className="relative z-10 flex items-center gap-2 flex-wrap mb-2">
                <Select
                  value={selectedSeason.toString()}
                  onValueChange={(v) => {
                    setSelectedSeason(parseInt(v));
                    setSelectedEpisode(1);
                    setStreams([]);
                  }}
                >
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue placeholder="Season" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {Array.from({ length: media.seasons || 10 }, (_, i) => i + 1).map((s) => (
                      <SelectItem key={s} value={s.toString()} className="text-xs">
                        S{s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedEpisode.toString()}
                  onValueChange={(v) => {
                    setSelectedEpisode(parseInt(v));
                    setStreams([]);
                  }}
                >
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue placeholder="Episode" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {Array.from({ length: 30 }, (_, i) => i + 1).map((e) => (
                      <SelectItem key={e} value={e.toString()} className="text-xs">
                        E{e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleSearch} disabled={isSearching} variant="outline" size="sm" className="gap-1">
                  {isSearching ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Search
                </Button>
              </div>
            )}

            {/* Loading state */}
            {isSearching && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Searching for streams...</span>
              </div>
            )}

            {/* Error state */}
            {error && !isSearching && (
              <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm text-destructive">{error}</p>
                  <Button onClick={handleSearch} variant="ghost" size="sm" className="mt-2 h-7 gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Try Again
                  </Button>
                </div>
              </div>
            )}

            {/* Stream list */}
            {streams.length > 0 && !isSearching && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* Quality filter, compact toggle, and count */}
                <div className="flex items-center justify-between gap-3 mb-2 px-1 shrink-0">
                  <p className={cn(
                    "text-muted-foreground",
                    isTVMode ? "text-base" : "text-xs"
                  )}>
                    {filteredStreams.length} of {streams.length} stream(s)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("h-8 w-8", isTVMode && "h-10 w-10")}
                      onClick={() => setIsCompactView(!isCompactView)}
                      title={isCompactView ? "Normal view" : "Compact view"}
                    >
                      {isCompactView ? (
                        <LayoutGrid className={cn("w-4 h-4", isTVMode && "w-5 h-5")} />
                      ) : (
                        <List className={cn("w-4 h-4", isTVMode && "w-5 h-5")} />
                      )}
                    </Button>
                    <Filter className="w-3 h-3 text-muted-foreground" />
                    <Select value={qualityFilter} onValueChange={setQualityFilter}>
                      <SelectTrigger className={cn("w-[100px]", isTVMode ? "h-10" : "h-8")}>
                        <SelectValue placeholder="Quality" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="4k">4K</SelectItem>
                        <SelectItem value="1080p">1080p</SelectItem>
                        <SelectItem value="720p">720p</SelectItem>
                        <SelectItem value="480p">480p/SD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {filteredStreams.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No streams match the selected quality filter.
                  </p>
                ) : (
                <ScrollAreaWithArrows 
                  scrollStep={150}
                  isTVMode={isTVMode}
                  className="flex-1 min-h-0"
                >
                  <div className={cn(
                    "p-1",
                    "grid gap-2",
                    // Responsive grid: more columns in landscape/wider screens
                    "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                  )}>
                
                {filteredStreams.map((stream, index) => {
                  const info = parseStreamInfo(stream);
                  const isCurrentlyResolving = resolvingStream === stream.url;
                  const isFocused = focusedIndex === index;
                  
                  return (
                    <button
                      key={index}
                      ref={(el) => (streamButtonsRef.current[index] = el)}
                      onClick={() => handleStreamSelect(stream)}
                      onKeyDown={(e) => handleKeyDown(e, index, stream)}
                      onFocus={() => setFocusedIndex(index)}
                      disabled={isResolving}
                      className={cn(
                        "w-full text-left rounded-lg border transition-all duration-200",
                        isCompactView
                          ? (isTVMode ? "p-3" : "p-1.5")
                          : (isTVMode ? "p-5" : "p-3"),
                        isCurrentlyResolving
                          ? "border-primary bg-primary/30 ring-2 ring-primary shadow-lg shadow-primary/20"
                          : isFocused
                          ? "border-primary bg-primary/20 ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02] shadow-lg shadow-primary/20"
                          : "border-muted-foreground/30 bg-secondary/50 hover:border-primary hover:bg-primary/10 hover:shadow-md",
                        "focus:outline-none focus:border-primary focus:bg-primary/20 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background focus:scale-[1.02] focus:shadow-lg focus:shadow-primary/20",
                        isResolving && !isCurrentlyResolving && "opacity-50"
                      )}
                    >
                      <div className={cn(
                        "flex items-center justify-between",
                        isTVMode ? "gap-4" : "gap-3"
                      )}>
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            "flex flex-wrap items-center",
                            isTVMode ? "gap-3" : "gap-2"
                          )}>
                            {info.quality && (
                              <span className={cn(
                                "font-semibold rounded",
                                isTVMode ? "px-3 py-1 text-base" : "px-2 py-0.5 text-xs",
                                info.quality.includes("2160") || info.quality.includes("4K")
                                  ? "bg-purple-500/20 text-purple-400"
                                  : info.quality.includes("1080")
                                  ? "bg-blue-500/20 text-blue-400"
                                  : info.quality.includes("720")
                                  ? "bg-green-500/20 text-green-400"
                                  : "bg-muted text-muted-foreground"
                              )}>
                                {info.quality}
                              </span>
                            )}
                            {info.size && (
                              <span className={cn(
                                "text-muted-foreground",
                                isTVMode ? "text-base" : "text-xs"
                              )}>{info.size}</span>
                            )}
                            {info.isDirectLink && (
                              <span className={cn(
                                "bg-green-500/20 text-green-400 rounded flex items-center gap-1",
                                isTVMode ? "px-2 py-1 text-sm" : "px-1.5 py-0.5 text-xs"
                              )}>
                                <Zap className={cn(isTVMode ? "w-4 h-4" : "w-3 h-3")} />
                                Cached
                              </span>
                            )}
                          </div>
                          <p className={cn(
                            "text-foreground/80 mt-1 truncate font-medium",
                            isTVMode ? "text-base" : "text-sm"
                          )}>
                            {stream.title || stream.name}
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {isCurrentlyResolving ? (
                            <div className="flex flex-col items-end gap-1">
                              <Loader2 className={cn(
                                "animate-spin text-primary",
                                isTVMode ? "w-8 h-8" : "w-5 h-5"
                              )} />
                              {resolveStatus && (
                                <span className={cn(
                                  "text-primary",
                                  isTVMode ? "text-sm" : "text-xs"
                                )}>{resolveStatus}</span>
                              )}
                              {resolveProgress > 0 && resolveProgress < 100 && (
                                <div className={cn(
                                  "bg-muted rounded-full overflow-hidden",
                                  isTVMode ? "w-28 h-2" : "w-20 h-1.5"
                                )}>
                                  <div 
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${resolveProgress}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          ) : (
                            <Play className={cn(
                              isTVMode ? "w-8 h-8" : "w-5 h-5",
                              isFocused ? "text-primary" : "text-muted-foreground"
                            )} />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
                  </div>
                </ScrollAreaWithArrows>
                )}
              </div>
            )}
          </TabsContent>

          {/* Fail-Safe Tab */}
          <TabsContent value="downloads" className="flex-1 flex flex-col min-h-0 mt-4">
            {/* Search box for downloads */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search your downloads..."
                  value={downloadSearchQuery}
                  onChange={(e) => setDownloadSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-secondary/50 border border-muted-foreground/30 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <Button onClick={loadMyDownloads} disabled={isLoadingDownloads} variant="outline" size="icon" className="shrink-0">
                {isLoadingDownloads ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Loading state */}
            {isLoadingDownloads && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Loading your downloads...</span>
              </div>
            )}

            {/* Error state */}
            {downloadsError && !isLoadingDownloads && (
              <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm text-destructive">{downloadsError}</p>
                  <Button onClick={loadMyDownloads} variant="ghost" size="sm" className="mt-2 h-7 gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Try Again
                  </Button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!isLoadingDownloads && !downloadsError && myDownloads.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Download className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm">No downloads found in your Real-Debrid account</p>
                <Button onClick={loadMyDownloads} variant="ghost" size="sm" className="mt-2 gap-1">
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </Button>
              </div>
            )}

            {/* Downloads list */}
            {!isLoadingDownloads && filteredDownloads.length > 0 && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* Compact toggle and count */}
                <div className="flex items-center justify-between gap-3 mb-2 px-1 shrink-0">
                  <p className={cn(
                    "text-muted-foreground",
                    isTVMode ? "text-base" : "text-xs"
                  )}>
                    {filteredDownloads.length} of {myDownloads.length} file(s)
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8", isTVMode && "h-10 w-10")}
                    onClick={() => setIsCompactView(!isCompactView)}
                    title={isCompactView ? "Normal view" : "Compact view"}
                  >
                    {isCompactView ? (
                      <LayoutGrid className={cn("w-4 h-4", isTVMode && "w-5 h-5")} />
                    ) : (
                      <List className={cn("w-4 h-4", isTVMode && "w-5 h-5")} />
                    )}
                  </Button>
                </div>
                
                <ScrollAreaWithArrows 
                  scrollStep={150}
                  isTVMode={isTVMode}
                  className="flex-1 min-h-0"
                >
                  <div className={cn(
                    "p-1",
                    isCompactView 
                      ? (isTVMode ? "space-y-2" : "space-y-1") 
                      : (isTVMode ? "space-y-3" : "space-y-2")
                  )}>
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
                            "w-full text-left rounded-lg border transition-all duration-200",
                            isCompactView
                              ? (isTVMode ? "p-3" : "p-1.5")
                              : (isTVMode ? "p-5" : "p-3"),
                            isCurrentlyResolving
                              ? "border-primary bg-primary/30 ring-2 ring-primary shadow-lg shadow-primary/20"
                              : isFocused
                              ? "border-primary bg-primary/20 ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02] shadow-lg shadow-primary/20"
                              : "border-muted-foreground/30 bg-secondary/50 hover:border-primary hover:bg-primary/10 hover:shadow-md",
                            "focus:outline-none focus:border-primary focus:bg-primary/20 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background focus:scale-[1.02] focus:shadow-lg focus:shadow-primary/20",
                            isResolving && !isCurrentlyResolving && "opacity-50"
                          )}
                        >
                          <div className={cn(
                            "flex items-center justify-between",
                            isTVMode ? "gap-4" : "gap-3"
                          )}>
                            <div className="flex-1 min-w-0">
                              <div className={cn(
                                "flex flex-wrap items-center",
                                isTVMode ? "gap-3" : "gap-2"
                              )}>
                                {quality && (
                                  <span className={cn(
                                    "font-semibold rounded",
                                    isTVMode ? "px-3 py-1 text-base" : "px-2 py-0.5 text-xs",
                                    quality.includes("2160") || quality.includes("4K")
                                      ? "bg-purple-500/20 text-purple-400"
                                      : quality.includes("1080")
                                      ? "bg-blue-500/20 text-blue-400"
                                      : quality.includes("720")
                                      ? "bg-green-500/20 text-green-400"
                                      : "bg-muted text-muted-foreground"
                                  )}>
                                    {quality}
                                  </span>
                                )}
                                <span className={cn(
                                  "text-muted-foreground",
                                  isTVMode ? "text-base" : "text-xs"
                                )}>
                                  {formatFileSize(download.filesize)}
                                </span>
                                <span className={cn(
                                  "bg-green-500/20 text-green-400 rounded flex items-center gap-1",
                                  isTVMode ? "px-2 py-1 text-sm" : "px-1.5 py-0.5 text-xs"
                                )}>
                                  <Zap className={cn(isTVMode ? "w-4 h-4" : "w-3 h-3")} />
                                  Ready
                                </span>
                              </div>
                              <p className={cn(
                                "text-foreground/80 mt-1 truncate font-medium",
                                isTVMode ? "text-base" : "text-sm"
                              )}>
                                {download.filename}
                              </p>
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1">
                              {isCurrentlyResolving ? (
                                <div className="flex flex-col items-end gap-1">
                                  <Loader2 className={cn(
                                    "animate-spin text-primary",
                                    isTVMode ? "w-8 h-8" : "w-5 h-5"
                                  )} />
                                  {resolveStatus && (
                                    <span className={cn(
                                      "text-primary",
                                      isTVMode ? "text-sm" : "text-xs"
                                    )}>{resolveStatus}</span>
                                  )}
                                </div>
                              ) : (
                                <Play className={cn(
                                  isTVMode ? "w-8 h-8" : "w-5 h-5",
                                  isFocused ? "text-primary" : "text-muted-foreground"
                                )} />
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollAreaWithArrows>
              </div>
            )}

            {/* No results for search */}
            {!isLoadingDownloads && myDownloads.length > 0 && filteredDownloads.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No downloads match your search.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
