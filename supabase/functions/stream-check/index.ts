import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, accept, origin',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
  'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges, content-type',
  'Access-Control-Max-Age': '86400',
};

const REQUEST_TIMEOUT_MS = 15000;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;

  // IPv4 checks
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

  // IPv6 checks (basic)
  if (host.includes(":")) {
    if (host === "::1") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique local
    if (host.startsWith("fe80")) return true; // link-local
  }

  return false;
}

function getMixedContentRisk(req: Request, targetUrl: URL): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const appOrigin = new URL(origin);
    return appOrigin.protocol === "https:" && targetUrl.protocol === "http:";
  } catch {
    return false;
  }
}

async function fetchHeadThenRange(url: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (head.status !== 405) return head;

    // Some origins don't support HEAD; do a minimal GET.
    const controller2 = new AbortController();
    const t2 = setTimeout(() => controller2.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { Range: "bytes=0-0" },
        signal: controller2.signal,
      });
    } finally {
      clearTimeout(t2);
    }
  } finally {
    clearTimeout(t);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Validation error", message: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { url } = (body ?? {}) as { url?: unknown };
    if (typeof url !== "string" || url.trim().length === 0 || url.length > 4096) {
      return new Response(
        JSON.stringify({ error: "Validation error", message: "url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: "Validation error", message: "Invalid url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      return new Response(
        JSON.stringify({ error: "Validation error", message: "Only http/https supported" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (isPrivateHost(targetUrl.hostname)) {
      return new Response(
        JSON.stringify({ error: "Validation error", message: "Blocked host" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetchHeadThenRange(targetUrl.toString());

    const contentType = response.headers.get("content-type");
    const allowOrigin = response.headers.get("access-control-allow-origin");

    const result = {
      requestedUrl: targetUrl.toString(),
      finalUrl: response.url,
      status: response.status,
      ok: response.ok,
      contentType,
      cors: {
        allowOrigin,
        allowHeaders: response.headers.get("access-control-allow-headers"),
        allowMethods: response.headers.get("access-control-allow-methods"),
      },
      mixedContentRisk: getMixedContentRisk(req, targetUrl),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Stream check error", message: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
