import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Torrentio base URL - using realdebrid provider
const TORRENTIO_BASE = "https://torrentio.strem.fun";

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequests: 30,      // 30 requests
  windowMs: 60 * 1000,  // per minute
};

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(req: Request): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `torrentio:${ip}`;
  
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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Check rate limit
  const rateLimit = checkRateLimit(req);
  if (!rateLimit.allowed) {
    console.warn("Rate limit exceeded for Torrentio function");
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
    const { action, imdbId, type, season, episode } = await req.json();
    console.log("Torrentio request:", { action, imdbId, type, season, episode });

    if (action === "search") {
      if (!imdbId || !type) {
        return new Response(
          JSON.stringify({ error: "IMDB ID and type are required" }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get Real-Debrid API key for authenticated streams
      const rdApiKey = Deno.env.get('REAL_DEBRID_API_KEY');
      
      // Build the stream ID - for series, include season:episode
      let streamId = imdbId;
      if (type === "series" && season !== undefined && episode !== undefined) {
        streamId = `${imdbId}:${season}:${episode}`;
      }
      
      // Build Torrentio URL with Real-Debrid provider if available
      let torrentioUrl: string;
      if (rdApiKey) {
        // Use realdebrid provider for direct streaming links
        torrentioUrl = `${TORRENTIO_BASE}/realdebrid=${rdApiKey}/stream/${type}/${streamId}.json`;
      } else {
        // Fallback to regular torrents (magnet links)
        torrentioUrl = `${TORRENTIO_BASE}/stream/${type}/${streamId}.json`;
      }

      console.log("Fetching from Torrentio:", torrentioUrl.replace(rdApiKey || '', '***'));
      const response = await fetch(torrentioUrl);
      
      if (!response.ok) {
        console.error("Torrentio API error:", response.status);
        return new Response(
          JSON.stringify({ error: "Failed to fetch streams", status: response.status }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      console.log(`Found ${data.streams?.length || 0} streams`);

      return new Response(JSON.stringify(data), {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in torrentio function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
