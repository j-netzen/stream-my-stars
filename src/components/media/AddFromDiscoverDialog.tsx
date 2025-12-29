import { useState, useEffect } from "react";
import { useMedia, CreateMediaInput } from "@/hooks/useMedia";
import { useCategories } from "@/hooks/useCategories";
import { getMovieDetails, getTVDetails, TMDBSearchResult, getImageUrl } from "@/lib/tmdb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Film, Tv, Star, Calendar, Plus } from "lucide-react";
import { toast } from "sonner";

interface AddFromDiscoverDialogProps {
  item: TMDBSearchResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TMDBDetails {
  tmdb_id: number;
  imdb_id?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  rating?: number;
  genres?: string[];
  runtime?: number;
  seasons?: number;
  episodes?: number;
  cast_members?: any;
  media_type: "movie" | "tv";
  overview?: string;
}

export function AddFromDiscoverDialog({ item, open, onOpenChange }: AddFromDiscoverDialogProps) {
  const { addMedia } = useMedia();
  const { categories } = useCategories();

  const [tmdbDetails, setTmdbDetails] = useState<TMDBDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [isAdding, setIsAdding] = useState(false);

  // Fetch TMDB details when item changes
  useEffect(() => {
    if (!item || !open) return;

    const fetchDetails = async () => {
      setIsLoadingDetails(true);
      try {
        let details: any = null;
        if (item.media_type === "movie") {
          details = await getMovieDetails(item.id);
        } else if (item.media_type === "tv") {
          details = await getTVDetails(item.id);
        }

        const mediaType = item.media_type === "movie" ? "movie" : "tv" as const;
        const genres = details?.genres?.map((g: any) => g.name) || [];
        
        // For TV shows, use episode_run_time array (first value), for movies use runtime
        const runtime = mediaType === "movie" 
          ? details?.runtime 
          : (details?.episode_run_time?.[0] || undefined);
        
        setTmdbDetails({
          tmdb_id: item.id,
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          release_date: item.release_date || item.first_air_date,
          rating: item.vote_average,
          overview: item.overview,
          genres,
          runtime,
          seasons: details?.number_of_seasons,
          episodes: details?.number_of_episodes,
          cast_members: details?.credits?.cast?.slice(0, 10) || [],
          media_type: mediaType,
          imdb_id: details?.external_ids?.imdb_id,
        });

        // Auto-select category based on first genre
        if (genres.length > 0 && categories && categories.length > 0) {
          const firstGenre = genres[0].toLowerCase();
          const matchingCategory = categories.find(
            (cat) => cat.name.toLowerCase() === firstGenre
          );
          if (matchingCategory) {
            setSelectedCategory(matchingCategory.id);
          }
        }
      } catch (error) {
        // Use basic info if details fail
        const mediaType = item.media_type === "movie" ? "movie" : "tv" as const;
        setTmdbDetails({
          tmdb_id: item.id,
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          release_date: item.release_date || item.first_air_date,
          rating: item.vote_average,
          overview: item.overview,
          media_type: mediaType,
        });
      }
      setIsLoadingDetails(false);
    };

    fetchDetails();
  }, [item, open, categories]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedCategory("");
      setTmdbDetails(null);
    }
  }, [open]);

  const handleAddToLibrary = async () => {
    if (!item || !tmdbDetails) {
      toast.error("Loading details, please wait...");
      return;
    }

    setIsAdding(true);
    try {
      const title = item.title || item.name || "Unknown";
      const input: CreateMediaInput = {
        title,
        media_type: tmdbDetails.media_type,
        source_type: "url",
        source_url: undefined,
        category_id: selectedCategory || undefined,
        overview: tmdbDetails.overview,
        tmdb_id: tmdbDetails.tmdb_id,
        poster_path: tmdbDetails.poster_path,
        backdrop_path: tmdbDetails.backdrop_path,
        release_date: tmdbDetails.release_date,
        rating: tmdbDetails.rating,
        genres: tmdbDetails.genres,
        runtime: tmdbDetails.runtime,
        seasons: tmdbDetails.seasons,
        episodes: tmdbDetails.episodes,
        cast_members: tmdbDetails.cast_members,
      };

      await addMedia.mutateAsync(input);
      toast.success("Added to library!");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to add to library");
    }
    setIsAdding(false);
  };

  if (!item) return null;

  const title = item.title || item.name || "Unknown";
  const year = (item.release_date || item.first_air_date)?.split("-")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {item.media_type === "movie" ? (
              <Film className="h-5 w-5 text-primary" />
            ) : (
              <Tv className="h-5 w-5 text-primary" />
            )}
            Add to Library
          </DialogTitle>
        </DialogHeader>

        {isLoadingDetails ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Media Preview */}
            <div className="flex gap-4">
              {item.poster_path && (
                <img
                  src={getImageUrl(item.poster_path, "w200")}
                  alt={title}
                  className="w-20 h-30 object-cover rounded-md"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{title}</h3>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                  {year && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {year}
                    </span>
                  )}
                  {item.vote_average > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-yellow-500" />
                      {item.vote_average.toFixed(1)}
                    </span>
                  )}
                </div>
                {tmdbDetails?.genres && tmdbDetails.genres.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {tmdbDetails.genres.slice(0, 3).join(" • ")}
                  </p>
                )}
                {tmdbDetails?.overview && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {tmdbDetails.overview}
                  </p>
                )}
              </div>
            </div>

            {/* Category Selection */}
            <div className="space-y-2">
              <Label>Category (Optional)</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Add Button */}
            <Button
              onClick={handleAddToLibrary}
              disabled={isAdding || isLoadingDetails}
              className="w-full"
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add to Library
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
