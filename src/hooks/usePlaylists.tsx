import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { Media } from "./useMedia";

export interface Playlist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_image: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlaylistWithItems extends Playlist {
  items: { media: Media; sort_order: number }[];
}

export function usePlaylists() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ["playlists", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("playlists")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Playlist[];
    },
    enabled: !!user,
  });

  const addPlaylist = useMutation({
    mutationFn: async (input: { name: string; description?: string; cover_image?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("playlists")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      toast.success("Playlist created");
    },
    onError: (error) => {
      toast.error("Failed to create playlist: " + error.message);
    },
  });

  const deletePlaylist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("playlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      toast.success("Playlist deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    },
  });

  const addToPlaylist = useMutation({
    mutationFn: async ({ playlistId, mediaId }: { playlistId: string; mediaId: string }) => {
      const { error } = await supabase
        .from("playlist_items")
        .insert({ playlist_id: playlistId, media_id: mediaId });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      toast.success("Added to playlist");
    },
    onError: (error) => {
      toast.error("Failed to add: " + error.message);
    },
  });

  const removeFromPlaylist = useMutation({
    mutationFn: async ({ playlistId, mediaId }: { playlistId: string; mediaId: string }) => {
      const { error } = await supabase
        .from("playlist_items")
        .delete()
        .eq("playlist_id", playlistId)
        .eq("media_id", mediaId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      toast.success("Removed from playlist");
    },
    onError: (error) => {
      toast.error("Failed to remove: " + error.message);
    },
  });

  return { playlists, isLoading, addPlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist };
}
