import { useRef } from "react";
import { Media } from "@/hooks/useMedia";
import { WatchProgress } from "@/hooks/useWatchProgress";
import { MediaCard } from "./MediaCard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaRowProps {
  title: string;
  media: Media[];
  progress?: WatchProgress[];
  onPlay?: (media: Media) => void;
  onDelete?: (media: Media) => void;
  onAddToPlaylist?: (media: Media) => void;
}

export function MediaRow({
  title,
  media,
  progress = [],
  onPlay,
  onDelete,
  onAddToPlaylist,
}: MediaRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (media.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-4 md:px-6">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => scroll("left")}
            className="h-8 w-8"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => scroll("right")}
            className="h-8 w-8"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide px-4 md:px-6 pb-4 snap-x snap-mandatory"
      >
        {media.map((item) => (
          <div key={item.id} className="flex-shrink-0 w-32 sm:w-36 md:w-40 lg:w-44 snap-start">
            <MediaCard
              media={item}
              progress={progress.find((p) => p.media_id === item.id)}
              onPlay={onPlay}
              onDelete={onDelete}
              onAddToPlaylist={onAddToPlaylist}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
