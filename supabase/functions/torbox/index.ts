import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Enhanced CORS headers for web and mobile apps
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, accept, origin, x-requested-with, cache-control',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges, content-type, x-ratelimit-remaining',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
};

const TORBOX_API_BASE = "https://api.torbox.app/v1/api";

// Request timeout configuration
const REQUEST_TIMEOUT = {
  default: 30000,
  streaming: 45000,
  download: 60000,
};

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60 * 1000,
};

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// ========== INPUT VALIDATION ==========
const VALID_ACTIONS = ["user", "request_download", "add_magnet", "add_torrent", "torrent_info", "torrents", "downloads", "check_cached", "control_torrent"] as const;
const MAGNET_REGEX = /^magnet:\?xt=urn:[a-z0-9]+:[a-z0-9]{32,}/i;
const HASH_REGEX = /^[a-fA-F0-9]{40}$/;
const MAX_MAGNET_LENGTH = 5000;
const MAX_HASHES = 100;

interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: {
    action: string;
    magnet?: string;
    torrentId?: number;
    torrentFile?: string;
    hashes?: string[];
    fileId?: number;
    zipLink?: boolean;
  };
}

function validateTorBoxInput(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: "Invalid request body" };
  }
  
  const { action, magnet, torrentId, torrentFile, hashes, fileId, zipLink } = body as Record<string, unknown>;
  
  if (typeof action !== 'string' || !VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return { valid: false, error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }
  
  if (action === "add_magnet") {
    if (typeof magnet !== 'string') {
      return { valid: false, error: "Magnet link is required for add_magnet action" };
    }
    if (magnet.length > MAX_MAGNET_LENGTH) {
      return { valid: false, error: `Magnet link too long. Maximum ${MAX_MAGNET_LENGTH} characters` };
    }
    if (!MAGNET_REGEX.test(magnet)) {
      return { valid: false, error: "Invalid magnet link format" };
    }
  }
  
  if (action === "add_torrent") {
    if (typeof torrentFile !== 'string') {
      return { valid: false, error: "Torrent file (base64) is required for add_torrent action" };
    }
    if (torrentFile.length > 10 * 1024 * 1024) {
      return { valid: false, error: "Torrent file too large. Maximum 10MB" };
    }
  }
  
  if (["torrent_info", "control_torrent"].includes(action)) {
    if (typeof torrentId !== 'number' && typeof torrentId !== 'string') {
      return { valid: false, error: "Torrent ID is required for this action" };
    }
  }
  
  if (action === "request_download") {
    if (typeof torrentId !== 'number' && typeof torrentId !== 'string') {
      return { valid: false, error: "Torrent ID is required for request_download action" };
    }
    if (typeof fileId !== 'number' && typeof fileId !== 'string') {
      return { valid: false, error: "File ID is required for request_download action" };
    }
  }
  
  if (action === "check_cached") {
    if (!Array.isArray(hashes) || hashes.length === 0) {
      return { valid: false, error: "Hashes array is required for check_cached action" };
    }
    if (hashes.length > MAX_HASHES) {
      return { valid: false, error: `Too many hashes. Maximum ${MAX_HASHES} hashes per request` };
    }
    for (const hash of hashes) {
      if (typeof hash !== 'string' || !HASH_REGEX.test(hash)) {
        return { valid: false, error: "Invalid hash format. Must be 40-character hex string" };
      }
    }
  }
  
  return { 
    valid: true, 
    data: { 
      action, 
      magnet: magnet as string | undefined,
      torrentId: typeof torrentId === 'string' ? parseInt(torrentId, 10) : torrentId as number | undefined,
      torrentFile: torrentFile as string | undefined,
      hashes: hashes as string[] | undefined,
      fileId: typeof fileId === 'string' ? parseInt(fileId, 10) : fileId as number | undefined,
      zipLink: zipLink as boolean | undefined,
    } 
  };
}

// ========== RATE LIMITING ==========
function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

function checkRateLimit(req: Request): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `torbox:${ip}`;
  
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

// Timeout wrapper for fetch
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = REQUEST_TIMEOUT.default): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Fetch with retry logic
async function tbFetch(url: string, options: RequestInit = {}, timeoutMs: number = REQUEST_TIMEOUT.default, maxRetries: number = 3): Promise<Response> {
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      
      if (response.status === 503 && attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.log(`TorBox returned 503, retry ${attempt + 1}/${maxRetries} after ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        lastResponse = response;
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      const errorMsg = lastError.message.toLowerCase();
      const isRetryable = 
        lastError.name === 'AbortError' ||
        errorMsg.includes('connection') ||
        errorMsg.includes('network') ||
        errorMsg.includes('tls') ||
        errorMsg.includes('timeout');
      
      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }
      
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 4000);
      console.log(`Retry ${attempt + 1}/${maxRetries} after ${backoffMs}ms for ${url}`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
  
  if (lastResponse) {
    return lastResponse;
  }
  
  throw lastError || new Error('Unexpected error in tbFetch');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const rateLimit = checkRateLimit(req);
  if (!rateLimit.allowed) {
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
        },
      }
    );
  }

  try {
    const apiKey = Deno.env.get('TORBOX_API_KEY');
    if (!apiKey) {
      console.error("TORBOX_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "TorBox API key not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Validation error", message: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validation = validateTorBoxInput(body);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: "Validation error", message: validation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, magnet, torrentId, torrentFile, hashes, fileId, zipLink } = validation.data!;
    console.log("TorBox request:", { action, hasMagnet: !!magnet, torrentId, hashCount: hashes?.length || 0 });

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
    };

    let response: Response;
    let data: unknown;

    switch (action) {
      case "user":
        console.log("Fetching user info...");
        response = await tbFetch(`${TORBOX_API_BASE}/user/me`, { headers }, REQUEST_TIMEOUT.default);
        data = await response.json();
        break;

      case "request_download":
        console.log("Requesting download link for torrent:", torrentId, "file:", fileId);
        const dlParams = new URLSearchParams({
          token: apiKey,
          torrent_id: String(torrentId),
          file_id: String(fileId),
        });
        if (zipLink) {
          dlParams.append('zip_link', 'true');
        }
        response = await tbFetch(`${TORBOX_API_BASE}/torrents/requestdl?${dlParams}`, { 
          method: 'GET',
          headers 
        }, REQUEST_TIMEOUT.download);
        data = await response.json();
        break;

      case "add_magnet":
        console.log("Adding magnet...");
        const magnetFormData = new FormData();
        magnetFormData.append('magnet', magnet!);
        response = await tbFetch(`${TORBOX_API_BASE}/torrents/createtorrent`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: magnetFormData,
        }, REQUEST_TIMEOUT.download);
        data = await response.json();
        break;

      case "add_torrent":
        console.log("Adding torrent file...");
        const binaryString = atob(torrentFile!);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/x-bittorrent' });
        const torrentFormData = new FormData();
        torrentFormData.append('file', blob, 'torrent.torrent');
        response = await tbFetch(`${TORBOX_API_BASE}/torrents/createtorrent`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: torrentFormData,
        }, REQUEST_TIMEOUT.download);
        data = await response.json();
        break;

      case "torrent_info":
        console.log("Getting torrent info:", torrentId);
        response = await tbFetch(`${TORBOX_API_BASE}/torrents/mylist?id=${torrentId}`, { headers });
        data = await response.json();
        break;

      case "torrents":
        console.log("Listing torrents...");
        response = await tbFetch(`${TORBOX_API_BASE}/torrents/mylist`, { headers });
        data = await response.json();
        break;

      case "downloads":
        console.log("Listing downloads (web downloads)...");
        response = await tbFetch(`${TORBOX_API_BASE}/webdl/mylist`, { headers });
        data = await response.json();
        break;

      case "check_cached":
        console.log("Checking cache availability for", hashes!.length, "hashes...");
        const hashList = hashes!.join(',');
        response = await tbFetch(`${TORBOX_API_BASE}/torrents/checkcached?hash=${encodeURIComponent(hashList)}&format=object`, { headers });
        data = await response.json();
        break;

      case "control_torrent":
        console.log("Controlling torrent:", torrentId);
        const { operation } = body as Record<string, unknown>;
        const controlFormData = new FormData();
        controlFormData.append('torrent_id', String(torrentId));
        controlFormData.append('operation', String(operation || 'reannounce'));
        response = await tbFetch(`${TORBOX_API_BASE}/torrents/controltorrent`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: controlFormData,
        });
        data = response.status === 204 ? { success: true } : await response.json();
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Handle TorBox response format: { success: boolean, data: any, detail?: string }
    const tbData = data as { success?: boolean; data?: unknown; detail?: string; error?: string };
    
    if (!response.ok || tbData.success === false) {
      const errorMsg = tbData.detail || tbData.error || `TorBox API error (${response.status})`;
      console.error("TorBox API error:", errorMsg);
      
      // Map to appropriate HTTP status
      let returnStatus = response.status;
      let skipStream = false;
      
      // Check for content unavailable errors
      if (errorMsg.toLowerCase().includes('not found') || 
          errorMsg.toLowerCase().includes('unavailable') ||
          errorMsg.toLowerCase().includes('expired')) {
        returnStatus = 410; // Gone - signals client to try next stream
        skipStream = true;
      }
      
      // Check for auth errors
      if (response.status === 401 || response.status === 403 || 
          errorMsg.toLowerCase().includes('unauthorized') ||
          errorMsg.toLowerCase().includes('invalid api')) {
        returnStatus = 401;
      }

      return new Response(
        JSON.stringify({ 
          error: errorMsg, 
          details: tbData,
          httpStatus: response.status,
          skipStream,
        }),
        { status: returnStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return the data field from TorBox response
    return new Response(
      JSON.stringify(tbData.data ?? tbData),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("TorBox function error:", errorMessage);
    
    const isTransient = errorMessage.toLowerCase().includes('timeout') ||
                       errorMessage.toLowerCase().includes('connection') ||
                       errorMessage.toLowerCase().includes('network');
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        retryable: isTransient,
      }),
      { status: isTransient ? 503 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
