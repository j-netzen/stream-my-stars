import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges, content-type",
};

const REQUEST_TIMEOUT_MS = 30000;

// High ceiling to avoid breaking normal HLS segment fetching.
const RATE_LIMIT = {
  maxRequests: 4000,
  windowMs: 60 * 1000,
};
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(req: Request): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `streamproxy:${ip}`;

  let entry = rateLimitStore.get(key);
  if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + RATE_LIMIT.windowMs };

  entry.count++;
  rateLimitStore.set(key, entry);

  const remaining = Math.max(0, RATE_LIMIT.maxRequests - entry.count);
  const allowed = entry.count <= RATE_LIMIT.maxRequests;

  return { allowed, remaining, retryAfterMs: allowed ? undefined : entry.resetAt - now };
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;

  const ipv4 = host.match(/^\d{1,3}(?:\.\d{1,3}){3}$/);
  if (ipv4) {
    const parts = host.split(".").map((p) => Number(p));
    if (parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }

  if (host.includes(":")) {
    if (host === "::1") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true;
    if (host.startsWith("fe80")) return true;
  }

  return false;
}

function isProbablyPlaylist(contentType: string | null, targetUrl: URL): boolean {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("application/vnd.apple.mpegurl")) return true;
  if (ct.includes("application/x-mpegurl")) return true;
  if (ct.includes("audio/mpegurl")) return true;
  if (ct.includes("vnd.apple.mpegurl")) return true;
  return targetUrl.pathname.toLowerCase().endsWith(".m3u8");
}

function rewritePlaylist(playlist: string, baseUrl: string, proxyPrefix: string): string {
  const base = new URL(baseUrl);

  const rewriteUri = (raw: string): string => {
    try {
      const resolved = new URL(raw, base).toString();
      return `${proxyPrefix}${encodeURIComponent(resolved)}`;
    } catch {
      return raw;
    }
  };

  return playlist
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // Rewrite URI="..." anywhere it appears (KEY, MAP, MEDIA, I-FRAME, etc.)
      if (trimmed.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${rewriteUri(uri)}"`);
      }

      if (trimmed.startsWith("#")) return line;

      // Regular segment / playlist URI line
      return rewriteUri(trimmed);
    })
    .join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const rateLimit = checkRateLimit(req);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded", retryAfterMs: rateLimit.retryAfterMs }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil((rateLimit.retryAfterMs || 0) / 1000)),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      },
    );
  }

  const requestUrl = new URL(req.url);
  const raw = requestUrl.searchParams.get("url");
  const mode = (requestUrl.searchParams.get("mode") || "passthrough").toLowerCase();

  if (!raw || raw.length > 4096) {
    return new Response(JSON.stringify({ error: "Validation error", message: "Missing url" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(raw);
  } catch {
    return new Response(JSON.stringify({ error: "Validation error", message: "Invalid url" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return new Response(JSON.stringify({ error: "Validation error", message: "Only http/https supported" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (isPrivateHost(targetUrl.hostname)) {
    return new Response(JSON.stringify({ error: "Validation error", message: "Blocked host" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[stream-proxy]", {
    mode,
    method: req.method,
    requestedUrl: targetUrl.toString(),
  });

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstreamHeaders: Record<string, string> = {};

    // Forward range/accept for segments + playlists
    const range = req.headers.get("range");
    if (range) upstreamHeaders["range"] = range;

    const accept = req.headers.get("accept");
    if (accept) upstreamHeaders["accept"] = accept;

    // Spoof / forward headers commonly required by IPTV/CDN origins
    const uaFromClient = req.headers.get("user-agent");
    const acceptLanguage = req.headers.get("accept-language");

    const DEFAULT_UA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

    upstreamHeaders["user-agent"] = uaFromClient || DEFAULT_UA;

    const targetOrigin = `${targetUrl.protocol}//${targetUrl.host}`;

    if (mode === "spoof") {
      upstreamHeaders["referer"] = `${targetOrigin}/`;
      upstreamHeaders["origin"] = targetOrigin;
    } else {
      // Pass through where possible, but default to target origin (many IPTV servers require this)
      const referer = req.headers.get("referer");
      const origin = req.headers.get("origin");
      upstreamHeaders["referer"] = referer || `${targetOrigin}/`;
      upstreamHeaders["origin"] = origin || targetOrigin;
    }

    if (acceptLanguage) upstreamHeaders["accept-language"] = acceptLanguage;
    upstreamHeaders["cache-control"] = "no-cache";
    upstreamHeaders["pragma"] = "no-cache";

    const response = await fetch(targetUrl.toString(), {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type");

    console.log("[stream-proxy] upstream", {
      status: response.status,
      ok: response.ok,
      contentType,
      finalUrl: response.url,
    });

    const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || requestUrl.host;
    const publicPath = requestUrl.pathname.includes("/functions/v1/")
      ? requestUrl.pathname
      : `/functions/v1${requestUrl.pathname}`;

    const modePrefix = mode ? `mode=${encodeURIComponent(mode)}&` : "";
    const selfPrefix = `${forwardedProto}://${forwardedHost}${publicPath}?${modePrefix}url=`;

    if (req.method !== "HEAD" && isProbablyPlaylist(contentType, new URL(response.url))) {
      const text = await response.text();
      if (text.startsWith("#EXTM3U")) {
        const rewritten = rewritePlaylist(text, response.url, selfPrefix);
        return new Response(rewritten, {
          status: response.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-store",
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        });
      }
    }

    // Pass-through (segments, keys, etc.)
    const passthroughHeaders = new Headers(corsHeaders);
    if (contentType) passthroughHeaders.set("Content-Type", contentType);

    const cl = response.headers.get("content-length");
    if (cl) passthroughHeaders.set("Content-Length", cl);

    const cr = response.headers.get("content-range");
    if (cr) passthroughHeaders.set("Content-Range", cr);

    const ar = response.headers.get("accept-ranges");
    if (ar) passthroughHeaders.set("Accept-Ranges", ar);

    passthroughHeaders.set("X-RateLimit-Remaining", String(rateLimit.remaining));

    return new Response(response.body, {
      status: response.status,
      headers: passthroughHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Stream proxy error", message: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } finally {
    clearTimeout(t);
  }
});
