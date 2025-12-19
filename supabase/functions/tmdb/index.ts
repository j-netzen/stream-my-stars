import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");
    if (!TMDB_API_KEY) {
      console.error("TMDB_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "TMDB API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, query, id, media_type } = await req.json();
    console.log("TMDB request:", { action, query, id, media_type });

    let url = "";
    
    switch (action) {
      case "search":
        url = `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`;
        break;
      case "movie_details":
        url = `${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits,external_ids`;
        break;
      case "tv_details":
        url = `${TMDB_BASE_URL}/tv/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits,external_ids`;
        break;
      case "trending":
        url = `${TMDB_BASE_URL}/trending/${media_type || "all"}/week?api_key=${TMDB_API_KEY}`;
        break;
      case "popular_movies":
        url = `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}`;
        break;
      case "popular_tv":
        url = `${TMDB_BASE_URL}/tv/popular?api_key=${TMDB_API_KEY}`;
        break;
      case "get_imdb_id": {
        // Get external IDs including IMDB ID
        const endpoint = media_type === "movie" ? "movie" : "tv";
        url = `${TMDB_BASE_URL}/${endpoint}/${id}/external_ids?api_key=${TMDB_API_KEY}`;
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    console.log("Fetching TMDB:", url.replace(TMDB_API_KEY, "***"));
    
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error("TMDB API error:", data);
      return new Response(
        JSON.stringify({ error: data.status_message || "TMDB API error" }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("TMDB response success");
    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("TMDB function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
