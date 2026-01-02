import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Enhanced CORS headers for web and mobile apps (Android/iOS)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, accept, origin, x-requested-with, cache-control',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges, content-type, x-ratelimit-remaining',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
};

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const REQUEST_TIMEOUT = 15000;

// ========== ERROR RESPONSE HELPER ==========
interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  status?: number;
  retryable?: boolean;
}

function createErrorResponse(
  error: string,
  message: string,
  status: number,
  options?: { code?: string; retryable?: boolean }
): Response {
  const body: ErrorResponse = {
    error,
    message,
    status,
    code: options?.code,
    retryable: options?.retryable ?? false,
  };

  console.error(`[ERROR] ${error}: ${message}`);

  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ========== SECRETS VERIFICATION ==========
function verifySecrets(): { configured: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const apiKey = Deno.env.get('TMDB_API_KEY');
  
  if (!apiKey || apiKey.length === 0) {
    warnings.push("TMDB_API_KEY not configured");
  }
  
  return { configured: !!apiKey, warnings };
}

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequests: 60,      // 60 requests
  windowMs: 60 * 1000,  // per minute
};

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// ========== INPUT VALIDATION ==========
const VALID_ACTIONS = ["search", "movie_details", "tv_details", "trending", "popular_movies", "popular_tv", "get_imdb_id", "get_videos", "tv_airing_today", "now_playing_movies", "watch_providers", "discover_by_provider"] as const;
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
  if (["movie_details", "tv_details", "get_imdb_id", "get_videos", "watch_providers", "discover_by_provider"].includes(action)) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > MAX_ID_VALUE) {
      return { valid: false, error: "ID must be a positive integer" };
    }
  }
  
  // Validate media_type for actions that use it
  if (["trending", "get_imdb_id", "get_videos", "watch_providers", "discover_by_provider"].includes(action)) {
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
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  return "unknown";
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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Verify secrets on startup
  const secretsStatus = verifySecrets();
  if (secretsStatus.warnings.length > 0) {
    console.warn("[SECRETS]", secretsStatus.warnings.join("; "));
  }

  // Check rate limit
  const rateLimit = checkRateLimit(req);
  if (!rateLimit.allowed) {
    console.warn(`[RATE_LIMIT] Exceeded for IP: ${getClientIp(req)}`);
    return new Response(
      JSON.stringify({
        error: "RATE_LIMIT_EXCEEDED",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfterMs: rateLimit.retryAfterMs,
        message: `Too many requests. Retry in ${Math.ceil((rateLimit.retryAfterMs || 0) / 1000)}s`,
        retryable: true,
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil((rateLimit.retryAfterMs || 0) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  try {
    const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");
    if (!TMDB_API_KEY) {
      return createErrorResponse(
        "CONFIG_ERROR",
        "TMDB API key not configured",
        503,
        { code: "MISSING_API_KEY", retryable: false }
      );
    }

    // Parse and validate input
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return createErrorResponse("PARSE_ERROR", "Invalid JSON", 400, { code: "INVALID_JSON" });
    }

    const validation = validateTmdbInput(body);
    if (!validation.valid) {
      return createErrorResponse("VALIDATION_ERROR", validation.error!, 400, { code: "INVALID_INPUT" });
    }

    const { action, query, id, media_type } = validation.data!;

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
        const endpoint = media_type === "movie" ? "movie" : "tv";
        url = `${TMDB_BASE_URL}/${endpoint}/${id}/external_ids?api_key=${TMDB_API_KEY}`;
        break;
      }
      case "get_videos": {
        const endpoint = media_type === "movie" ? "movie" : "tv";
        url = `${TMDB_BASE_URL}/${endpoint}/${id}/videos?api_key=${TMDB_API_KEY}`;
        break;
      }
      case "tv_airing_today":
        url = `${TMDB_BASE_URL}/tv/airing_today?api_key=${TMDB_API_KEY}`;
        break;
      case "now_playing_movies":
        url = `${TMDB_BASE_URL}/movie/now_playing?api_key=${TMDB_API_KEY}`;
        break;
      case "watch_providers": {
        const endpoint = media_type === "movie" ? "movie" : "tv";
        url = `${TMDB_BASE_URL}/${endpoint}/${id}/watch/providers?api_key=${TMDB_API_KEY}`;
        break;
      }
      case "discover_by_provider": {
        const endpoint = media_type === "movie" ? "movie" : "tv";
        url = `${TMDB_BASE_URL}/discover/${endpoint}?api_key=${TMDB_API_KEY}&with_watch_providers=${id}&watch_region=US&sort_by=popularity.desc`;
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: "Validation error", message: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
    
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error("TMDB API error:", response.status);
      return new Response(
        JSON.stringify({ error: data.status_message || "TMDB API error" }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
