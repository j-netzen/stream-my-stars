import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequests: 60,      // 60 requests
  windowMs: 60 * 1000,  // per minute
};

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// ========== INPUT VALIDATION ==========
const VALID_ACTIONS = ["search", "movie_details", "tv_details", "trending", "popular_movies", "popular_tv", "get_imdb_id", "get_videos"] as const;
const VALID_MEDIA_TYPES = ["movie", "tv", "all"] as const;
const MAX_QUERY_LENGTH = 200;
const MAX_ID_VALUE = 999999999; // TMDB IDs are large integers

interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: {
    action: string;
    query?: string;
    id?: number;
    media_type?: string;
  };
}

function validateTmdbInput(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: "Invalid request body" };
  }
  
  const { action, query, id, media_type } = body as Record<string, unknown>;
  
  // Validate action (required)
  if (typeof action !== 'string' || !VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return { valid: false, error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }
  
  // Validate query for search action
  if (action === "search") {
    if (typeof query !== 'string' || query.trim().length === 0) {
      return { valid: false, error: "Query is required for search action" };
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return { valid: false, error: `Query too long. Maximum ${MAX_QUERY_LENGTH} characters` };
    }
  }
  
  // Validate id for detail actions
  if (["movie_details", "tv_details", "get_imdb_id", "get_videos"].includes(action)) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > MAX_ID_VALUE) {
      return { valid: false, error: "ID must be a positive integer" };
    }
  }
  
  // Validate media_type for actions that use it
  if (["trending", "get_imdb_id", "get_videos"].includes(action)) {
    if (media_type !== undefined) {
      if (typeof media_type !== 'string' || !VALID_MEDIA_TYPES.includes(media_type as typeof VALID_MEDIA_TYPES[number])) {
        return { valid: false, error: `Invalid media_type. Must be one of: ${VALID_MEDIA_TYPES.join(', ')}` };
      }
    }
  }
  
  return { 
    valid: true, 
    data: { 
      action, 
      query: typeof query === 'string' ? query.trim() : undefined, 
      id: id as number | undefined, 
      media_type: media_type as string | undefined 
    } 
  };
}

// ========== RATE LIMITING ==========
function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(req: Request): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `tmdb:${ip}`;
  
  let entry = rateLimitStore.get(key);
  
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + RATE_LIMIT.windowMs };
  }
  
  entry.count++;
  rateLimitStore.set(key, entry);
  
  const remaining = Math.max(0, RATE_LIMIT.maxRequests - entry.count);
  const allowed = entry.count <= RATE_LIMIT.maxRequests;
  
  return {
    allowed,
    remaining,
    retryAfterMs: allowed ? undefined : entry.resetAt - now,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Check rate limit
  const rateLimit = checkRateLimit(req);
  if (!rateLimit.allowed) {
    console.warn("Rate limit exceeded for TMDB function");
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        retryAfterMs: rateLimit.retryAfterMs,
        message: `Too many requests. Please try again in ${Math.ceil((rateLimit.retryAfterMs || 0) / 1000)} seconds.`,
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil((rateLimit.retryAfterMs || 0) / 1000)),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
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

    // Parse and validate input
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Validation error", message: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validation = validateTmdbInput(body);
    if (!validation.valid) {
      console.warn("Validation failed:", validation.error);
      return new Response(
        JSON.stringify({ error: "Validation error", message: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, query, id, media_type } = validation.data!;
    console.log("TMDB request (validated):", { action, query, id, media_type });

    let url = "";
    
    switch (action) {
      case "search":
        url = `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query!)}&include_adult=false`;
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
      case "get_videos": {
        // Get videos (trailers, teasers, etc.)
        const endpoint = media_type === "movie" ? "movie" : "tv";
        url = `${TMDB_BASE_URL}/${endpoint}/${id}/videos?api_key=${TMDB_API_KEY}`;
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: "Validation error", message: "Invalid action" }),
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
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        } 
      }
    );
  } catch (error) {
    console.error("TMDB function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
