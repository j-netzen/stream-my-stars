import { useRef, useCallback } from "react";
import { Media } from "@/hooks/useMedia";
import { WatchProgress } from "@/hooks/useWatchProgress";
import { MediaCard } from "./MediaCard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTVMode } from "@/hooks/useTVMode";
import { cn } from "@/lib/utils";

interface MediaRowProps {
  title: string;
  media: Media[];
  progress?: WatchProgress[];
  showContinue?: boolean;
  onPlay?: (media: Media) => void;
  onDelete?: (media: Media) => void;
  onAddToPlaylist?: (media: Media) => void;
  onMoreInfo?: (media: Media) => void;
}

export function MediaRow({
  title,
  media,
  progress = [],
  showContinue = true,
  onPlay,
  onDelete,
  onAddToPlaylist,
  onMoreInfo,
}: MediaRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { isTVMode } = useTVMode();

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  // Handle keyboard navigation within the row
  const handleRowKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (!isTVMode) return;
    
    const cards = cardRefs.current.filter(Boolean) as HTMLDivElement[];
    let nextIndex = index;
    
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        e.stopPropagation();
        nextIndex = Math.min(index + 1, cards.length - 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        e.stopPropagation();
        nextIndex = Math.max(index - 1, 0);
        break;
      default:
        return;
    }
    
    if (nextIndex !== index && cards[nextIndex]) {
      const focusable = cards[nextIndex].querySelector<HTMLElement>('[tabindex="0"]');
      if (focusable) {
        focusable.focus();
        focusable.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [isTVMode]);

  if (media.length === 0) return null;

  return (
    <div className={cn("space-y-3", isTVMode ? "space-y-4" : "landscape:space-y-2")}>
      <div className={cn(
        "flex items-center justify-between",
        isTVMode ? "px-8" : "px-4 md:px-6"
      )}>
        <h2 className={cn(
          "font-semibold",
          isTVMode ? "tv-row-title text-xl" : "text-lg landscape:text-base"
        )}>
          {title}
        </h2>
        <div className={cn("flex", isTVMode ? "gap-3" : "gap-2")}>
          <Button
            variant="ghost"
            size={isTVMode ? "default" : "icon"}
            onClick={() => scroll("left")}
            className={cn(isTVMode ? "tv-button-icon h-12 w-12" : "h-8 w-8")}
          >
            <ChevronLeft className={cn(isTVMode ? "w-6 h-6" : "w-4 h-4")} />
          </Button>
          <Button
            variant="ghost"
            size={isTVMode ? "default" : "icon"}
            onClick={() => scroll("right")}
            className={cn(isTVMode ? "tv-button-icon h-12 w-12" : "h-8 w-8")}
          >
            <ChevronRight className={cn(isTVMode ? "w-6 h-6" : "w-4 h-4")} />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          "flex overflow-x-auto scrollbar-hide snap-x snap-mandatory",
          isTVMode 
            ? "gap-5 px-8 pb-4" 
            : "gap-3 md:gap-4 px-4 md:px-6 pb-3 landscape:gap-4 landscape:pb-2"
        )}
      >
        {media.map((item, index) => (
          <div 
            key={item.id}
            ref={(el) => (cardRefs.current[index] = el)}
            onKeyDown={(e) => handleRowKeyDown(e, index)}
            className={cn(
              "flex-shrink-0 snap-start",
              isTVMode 
                ? "w-[var(--tv-card-width)]" 
                : "w-[var(--card-width-xs)] sm:w-[var(--card-width-sm)] md:w-[var(--card-width-md)] lg:w-[var(--card-width-lg)] xl:w-[var(--card-width-xl)] 2xl:w-[var(--card-width-2xl)]"
            )}
          >
            <MediaCard
              media={item}
              progress={progress.find((p) => p.media_id === item.id)}
              showContinue={showContinue}
              onPlay={onPlay}
              onDelete={onDelete}
              onAddToPlaylist={onAddToPlaylist}
              onMoreInfo={onMoreInfo}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
