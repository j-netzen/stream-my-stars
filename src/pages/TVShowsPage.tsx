import { useState, useCallback, useEffect, useMemo } from "react";
import { useMedia, Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { useTVMode } from "@/hooks/useTVMode";
import { MediaCard } from "@/components/media/MediaCard";
import { MediaHero } from "@/components/media/MediaHero";
import { MediaDetailsDialog } from "@/components/media/MediaDetailsDialog";
import { AddToPlaylistDialog } from "@/components/media/AddToPlaylistDialog";
import { StreamSelectionDialog, EpisodeContext } from "@/components/media/StreamSelectionDialog";
import { TVShowBrowserDialog } from "@/components/media/TVShowBrowserDialog";
import { VideoPlayerWrapper } from "@/components/media/player";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Input } from "@/components/ui/input";
import { Search, Tv, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TVShowsPage() {
  const { media, isLoading, deleteMedia, refetch } = useMedia();
  const { progress } = useWatchProgress();
  const { isTVMode } = useTVMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMedia, setActiveMedia] = useState<Media | null>(null);
  const [activeStreamUrl, setActiveStreamUrl] = useState<string | null>(null);
  const [activeEpisodeContext, setActiveEpisodeContext] = useState<EpisodeContext | null>(null);
  const [detailsMedia, setDetailsMedia] = useState<Media | null>(null);
  const [playlistMedia, setPlaylistMedia] = useState<Media | null>(null);
  const [streamSelectMedia, setStreamSelectMedia] = useState<Media | null>(null);
  const [browserMedia, setBrowserMedia] = useState<Media | null>(null);
  const [pendingEpisode, setPendingEpisode] = useState<{ season: number; episode: number } | null>(null);
  const [nextEpisodeRequest, setNextEpisodeRequest] = useState<{ media: Media; season: number; episode: number } | null>(null);

  const tvShows = media
    .filter((m) => m.media_type === "tv")
    .sort((a, b) => a.title.localeCompare(b.title));
  
  const filteredShows = tvShows.filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get shows with backdrops for hero rotation
  const showsWithBackdrops = useMemo(() => 
    tvShows.filter((m) => m.backdrop_path), 
    [tvShows]
  );
  
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Rotate featured show every 30 seconds
  useEffect(() => {
    if (showsWithBackdrops.length <= 1) return;
    
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setFeaturedIndex((prev) => {
          let newIndex;
          do {
            newIndex = Math.floor(Math.random() * showsWithBackdrops.length);
          } while (newIndex === prev && showsWithBackdrops.length > 1);
          return newIndex;
        });
        setIsTransitioning(false);
      }, 500);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [showsWithBackdrops.length]);
  
  const featured = showsWithBackdrops[featuredIndex] || tvShows[0];

  const handlePlay = (item: Media) => {
    // If it has TMDB ID and is a TV show with seasons, open the browser
    if (item.tmdb_id && item.media_type === "tv" && item.seasons) {
      setBrowserMedia(item);
    } else if (item.tmdb_id) {
      setStreamSelectMedia(item);
    } else {
      setActiveMedia(item);
    }
  };

  // Handle episode selection from browser
  const handleEpisodeSelect = (item: Media, seasonNumber: number, episodeNumber: number) => {
    setPendingEpisode({ season: seasonNumber, episode: episodeNumber });
    setStreamSelectMedia(item);
  };

  // Handle stream selection - store both media and URL
  const handleStreamSelected = (updatedMedia: Media, streamUrl: string, _qualityInfo?: any, _tryNext?: any, episodeContext?: EpisodeContext) => {
    setActiveMedia(updatedMedia);
    setActiveStreamUrl(streamUrl);
    setActiveEpisodeContext(episodeContext || null);
    console.log("[TVShowsPage] Stream selected:", streamUrl.substring(0, 50) + "...", episodeContext);
  };

  // Close player
  const handleClosePlayer = () => {
    setActiveMedia(null);
    setActiveStreamUrl(null);
    setActiveEpisodeContext(null);
  };

  // Handle play next episode
  const handlePlayNextEpisode = () => {
    if (!activeMedia || !activeEpisodeContext) return;
    
    const nextEpisode = activeEpisodeContext.episodeNumber + 1;
    setNextEpisodeRequest({
      media: activeMedia,
      season: activeEpisodeContext.seasonNumber,
      episode: nextEpisode,
    });
    
    setActiveMedia(null);
    setActiveStreamUrl(null);
    setActiveEpisodeContext(null);
    setStreamSelectMedia(activeMedia);
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
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <Tv className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h1 className={cn("font-bold", isTVMode ? "text-3xl" : "text-2xl")}>All TV Shows</h1>
              <p className="text-sm text-muted-foreground">
                {tvShows.length} shows in your library
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search TV shows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Grid */}
        {filteredShows.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredShows.map((show) => (
              <MediaCard
                key={show.id}
                media={show}
                progress={progress.find((p) => p.media_id === show.id)}
                onPlay={handlePlay}
                onDelete={(m) => deleteMedia.mutate(m.id)}
                onMoreInfo={setDetailsMedia}
                onAddToPlaylist={setPlaylistMedia}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Tv className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {searchQuery ? "No shows found" : "No TV shows yet"}
            </h2>
            <p className="text-muted-foreground">
              {searchQuery
                ? "Try a different search term"
                : "Add some TV shows to your library to see them here"}
            </p>
          </div>
        )}

        {/* TV Show Browser Dialog */}
        <TVShowBrowserDialog
          media={browserMedia}
          open={!!browserMedia}
          onOpenChange={(open) => !open && setBrowserMedia(null)}
          onEpisodeSelect={handleEpisodeSelect}
        />

        {/* Stream Selection Dialog */}
        <StreamSelectionDialog
          media={streamSelectMedia}
          open={!!streamSelectMedia}
          onOpenChange={(open) => {
            if (!open) {
              setStreamSelectMedia(null);
              setNextEpisodeRequest(null);
              setPendingEpisode(null);
            }
          }}
          onStreamSelected={handleStreamSelected}
          defaultSeason={pendingEpisode?.season ?? nextEpisodeRequest?.season}
          defaultEpisode={pendingEpisode?.episode ?? nextEpisodeRequest?.episode}
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
        {activeMedia && activeStreamUrl && (
          <VideoPlayerWrapper
            media={activeMedia}
            streamUrl={activeStreamUrl}
            onClose={handleClosePlayer}
            episodeNumber={activeEpisodeContext?.episodeNumber}
            seasonNumber={activeEpisodeContext?.seasonNumber}
            onPlayNextEpisode={handlePlayNextEpisode}
          />
        )}
      </div>
    </PullToRefresh>
  );
}
