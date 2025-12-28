import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RD_API_BASE = "https://api.real-debrid.com/rest/1.0";

// Connection pooling configuration
const POOL_CONFIG = {
  maxConnections: 10,
  idleTimeout: 30000, // 30 seconds
  connectionTimeout: 15000, // 15 seconds for connection establishment
};

// Request timeout configuration
const REQUEST_TIMEOUT = {
  default: 30000, // 30 seconds
  streaming: 45000, // 45 seconds for streaming transcoding (can be slow)
  download: 60000, // 60 seconds for download-related operations
};

// Create an HTTP client with connection pooling and HTTP/1.1 forced
const httpClient = Deno.createHttpClient({
  http2: false,
  poolMaxIdlePerHost: POOL_CONFIG.maxConnections,
  poolIdleTimeout: POOL_CONFIG.idleTimeout,
});

// Timeout wrapper for fetch requests
async function fetchWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeoutMs: number = REQUEST_TIMEOUT.default
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      // @ts-ignore - Deno-specific option
      client: httpClient,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Custom fetch wrapper with retry logic for transient errors AND 503 responses
async function rdFetch(
  url: string, 
  options: RequestInit = {}, 
  timeoutMs: number = REQUEST_TIMEOUT.default,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      
      // Retry on 503 Service Unavailable (Real-Debrid temporary overload)
      if (response.status === 503 && attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s, 8s
        console.log(`Real-Debrid returned 503, retry ${attempt + 1}/${maxRetries} after ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        lastResponse = response;
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a retryable error
      const isRetryable = 
        lastError.name === 'AbortError' || // Timeout
        lastError.message.includes('connection') ||
        lastError.message.includes('http2') ||
        lastError.message.includes('network');
      
      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 4000);
      console.log(`Retry ${attempt + 1}/${maxRetries} after ${backoffMs}ms for ${url}`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
  
  // If we exhausted retries due to 503s, return the last response
  if (lastResponse) {
    return lastResponse;
  }
  
  throw lastError || new Error('Unexpected error in rdFetch');
}

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
    fileId?: string; // for streaming action
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
  
  // Validate link for unrestrict action
  if (action === "unrestrict") {
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
  
  // Validate fileId for streaming action (needs file ID, not URL)
  if (action === "streaming") {
    const { fileId } = body as Record<string, unknown>;
    if (typeof fileId !== 'string') {
      return { valid: false, error: "File ID is required for streaming action" };
    }
    if (fileId.length > MAX_LINK_LENGTH) {
      return { valid: false, error: `File ID too long. Maximum ${MAX_LINK_LENGTH} characters` };
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
  
  const { fileId } = body as Record<string, unknown>;
  
  return { 
    valid: true, 
    data: { 
      action, 
      link: link as string | undefined, 
      fileId: fileId as string | undefined,
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

    const { action, link, fileId, magnet, torrentId, torrentFile } = validation.data!;
    console.log("Real-Debrid request (validated):", { action, link: link ? "provided" : "none", fileId: fileId ? "provided" : "none", magnet: magnet ? "provided" : "none", torrentFile: torrentFile ? "provided" : "none" });

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
    };

    let response;
    let data;

    switch (action) {
      case "user":
        // Get user account info
        console.log("Fetching user info...");
        response = await rdFetch(`${RD_API_BASE}/user`, { headers }, REQUEST_TIMEOUT.default);
        data = await response.json();
        console.log("User info response status:", response.status);
        break;

      case "unrestrict":
        // Unrestrict a link to get direct download/streaming URL
        console.log("Unrestricting link...");
        response = await rdFetch(`${RD_API_BASE}/unrestrict/link`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `link=${encodeURIComponent(link!)}`,
        }, REQUEST_TIMEOUT.download);
        data = await response.json();
        console.log("Unrestrict response status:", response.status);
        break;

      case "streaming":
        // Get streaming transcoded links for a file using its ID
        console.log("Getting streaming links for file ID:", fileId);
        response = await rdFetch(`${RD_API_BASE}/streaming/transcode/${encodeURIComponent(fileId!)}`, {
          method: 'GET',
          headers,
        }, REQUEST_TIMEOUT.streaming);
        data = await response.json();
        console.log("Streaming response status:", response.status);
        break;

      case "add_magnet":
        // Add a magnet link
        console.log("Adding magnet...");
        response = await rdFetch(`${RD_API_BASE}/torrents/addMagnet`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `magnet=${encodeURIComponent(magnet!)}`,
        }, REQUEST_TIMEOUT.download);
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
        
        response = await rdFetch(`${RD_API_BASE}/torrents/addTorrent`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: formData,
        }, REQUEST_TIMEOUT.download);
        data = await response.json();
        console.log("Add torrent response status:", response.status);
        break;

      case "select_files":
        // Select all files from a torrent
        console.log("Selecting files for torrent:", torrentId);
        response = await rdFetch(`${RD_API_BASE}/torrents/selectFiles/${torrentId}`, {
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
        response = await rdFetch(`${RD_API_BASE}/torrents/info/${torrentId}`, { headers });
        data = await response.json();
        console.log("Torrent info response status:", response.status);
        break;

      case "torrents":
        // List all torrents
        console.log("Listing torrents...");
        response = await rdFetch(`${RD_API_BASE}/torrents`, { headers });
        data = await response.json();
        console.log("Torrents list response status:", response.status);
        break;

      case "downloads":
        // List download history
        console.log("Listing downloads...");
        response = await rdFetch(`${RD_API_BASE}/downloads`, { headers });
        data = await response.json();
        console.log("Downloads list response status:", response.status);
        break;

      case "hosts":
        // Get supported hosts
        console.log("Fetching supported hosts...");
        response = await rdFetch(`${RD_API_BASE}/hosts`, { headers });
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
      
      // Map Real-Debrid error codes to user-friendly messages
      let userMessage = data.error || "Real-Debrid API error";
      const errorCode = data.error_code;
      
      // For streaming action, wrong_parameter means the file doesn't support transcoding
      // This is not an error - return success with empty links so client uses download URL
      if (action === "streaming" && (data.error === "wrong_parameter" || errorCode === 2)) {
        console.log("File doesn't support streaming transcoding, returning empty result");
        return new Response(JSON.stringify({ streaming_not_supported: true }), {
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        });
      }
      
      if (data.error === "service_unavailable" || errorCode === 25) {
        userMessage = "Real-Debrid servers are temporarily overloaded. Please wait a moment and try again.";
      } else if (data.error === "infringing_file" || errorCode === 35) {
        userMessage = "This content is unavailable due to copyright restrictions. Please try a different stream.";
      } else if (data.error === "hoster_unavailable" || errorCode === 7) {
        userMessage = "The file host is temporarily unavailable. Please try again later or choose a different stream.";
      } else if (data.error === "file_unavailable" || errorCode === 8) {
        userMessage = "The file is no longer available. Please try a different stream.";
      } else if (data.error === "torrent_too_big" || errorCode === 19) {
        userMessage = "This torrent is too large for your account. Please try a smaller file.";
      } else if (data.error === "magnet_conversion" || errorCode === 28) {
        userMessage = "Could not process this magnet link. Please try a different stream.";
      } else if (data.error === "action_already_done" || errorCode === 24) {
        userMessage = "This action was already completed.";
      } else if (data.error === "wrong_parameter" || errorCode === 2) {
        userMessage = "Invalid parameter provided.";
      }
      
      return new Response(
        JSON.stringify({ error: userMessage, details: data }),
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
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const isConnectionError = error instanceof Error && 
      (errorMessage.includes('connection') || errorMessage.includes('http2') || errorMessage.includes('network'));
    
    console.error("Error in real-debrid function:", {
      message: errorMessage,
      isTimeout,
      isConnectionError,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    let userMessage = errorMessage;
    let statusCode = 500;
    
    if (isTimeout) {
      userMessage = "Request timed out. The Real-Debrid API is taking too long to respond. Please try again.";
      statusCode = 504; // Gateway Timeout
    } else if (isConnectionError) {
      userMessage = "Connection error with Real-Debrid. Please try again in a moment.";
      statusCode = 502; // Bad Gateway
    }
    
    return new Response(
      JSON.stringify({ 
        error: userMessage,
        details: { originalError: errorMessage, isTimeout, isConnectionError }
      }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
