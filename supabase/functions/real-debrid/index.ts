import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RD_API_BASE = "https://api.real-debrid.com/rest/1.0";

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequests: 30,      // 30 requests
  windowMs: 60 * 1000,  // per minute
};

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// ========== INPUT VALIDATION ==========
const VALID_ACTIONS = ["user", "unrestrict", "streaming", "add_magnet", "add_torrent", "select_files", "torrent_info", "torrents", "downloads", "hosts"] as const;
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const MAGNET_REGEX = /^magnet:\?xt=urn:[a-z0-9]+:[a-z0-9]{32,}/i;
const TORRENT_ID_REGEX = /^[a-zA-Z0-9]+$/;
const MAX_LINK_LENGTH = 2000;
const MAX_MAGNET_LENGTH = 5000;
const MAX_TORRENT_ID_LENGTH = 50;

interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: {
    action: string;
    link?: string;
    magnet?: string;
    torrentId?: string;
    torrentFile?: string; // base64 encoded torrent file
  };
}

function validateRealDebridInput(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: "Invalid request body" };
  }
  
  const { action, link, magnet, torrentId, torrentFile } = body as Record<string, unknown>;
  
  // Validate action (required)
  if (typeof action !== 'string' || !VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return { valid: false, error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }
  
  // Validate link for unrestrict and streaming actions
  if (action === "unrestrict" || action === "streaming") {
    if (typeof link !== 'string') {
      return { valid: false, error: "Link is required for this action" };
    }
    if (link.length > MAX_LINK_LENGTH) {
      return { valid: false, error: `Link too long. Maximum ${MAX_LINK_LENGTH} characters` };
    }
    if (!URL_REGEX.test(link)) {
      return { valid: false, error: "Invalid URL format for link" };
    }
  }
  
  // Validate magnet for add_magnet action
  if (action === "add_magnet") {
    if (typeof magnet !== 'string') {
      return { valid: false, error: "Magnet link is required for add_magnet action" };
    }
    if (magnet.length > MAX_MAGNET_LENGTH) {
      return { valid: false, error: `Magnet link too long. Maximum ${MAX_MAGNET_LENGTH} characters` };
    }
    if (!MAGNET_REGEX.test(magnet)) {
      return { valid: false, error: "Invalid magnet link format. Must start with 'magnet:?xt=urn:'" };
    }
  }
  
  // Validate torrentFile for add_torrent action
  if (action === "add_torrent") {
    if (typeof torrentFile !== 'string') {
      return { valid: false, error: "Torrent file (base64) is required for add_torrent action" };
    }
    // Basic base64 validation
    if (torrentFile.length > 10 * 1024 * 1024) { // 10MB max
      return { valid: false, error: "Torrent file too large. Maximum 10MB" };
    }
  }
  
  // Validate torrentId for select_files and torrent_info actions
  if (["select_files", "torrent_info"].includes(action)) {
    if (typeof torrentId !== 'string') {
      return { valid: false, error: "Torrent ID is required for this action" };
    }
    if (torrentId.length > MAX_TORRENT_ID_LENGTH) {
      return { valid: false, error: `Torrent ID too long. Maximum ${MAX_TORRENT_ID_LENGTH} characters` };
    }
    if (!TORRENT_ID_REGEX.test(torrentId)) {
      return { valid: false, error: "Invalid torrent ID format. Must be alphanumeric" };
    }
  }
  
  return { 
    valid: true, 
    data: { 
      action, 
      link: link as string | undefined, 
      magnet: magnet as string | undefined, 
      torrentId: torrentId as string | undefined,
      torrentFile: torrentFile as string | undefined,
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
  const key = `realdebrid:${ip}`;
  
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
    console.warn("Rate limit exceeded for Real-Debrid function");
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
    const apiKey = Deno.env.get('REAL_DEBRID_API_KEY');
    if (!apiKey) {
      console.error("REAL_DEBRID_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Real-Debrid API key not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const validation = validateRealDebridInput(body);
    if (!validation.valid) {
      console.warn("Validation failed:", validation.error);
      return new Response(
        JSON.stringify({ error: "Validation error", message: validation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, link, magnet, torrentId, torrentFile } = validation.data!;
    console.log("Real-Debrid request (validated):", { action, link: link ? "provided" : "none", magnet: magnet ? "provided" : "none", torrentFile: torrentFile ? "provided" : "none" });

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
    };

    let response;
    let data;

    switch (action) {
      case "user":
        // Get user account info
        console.log("Fetching user info...");
        response = await fetch(`${RD_API_BASE}/user`, { headers });
        data = await response.json();
        console.log("User info response status:", response.status);
        break;

      case "unrestrict":
        // Unrestrict a link to get direct download/streaming URL
        console.log("Unrestricting link...");
        response = await fetch(`${RD_API_BASE}/unrestrict/link`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `link=${encodeURIComponent(link!)}`,
        });
        data = await response.json();
        console.log("Unrestrict response status:", response.status);
        break;

      case "streaming":
        // Get streaming transcoded links for a file
        console.log("Getting streaming links...");
        response = await fetch(`${RD_API_BASE}/streaming/transcode/${encodeURIComponent(link!)}`, {
          method: 'GET',
          headers,
        });
        data = await response.json();
        console.log("Streaming response status:", response.status);
        break;

      case "add_magnet":
        // Add a magnet link
        console.log("Adding magnet...");
        response = await fetch(`${RD_API_BASE}/torrents/addMagnet`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `magnet=${encodeURIComponent(magnet!)}`,
        });
        data = await response.json();
        console.log("Add magnet response status:", response.status);
        break;

      case "add_torrent":
        // Add a torrent file (base64 encoded)
        console.log("Adding torrent file...");
        // Decode base64 to binary
        const binaryString = atob(torrentFile!);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/x-bittorrent' });
        const formData = new FormData();
        formData.append('file', blob, 'torrent.torrent');
        
        response = await fetch(`${RD_API_BASE}/torrents/addTorrent`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: formData,
        });
        data = await response.json();
        console.log("Add torrent response status:", response.status);
        break;

      case "select_files":
        // Select all files from a torrent
        console.log("Selecting files for torrent:", torrentId);
        response = await fetch(`${RD_API_BASE}/torrents/selectFiles/${torrentId}`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'files=all',
        });
        // This endpoint returns 204 on success
        if (response.status === 204) {
          data = { success: true };
        } else {
          data = await response.json();
        }
        console.log("Select files response status:", response.status);
        break;

      case "torrent_info":
        // Get torrent info
        console.log("Getting torrent info:", torrentId);
        response = await fetch(`${RD_API_BASE}/torrents/info/${torrentId}`, { headers });
        data = await response.json();
        console.log("Torrent info response status:", response.status);
        break;

      case "torrents":
        // List all torrents
        console.log("Listing torrents...");
        response = await fetch(`${RD_API_BASE}/torrents`, { headers });
        data = await response.json();
        console.log("Torrents list response status:", response.status);
        break;

      case "downloads":
        // List download history
        console.log("Listing downloads...");
        response = await fetch(`${RD_API_BASE}/downloads`, { headers });
        data = await response.json();
        console.log("Downloads list response status:", response.status);
        break;

      case "hosts":
        // Get supported hosts
        console.log("Fetching supported hosts...");
        response = await fetch(`${RD_API_BASE}/hosts`, { headers });
        data = await response.json();
        console.log("Hosts response status:", response.status);
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Validation error", message: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    if (!response.ok && response.status !== 204) {
      console.error("Real-Debrid API error:", data);
      return new Response(
        JSON.stringify({ error: data.error || "Real-Debrid API error", details: data }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Real-Debrid response success");
    return new Response(JSON.stringify(data), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in real-debrid function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
