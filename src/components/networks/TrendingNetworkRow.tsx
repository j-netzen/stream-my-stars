import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Star, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { discoverByProvider, TMDB_IMAGE_BASE, TMDBSearchResult } from "@/lib/tmdb";
import { AddFromDiscoverDialog } from "@/components/media/AddFromDiscoverDialog";

// Mock data fallback
const MOCK_TRENDING: Record<number, { movies: TMDBSearchResult[]; tv: TMDBSearchResult[] }> = {
  8: { // Netflix
    movies: [
      { id: 1, title: "Glass Onion", media_type: "movie", poster_path: null, backdrop_path: null, overview: "", vote_average: 7.2 },
      { id: 2, title: "All Quiet on the Western Front", media_type: "movie", poster_path: null, backdrop_path: null, overview: "", vote_average: 7.8 },
    ],
    tv: [
      { id: 3, name: "Stranger Things", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.7 },
      { id: 4, name: "Wednesday", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.3 },
      { id: 5, name: "The Witcher", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.0 },
    ],
  },
  387: { // HBO Max
    movies: [
      { id: 6, title: "Dune", media_type: "movie", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.0 },
      { id: 7, title: "The Batman", media_type: "movie", poster_path: null, backdrop_path: null, overview: "", vote_average: 7.8 },
    ],
    tv: [
      { id: 8, name: "House of the Dragon", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.5 },
      { id: 9, name: "The Last of Us", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.8 },
      { id: 10, name: "The Bear", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.6 },
    ],
  },
  337: { // Disney+
    movies: [
      { id: 11, title: "Avatar: The Way of Water", media_type: "movie", poster_path: null, backdrop_path: null, overview: "", vote_average: 7.7 },
      { id: 12, title: "Black Panther: Wakanda Forever", media_type: "movie", poster_path: null, backdrop_path: null, overview: "", vote_average: 7.3 },
    ],
    tv: [
      { id: 13, name: "The Mandalorian", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.5 },
      { id: 14, name: "Andor", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.4 },
    ],
  },
  9: { // Amazon Prime
    movies: [
      { id: 15, title: "The Tomorrow War", media_type: "movie", poster_path: null, backdrop_path: null, overview: "", vote_average: 6.8 },
    ],
    tv: [
      { id: 16, name: "The Boys", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.5 },
      { id: 17, name: "The Rings of Power", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 7.5 },
    ],
  },
  2: { // Apple TV+
    movies: [
      { id: 18, title: "Killers of the Flower Moon", media_type: "movie", poster_path: null, backdrop_path: null, overview: "", vote_average: 7.6 },
    ],
    tv: [
      { id: 19, name: "Ted Lasso", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.7 },
      { id: 20, name: "Severance", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.7 },
    ],
  },
  15: { // Hulu
    movies: [],
    tv: [
      { id: 21, name: "The Handmaid's Tale", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.4 },
      { id: 22, name: "Only Murders in the Building", media_type: "tv", poster_path: null, backdrop_path: null, overview: "", vote_average: 8.1 },
    ],
  },
};

interface TrendingNetworkRowProps {
  providerId: number;
  providerName: string;
  providerLogo?: string;
}

interface TrendingCardProps {
  item: TMDBSearchResult;
  onAdd: (item: TMDBSearchResult) => void;
}

function TrendingCard({ item, onAdd }: TrendingCardProps) {
  const title = item.title || item.name || "Unknown";
  
  return (
    <div className="flex-shrink-0 w-32 group cursor-pointer">
      <div 
        className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted transition-transform duration-300 group-hover:scale-105 group-hover:shadow-star-glow"
        onClick={() => onAdd(item)}
      >
        {item.poster_path ? (
          <img
            src={`${TMDB_IMAGE_BASE}/w300${item.poster_path}`}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-card text-muted-foreground text-xs text-center p-2">
            {title}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="secondary" className="gap-1 h-7 text-xs">
            <Plus className="w-3 h-3" />
            Add
          </Button>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <p className="text-sm font-medium truncate">{title}</p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="w-3 h-3 fill-star-gold text-star-gold" />
          <span>{item.vote_average?.toFixed(1) || "N/A"}</span>
        </div>
      </div>
    </div>
  );
}

export function TrendingNetworkRow({ providerId, providerName, providerLogo }: TrendingNetworkRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedItem, setSelectedItem] = useState<TMDBSearchResult | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: movies, isLoading: moviesLoading } = useQuery({
    queryKey: ["trending-network", providerId, "movie"],
    queryFn: () => discoverByProvider(providerId, "movie"),
    staleTime: 1000 * 60 * 30, // 30 minutes
    retry: 1,
  });

  const { data: tvShows, isLoading: tvLoading } = useQuery({
    queryKey: ["trending-network", providerId, "tv"],
    queryFn: () => discoverByProvider(providerId, "tv"),
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });

  const isLoading = moviesLoading || tvLoading;
  
  // Combine movies and TV, taking top 10 total sorted by popularity
  const fallback = MOCK_TRENDING[providerId];
  const allContent = [
    ...(movies?.slice(0, 5) || fallback?.movies || []),
    ...(tvShows?.slice(0, 5) || fallback?.tv || []),
  ].slice(0, 10);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const handleAddClick = (item: TMDBSearchResult) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  if (allContent.length === 0 && !isLoading) return null;

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {providerLogo && (
            <img
              src={`${TMDB_IMAGE_BASE}/w92${providerLogo}`}
              alt={providerName}
              className="w-8 h-8 rounded-lg object-contain bg-white"
            />
          )}
          <h3 className="text-lg font-semibold">Top on {providerName}</h3>
        </div>

        <div className="relative group">
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>

          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 scroll-smooth"
          >
            {isLoading ? (
              <div className="flex items-center justify-center w-full py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              allContent.map((item) => (
                <TrendingCard 
                  key={`${item.media_type}-${item.id}`} 
                  item={item} 
                  onAdd={handleAddClick}
                />
              ))
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <AddFromDiscoverDialog
        item={selectedItem}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}