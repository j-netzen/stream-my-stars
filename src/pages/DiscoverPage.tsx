import { useState } from "react";
import { searchTMDB, getTrending, getTVAiringToday, TMDBSearchResult, getImageUrl } from "@/lib/tmdb";
import { useMedia, CreateMediaInput } from "@/hooks/useMedia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Compass, Film, Tv, Loader2, Star, Calendar, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

function MediaResultCard({ item, onSelect }: { item: TMDBSearchResult; onSelect: (item: TMDBSearchResult) => void }) {
  return (
    <div className="media-card group">
      <div className="relative aspect-[2/3] bg-secondary">
        {item.poster_path ? (
          <img
            src={getImageUrl(item.poster_path, "w300")!}
            alt={item.title || item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            {item.media_type === "movie" ? (
              <Film className="w-12 h-12" />
            ) : (
              <Tv className="w-12 h-12" />
            )}
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <Button
            onClick={() => onSelect(item)}
            className="w-full gap-2"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            Add to Library
          </Button>
        </div>

        {/* Type Badge */}
        <div
          className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-medium uppercase ${
            item.media_type === "movie"
              ? "bg-blue-500/80"
              : "bg-green-500/80"
          }`}
        >
          {item.media_type}
        </div>
      </div>

      <div className="p-3">
        <h3 className="font-medium text-sm line-clamp-1">
          {item.title || item.name}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {(item.release_date || item.first_air_date)?.split("-")[0] || "N/A"}
          </span>
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
            {item.vote_average.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  const { addMedia } = useMedia();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TMDBSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TMDBSearchResult | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const { data: trending = [], isLoading: trendingLoading } = useQuery({
    queryKey: ["trending"],
    queryFn: () => getTrending("all"),
  });

  const { data: airingToday = [], isLoading: airingTodayLoading } = useQuery({
    queryKey: ["tv-airing-today"],
    queryFn: getTVAiringToday,
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchTMDB(searchQuery);
      setSearchResults(results);
    } catch (error) {
      toast.error("Search failed");
    }
    setIsSearching(false);
  };

  const handleAddToLibrary = async () => {
    if (!selectedItem || !sourceUrl.trim()) {
      toast.error("Please provide a video source URL");
      return;
    }

    setIsAdding(true);
    try {
      const input: CreateMediaInput = {
        title: selectedItem.title || selectedItem.name || "Unknown",
        media_type: selectedItem.media_type as "movie" | "tv",
        source_type: "url",
        source_url: sourceUrl,
        tmdb_id: selectedItem.id,
        poster_path: selectedItem.poster_path,
        backdrop_path: selectedItem.backdrop_path,
        overview: selectedItem.overview,
        release_date: selectedItem.release_date || selectedItem.first_air_date,
        rating: selectedItem.vote_average,
      };

      await addMedia.mutateAsync(input);
      setSelectedItem(null);
      setSourceUrl("");
    } catch (error) {
      toast.error("Failed to add to library");
    }
    setIsAdding(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
            <Compass className="w-5 h-5 text-cyan-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Discover</h1>
            <p className="text-sm text-muted-foreground">
              Search TMDB for movies and TV shows
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex gap-2 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search movies and TV shows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10"
          />
        </div>
        <Button onClick={handleSearch} disabled={isSearching}>
          {isSearching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Search"
          )}
        </Button>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Search Results</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {searchResults.map((item) => (
              <MediaResultCard key={`${item.media_type}-${item.id}`} item={item} onSelect={setSelectedItem} />
            ))}
          </div>
        </div>
      )}

      {/* TV Airing Today */}
      {!searchResults.length && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Tv className="w-5 h-5 text-green-500" />
            TV - Airing Today
          </h2>
          {airingTodayLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {airingToday.map((item) => (
                <MediaResultCard key={`tv-${item.id}`} item={item} onSelect={setSelectedItem} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trending This Week */}
      {!searchResults.length && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Trending This Week</h2>
          {trendingLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {trending.map((item) => (
                <MediaResultCard key={`${item.media_type}-${item.id}`} item={item} onSelect={setSelectedItem} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add to Library Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Library</DialogTitle>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              <div className="flex gap-4 p-4 bg-secondary/30 rounded-lg">
                {selectedItem.poster_path && (
                  <img
                    src={getImageUrl(selectedItem.poster_path, "w200")!}
                    alt={selectedItem.title || selectedItem.name}
                    className="w-20 rounded"
                  />
                )}
                <div className="flex-1">
                  <h3 className="font-semibold">
                    {selectedItem.title || selectedItem.name}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {selectedItem.overview}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Video Source URL *</Label>
                <Input
                  placeholder="https://example.com/video.mp4"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the URL where this media can be streamed from
                </p>
              </div>

              <Button
                onClick={handleAddToLibrary}
                disabled={isAdding}
                className="w-full"
              >
                {isAdding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add to Library
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
