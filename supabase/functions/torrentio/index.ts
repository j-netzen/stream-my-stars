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

// Torrentio base URL
const TORRENTIO_BASE = "https://torrentio.strem.fun";

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60 * 1000,
};

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// ========== INPUT VALIDATION ==========
const IMDB_ID_REGEX = /^tt\d{7,10}$/;
const VALID_TYPES = ["movie", "series"] as const;
const VALID_ACTIONS = ["search", "health"] as const;

interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: {
    action: string;
    imdbId: string;
    type: string;
    season?: number;
    episode?: number;
    rdApiKey?: string;
  };
}

interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  status?: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

function createErrorResponse(
  error: string,
  message: string,
  status: number,
  options?: { code?: string; retryable?: boolean; details?: Record<string, unknown> }
): Response {
  const body: ErrorResponse = {
    error,
    message,
    status,
    code: options?.code,
    retryable: options?.retryable ?? false,
    details: options?.details,
  };

  console.error(`[ERROR] ${error}: ${message}`, options?.details || '');

  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function validateTorrentioInput(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: "Invalid request body - expected JSON object" };
  }
  
  const { action, imdbId, type, season, episode, rdApiKey } = body as Record<string, unknown>;
  
  // Validate action
  if (typeof action !== 'string' || !VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return { valid: false, error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }

  // Health check action - no additional validation needed
  if (action === "health") {
    let validatedRdKey: string | undefined;
    if (rdApiKey !== undefined && typeof rdApiKey === 'string' && rdApiKey.length > 0) {
      validatedRdKey = rdApiKey;
    }
    return { 
      valid: true, 
      data: { action, imdbId: '', type: '', rdApiKey: validatedRdKey } 
    };
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

    // Optional: client can pass RD API key
    let validatedRdKey: string | undefined;
    if (rdApiKey !== undefined) {
      if (typeof rdApiKey !== 'string' || rdApiKey.length === 0) {
        return { valid: false, error: "rdApiKey must be a non-empty string if provided" };
      }
      validatedRdKey = rdApiKey;
    }
    
    return { 
      valid: true, 
      data: { 
        action, 
        imdbId, 
        type, 
        season: season as number | undefined, 
        episode: episode as number | undefined,
        rdApiKey: validatedRdKey,
      } 
    };
  }
  
  return { valid: false, error: "Unknown action" };
}

// ========== ENVIRONMENT SECRETS VERIFICATION ==========
interface SecretsStatus {
  realDebridConfigured: boolean;
  supabaseConfigured: boolean;
  warnings: string[];
}

function verifySecrets(): SecretsStatus {
  const warnings: string[] = [];
  
  const rdApiKey = Deno.env.get('REAL_DEBRID_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  
  const realDebridConfigured = !!rdApiKey && rdApiKey.length > 0;
  const supabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;
  
  if (!realDebridConfigured) {
    warnings.push("REAL_DEBRID_API_KEY not configured - Real-Debrid streams unavailable");
  }
  
  if (!supabaseConfigured) {
    warnings.push("Supabase environment variables not fully configured");
  }
  
  return { realDebridConfigured, supabaseConfigured, warnings };
}

// ========== RATE LIMITING ==========
function getClientIp(req: Request): string {
  // Check various headers used by proxies/load balancers
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;
  
  return "unknown";
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
  
  // Clean up old entries periodically
  if (rateLimitStore.size > 1000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt <= now) {
        rateLimitStore.delete(k);
      }
    }
  }
  
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
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  // Verify secrets on startup (log warnings)
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
        error: "Rate limit exceeded",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfterMs: rateLimit.retryAfterMs,
        message: `Too many requests. Please try again in ${Math.ceil((rateLimit.retryAfterMs || 0) / 1000)} seconds.`,
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
    // Parse and validate input
    let body: unknown;
    try {
      body = await req.json();
    } catch (parseError) {
      return createErrorResponse(
        "PARSE_ERROR",
        "Invalid JSON in request body",
        400,
        { code: "INVALID_JSON", details: { hint: "Ensure request body is valid JSON" } }
      );
    }

    const validation = validateTorrentioInput(body);
    if (!validation.valid) {
      return createErrorResponse(
        "VALIDATION_ERROR",
        validation.error || "Invalid input",
        400,
        { code: "INVALID_INPUT" }
      );
    }

    const { action, imdbId, type, season, episode, rdApiKey: clientRdKey } = validation.data!;

    // ========== HEALTH CHECK ACTION ==========
    if (action === "health") {
      console.log("[HEALTH] Running health check...");
      
      const rdApiKey = clientRdKey || Deno.env.get('REAL_DEBRID_API_KEY');
      const healthResult: {
        status: "healthy" | "degraded" | "unhealthy";
        checks: {
          realDebrid: { configured: boolean; valid: boolean; error?: string; username?: string; premium?: boolean; expiration?: string };
          torrentio: { reachable: boolean; error?: string };
        };
        timestamp: string;
      } = {
        status: "healthy",
        checks: {
          realDebrid: { configured: false, valid: false },
          torrentio: { reachable: false },
        },
        timestamp: new Date().toISOString(),
      };

      // Check Real-Debrid API key validity
      if (rdApiKey && rdApiKey.length > 0) {
        healthResult.checks.realDebrid.configured = true;
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          const rdResponse = await fetch("https://api.real-debrid.com/rest/1.0/user", {
            headers: {
              "Authorization": `Bearer ${rdApiKey}`,
              "Accept": "application/json",
            },
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          if (rdResponse.ok) {
            const userData = await rdResponse.json();
            healthResult.checks.realDebrid.valid = true;
            healthResult.checks.realDebrid.username = userData.username;
            healthResult.checks.realDebrid.premium = userData.type === "premium";
            healthResult.checks.realDebrid.expiration = userData.expiration;
            console.log(`[HEALTH] Real-Debrid: valid (user: ${userData.username}, premium: ${userData.type === "premium"})`);
          } else if (rdResponse.status === 401) {
            healthResult.checks.realDebrid.error = "API key is invalid or expired";
            healthResult.status = "unhealthy";
            console.error("[HEALTH] Real-Debrid: invalid API key");
          } else {
            healthResult.checks.realDebrid.error = `API returned ${rdResponse.status}`;
            healthResult.status = "degraded";
            console.warn(`[HEALTH] Real-Debrid: unexpected status ${rdResponse.status}`);
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            healthResult.checks.realDebrid.error = "Request timed out";
          } else {
            healthResult.checks.realDebrid.error = err instanceof Error ? err.message : "Connection failed";
          }
          healthResult.status = "degraded";
          console.error("[HEALTH] Real-Debrid check failed:", err);
        }
      } else {
        healthResult.checks.realDebrid.error = "API key not configured";
        healthResult.status = "degraded";
        console.warn("[HEALTH] Real-Debrid: not configured");
      }

      // Check Torrentio reachability
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        // Use a simple manifest request to check if Torrentio is up
        const torrentioResponse = await fetch(`${TORRENTIO_BASE}/manifest.json`, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
          },
        });
        
        clearTimeout(timeoutId);
        
        if (torrentioResponse.ok) {
          healthResult.checks.torrentio.reachable = true;
          console.log("[HEALTH] Torrentio: reachable");
        } else {
          healthResult.checks.torrentio.error = `Returned ${torrentioResponse.status}`;
          if (healthResult.status === "healthy") healthResult.status = "degraded";
          console.warn(`[HEALTH] Torrentio: returned ${torrentioResponse.status}`);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          healthResult.checks.torrentio.error = "Request timed out";
        } else {
          healthResult.checks.torrentio.error = err instanceof Error ? err.message : "Connection failed";
        }
        if (healthResult.status === "healthy") healthResult.status = "degraded";
        console.error("[HEALTH] Torrentio check failed:", err);
      }

      // Determine overall status
      if (!healthResult.checks.realDebrid.valid && !healthResult.checks.torrentio.reachable) {
        healthResult.status = "unhealthy";
      }

      console.log(`[HEALTH] Overall status: ${healthResult.status}`);

      return new Response(JSON.stringify(healthResult), {
        status: healthResult.status === "unhealthy" ? 503 : 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    if (action === "search") {
      // Get Real-Debrid API key - prefer client-provided, fall back to env
      const rdApiKey = clientRdKey || Deno.env.get('REAL_DEBRID_API_KEY');
      
      // Log secret status (not the actual values!)
      console.log(`[SECRETS] Real-Debrid API key: ${rdApiKey ? 'configured (' + rdApiKey.length + ' chars)' : 'NOT configured'}`);
      
      // Build the stream ID - for series, include season:episode
      let streamId = imdbId;
      if (type === "series" && season !== undefined && episode !== undefined) {
        streamId = `${imdbId}:${season}:${episode}`;
      }
      
      console.log(`[SEARCH] Type: ${type}, StreamID: ${streamId}`);
      
      // Build Torrentio URLs
      // IMPORTANT: Torrentio expects a full config string BEFORE /stream/
      // Format: /[config]/stream/[type]/[id].json
      // Config format: providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex|sort=qualitysize|qualityfilter=brremux,hdrall,dolbyvision,4k,1080p,720p,480p,scr,cam,unknown
      const torrentioUrls: Array<{ label: string; url: string }> = [];
      
      // Real-Debrid endpoint - Torrentio uses the API key directly in the path (NOT URL encoded)
      // Format: /realdebrid=APIKEY/stream/type/id.json
      if (rdApiKey) {
        const rdUrl = `${TORRENTIO_BASE}/realdebrid=${rdApiKey}/stream/${type}/${streamId}.json`;
        torrentioUrls.push({ label: "realdebrid", url: rdUrl });
      }
      
      // Standard public endpoint (no config needed for basic search)
      const standardUrl = `${TORRENTIO_BASE}/stream/${type}/${streamId}.json`;
      torrentioUrls.push({ label: "standard", url: standardUrl });

      // Retry logic with exponential backoff
      const MAX_RETRIES = 3;
      const RETRY_DELAYS = [1000, 2000, 4000];
      
      const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let lastStatus = 0;
      let lastError: string | null = null;

      for (const candidate of torrentioUrls) {
        console.log(`[TORRENTIO] Trying: ${candidate.label}`);

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            console.log(`[TORRENTIO] Attempt ${attempt + 1}/${MAX_RETRIES} (${candidate.label})`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const response = await fetch(candidate.url, {
              headers: {
                Accept: "application/json",
                "User-Agent": "MediaHub/1.0 (Android; iOS; Web)",
              },
              signal: controller.signal,
            });

            clearTimeout(timeoutId);
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

              const streamCount = data.streams?.length || 0;
              console.log(`[SUCCESS] Torrentio returned ${streamCount} streams via ${candidate.label}`);

              return new Response(JSON.stringify({
                ...data,
                _meta: {
                  provider: candidate.label,
                  streamCount,
                  timestamp: new Date().toISOString(),
                }
              }), {
                status: 200,
                headers: {
                  ...corsHeaders,
                  "Content-Type": "application/json",
                  "X-RateLimit-Remaining": String(rateLimit.remaining),
                  "Cache-Control": "private, max-age=300", // 5 min cache
                },
              });
            }

            // Handle specific error codes
            if (response.status === 403) {
              lastError = "Access denied by Torrentio - API key may be invalid or expired";
              console.error(`[ERROR] 403 Forbidden from ${candidate.label} - checking next provider`);
              // Don't retry 403, move to next provider
              break;
            }

            if (response.status === 404) {
              lastError = "Content not found on Torrentio";
              console.warn(`[WARN] 404 Not Found for ${streamId}`);
              // Return empty streams for 404
              return new Response(JSON.stringify({
                streams: [],
                _meta: {
                  provider: candidate.label,
                  streamCount: 0,
                  message: "No streams found for this content",
                  timestamp: new Date().toISOString(),
                }
              }), {
                status: 200,
                headers: {
                  ...corsHeaders,
                  "Content-Type": "application/json",
                  "X-RateLimit-Remaining": String(rateLimit.remaining),
                },
              });
            }

            // Non-retryable client errors (4xx except 429)
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
              lastError = `Torrentio returned error ${response.status}`;
              console.error(`[ERROR] ${response.status} from ${candidate.label}`);
              break; // Move to next provider
            }

            // Retryable errors (5xx, 429)
            lastError = `Torrentio temporarily unavailable (${response.status})`;
            console.warn(`[RETRY] ${response.status} from ${candidate.label}`);
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
              lastError = "Request timed out";
              console.warn(`[TIMEOUT] Request to ${candidate.label} timed out`);
            } else {
              lastError = err instanceof Error ? err.message : "Network error";
              console.error(`[FETCH_ERROR] ${candidate.label}:`, err);
            }
          }

          // Wait before retry (except on last attempt)
          if (attempt < MAX_RETRIES - 1) {
            const delay = RETRY_DELAYS[attempt];
            console.log(`[WAIT] ${delay}ms before retry`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        console.warn(`[FAILED] Provider ${candidate.label} exhausted (status: ${lastStatus})`);
      }

      // All providers failed - return graceful error with empty streams
      console.error(`[EXHAUSTED] All providers failed. Last status: ${lastStatus}, Last error: ${lastError}`);
      
      return new Response(
        JSON.stringify({
          streams: [],
          error: "STREAM_FETCH_FAILED",
          message: lastError || "Unable to fetch streams. Please try again later.",
          status: lastStatus || 503,
          retryable: true,
          _meta: {
            timestamp: new Date().toISOString(),
            secretsConfigured: secretsStatus.realDebridConfigured,
          }
        }),
        {
          status: 200, // Return 200 so client can handle gracefully
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        }
      );
    }

    return createErrorResponse(
      "UNKNOWN_ACTION",
      `Unknown action: ${action}`,
      400,
      { code: "INVALID_ACTION" }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error("[FATAL] Unhandled error:", errorMessage, errorStack);
    
    return new Response(
      JSON.stringify({
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again.",
        code: "INTERNAL_SERVER_ERROR",
        retryable: true,
        _debug: Deno.env.get('ENVIRONMENT') === 'development' ? { message: errorMessage } : undefined,
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
