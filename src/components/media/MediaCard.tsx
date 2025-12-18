import { Media } from "@/hooks/useMedia";
import { WatchProgress } from "@/hooks/useWatchProgress";
import { getImageUrl } from "@/lib/tmdb";
import { cn } from "@/lib/utils";
import { Play, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface MediaCardProps {
  media: Media;
  progress?: WatchProgress;
  onPlay?: (media: Media) => void;
  onDelete?: (media: Media) => void;
  onAddToPlaylist?: (media: Media) => void;
}

export function MediaCard({
  media,
  progress,
  onPlay,
  onDelete,
  onAddToPlaylist,
}: MediaCardProps) {
  const posterUrl = media.poster_path
    ? getImageUrl(media.poster_path, "w300")
    : null;

  const progressPercent = progress?.duration_seconds
    ? (progress.progress_seconds / progress.duration_seconds) * 100
    : 0;

  return (
    <div className="media-card group">
      {/* Poster */}
      <div className="relative aspect-[2/3] bg-secondary">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={media.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Play className="w-12 h-12" />
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <Button
            onClick={() => onPlay?.(media)}
            className="w-full gap-2 mb-2"
            size="sm"
          >
            <Play className="w-4 h-4" />
            {progress && progressPercent > 0 ? "Continue" : "Play"}
          </Button>
        </div>

        {/* Progress Bar */}
        {progress && progressPercent > 0 && progressPercent < 95 && (
          <div className="absolute bottom-0 left-0 right-0 progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Menu */}
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

        {/* Media Type Badge */}
        <div
          className={cn(
            "absolute top-2 left-2 px-2 py-1 rounded text-xs font-medium uppercase",
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
      <div className="p-3">
        <h3 className="font-medium text-sm line-clamp-1">{media.title}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {media.release_date?.split("-")[0] || "Unknown year"}
          {media.rating && ` • ${media.rating.toFixed(1)}★`}
        </p>
      </div>
    </div>
  );
}
