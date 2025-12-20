import { useState } from "react";
import { useMedia, Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { MediaCard } from "@/components/media/MediaCard";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { MediaDetailsDialog } from "@/components/media/MediaDetailsDialog";
import { Input } from "@/components/ui/input";
import { Search, Film, Loader2 } from "lucide-react";

export default function MoviesPage() {
  const { media, isLoading, deleteMedia } = useMedia();
  const { progress } = useWatchProgress();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMedia, setActiveMedia] = useState<Media | null>(null);
  const [detailsMedia, setDetailsMedia] = useState<Media | null>(null);

  const movies = media
    .filter((m) => m.media_type === "movie")
    .sort((a, b) => a.title.localeCompare(b.title));
  
  const filteredMovies = movies.filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <Film className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Movies</h1>
            <p className="text-sm text-muted-foreground">
              {movies.length} movies in your library
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search movies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Grid */}
      {filteredMovies.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredMovies.map((movie) => (
            <MediaCard
              key={movie.id}
              media={movie}
              progress={progress.find((p) => p.media_id === movie.id)}
              onPlay={setActiveMedia}
              onDelete={(m) => deleteMedia.mutate(m.id)}
              onMoreInfo={setDetailsMedia}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Film className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {searchQuery ? "No movies found" : "No movies yet"}
          </h2>
          <p className="text-muted-foreground">
            {searchQuery
              ? "Try a different search term"
              : "Add some movies to your library to see them here"}
          </p>
        </div>
      )}

      {/* Media Details Dialog */}
      <MediaDetailsDialog
        media={detailsMedia}
        open={!!detailsMedia}
        onOpenChange={(open) => !open && setDetailsMedia(null)}
        onPlay={setActiveMedia}
      />

      {/* Video Player */}
      {activeMedia && (
        <VideoPlayer media={activeMedia} onClose={() => setActiveMedia(null)} />
      )}
    </div>
  );
}
