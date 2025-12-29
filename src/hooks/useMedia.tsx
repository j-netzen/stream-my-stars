import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface Media {
  id: string;
  user_id: string;
  category_id: string | null;
  title: string;
  media_type: "movie" | "tv" | "custom";
  source_type: "url" | "upload";
  source_url: string | null;
  storage_path: string | null;
  tmdb_id: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  release_date: string | null;
  rating: number | null;
  genres: string[] | null;
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
  cast_members: any | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMediaInput {
  title: string;
  media_type: "movie" | "tv" | "custom";
  source_type: "url" | "upload";
  source_url?: string;
  storage_path?: string;
  category_id?: string;
  tmdb_id?: number;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  release_date?: string;
  rating?: number;
  genres?: string[];
  runtime?: number;
  seasons?: number;
  episodes?: number;
  cast_members?: any;
}

export function useMedia() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: media = [], isLoading, refetch } = useQuery({
    queryKey: ["media", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("media")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Media[];
    },
    enabled: !!user,
  });

  const addMedia = useMutation({
    mutationFn: async (input: CreateMediaInput) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("media")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      toast.success("Media added successfully");
    },
    onError: (error) => {
      toast.error("Failed to add media: " + error.message);
    },
  });

  const updateMedia = useMutation({
    mutationFn: async (input: { id: string; source_url?: string }) => {
      const { data, error } = await supabase
        .from("media")
        .update({ source_url: input.source_url, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (error) => {
      toast.error("Failed to update media: " + error.message);
    },
  });

  const refreshMetadata = useMutation({
    mutationFn: async (input: Partial<CreateMediaInput> & { id: string }) => {
      const { id, ...updates } = input;
      const { data, error } = await supabase
        .from("media")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data as Media;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      toast.success("Metadata refreshed");
    },
    onError: (error) => {
      toast.error("Failed to refresh metadata: " + error.message);
    },
  });

  const deleteMedia = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("media").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      toast.success("Media deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    },
  });

  return { media, isLoading, addMedia, updateMedia, deleteMedia, refreshMetadata, refetch };
}
