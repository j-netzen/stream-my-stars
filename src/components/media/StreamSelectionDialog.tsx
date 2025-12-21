import { useState, useEffect, useRef, useCallback } from "react";
import { Media, useMedia } from "@/hooks/useMedia";
import { useTVMode } from "@/hooks/useTVMode";
import { searchTorrentio, getImdbIdFromTmdb, parseStreamInfo, TorrentioStream, isDirectRdLink, isMagnetLink, extractMagnetFromTorrentioUrl } from "@/lib/torrentio";
import { unrestrictLink, addMagnetAndWait } from "@/lib/realDebrid";
import { getImageUrl } from "@/lib/tmdb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { ScrollAreaWithArrows } from "@/components/ui/scroll-area-with-arrows";
import { Loader2, Play, Film, Tv, RefreshCw, Star, Calendar, Zap, AlertCircle, Clock, Filter } from "lucide-react";
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
  const streamButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);

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

  // Auto-focus first stream when list loads or filter changes
  useEffect(() => {
    if (filteredStreams.length > 0 && !isSearching) {
      setFocusedIndex(0);
      // Focus the first stream button for TV navigation
      setTimeout(() => {
        streamButtonsRef.current[0]?.focus();
      }, 100);
    }
  }, [filteredStreams.length, isSearching, qualityFilter]);

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

  // Reset state when dialog opens with new media
  useEffect(() => {
    if (open && media) {
      setStreams([]);
      setError(null);
      setSelectedSeason(1);
      setSelectedEpisode(1);
      setQualityFilter("all");
      // Auto-search when dialog opens
      handleSearch();
    }
  }, [open, media?.id]);

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

  const handleStreamSelect = async (stream: TorrentioStream) => {
    if (!media) return;
    
    setIsResolving(true);
    setResolvingStream(stream.url);
    setResolveProgress(0);
    setResolveStatus("Starting...");
    
    try {
      let downloadUrl: string;
      const isTorrentioResolveUrl = stream.url.includes("torrentio.strem.fun/resolve/");
      
      const handleProgress = (progress: number) => {
        setResolveProgress(progress);
        if (progress < 100) {
          setResolveStatus(`Downloading: ${progress}%`);
        } else {
          setResolveStatus("Finalizing...");
        }
      };
      
      if (isDirectRdLink(stream.url)) {
        // Already a direct link
        setResolveStatus("Using cached stream...");
        downloadUrl = stream.url;
      } else if (isMagnetLink(stream.url)) {
        // Magnet link - add to RD and wait
        setResolveStatus("Adding to Real-Debrid...");
        const torrent = await addMagnetAndWait(stream.url, handleProgress);
        if (torrent.links && torrent.links.length > 0) {
          setResolveStatus("Generating download link...");
          const unrestricted = await unrestrictLink(torrent.links[0]);
          downloadUrl = unrestricted.download;
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
            setResolveStatus("Generating download link...");
            const unrestricted = await unrestrictLink(torrent.links[0]);
            downloadUrl = unrestricted.download;
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
        downloadUrl = unrestricted.download;
      }
      
      // Don't save the URL to database - always prompt for stream selection
      toast.success("Stream ready!");
      onOpenChange(false);
      
      // Pass the media with the stream URL to play (without persisting)
      onStreamSelected({ ...media, source_url: downloadUrl }, downloadUrl);
      
    } catch (err: any) {
      console.error("Stream resolution error:", err);
      toast.error(err.message || "Failed to resolve stream");
    }
    
    setIsResolving(false);
    setResolvingStream(null);
    setResolveProgress(0);
    setResolveStatus("");
  };

  const posterUrl = media?.poster_path
    ? getImageUrl(media.poster_path, "w200")
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Select Stream
          </DialogTitle>
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

        {/* Season/Episode picker for TV shows */}
        {media?.media_type === "tv" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Season</Label>
              <Select
                value={selectedSeason.toString()}
                onValueChange={(v) => {
                  setSelectedSeason(parseInt(v));
                  setSelectedEpisode(1);
                  setStreams([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: media.seasons || 10 }, (_, i) => i + 1).map((s) => (
                    <SelectItem key={s} value={s.toString()}>
                      Season {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Episode</Label>
              <Select
                value={selectedEpisode.toString()}
                onValueChange={(v) => {
                  setSelectedEpisode(parseInt(v));
                  setStreams([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((e) => (
                    <SelectItem key={e} value={e.toString()}>
                      Episode {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Search button for TV shows when episode changes */}
        {media?.media_type === "tv" && (
          <Button onClick={handleSearch} disabled={isSearching} variant="outline" className="gap-2">
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Search S{selectedSeason}E{selectedEpisode}
          </Button>
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
          <div className="flex flex-col flex-1 min-h-0">
            <ScrollAreaWithArrows 
              scrollStep={150}
              isTVMode={isTVMode}
            >
              <div className={cn(
                isTVMode ? "space-y-3 p-1" : "space-y-2 p-1"
              )}>
            {/* Quality filter and count */}
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className={cn(
                "text-muted-foreground",
                isTVMode ? "text-base" : "text-xs"
              )}>
                {filteredStreams.length} of {streams.length} stream(s)
              </p>
              <div className="flex items-center gap-2">
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
            
            {filteredStreams.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No streams match the selected quality filter.
              </p>
            )}
            
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
                    "w-full text-left rounded-lg border-2 transition-all duration-200",
                    // Base padding - larger for TV
                    isTVMode ? "p-5" : "p-3",
                    // Focus/selection states - very visible for TV
                    isCurrentlyResolving
                      ? "border-primary bg-primary/30 ring-2 ring-primary shadow-lg shadow-primary/20"
                      : isFocused
                      ? "border-primary bg-primary/20 ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02] shadow-lg shadow-primary/20"
                      : "border-muted-foreground/30 bg-secondary/50 hover:border-primary hover:bg-primary/10 hover:shadow-md",
                    // Focused state styling
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
