import { useState, useMemo } from "react";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useMedia, Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { MediaCard } from "@/components/media/MediaCard";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { StreamSelectionDialog, StreamQualityInfo } from "@/components/media/StreamSelectionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListVideo, Plus, Trash2, Loader2, Shuffle, ArrowUpDown, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

type SortOption = "date_added" | "alphabetical" | "release_date";

export default function PlaylistsPage() {
  const { playlists, isLoading, addPlaylist, updatePlaylist, deletePlaylist, removeFromPlaylist } = usePlaylists();
  const { media, deleteMedia } = useMedia();
  const { progress } = useWatchProgress();
  const [activeMedia, setActiveMedia] = useState<Media | null>(null);
  const [streamSelectMedia, setStreamSelectMedia] = useState<Media | null>(null);
  const [activeStreamQuality, setActiveStreamQuality] = useState<StreamQualityInfo | undefined>();
  const [activeTryNextStream, setActiveTryNextStream] = useState<(() => void) | undefined>();
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [newPlaylistPublic, setNewPlaylistPublic] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("date_added");
  const [publicConfirmPlaylistId, setPublicConfirmPlaylistId] = useState<string | null>(null);
  const [pendingPublicState, setPendingPublicState] = useState<boolean>(false);

  // Fetch playlist items
  const { data: playlistItems = [] } = useQuery({
    queryKey: ["playlist_items", selectedPlaylist],
    queryFn: async () => {
      if (!selectedPlaylist) return [];
      const { data, error } = await supabase
        .from("playlist_items")
        .select("media_id, sort_order")
        .eq("playlist_id", selectedPlaylist)
        .order("sort_order", { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedPlaylist,
  });

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      toast.error("Please enter a playlist name");
      return;
    }

    await addPlaylist.mutateAsync({
      name: newPlaylistName,
      description: newPlaylistDesc || undefined,
      is_public: newPlaylistPublic,
    });

    setNewPlaylistName("");
    setNewPlaylistDesc("");
    setNewPlaylistPublic(false);
    setIsDialogOpen(false);
  };

  const handleTogglePublic = (playlistId: string, currentPublic: boolean) => {
    if (!currentPublic) {
      // Making public - show confirmation
      setPublicConfirmPlaylistId(playlistId);
      setPendingPublicState(true);
    } else {
      // Making private - no confirmation needed
      updatePlaylist.mutate({ id: playlistId, is_public: false });
    }
  };

  const confirmMakePublic = () => {
    if (publicConfirmPlaylistId) {
      updatePlaylist.mutate({ id: publicConfirmPlaylistId, is_public: true });
    }
    setPublicConfirmPlaylistId(null);
    setPendingPublicState(false);
  };

  const selectedPlaylistData = playlists.find((p) => p.id === selectedPlaylist);
  const playlistMedia = media.filter((m) =>
    playlistItems.some((item) => item.media_id === m.id)
  );

  // Sort playlist media based on selected option
  const sortedPlaylistMedia = useMemo(() => {
    const sorted = [...playlistMedia];
    
    switch (sortOption) {
      case "alphabetical":
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case "release_date":
        return sorted.sort((a, b) => {
          const dateA = a.release_date ? new Date(a.release_date).getTime() : 0;
          const dateB = b.release_date ? new Date(b.release_date).getTime() : 0;
          return dateB - dateA; // Newest first
        });
      case "date_added":
      default:
        // Sort by the order they were added to the playlist
        return sorted.sort((a, b) => {
          const itemA = playlistItems.find((item) => item.media_id === a.id);
          const itemB = playlistItems.find((item) => item.media_id === b.id);
          return (itemA?.sort_order ?? 0) - (itemB?.sort_order ?? 0);
        });
    }
  }, [playlistMedia, playlistItems, sortOption]);

  const handlePlay = (item: Media) => {
    // Show stream selection for media with TMDB ID
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

  const handlePickForMe = () => {
    if (playlistMedia.length === 0) {
      toast.error("No media in this playlist to pick from");
      return;
    }
    const randomIndex = Math.floor(Math.random() * playlistMedia.length);
    const randomMedia = playlistMedia[randomIndex];
    handlePlay(randomMedia);
    toast.success(`Playing: ${randomMedia.title}`);
  };

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
          <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
            <ListVideo className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Playlists</h1>
            <p className="text-sm text-muted-foreground">
              Create custom playlists of your favorite content
            </p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Playlist
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Playlist</DialogTitle>
              <DialogDescription>
                Create a new playlist to organize your media
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="e.g., Movie Night"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  placeholder="Enter a description"
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                <div className="flex items-center gap-2">
                  {newPlaylistPublic ? (
                    <Globe className="w-4 h-4 text-primary" />
                  ) : (
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  )}
                  <div>
                    <Label className="cursor-pointer">Make Public</Label>
                    <p className="text-xs text-muted-foreground">
                      {newPlaylistPublic 
                        ? "All authenticated users can view this playlist" 
                        : "Only you can see this playlist"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={newPlaylistPublic}
                  onCheckedChange={setNewPlaylistPublic}
                />
              </div>
              <Button onClick={handleCreatePlaylist} className="w-full">
                Create Playlist
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-6">
        {/* Playlists List */}
        <div className="w-64 flex-shrink-0 space-y-2">
          {playlists.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ListVideo className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No playlists yet</p>
            </div>
          ) : (
            playlists.map((playlist) => (
              <Card
                key={playlist.id}
                withSpaceBg
                onClick={() => setSelectedPlaylist(playlist.id)}
                className={`cursor-pointer p-3 transition-all ${
                  selectedPlaylist === playlist.id
                    ? "ring-2 ring-primary shadow-star-glow"
                    : "hover:shadow-star-lg"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <ListVideo className="w-4 h-4 text-purple-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium">{playlist.name}</p>
                        {playlist.is_public && (
                          <Globe className="w-3 h-3 text-primary" />
                        )}
                      </div>
                      {playlist.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {playlist.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePublic(playlist.id, playlist.is_public);
                      }}
                      className={`h-8 w-8 ${playlist.is_public ? 'text-primary' : 'text-muted-foreground'}`}
                      title={playlist.is_public ? "Make private" : "Make public"}
                    >
                      {playlist.is_public ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePlaylist.mutate(playlist.id);
                        if (selectedPlaylist === playlist.id) {
                          setSelectedPlaylist(null);
                        }
                      }}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Playlist Content */}
        <div className="flex-1">
          {selectedPlaylist && selectedPlaylistData ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{selectedPlaylistData.name}</h2>
                <div className="flex items-center gap-3">
                  {/* Sort dropdown */}
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                    <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date_added">Date Added</SelectItem>
                        <SelectItem value="alphabetical">Alphabetical</SelectItem>
                        <SelectItem value="release_date">Release Date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {sortedPlaylistMedia.length > 0 && (
                    <Button
                      onClick={handlePickForMe}
                      variant="outline"
                      className="gap-2"
                    >
                      <Shuffle className="w-4 h-4" />
                      Pick for me
                    </Button>
                  )}
                </div>
              </div>
              {sortedPlaylistMedia.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {sortedPlaylistMedia.map((item) => (
                    <MediaCard
                      key={item.id}
                      media={item}
                      progress={progress.find((p) => p.media_id === item.id)}
                      onPlay={handlePlay}
                      onDelete={() => {
                        removeFromPlaylist.mutate({
                          playlistId: selectedPlaylist,
                          mediaId: item.id,
                        });
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No media in this playlist</p>
                  <p className="text-sm">Add media to this playlist from the media card menu</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <ListVideo className="w-16 h-16 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Select a playlist</h2>
              <p className="text-muted-foreground">
                Choose a playlist from the list to view its content
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stream Selection Dialog */}
      <StreamSelectionDialog
        media={streamSelectMedia}
        open={!!streamSelectMedia}
        onOpenChange={(open) => !open && setStreamSelectMedia(null)}
        onStreamSelected={handleStreamSelected}
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

      {/* Public Confirmation Dialog */}
      <AlertDialog open={!!publicConfirmPlaylistId} onOpenChange={(open) => !open && setPublicConfirmPlaylistId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Make Playlist Public?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Making this playlist public means <strong>all authenticated users</strong> will be able to view it and its contents.
              </p>
              <p className="text-amber-500">
                ⚠️ Any media in this playlist will be visible to others.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMakePublic}>
              Yes, Make Public
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
