import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface WatchProgress {
  id: string;
  user_id: string;
  media_id: string;
  progress_seconds: number;
  duration_seconds: number | null;
  completed: boolean;
  last_watched_at: string;
  episode_number: number | null;
  season_number: number | null;
}

export function useWatchProgress() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: progress = [], isLoading } = useQuery({
    queryKey: ["watch_progress", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("watch_progress")
        .select("*")
        .eq("user_id", user.id)
        .order("last_watched_at", { ascending: false });
      
      if (error) throw error;
      return data as WatchProgress[];
    },
    enabled: !!user,
  });

  const updateProgress = useMutation({
    mutationFn: async (input: {
      mediaId: string;
      progressSeconds: number;
      durationSeconds?: number;
      completed?: boolean;
      episodeNumber?: number;
      seasonNumber?: number;
    }) => {
      if (!user) throw new Error("Not authenticated");
      
      const { data, error } = await supabase
        .from("watch_progress")
        .upsert({
          user_id: user.id,
          media_id: input.mediaId,
          progress_seconds: input.progressSeconds,
          duration_seconds: input.durationSeconds,
          completed: input.completed || false,
          episode_number: input.episodeNumber,
          season_number: input.seasonNumber,
          last_watched_at: new Date().toISOString(),
        }, {
          onConflict: "user_id,media_id,episode_number,season_number",
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watch_progress"] });
    },
  });

  const getProgressForMedia = (mediaId: string, episodeNumber?: number, seasonNumber?: number) => {
    return progress.find(
      (p) =>
        p.media_id === mediaId &&
        p.episode_number === (episodeNumber ?? null) &&
        p.season_number === (seasonNumber ?? null)
    );
  };

  const getContinueWatching = () => {
    return progress.filter((p) => !p.completed && p.progress_seconds > 0);
  };

  return { progress, isLoading, updateProgress, getProgressForMedia, getContinueWatching };
}
