import { supabase } from "@/integrations/supabase/client";

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export const getImageUrl = (path: string | null, size: "w200" | "w300" | "w500" | "w780" | "original" = "w500") => {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
};

export interface TMDBSearchResult {
  id: number;
  title?: string;
  name?: string;
  media_type: "movie" | "tv" | "person";
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
}

export interface TMDBMovieDetails {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  runtime: number;
  genres: { id: number; name: string }[];
  credits: {
    cast: { id: number; name: string; character: string; profile_path: string | null }[];
  };
}

export interface TMDBTVDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time?: number[];
  genres: { id: number; name: string }[];
  credits: {
    cast: { id: number; name: string; character: string; profile_path: string | null }[];
  };
}

export async function searchTMDB(query: string): Promise<TMDBSearchResult[]> {
  const { data, error } = await supabase.functions.invoke("tmdb", {
    body: { action: "search", query },
  });

  if (error) throw error;
  return data.results?.filter((r: TMDBSearchResult) => r.media_type !== "person") || [];
}

export async function getMovieDetails(id: number): Promise<TMDBMovieDetails> {
  const { data, error } = await supabase.functions.invoke("tmdb", {
    body: { action: "movie_details", id },
  });

  if (error) throw error;
  return data;
}

export async function getTVDetails(id: number): Promise<TMDBTVDetails> {
  const { data, error } = await supabase.functions.invoke("tmdb", {
    body: { action: "tv_details", id },
  });

  if (error) throw error;
  return data;
}

export async function getTrending(mediaType: "all" | "movie" | "tv" = "all"): Promise<TMDBSearchResult[]> {
  const { data, error } = await supabase.functions.invoke("tmdb", {
    body: { action: "trending", media_type: mediaType },
  });

  if (error) throw error;
  return data.results || [];
}

export interface TMDBVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
}

export interface TMDBWatchProvider {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

export interface TMDBWatchProviders {
  id: number;
  results: {
    [countryCode: string]: {
      link: string;
      flatrate?: TMDBWatchProvider[];
      rent?: TMDBWatchProvider[];
      buy?: TMDBWatchProvider[];
      free?: TMDBWatchProvider[];
    };
  };
}

export async function getVideos(id: number, mediaType: "movie" | "tv"): Promise<TMDBVideo[]> {
  const { data, error } = await supabase.functions.invoke("tmdb", {
    body: { action: "get_videos", id, media_type: mediaType },
  });

  if (error) throw error;
  return data.results || [];
}

export async function getTVAiringToday(): Promise<TMDBSearchResult[]> {
  const { data, error } = await supabase.functions.invoke("tmdb", {
    body: { action: "tv_airing_today" },
  });

  if (error) throw error;
  return (data.results || []).map((item: TMDBSearchResult) => ({
    ...item,
    media_type: "tv" as const,
  }));
}

export async function getPopularMovies(): Promise<TMDBSearchResult[]> {
  const { data, error } = await supabase.functions.invoke("tmdb", {
    body: { action: "popular_movies" },
  });

  if (error) throw error;
  return (data.results || []).map((item: TMDBSearchResult) => ({
    ...item,
    media_type: "movie" as const,
  }));
}

export async function getNowPlayingMovies(): Promise<TMDBSearchResult[]> {
  const { data, error } = await supabase.functions.invoke("tmdb", {
    body: { action: "now_playing_movies" },
  });

  if (error) throw error;
  return (data.results || []).map((item: TMDBSearchResult) => ({
    ...item,
    media_type: "movie" as const,
  }));
}

export async function getWatchProviders(id: number, mediaType: "movie" | "tv"): Promise<TMDBWatchProviders> {
  const { data, error } = await supabase.functions.invoke("tmdb", {
    body: { action: "watch_providers", id, media_type: mediaType },
  });

  if (error) throw error;
  return data;
}

export async function discoverByProvider(providerId: number, mediaType: "movie" | "tv"): Promise<TMDBSearchResult[]> {
  const { data, error } = await supabase.functions.invoke("tmdb", {
    body: { action: "discover_by_provider", id: providerId, media_type: mediaType },
  });

  if (error) throw error;
  return (data.results || []).map((item: TMDBSearchResult) => ({
    ...item,
    media_type: mediaType,
  }));
}
