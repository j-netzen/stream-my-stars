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

// ========== INPUT VALIDATION ==========
const IMDB_ID_REGEX = /^tt\d{7,10}$/;  // IMDB IDs: tt followed by 7-10 digits
const VALID_TYPES = ["movie", "series"] as const;
const VALID_ACTIONS = ["search"] as const;

interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: {
    action: string;
    imdbId: string;
    type: string;
    season?: number;
    episode?: number;
  };
}

function validateTorrentioInput(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: "Invalid request body" };
  }
  
  const { action, imdbId, type, season, episode } = body as Record<string, unknown>;
  
  // Validate action
  if (typeof action !== 'string' || !VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return { valid: false, error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }
  
  // For search action, validate required fields
  if (action === "search") {
    // Validate imdbId
    if (typeof imdbId !== 'string') {
      return { valid: false, error: "IMDB ID must be a string" };
    }
    if (!IMDB_ID_REGEX.test(imdbId)) {
      return { valid: false, error: "Invalid IMDB ID format. Must match pattern: tt1234567 (7-10 digits)" };
    }
    
    // Validate type
    if (typeof type !== 'string' || !VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      return { valid: false, error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` };
    }
    
    // Validate season/episode for series
    if (type === "series") {
      if (season !== undefined) {
        if (typeof season !== 'number' || !Number.isInteger(season) || season < 1 || season > 100) {
          return { valid: false, error: "Season must be an integer between 1 and 100" };
        }
      }
      if (episode !== undefined) {
        if (typeof episode !== 'number' || !Number.isInteger(episode) || episode < 1 || episode > 1000) {
          return { valid: false, error: "Episode must be an integer between 1 and 1000" };
        }
      }
    }
    
    return { 
      valid: true, 
      data: { 
        action, 
        imdbId, 
        type, 
        season: season as number | undefined, 
        episode: episode as number | undefined 
      } 
    };
  }
  
  return { valid: false, error: "Unknown action" };
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
    // Parse and validate input
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Validation error", message: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validation = validateTorrentioInput(body);
    if (!validation.valid) {
      console.warn("Validation failed:", validation.error);
      return new Response(
        JSON.stringify({ error: "Validation error", message: validation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, imdbId, type, season, episode } = validation.data!;

    if (action === "search") {
      // Get Real-Debrid API key for authenticated streams
      const rdApiKey = Deno.env.get('REAL_DEBRID_API_KEY');
      
      // Build the stream ID - for series, include season:episode
      let streamId = imdbId;
      if (type === "series" && season !== undefined && episode !== undefined) {
        streamId = `${imdbId}:${season}:${episode}`;
      }
      
      // Build Torrentio URLs (try Real-Debrid provider first, then fallback to standard)
      const torrentioUrls: Array<{ label: string; url: string }> = [];
      const standardUrl = `${TORRENTIO_BASE}/stream/${type}/${streamId}.json`;
      if (rdApiKey) {
        const rdUrl = `${TORRENTIO_BASE}/realdebrid=${rdApiKey}/stream/${type}/${streamId}.json`;
        torrentioUrls.push({ label: "realdebrid", url: rdUrl });
      }
      torrentioUrls.push({ label: "standard", url: standardUrl });

      // Retry logic with exponential backoff for transient errors
      const MAX_RETRIES = 3;
      const RETRY_DELAYS = [1000, 2000, 4000]; // ms

      const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let lastStatus = 0;

      for (const candidate of torrentioUrls) {
        console.log(`Torrentio search using: ${candidate.label}`);

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            console.log(`Torrentio request attempt ${attempt + 1}/${MAX_RETRIES} (${candidate.label})`);

            const response = await fetch(candidate.url, {
              headers: {
                Accept: "application/json",
                "User-Agent": "MediaHub/1.0",
              },
            });

            lastStatus = response.status;

            // Success
            if (response.ok) {
              const data = await response.json();

              // SECURITY: Sanitize response to remove any API keys from URLs
              if (data.streams && Array.isArray(data.streams) && rdApiKey) {
                const keyRegex = new RegExp(escapeRegExp(rdApiKey), "g");
                data.streams = data.streams.map((stream: { url?: string; [key: string]: unknown }) => {
                  if (stream.url && typeof stream.url === "string") {
                    stream.url = stream.url.replace(keyRegex, "[REDACTED]");
                  }
                  return stream;
                });
              }

              console.log(`Torrentio returned ${data.streams?.length || 0} streams`);

              return new Response(JSON.stringify(data), {
                headers: {
                  ...corsHeaders,
                  "Content-Type": "application/json",
                  "X-RateLimit-Remaining": String(rateLimit.remaining),
                },
              });
            }

            // Non-retryable client errors (4xx except 429)
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
              console.error(`Torrentio client error: ${response.status}`);
              return new Response(
                JSON.stringify({ error: "Failed to fetch streams", status: response.status }),
                { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }

            // Retryable errors (5xx, 429)
            console.warn(`Torrentio returned ${response.status} (${candidate.label}), will retry...`);
          } catch (err) {
            console.warn(`Torrentio fetch error on attempt ${attempt + 1} (${candidate.label}):`, err);
          }

          // Wait before retry (except on last attempt)
          if (attempt < MAX_RETRIES - 1) {
            const delay = RETRY_DELAYS[attempt];
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        console.warn(`Torrentio path failed: ${candidate.label} (last status: ${lastStatus})`);
      }

      // All attempts exhausted. IMPORTANT:
      // Return HTTP 200 with an error payload so the client can show a friendly message
      // without Lovable treating this as a runtime error/blank screen.
      return new Response(
        JSON.stringify({
          streams: [],
          error: "Failed to fetch streams",
          status: lastStatus || 503,
          message: "Stream service temporarily unavailable. Please try again in a few moments.",
          retryable: true,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Validation error", message: `Unknown action: ${action}` }),
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
