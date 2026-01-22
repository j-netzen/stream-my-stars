import { Media } from "@/hooks/useMedia";
import { WatchProgress } from "@/hooks/useWatchProgress";
import { getImageUrl } from "@/lib/tmdb";
import { cn } from "@/lib/utils";
import { Play, MoreVertical, Info, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useTVMode } from "@/hooks/useTVMode";
import { usePredictivePrefetch } from "@/hooks/usePredictivePrefetch";
import { useState, useCallback } from "react";

interface MediaCardProps {
  media: Media;
  progress?: WatchProgress;
  showContinue?: boolean;
  onPlay?: (media: Media) => void;
  onDelete?: (media: Media) => void;
  onAddToPlaylist?: (media: Media) => void;
  onMoreInfo?: (media: Media) => void;
}

export function MediaCard({
  media,
  progress,
  showContinue = true,
  onPlay,
  onDelete,
  onAddToPlaylist,
  onMoreInfo,
}: MediaCardProps) {
  const { isTVMode } = useTVMode();
  const { handleHoverIntent, handleHoverEnd } = usePredictivePrefetch();
  const [isOptimisticPlaying, setIsOptimisticPlaying] = useState(false);
  
  const posterUrl = media.poster_path
    ? getImageUrl(media.poster_path, isTVMode ? "w500" : "w300")
    : null;

  const progressPercent = progress?.duration_seconds
    ? (progress.progress_seconds / progress.duration_seconds) * 100
    : 0;

  // Handle keyboard navigation for TV
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      handleOptimisticPlay();
      return;
    }
  };

  // Optimistic UI: Update immediately on play click with very short timeout
  const handleOptimisticPlay = useCallback(() => {
    setIsOptimisticPlaying(true);
    onPlay?.(media);
    // Reset quickly - the dialog will take over instantly
    setTimeout(() => setIsOptimisticPlaying(false), 300);
  }, [media, onPlay]);

  // Predictive prefetch on hover
  const handleMouseEnter = useCallback(() => {
    handleHoverIntent(
      media.tmdb_id,
      media.media_type as 'movie' | 'tv',
      media.poster_path,
      media.backdrop_path
    );
  }, [media, handleHoverIntent]);

  const handleMouseLeave = useCallback(() => {
    handleHoverEnd();
  }, [handleHoverEnd]);

  return (
    <div 
      className={cn(
        "media-card group cosmic-border rounded-lg transition-all duration-200",
        "hover:shadow-star-glow",
        isTVMode ? "hover:scale-105 focus-within:scale-108" : "hover:scale-[1.02]",
        isOptimisticPlaying && "ring-2 ring-primary animate-pulse"
      )}
      tabIndex={0}
      role="button"
      aria-label={`Play ${media.title}`}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {/* Poster */}
      <div className={cn(
        "relative bg-secondary rounded-lg overflow-hidden shadow-star-md",
        "transition-shadow duration-200 group-hover:shadow-star-lg",
        "aspect-[2/3]"
      )}>
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={media.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Play className={cn("w-12 h-12", isTVMode && "w-20 h-20")} />
          </div>
        )}

        {/* Hover/Focus Overlay - always visible on TV for focused items */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end transition-opacity duration-200",
          isTVMode 
            ? "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 p-6" 
            : "opacity-0 group-hover:opacity-100 p-4"
        )}>
          {/* Button container - flexbox layout */}
          <div className={cn("flex flex-row gap-2", isTVMode && "gap-4")}>
            <Button
              onClick={handleOptimisticPlay}
              className={cn(
                "flex-1 gap-2",
                isTVMode && "h-16 text-lg"
              )}
              size={isTVMode ? "lg" : "sm"}
              tabIndex={-1}
              disabled={isOptimisticPlaying}
            >
              {isOptimisticPlaying ? (
                <Loader2 className={cn("w-4 h-4 animate-spin", isTVMode && "w-7 h-7")} />
              ) : (
                <Play className={cn("w-4 h-4", isTVMode && "w-7 h-7")} />
              )}
              {showContinue && progress && progressPercent > 0 ? "Continue" : "Play"}
            </Button>
            <Button
              onClick={() => onMoreInfo?.(media)}
              variant="secondary"
              size={isTVMode ? "lg" : "sm"}
              className={cn(isTVMode && "h-16 w-16")}
              title="More Info"
              tabIndex={-1}
            >
              <Info className={cn("w-4 h-4", isTVMode && "w-7 h-7")} />
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        {progress && progressPercent > 0 && progressPercent < 95 && (
          <div className={cn("absolute bottom-0 left-0 right-0 progress-bar", isTVMode && "h-2")}>
            <div
              className="progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Menu - hidden on TV mode, use overlay buttons instead */}
        {!isTVMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/70"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onPlay?.(media)}>
                Play
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMoreInfo?.(media)}>
                More Info
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddToPlaylist?.(media)}>
                Add to Playlist
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete?.(media)}
                className="text-destructive"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

      </div>

      {/* Info - flexbox layout */}
      <div className={cn(
        "flex flex-col p-3 bg-card/80 backdrop-blur-sm", 
        isTVMode && "p-5"
      )}>
        <h3 className={cn(
          "font-medium line-clamp-1 group-hover:text-primary transition-colors",
          isTVMode ? "text-xl" : "text-sm"
        )}>
          {media.title}
        </h3>
        <p className={cn(
          "text-muted-foreground mt-1",
          isTVMode ? "text-lg" : "text-xs"
        )}>
          {media.release_date?.split("-")[0] || "Unknown year"}
          {media.rating && (
            <span className="text-star-glow"> • {media.rating.toFixed(1)}★</span>
          )}
        </p>
      </div>
    </div>
  );
}
