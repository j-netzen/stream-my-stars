import { useState } from "react";
import { Media } from "@/hooks/useMedia";
import { usePlaylists } from "@/hooks/usePlaylists";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListVideo, Plus, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddToPlaylistDialogProps {
  media: Media | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddToPlaylistDialog({
  media,
  open,
  onOpenChange,
}: AddToPlaylistDialogProps) {
  const { playlists, isLoading, addPlaylist, addToPlaylist } = usePlaylists();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAddToPlaylist = async () => {
    if (!media || !selectedPlaylistId) return;
    
    setIsAdding(true);
    try {
      await addToPlaylist.mutateAsync({
        playlistId: selectedPlaylistId,
        mediaId: media.id,
      });
      onOpenChange(false);
      setSelectedPlaylistId(null);
    } catch (error) {
      // Error handled in mutation
    }
    setIsAdding(false);
  };

  const handleCreateAndAdd = async () => {
    if (!media || !newPlaylistName.trim()) return;
    
    setIsAdding(true);
    try {
      const newPlaylist = await addPlaylist.mutateAsync({
        name: newPlaylistName.trim(),
      });
      
      if (newPlaylist?.id) {
        await addToPlaylist.mutateAsync({
          playlistId: newPlaylist.id,
          mediaId: media.id,
        });
      }
      
      onOpenChange(false);
      setNewPlaylistName("");
      setIsCreatingNew(false);
    } catch (error) {
      // Error handled in mutation
    }
    setIsAdding(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedPlaylistId(null);
      setIsCreatingNew(false);
      setNewPlaylistName("");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListVideo className="w-5 h-5" />
            Add to Playlist
          </DialogTitle>
        </DialogHeader>

        {media && (
          <p className="text-sm text-muted-foreground">
            Adding: <span className="font-medium text-foreground">{media.title}</span>
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Existing Playlists */}
            {playlists.length > 0 && !isCreatingNew && (
              <div className="space-y-2">
                <Label>Select a playlist</Label>
                <ScrollArea className="h-[200px] border rounded-lg">
                  <div className="p-2 space-y-1">
                    {playlists.map((playlist) => (
                      <button
                        key={playlist.id}
                        type="button"
                        onClick={() => setSelectedPlaylistId(playlist.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                          selectedPlaylistId === playlist.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-secondary"
                        )}
                      >
                        <ListVideo className="w-4 h-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{playlist.name}</p>
                          {playlist.description && (
                            <p className={cn(
                              "text-xs truncate",
                              selectedPlaylistId === playlist.id
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            )}>
                              {playlist.description}
                            </p>
                          )}
                        </div>
                        {selectedPlaylistId === playlist.id && (
                          <Check className="w-4 h-4 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Create New Playlist */}
            {isCreatingNew ? (
              <div className="space-y-3">
                <Label>New playlist name</Label>
                <Input
                  placeholder="Enter playlist name..."
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateAndAdd()}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setIsCreatingNew(false);
                      setNewPlaylistName("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleCreateAndAdd}
                    disabled={!newPlaylistName.trim() || isAdding}
                  >
                    {isAdding ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Create & Add"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setIsCreatingNew(true)}
              >
                <Plus className="w-4 h-4" />
                Create New Playlist
              </Button>
            )}

            {/* Add Button */}
            {!isCreatingNew && playlists.length > 0 && (
              <Button
                className="w-full"
                onClick={handleAddToPlaylist}
                disabled={!selectedPlaylistId || isAdding}
              >
                {isAdding ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Add to Playlist
              </Button>
            )}

            {/* Empty State */}
            {playlists.length === 0 && !isCreatingNew && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No playlists yet. Create one to get started!
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
