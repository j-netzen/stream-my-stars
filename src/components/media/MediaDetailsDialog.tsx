import { Media } from "@/hooks/useMedia";
import { getImageUrl } from "@/lib/tmdb";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, X, Star, Calendar, Clock, Film, Tv } from "lucide-react";

interface MediaDetailsDialogProps {
  media: Media | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlay: (media: Media) => void;
}

export function MediaDetailsDialog({ media, open, onOpenChange, onPlay }: MediaDetailsDialogProps) {
  if (!media) return null;

  const backdropUrl = media.backdrop_path
    ? getImageUrl(media.backdrop_path, "original")
    : null;

  const posterUrl = media.poster_path
    ? getImageUrl(media.poster_path, "w500")
    : null;

  const castMembers = Array.isArray(media.cast_members) ? media.cast_members : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background border-border">
        {/* Backdrop Header */}
        <div className="relative h-64 md:h-80">
          {backdropUrl ? (
            <img
              src={backdropUrl}
              alt={media.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-secondary" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          
          {/* Close Button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 p-2 bg-background/80 hover:bg-background rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Title and Play */}
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{media.title}</h2>
            <Button size="lg" className="gap-2" onClick={() => {
              onOpenChange(false);
              onPlay(media);
            }}>
              <Play className="w-5 h-5 fill-current" />
              Play
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              {media.media_type === "movie" ? (
                <Film className="w-4 h-4" />
              ) : (
                <Tv className="w-4 h-4" />
              )}
              {media.media_type === "movie" ? "Movie" : "TV Series"}
            </span>
            {media.release_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {media.release_date.slice(0, 4)}
              </span>
            )}
            {media.rating && media.rating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-500" />
                {media.rating.toFixed(1)}
              </span>
            )}
            {media.runtime && (
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {media.runtime} min
              </span>
            )}
            {media.seasons && (
              <span>{media.seasons} season{media.seasons > 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Genres */}
          {media.genres && media.genres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {media.genres.map((genre) => (
                <span
                  key={genre}
                  className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded-full"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {/* Overview */}
          {media.overview && (
            <p className="text-muted-foreground leading-relaxed">
              {media.overview}
            </p>
          )}

          {/* Cast */}
          {castMembers.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Cast</h3>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {castMembers.slice(0, 10).map((member: any) => (
                  <div key={member.id} className="flex-shrink-0 text-center w-20">
                    {member.profile_path ? (
                      <img
                        src={getImageUrl(member.profile_path, "w200") || ""}
                        alt={member.name}
                        className="w-16 h-16 rounded-full object-cover mx-auto mb-2"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-secondary mx-auto mb-2 flex items-center justify-center">
                        <span className="text-xl text-muted-foreground">
                          {member.name?.charAt(0)}
                        </span>
                      </div>
                    )}
                    <p className="text-xs font-medium truncate">{member.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {member.character}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
