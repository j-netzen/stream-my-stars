import { Media } from "@/hooks/useMedia";
import { WatchProgress } from "@/hooks/useWatchProgress";
import { getImageUrl } from "@/lib/tmdb";
import { cn } from "@/lib/utils";
import { Play, MoreVertical, Info } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useTVMode } from "@/hooks/useTVMode";

interface MediaCardProps {
  media: Media;
  progress?: WatchProgress;
  onPlay?: (media: Media) => void;
  onDelete?: (media: Media) => void;
  onAddToPlaylist?: (media: Media) => void;
  onMoreInfo?: (media: Media) => void;
}

export function MediaCard({
  media,
  progress,
  onPlay,
  onDelete,
  onAddToPlaylist,
  onMoreInfo,
}: MediaCardProps) {
  const { isTVMode } = useTVMode();
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
      onPlay?.(media);
    }
  };

  return (
    <div 
      className="media-card group"
      tabIndex={0}
      role="button"
      aria-label={`Play ${media.title}`}
      onKeyDown={handleKeyDown}
    >
      {/* Poster */}
      <div className={cn(
        "relative bg-secondary rounded-lg overflow-hidden",
        isTVMode ? "aspect-[2/3]" : "aspect-[2/3]"
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
            <Play className={cn("w-12 h-12", isTVMode && "w-16 h-16")} />
          </div>
        )}

        {/* Hover/Focus Overlay - always visible on TV for focused items */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-4 transition-opacity duration-300",
          isTVMode 
            ? "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 p-6" 
            : "opacity-0 group-hover:opacity-100"
        )}>
          <div className={cn("flex gap-2", isTVMode && "gap-3")}>
            <Button
              onClick={() => onPlay?.(media)}
              className={cn("flex-1 gap-2", isTVMode && "tv-button")}
              size={isTVMode ? "lg" : "sm"}
              tabIndex={-1}
            >
              <Play className={cn("w-4 h-4", isTVMode && "w-6 h-6")} />
              {progress && progressPercent > 0 ? "Continue" : "Play"}
            </Button>
            <Button
              onClick={() => onMoreInfo?.(media)}
              variant="secondary"
              size={isTVMode ? "lg" : "sm"}
              className={isTVMode ? "tv-button" : ""}
              title="More Info"
              tabIndex={-1}
            >
              <Info className={cn("w-4 h-4", isTVMode && "w-6 h-6")} />
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

        {/* Media Type Badge */}
        <div
          className={cn(
            "absolute top-2 left-2 px-2 py-1 rounded font-medium uppercase",
            isTVMode ? "text-sm px-3 py-1.5" : "text-xs",
            media.media_type === "movie"
              ? "bg-blue-500/80"
              : media.media_type === "tv"
              ? "bg-green-500/80"
              : "bg-orange-500/80"
          )}
        >
          {media.media_type}
        </div>
      </div>

      {/* Info */}
      <div className={cn("p-3", isTVMode && "p-4")}>
        <h3 className={cn(
          "font-medium line-clamp-1",
          isTVMode ? "text-lg" : "text-sm"
        )}>
          {media.title}
        </h3>
        <p className={cn(
          "text-muted-foreground mt-1",
          isTVMode ? "text-base" : "text-xs"
        )}>
          {media.release_date?.split("-")[0] || "Unknown year"}
          {media.rating && ` • ${media.rating.toFixed(1)}★`}
        </p>
      </div>
    </div>
  );
}
