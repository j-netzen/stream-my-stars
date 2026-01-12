import { useState, useCallback, useEffect, useMemo } from "react";
import { useMedia, Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { useTVMode } from "@/hooks/useTVMode";
import { MediaCard } from "@/components/media/MediaCard";
import { MediaHero } from "@/components/media/MediaHero";
import { VideoPlayer, StreamQualityInfo } from "@/components/media/VideoPlayer";
import { MediaDetailsDialog } from "@/components/media/MediaDetailsDialog";
import { AddToPlaylistDialog } from "@/components/media/AddToPlaylistDialog";
import { StreamSelectionDialog } from "@/components/media/StreamSelectionDialog";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Input } from "@/components/ui/input";
import { Search, Film, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MoviesPage() {
  const { media, isLoading, deleteMedia, refetch } = useMedia();
  const { progress } = useWatchProgress();
  const { isTVMode } = useTVMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMedia, setActiveMedia] = useState<Media | null>(null);
  const [activeStreamQuality, setActiveStreamQuality] = useState<StreamQualityInfo | undefined>(undefined);
  const [activeTryNextStream, setActiveTryNextStream] = useState<(() => void) | undefined>(undefined);
  const [detailsMedia, setDetailsMedia] = useState<Media | null>(null);
  const [playlistMedia, setPlaylistMedia] = useState<Media | null>(null);
  const [streamSelectMedia, setStreamSelectMedia] = useState<Media | null>(null);

  const movies = media
    .filter((m) => m.media_type === "movie")
    .sort((a, b) => a.title.localeCompare(b.title));
  
  const filteredMovies = movies.filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get movies with backdrops for hero rotation
  const moviesWithBackdrops = useMemo(() => 
    movies.filter((m) => m.backdrop_path), 
    [movies]
  );
  
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Rotate featured movie every 30 seconds
  useEffect(() => {
    if (moviesWithBackdrops.length <= 1) return;
    
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setFeaturedIndex((prev) => {
          let newIndex;
          do {
            newIndex = Math.floor(Math.random() * moviesWithBackdrops.length);
          } while (newIndex === prev && moviesWithBackdrops.length > 1);
          return newIndex;
        });
        setIsTransitioning(false);
      }, 500); // Half second for fade out, then switch
    }, 30000);
    
    return () => clearInterval(interval);
  }, [moviesWithBackdrops.length]);
  
  const featured = moviesWithBackdrops[featuredIndex] || movies[0];

  const handlePlay = (item: Media) => {
    if (item.tmdb_id) {
      setStreamSelectMedia(item);
    } else {
      setActiveMedia(item);
    }
  };

  const handleStreamSelected = (updatedMedia: Media, streamUrl: string, qualityInfo?: StreamQualityInfo, tryNextStream?: () => void) => {
    setActiveStreamQuality(qualityInfo);
    setActiveTryNextStream(() => tryNextStream);
    setActiveMedia(updatedMedia);
  };

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  if (isLoading) {
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
          "transition-opacity duration-500",
          isTransitioning ? "opacity-0" : "opacity-100"
        )}>
          <MediaHero 
            featured={featured} 
            onPlay={handlePlay} 
            onMoreInfo={setDetailsMedia} 
          />
        </div>
      )}

      <div className={cn(
        "p-6 space-y-6",
        isTVMode && "mx-[5%]"
      )}>
        {/* Header with Search */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Film className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h1 className={cn("font-bold", isTVMode ? "text-3xl" : "text-2xl")}>All Movies</h1>
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
                onPlay={handlePlay}
                onDelete={(m) => deleteMedia.mutate(m.id)}
                onMoreInfo={setDetailsMedia}
                onAddToPlaylist={setPlaylistMedia}
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
              setActiveTryNextStream(undefined);
            }}
            streamQuality={activeStreamQuality}
            onPlaybackError={activeTryNextStream}
          />
        )}
      </div>
    </PullToRefresh>
  );
}
