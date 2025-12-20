import { useState } from "react";
import { useMedia, Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { useCategories } from "@/hooks/useCategories";
import { MediaRow } from "@/components/media/MediaRow";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { MediaDetailsDialog } from "@/components/media/MediaDetailsDialog";
import { getImageUrl } from "@/lib/tmdb";
import { Button } from "@/components/ui/button";
import { Play, Info, Loader2 } from "lucide-react";

export default function HomePage() {
  const { media, isLoading: mediaLoading, deleteMedia } = useMedia();
  const { progress, getContinueWatching } = useWatchProgress();
  const { categories } = useCategories();
  const [activeMedia, setActiveMedia] = useState<Media | null>(null);
  const [detailsMedia, setDetailsMedia] = useState<Media | null>(null);

  const continueWatching = getContinueWatching();
  const continueWatchingMedia = media.filter((m) =>
    continueWatching.some((p) => p.media_id === m.id)
  );

  const recentlyAdded = media.slice(0, 10);
  const movies = media.filter((m) => m.media_type === "movie");
  const tvShows = media.filter((m) => m.media_type === "tv");

  // Get a featured item
  const featured = media.find((m) => m.backdrop_path) || media[0];
  const featuredBackdrop = featured?.backdrop_path
    ? getImageUrl(featured.backdrop_path, "original")
    : null;

  const handlePlay = (item: Media) => {
    setActiveMedia(item);
  };

  const handleDelete = (item: Media) => {
    deleteMedia.mutate(item.id);
  };

  if (mediaLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      {featured && (
        <div className="relative h-[70vh] overflow-hidden z-20">
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
          <div className="relative z-20 h-full flex items-end pb-16 px-6">
            <div className="max-w-2xl space-y-4">
              <h1 className="text-5xl font-bold text-shadow">{featured.title}</h1>
              {featured.overview && (
                <p className="text-lg text-white/80 line-clamp-3 text-shadow">
                  {featured.overview}
                </p>
              )}
              <div className="flex gap-3">
                <Button
                  size="lg"
                  className="gap-2"
                  onClick={() => handlePlay(featured)}
                >
                  <Play className="w-5 h-5 fill-current" />
                  Play
                </Button>
                <Button 
                  size="lg" 
                  variant="secondary" 
                  className="gap-2"
                  onClick={() => setDetailsMedia(featured)}
                >
                  <Info className="w-5 h-5" />
                  More Info
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Rows */}
      <div className="space-y-8 pb-12 mt-4 md:-mt-24 relative z-30">
        {movies.length > 0 && (
          <MediaRow
            title="Movies"
            media={movies}
            progress={progress}
            onPlay={handlePlay}
            onDelete={handleDelete}
            onMoreInfo={setDetailsMedia}
          />
        )}

        {continueWatchingMedia.length > 0 && (
          <MediaRow
            title="Continue Watching"
            media={continueWatchingMedia}
            progress={progress}
            onPlay={handlePlay}
            onDelete={handleDelete}
            onMoreInfo={setDetailsMedia}
          />
        )}

        {recentlyAdded.length > 0 && (
          <MediaRow
            title="Recently Added"
            media={recentlyAdded}
            progress={progress}
            onPlay={handlePlay}
            onDelete={handleDelete}
            onMoreInfo={setDetailsMedia}
          />
        )}

        {tvShows.length > 0 && (
          <MediaRow
            title="TV Shows"
            media={tvShows}
            progress={progress}
            onPlay={handlePlay}
            onDelete={handleDelete}
            onMoreInfo={setDetailsMedia}
          />
        )}

        {/* Category Rows */}
        {categories.map((category) => {
          const categoryMedia = media.filter(
            (m) => m.category_id === category.id
          );
          if (categoryMedia.length === 0) return null;
          return (
            <MediaRow
              key={category.id}
              title={category.name}
              media={categoryMedia}
              progress={progress}
              onPlay={handlePlay}
              onDelete={handleDelete}
              onMoreInfo={setDetailsMedia}
            />
          );
        })}

        {/* Empty State */}
        {media.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-24 h-24 bg-secondary rounded-full flex items-center justify-center mb-6">
              <Play className="w-12 h-12 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Your library is empty</h2>
            <p className="text-muted-foreground max-w-md">
              Click "Add Media" in the sidebar to start building your personal
              streaming library with movies and TV shows.
            </p>
          </div>
        )}
      </div>

      {/* Media Details Dialog */}
      <MediaDetailsDialog
        media={detailsMedia}
        open={!!detailsMedia}
        onOpenChange={(open) => !open && setDetailsMedia(null)}
        onPlay={handlePlay}
      />

      {/* Video Player */}
      {activeMedia && (
        <VideoPlayer media={activeMedia} onClose={() => setActiveMedia(null)} />
      )}
    </div>
  );
}
