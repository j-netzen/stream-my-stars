import { useState } from "react";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useMedia, Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { MediaCard } from "@/components/media/MediaCard";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ListVideo, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function PlaylistsPage() {
  const { playlists, isLoading, addPlaylist, deletePlaylist, removeFromPlaylist } = usePlaylists();
  const { media, deleteMedia } = useMedia();
  const { progress } = useWatchProgress();
  const [activeMedia, setActiveMedia] = useState<Media | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);

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
    });

    setNewPlaylistName("");
    setNewPlaylistDesc("");
    setIsDialogOpen(false);
  };

  const selectedPlaylistData = playlists.find((p) => p.id === selectedPlaylist);
  const playlistMedia = media.filter((m) =>
    playlistItems.some((item) => item.media_id === m.id)
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
              <button
                key={playlist.id}
                onClick={() => setSelectedPlaylist(playlist.id)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  selectedPlaylist === playlist.id
                    ? "bg-primary/20 border border-primary"
                    : "bg-secondary/50 hover:bg-secondary"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{playlist.name}</p>
                    {playlist.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {playlist.description}
                      </p>
                    )}
                  </div>
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
              </button>
            ))
          )}
        </div>

        {/* Playlist Content */}
        <div className="flex-1">
          {selectedPlaylist && selectedPlaylistData ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">{selectedPlaylistData.name}</h2>
              {playlistMedia.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {playlistMedia.map((item) => (
                    <MediaCard
                      key={item.id}
                      media={item}
                      progress={progress.find((p) => p.media_id === item.id)}
                      onPlay={setActiveMedia}
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

      {activeMedia && (
        <VideoPlayer media={activeMedia} onClose={() => setActiveMedia(null)} />
      )}
    </div>
  );
}
