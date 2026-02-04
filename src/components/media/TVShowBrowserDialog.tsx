import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Media } from "@/hooks/useMedia";
import { useTVMode } from "@/hooks/useTVMode";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { useBrowseHere } from "@/hooks/useBrowseHere";
import { getTVSeason, getImageUrl, TMDBSeason, TMDBEpisode } from "@/lib/tmdb";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, Calendar, Clock, Star, ChevronRight, Tv, ChevronUp, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TVShowBrowserDialogProps {
  media: Media | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEpisodeSelect: (media: Media, seasonNumber: number, episodeNumber: number) => void;
}

export function TVShowBrowserDialog({
  media,
  open,
  onOpenChange,
  onEpisodeSelect,
}: TVShowBrowserDialogProps) {
  const { isTVMode } = useTVMode();
  const { isBrowseHere } = useBrowseHere();
  const { progress: watchProgress } = useWatchProgress();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonData, setSeasonData] = useState<TMDBSeason | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Scroll state
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  
  const scrollBehavior: ScrollBehavior = isBrowseHere ? "auto" : "smooth";

  // Generate season options based on media.seasons count
  const seasonOptions = useMemo(() => {
    if (!media?.seasons) return [1];
    return Array.from({ length: media.seasons }, (_, i) => i + 1);
  }, [media?.seasons]);

  // Get watch progress for an episode
  const getEpisodeProgress = useCallback((seasonNumber: number, episodeNumber: number) => {
    if (!media) return null;
    return watchProgress.find(
      (p) =>
        p.media_id === media.id &&
        p.season_number === seasonNumber &&
        p.episode_number === episodeNumber
    );
  }, [media, watchProgress]);

  // Update scroll state
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop < el.scrollHeight - el.clientHeight - 1);
  }, []);

  // Scroll by amount
  const scrollBy = useCallback((delta: number) => {
    const el = scrollRef.current;
    if (!el) return;
    if (typeof el.scrollBy === 'function') {
      el.scrollBy({ top: delta, behavior: scrollBehavior });
    } else {
      el.scrollTop += delta;
    }
  }, [scrollBehavior]);

  // Load season data when dialog opens or season changes
  useEffect(() => {
    if (!open || !media?.tmdb_id) return;

    const loadSeason = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const data = await getTVSeason(media.tmdb_id!, selectedSeason);
        setSeasonData(data);
      } catch (err: any) {
        console.error("Failed to load season data:", err);
        setError(err.message || "Failed to load season data");
        toast.error("Failed to load episodes");
      }
      
      setIsLoading(false);
    };

    loadSeason();
  }, [open, media?.tmdb_id, selectedSeason]);

  // Reset to season 1 when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedSeason(1);
      setSeasonData(null);
    }
  }, [open]);

  // Update scroll state on mount and content changes
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    
    updateScrollState();
    el.addEventListener('scroll', updateScrollState);
    
    const raf = requestAnimationFrame(updateScrollState);
    const timeout = setTimeout(updateScrollState, 100);
    
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [open, updateScrollState, seasonData]);

  const handleEpisodeClick = (episode: TMDBEpisode) => {
    if (!media) return;
    onEpisodeSelect(media, episode.season_number, episode.episode_number);
    onOpenChange(false);
  };

  const formatRuntime = (minutes: number | null) => {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (!media) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(
          "max-w-4xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden",
          isTVMode && "max-w-5xl"
        )}
      >
        {/* Header with backdrop */}
        <div className="relative h-40 shrink-0">
          {media.backdrop_path ? (
            <img
              src={getImageUrl(media.backdrop_path, "w780") || ""}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-background" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          
          <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className={cn(
                "font-bold truncate",
                isTVMode ? "text-2xl" : "text-xl"
              )}>
                {media.title}
              </h2>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                {media.release_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(media.release_date).getFullYear()}
                  </span>
                )}
                {media.seasons && (
                  <span>{media.seasons} Season{media.seasons > 1 ? 's' : ''}</span>
                )}
                {media.rating && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />
                    {media.rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
            
            {/* Season Selector */}
            <Select 
              value={String(selectedSeason)} 
              onValueChange={(v) => setSelectedSeason(Number(v))}
            >
              <SelectTrigger className={cn(
                "w-36 bg-background/80 backdrop-blur-sm",
                isTVMode && "w-44 h-12 text-lg"
              )}>
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent>
                {seasonOptions.map((num) => (
                  <SelectItem key={num} value={String(num)}>
                    Season {num}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Episode List with Scroll Navigation */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Scroll Up Button */}
          <div className={cn(
            "absolute top-0 left-0 right-0 z-10 flex justify-center py-2 bg-gradient-to-b from-background via-background/80 to-transparent transition-opacity",
            canScrollUp ? "opacity-100" : "opacity-0 pointer-events-none"
          )}>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "rounded-full shadow-lg",
                isTVMode && "h-12 w-12"
              )}
              onClick={() => scrollBy(-300)}
            >
              <ChevronUp className={cn("w-4 h-4", isTVMode && "w-6 h-6")} />
            </Button>
          </div>

          {/* Episode List */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 scroll-smooth"
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Tv className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{error}</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setSelectedSeason(selectedSeason)}
                >
                  Retry
                </Button>
              </div>
            ) : seasonData?.episodes?.length ? (
              <div className="space-y-2 py-4">
                {seasonData.episodes.map((episode) => {
                  const episodeProgress = getEpisodeProgress(episode.season_number, episode.episode_number);
                  const progressPercent = episodeProgress?.duration_seconds 
                    ? Math.round((episodeProgress.progress_seconds / episodeProgress.duration_seconds) * 100)
                    : 0;
                  const isCompleted = episodeProgress?.completed;
                  const hasProgress = episodeProgress && episodeProgress.progress_seconds > 0;

                  return (
                    <button
                      key={episode.id}
                      onClick={() => handleEpisodeClick(episode)}
                      className={cn(
                        "w-full flex gap-4 p-3 rounded-lg hover:bg-accent/50 transition-colors text-left group",
                        isTVMode && "p-4",
                        isCompleted && "opacity-75"
                      )}
                    >
                      {/* Episode Thumbnail */}
                      <div className={cn(
                        "relative shrink-0 rounded-md overflow-hidden bg-muted",
                        isTVMode ? "w-44 h-24" : "w-36 h-20"
                      )}>
                        {episode.still_path ? (
                          <img
                            src={getImageUrl(episode.still_path, "w300") || ""}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Tv className="w-8 h-8 text-muted-foreground/50" />
                          </div>
                        )}
                        
                        {/* Watch progress overlay */}
                        {hasProgress && !isCompleted && (
                          <div className="absolute bottom-0 left-0 right-0">
                            <Progress value={progressPercent} className="h-1 rounded-none bg-black/50" />
                          </div>
                        )}
                        
                        {/* Completed checkmark */}
                        {isCompleted && (
                          <div className="absolute top-1 right-1 bg-green-500 rounded-full p-1">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                        
                        {/* Play overlay on hover */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play className="w-8 h-8 text-white fill-white" />
                        </div>
                      </div>

                      {/* Episode Info */}
                      <div className="flex-1 min-w-0 py-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className={cn(
                            "font-medium line-clamp-1",
                            isTVMode && "text-lg"
                          )}>
                            <span className="text-muted-foreground mr-2">
                              E{episode.episode_number}
                            </span>
                            {episode.name}
                            {isCompleted && (
                              <span className="ml-2 text-xs text-green-500 font-normal">Watched</span>
                            )}
                            {hasProgress && !isCompleted && (
                              <span className="ml-2 text-xs text-primary font-normal">{progressPercent}%</span>
                            )}
                          </h3>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        
                        <p className={cn(
                          "text-sm text-muted-foreground line-clamp-2 mt-1",
                          isTVMode && "line-clamp-3"
                        )}>
                          {episode.overview || "No description available"}
                        </p>
                        
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {episode.air_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(episode.air_date).toLocaleDateString()}
                            </span>
                          )}
                          {episode.runtime && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatRuntime(episode.runtime)}
                            </span>
                          )}
                          {episode.vote_average > 0 && (
                            <span className="flex items-center gap-1">
                              <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                              {episode.vote_average.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Tv className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No episodes found for this season</p>
              </div>
            )}
          </div>

          {/* Scroll Down Button */}
          <div className={cn(
            "absolute bottom-0 left-0 right-0 z-10 flex justify-center py-2 bg-gradient-to-t from-background via-background/80 to-transparent transition-opacity",
            canScrollDown ? "opacity-100" : "opacity-0 pointer-events-none"
          )}>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "rounded-full shadow-lg",
                isTVMode && "h-12 w-12"
              )}
              onClick={() => scrollBy(300)}
            >
              <ChevronDown className={cn("w-4 h-4", isTVMode && "w-6 h-6")} />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
