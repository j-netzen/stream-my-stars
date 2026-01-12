import { Media } from "@/hooks/useMedia";
import { getImageUrl } from "@/lib/tmdb";
import { Button } from "@/components/ui/button";
import { Play, Info, Star, Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTVMode } from "@/hooks/useTVMode";

interface MediaHeroProps {
  featured: Media;
  onPlay: (media: Media) => void;
  onMoreInfo: (media: Media) => void;
}

export function MediaHero({ featured, onPlay, onMoreInfo }: MediaHeroProps) {
  const { isTVMode } = useTVMode();
  
  const featuredBackdrop = featured?.backdrop_path
    ? getImageUrl(featured.backdrop_path, "original")
    : null;

  return (
    <div className={cn(
      "relative overflow-hidden z-20",
      isTVMode 
        ? "h-[65vh] max-h-[700px] mx-[5%]"
        : "h-[50vh] min-h-[320px] max-h-[500px] landscape:h-[60vh] landscape:max-h-[450px]"
    )}>
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: featuredBackdrop
            ? `url(${featuredBackdrop})`
            : undefined,
          backgroundColor: featuredBackdrop ? undefined : "hsl(var(--secondary))",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className={cn(
        "relative z-40 h-full flex flex-col justify-end",
        isTVMode ? "pb-20 px-16" : "pb-8 px-6 landscape:pb-6 landscape:px-8"
      )}>
        <div className={cn(
          "flex flex-col space-y-3",
          isTVMode ? "max-w-4xl space-y-5" : "max-w-xl landscape:max-w-2xl"
        )}>
          {/* Meta info */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={cn(
              "px-3 py-1 rounded text-xs font-medium uppercase",
              featured.media_type === "movie" ? "bg-blue-500/80" : "bg-green-500/80"
            )}>
              {featured.media_type === "movie" ? "Movie" : "TV Show"}
            </span>
            {featured.rating && (
              <span className="flex items-center gap-1 text-sm text-white/80">
                <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                {featured.rating.toFixed(1)}
              </span>
            )}
            {featured.release_date && (
              <span className="flex items-center gap-1 text-sm text-white/80">
                <Calendar className="w-4 h-4" />
                {featured.release_date.split("-")[0]}
              </span>
            )}
            {featured.runtime && (
              <span className="flex items-center gap-1 text-sm text-white/80">
                <Clock className="w-4 h-4" />
                {featured.runtime} min
              </span>
            )}
          </div>

          <h1 className={cn(
            "font-bold text-shadow",
            isTVMode ? "text-5xl leading-tight" : "text-3xl landscape:text-4xl"
          )}>
            {featured.title}
          </h1>
          
          {featured.overview && (
            <p className={cn(
              "text-white/80 text-shadow",
              isTVMode ? "text-2xl line-clamp-2" : "text-sm line-clamp-2 landscape:text-base landscape:line-clamp-2"
            )}>
              {featured.overview}
            </p>
          )}
          
          {/* Genres */}
          {featured.genres && featured.genres.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {featured.genres.slice(0, 3).map((genre) => (
                <span 
                  key={genre} 
                  className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/70"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}
          
          {/* Button row */}
          <div className={cn("flex flex-row", isTVMode ? "gap-2 mt-1" : "gap-2 landscape:gap-3")}>
            <Button
              size={isTVMode ? "tv" : "lg"}
              className={cn("gap-1.5", isTVMode && "h-10 px-4 text-sm")}
              onClick={() => onPlay(featured)}
              tabIndex={0}
            >
              <Play className={cn("fill-current", isTVMode ? "w-4 h-4" : "w-5 h-5")} />
              Play
            </Button>
            <Button 
              size={isTVMode ? "tv" : "lg"}
              variant="secondary" 
              className={cn("gap-1.5", isTVMode && "h-10 px-4 text-sm")}
              onClick={() => onMoreInfo(featured)}
              tabIndex={0}
            >
              <Info className={cn(isTVMode ? "w-4 h-4" : "w-5 h-5")} />
              More Info
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
