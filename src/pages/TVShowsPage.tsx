import { useState, useCallback } from "react";
import { useMedia, Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { MediaCard } from "@/components/media/MediaCard";
import { VideoPlayer, StreamQualityInfo } from "@/components/media/VideoPlayer";
import { MediaDetailsDialog } from "@/components/media/MediaDetailsDialog";
import { AddToPlaylistDialog } from "@/components/media/AddToPlaylistDialog";
import { StreamSelectionDialog } from "@/components/media/StreamSelectionDialog";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Input } from "@/components/ui/input";
import { Search, Tv, Loader2 } from "lucide-react";

export default function TVShowsPage() {
  const { media, isLoading, deleteMedia, refetch } = useMedia();
  const { progress } = useWatchProgress();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMedia, setActiveMedia] = useState<Media | null>(null);
  const [activeStreamQuality, setActiveStreamQuality] = useState<StreamQualityInfo | undefined>(undefined);
  const [detailsMedia, setDetailsMedia] = useState<Media | null>(null);
  const [playlistMedia, setPlaylistMedia] = useState<Media | null>(null);
  const [streamSelectMedia, setStreamSelectMedia] = useState<Media | null>(null);

  const tvShows = media
    .filter((m) => m.media_type === "tv")
    .sort((a, b) => a.title.localeCompare(b.title));
  
  const filteredShows = tvShows.filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <Tv className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">TV Shows</h1>
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
      </div>
    </PullToRefresh>
  );
}
