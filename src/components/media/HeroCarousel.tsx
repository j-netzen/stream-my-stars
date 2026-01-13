import { useState, useEffect, useRef } from "react";
import { TMDBSearchResult, getImageUrl, getVideos, TMDBVideo } from "@/lib/tmdb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, ChevronLeft, ChevronRight, Star, Calendar, Film, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTVMode } from "@/hooks/useTVMode";
import { toast } from "sonner";

interface HeroCarouselProps {
  items: TMDBSearchResult[];
  onAddToLibrary?: (item: TMDBSearchResult) => void;
  isLoading?: boolean;
}

export function HeroCarousel({ items, onAddToLibrary, isLoading }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoadingTrailer, setIsLoadingTrailer] = useState(false);
  const [trailer, setTrailer] = useState<TMDBVideo | null>(null);
  const [showTrailerDialog, setShowTrailerDialog] = useState(false);
  const { isTVMode } = useTVMode();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleTrailer = async (item: TMDBSearchResult) => {
    setIsLoadingTrailer(true);
    try {
      const mediaType = item.media_type === "movie" ? "movie" : "tv";
      const videos = await getVideos(item.id, mediaType);
      const foundTrailer = videos.find(v => v.type === "Trailer" && v.site === "YouTube") 
        || videos.find(v => v.site === "YouTube");
      
      if (foundTrailer) {
        setTrailer(foundTrailer);
        setShowTrailerDialog(true);
      } else {
        toast.error("No trailer available");
      }
    } catch (error) {
      toast.error("Failed to load trailer");
    } finally {
      setIsLoadingTrailer(false);
    }
  };

  // Auto-scroll every 5 seconds
  useEffect(() => {
    if (items.length <= 1 || isPaused) return;

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % Math.min(items.length, 5));
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [items.length, isPaused]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
    setIsPaused(true);
    // Resume auto-scroll after 10 seconds
    setTimeout(() => setIsPaused(false), 10000);
  };

  const goToPrevious = () => {
    const newIndex = currentIndex === 0 ? Math.min(items.length - 1, 4) : currentIndex - 1;
    goToSlide(newIndex);
  };

  const goToNext = () => {
    const newIndex = (currentIndex + 1) % Math.min(items.length, 5);
    goToSlide(newIndex);
  };

  // Get top 5 items
  const displayItems = items.slice(0, 5);

  if (isLoading) {
    return (
      <div className={cn(
        "relative overflow-hidden animate-pulse bg-secondary",
        isTVMode 
          ? "h-[65vh] max-h-[700px] mx-[5%]"
          : "h-[50vh] min-h-[320px] max-h-[500px] landscape:h-[60vh] landscape:max-h-[450px]"
      )} />
    );
  }

  if (displayItems.length === 0) {
    return null;
  }

  const currentItem = displayItems[currentIndex];
  const backdropUrl = currentItem?.backdrop_path
    ? getImageUrl(currentItem.backdrop_path, "original")
    : null;

  return (
    <div 
      className={cn(
        "relative overflow-hidden z-20",
        isTVMode 
          ? "h-[65vh] max-h-[700px] mx-[5%]"
          : "h-[50vh] min-h-[320px] max-h-[500px] landscape:h-[60vh] landscape:max-h-[450px]"
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background with transition */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-700"
        style={{
          backgroundImage: backdropUrl ? `url(${backdropUrl})` : undefined,
          backgroundColor: backdropUrl ? undefined : "hsl(var(--secondary))",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      </div>

      {/* Rank Badge */}
      <div className={cn(
        "absolute top-4 left-4 z-50 bg-primary/90 text-primary-foreground font-bold rounded-lg flex items-center justify-center",
        isTVMode ? "w-16 h-16 text-3xl" : "w-12 h-12 text-xl"
      )}>
        #{currentIndex + 1}
      </div>

      {/* Navigation Arrows */}
      {displayItems.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPrevious}
            className={cn(
              "absolute left-4 top-1/2 -translate-y-1/2 z-50 bg-background/50 hover:bg-background/80 rounded-full",
              isTVMode ? "w-16 h-16" : "w-10 h-10"
            )}
          >
            <ChevronLeft className={cn(isTVMode ? "w-8 h-8" : "w-6 h-6")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNext}
            className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 z-50 bg-background/50 hover:bg-background/80 rounded-full",
              isTVMode ? "w-16 h-16" : "w-10 h-10"
            )}
          >
            <ChevronRight className={cn(isTVMode ? "w-8 h-8" : "w-6 h-6")} />
          </Button>
        </>
      )}

      {/* Content */}
      <div className={cn(
        "relative z-40 h-full flex flex-col justify-end",
        isTVMode ? "pb-20 px-16" : "pb-8 px-6 landscape:pb-6 landscape:px-8"
      )}>
        <div className={cn(
          "flex flex-col space-y-3",
          isTVMode ? "max-w-4xl space-y-5" : "max-w-xl landscape:max-w-2xl"
        )}>
          {/* Type Badge */}
          <div className="flex items-center gap-3">
            <span className={cn(
              "px-3 py-1 rounded text-xs font-medium uppercase",
              currentItem?.media_type === "movie" ? "bg-blue-500/80" : "bg-green-500/80"
            )}>
              {currentItem?.media_type === "movie" ? "Movie" : "TV Show"}
            </span>
            <span className="flex items-center gap-1 text-sm text-white/80">
              <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
              {currentItem?.vote_average?.toFixed(1) || "N/A"}
            </span>
            <span className="flex items-center gap-1 text-sm text-white/80">
              <Calendar className="w-4 h-4" />
              {(currentItem?.release_date || currentItem?.first_air_date)?.split("-")[0] || "N/A"}
            </span>
          </div>

          <h1 className={cn(
            "font-bold text-shadow",
            isTVMode ? "text-5xl leading-tight" : "text-3xl landscape:text-4xl"
          )}>
            {currentItem?.title || currentItem?.name}
          </h1>
          
          {currentItem?.overview && (
            <p className={cn(
              "text-white/80 text-shadow",
              isTVMode ? "text-2xl line-clamp-2" : "text-sm line-clamp-2 landscape:text-base landscape:line-clamp-2"
            )}>
              {currentItem.overview}
            </p>
          )}
          
          {/* Button row */}
          <div className={cn("flex flex-row flex-wrap", isTVMode ? "gap-2 mt-1" : "gap-2 landscape:gap-3")}>
            {onAddToLibrary && (
              <Button
                size={isTVMode ? "tv" : "lg"}
                className={cn("gap-1.5", isTVMode && "h-10 px-4 text-sm")}
                onClick={() => onAddToLibrary(currentItem)}
                tabIndex={0}
              >
                <Plus className={cn(isTVMode ? "w-4 h-4" : "w-5 h-5")} />
                Add to Library
              </Button>
            )}
            <Button
              size={isTVMode ? "tv" : "lg"}
              variant="secondary"
              className={cn("gap-1.5", isTVMode && "h-10 px-4 text-sm")}
              onClick={() => handleTrailer(currentItem)}
              disabled={isLoadingTrailer}
              tabIndex={0}
            >
              <Film className={cn(isTVMode ? "w-4 h-4" : "w-5 h-5")} />
              {isLoadingTrailer ? "Loading..." : "Trailer"}
            </Button>
          </div>
        </div>
      </div>

      {/* Dots Indicator */}
      {displayItems.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-2">
          {displayItems.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={cn(
                "rounded-full transition-all duration-300",
                isTVMode ? "w-4 h-4" : "w-2.5 h-2.5",
                index === currentIndex 
                  ? "bg-primary w-8" 
                  : "bg-white/50 hover:bg-white/80"
              )}
            />
          ))}
        </div>
      )}

      {/* Trailer Dialog */}
      <Dialog open={showTrailerDialog} onOpenChange={setShowTrailerDialog}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background border-border">
          <div className="relative">
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowTrailerDialog(false)}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h3 className="font-semibold">{trailer?.name}</h3>
            </div>
            <div className="aspect-video">
              {trailer && (
                <iframe
                  src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1`}
                  title={trailer.name}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
