import { useState, useCallback } from "react";
import { useMedia, Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { useCategories } from "@/hooks/useCategories";
import { useTVMode } from "@/hooks/useTVMode";
import { MediaRow } from "@/components/media/MediaRow";
import { VideoPlayer, StreamQualityInfo } from "@/components/media/VideoPlayer";
import { MediaDetailsDialog } from "@/components/media/MediaDetailsDialog";
import { AddToPlaylistDialog } from "@/components/media/AddToPlaylistDialog";
import { StreamSelectionDialog } from "@/components/media/StreamSelectionDialog";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { getImageUrl } from "@/lib/tmdb";
import { Button } from "@/components/ui/button";
import { Play, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const { media, isLoading: mediaLoading, deleteMedia, refetch } = useMedia();
  const { progress, getContinueWatching } = useWatchProgress();
  const { categories } = useCategories();
  const { isTVMode } = useTVMode();
  const [activeMedia, setActiveMedia] = useState<Media | null>(null);
  const [activeStreamQuality, setActiveStreamQuality] = useState<StreamQualityInfo | undefined>(undefined);
  const [detailsMedia, setDetailsMedia] = useState<Media | null>(null);
  const [playlistMedia, setPlaylistMedia] = useState<Media | null>(null);
  const [streamSelectMedia, setStreamSelectMedia] = useState<Media | null>(null);

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
    // Always show stream selection for media with TMDB ID
    if (item.tmdb_id) {
      setStreamSelectMedia(item);
    } else {
      setActiveMedia(item);
    }
  };

  const handleStreamSelected = (updatedMedia: Media, streamUrl: string, qualityInfo?: StreamQualityInfo) => {
    setActiveStreamQuality(qualityInfo);
    setActiveMedia(updatedMedia);
  };

  const handleDelete = (item: Media) => {
    deleteMedia.mutate(item.id);
  };

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  if (mediaLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className={cn("animate-spin text-primary", isTVMode ? "w-12 h-12" : "w-8 h-8")} />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen">
      {/* Hero Section */}
      {featured && (
        <div className={cn(
          "relative overflow-hidden z-20",
          isTVMode ? "h-[70vh] max-h-[600px]" : "h-[50vh] min-h-[320px] max-h-[500px] landscape:h-[60vh] landscape:max-h-[450px]"
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
            "relative z-40 h-full flex items-end",
            isTVMode ? "pb-16 px-12" : "pb-8 px-6 landscape:pb-6 landscape:px-8"
          )}>
            <div className={cn("space-y-3", isTVMode ? "max-w-3xl space-y-4" : "max-w-xl landscape:max-w-2xl")}>
              <h1 className={cn(
                "font-bold text-shadow",
                isTVMode ? "tv-title text-5xl" : "text-3xl landscape:text-4xl"
              )}>
                {featured.title}
              </h1>
              {featured.overview && (
                <p className={cn(
                  "text-white/80 text-shadow",
                  isTVMode ? "tv-subtitle text-lg line-clamp-2" : "text-sm line-clamp-2 landscape:text-base landscape:line-clamp-2"
                )}>
                  {featured.overview}
                </p>
              )}
              <div className={cn("flex", isTVMode ? "gap-3" : "gap-2 landscape:gap-3")}>
                <Button
                  size={isTVMode ? "tv-lg" : "lg"}
                  className="gap-2"
                  onClick={() => handlePlay(featured)}
                >
                  <Play className={cn("fill-current", isTVMode ? "w-7 h-7" : "w-5 h-5")} />
                  Play
                </Button>
                <Button 
                  size={isTVMode ? "tv-lg" : "lg"}
                  variant="secondary" 
                  className="gap-2"
                  onClick={() => setDetailsMedia(featured)}
                >
                  <Info className={cn(isTVMode ? "w-7 h-7" : "w-5 h-5")} />
                  More Info
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Rows */}
      <div className={cn(
        "pb-12 relative z-30",
        isTVMode ? "space-y-8 mt-4" : "space-y-6 mt-2 landscape:space-y-4 landscape:-mt-4"
      )}>
        {movies.length > 0 && (
          <MediaRow
            title="Movies"
            media={movies}
            progress={progress}
            showContinue={false}
            onPlay={handlePlay}
            onDelete={handleDelete}
            onMoreInfo={setDetailsMedia}
            onAddToPlaylist={setPlaylistMedia}
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
            onAddToPlaylist={setPlaylistMedia}
          />
        )}

        {recentlyAdded.length > 0 && (
          <MediaRow
            title="Recently Added"
            media={recentlyAdded}
            progress={progress}
            showContinue={false}
            onPlay={handlePlay}
            onDelete={handleDelete}
            onMoreInfo={setDetailsMedia}
            onAddToPlaylist={setPlaylistMedia}
          />
        )}

        {tvShows.length > 0 && (
          <MediaRow
            title="TV Shows"
            media={tvShows}
            progress={progress}
            showContinue={false}
            onPlay={handlePlay}
            onDelete={handleDelete}
            onMoreInfo={setDetailsMedia}
            onAddToPlaylist={setPlaylistMedia}
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
              showContinue={false}
              onPlay={handlePlay}
              onDelete={handleDelete}
              onMoreInfo={setDetailsMedia}
              onAddToPlaylist={setPlaylistMedia}
            />
          );
        })}

        {/* Empty State */}
        {media.length === 0 && (
          <div className={cn(
            "flex flex-col items-center justify-center text-center",
            isTVMode ? "py-32" : "py-20"
          )}>
            <div className={cn(
              "bg-secondary rounded-full flex items-center justify-center mb-6",
              isTVMode ? "w-32 h-32" : "w-24 h-24"
            )}>
              <Play className={cn("text-muted-foreground", isTVMode ? "w-16 h-16" : "w-12 h-12")} />
            </div>
            <h2 className={cn("font-semibold mb-2", isTVMode ? "text-4xl" : "text-2xl")}>
              Your library is empty
            </h2>
            <p className={cn("text-muted-foreground max-w-md", isTVMode && "text-xl")}>
              Click "Add Media" in the sidebar to start building your personal
              streaming library with movies and TV shows.
            </p>
          </div>
        )}
      </div>

      {/* Stream Selection Dialog */}
      <StreamSelectionDialog
        media={streamSelectMedia}
        open={!!streamSelectMedia}
        onOpenChange={(open) => !open && setStreamSelectMedia(null)}
        onStreamSelected={handleStreamSelected}
      />

      {/* Media Details Dialog */}
      <MediaDetailsDialog
        media={detailsMedia}
        open={!!detailsMedia}
        onOpenChange={(open) => !open && setDetailsMedia(null)}
        onPlay={handlePlay}
      />

      {/* Add to Playlist Dialog */}
      <AddToPlaylistDialog
        media={playlistMedia}
        open={!!playlistMedia}
        onOpenChange={(open) => !open && setPlaylistMedia(null)}
      />

      {/* Video Player */}
      {activeMedia && (
        <VideoPlayer 
          media={activeMedia} 
          onClose={() => {
            setActiveMedia(null);
            setActiveStreamQuality(undefined);
          }}
          streamQuality={activeStreamQuality}
        />
      )}
    </PullToRefresh>
  );
}
