import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Enhanced CORS headers for web and mobile apps (Android/iOS)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, accept, origin, x-requested-with, cache-control',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges, content-type',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
};

const REQUEST_TIMEOUT = 30000;

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

// ========== URL VALIDATION ==========
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;

  const ipv4 = host.match(/^\d{1,3}(?:\.\d{1,3}){3}$/);
  if (ipv4) {
    const parts = host.split(".").map((p) => Number(p));
    if (parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }

  if (host.includes(":")) {
    if (host === "::1") return true;
    if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  }

  return false;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.warn('[AUTH] Missing authorization header');
      return createErrorResponse("AUTH_ERROR", "Authorization header required", 401, { code: "MISSING_AUTH" });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[SECRETS] Supabase environment variables not configured");
      return createErrorResponse("CONFIG_ERROR", "Server configuration error", 503, { code: "MISSING_CONFIG", retryable: true });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.warn('[AUTH] Invalid token:', authError?.message);
      return createErrorResponse("AUTH_ERROR", "Invalid or expired token", 401, { code: "INVALID_TOKEN" });
    }

    console.log(`[AUTH] User authenticated: ${user.id.substring(0, 8)}...`);

    const requestUrl = new URL(req.url);
    const targetUrlParam = requestUrl.searchParams.get('url');

    if (!targetUrlParam) {
      return createErrorResponse("VALIDATION_ERROR", "URL parameter required", 400, { code: "MISSING_URL" });
    }

    const decodedUrl = decodeURIComponent(targetUrlParam);

    if (!isValidUrl(decodedUrl)) {
      return createErrorResponse("VALIDATION_ERROR", "Invalid URL format", 400, { code: "INVALID_URL" });
    }

    const targetUrl = new URL(decodedUrl);

    if (isPrivateHost(targetUrl.hostname)) {
      return createErrorResponse("VALIDATION_ERROR", "Private hosts not allowed", 400, { code: "BLOCKED_HOST" });
    }
    
    console.log(`[PROXY] Fetching: ${targetUrl.hostname}${targetUrl.pathname.substring(0, 50)}...`);

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    let response: Response;
    try {
      response = await fetch(decodedUrl, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: {
          'User-Agent': 'MediaHub/1.0 StreamProxy (Android; iOS; Web)',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': targetUrl.origin + '/',
          'Range': req.headers.get('range') || '',
        },
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
      console.error(`[PROXY] Fetch error: ${isTimeout ? 'Timeout' : fetchError}`);
      
      return createErrorResponse(
        isTimeout ? "TIMEOUT" : "FETCH_ERROR",
        isTimeout ? "Request timed out" : "Failed to fetch stream",
        isTimeout ? 504 : 502,
        { retryable: true }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    console.log(`[PROXY] Response: ${response.status} ${response.headers.get('content-type')}`);

    if (!response.ok && response.status !== 206) {
      return createErrorResponse(
        "UPSTREAM_ERROR",
        `Upstream returned ${response.status}`,
        response.status,
        { retryable: response.status >= 500 }
      );
    }

    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    
    // For HLS streams, we need to handle m3u8 playlists specially
    if (contentType.includes('mpegurl') || contentType.includes('m3u8') || decodedUrl.includes('.m3u8')) {
      const text = await response.text();
      
      const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);
      const proxyBase = `${requestUrl.origin}${requestUrl.pathname}?url=`;
      
      const rewrittenText = text.split('\n').map(line => {
        const trimmed = line.trim();
        
        if (trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (match, uri) => {
            const absoluteUri = uri.startsWith('http') ? uri : baseUrl + uri;
            return `URI="${proxyBase}${encodeURIComponent(absoluteUri)}"`;
          });
        }
        
        if (!trimmed || trimmed.startsWith('#')) {
          return line;
        }
        
        const absoluteUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
        return `${proxyBase}${encodeURIComponent(absoluteUrl)}`;
      }).join('\n');
      
      console.log(`[PROXY] Rewrote HLS playlist (${text.split('\n').length} lines)`);
      
      return new Response(rewrittenText, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache',
        },
      });
    }
    
    // For other content (video segments, etc.), stream directly
    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set('Content-Type', contentType);
    
    // Copy relevant headers from upstream
    const contentLength = response.headers.get('Content-Length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }
    
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[PROXY] Fatal error:", errorMessage);

    return new Response(
      JSON.stringify({
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        retryable: true,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
