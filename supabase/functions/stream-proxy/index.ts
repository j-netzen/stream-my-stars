import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing url parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode the URL if it's encoded
    const decodedUrl = decodeURIComponent(targetUrl);
    
    console.log(`Proxying stream: ${decodedUrl}`);

    // Forward the request to the target URL
    const response = await fetch(decodedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': new URL(decodedUrl).origin + '/',
      },
    });

    if (!response.ok) {
      console.error(`Upstream error: ${response.status} ${response.statusText}`);
      return new Response(
        JSON.stringify({ error: `Upstream server returned ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the content type from the upstream response
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    
    // For HLS streams, we need to handle m3u8 playlists specially
    if (contentType.includes('mpegurl') || contentType.includes('m3u8') || decodedUrl.includes('.m3u8')) {
      const text = await response.text();
      
      // Get the base URL for relative paths in the playlist
      const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);
      const proxyBase = `${url.origin}${url.pathname}?url=`;
      
      // Rewrite URLs in the playlist to go through proxy
      const rewrittenText = text.split('\n').map(line => {
        const trimmed = line.trim();
        
        // Skip empty lines and comments (but not URI in comments)
        if (!trimmed || (trimmed.startsWith('#') && !trimmed.includes('URI='))) {
          // Handle URI= in #EXT-X-KEY or other tags
          if (trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
              const absoluteUri = uri.startsWith('http') ? uri : baseUrl + uri;
              return `URI="${proxyBase}${encodeURIComponent(absoluteUri)}"`;
            });
          }
          return line;
        }
        
        // Handle segment URLs
        if (!trimmed.startsWith('#')) {
          const absoluteUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
          return `${proxyBase}${encodeURIComponent(absoluteUrl)}`;
        }
        
        return line;
      }).join('\n');
      
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
    console.error('Proxy error:', error);
    const message = error instanceof Error ? error.message : 'Proxy failed';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
