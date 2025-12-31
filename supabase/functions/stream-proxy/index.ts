import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.log('Stream proxy: Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the JWT using Supabase auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.log('Stream proxy: Invalid or expired token', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Stream proxy: Authenticated user ${user.id}`);

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
      const proxyBase = `${url.origin}/functions/v1/stream-proxy?url=`;
      
      // Rewrite URLs in the playlist to go through proxy
      const rewrittenText = text.split('\n').map(line => {
        const trimmed = line.trim();
        
        // Handle URI= in any tag (like #EXT-X-MEDIA, #EXT-X-KEY, etc.)
        if (trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (match, uri) => {
            const absoluteUri = uri.startsWith('http') ? uri : baseUrl + uri;
            return `URI="${proxyBase}${encodeURIComponent(absoluteUri)}"`;
          });
        }
        
        // Skip empty lines and comment-only lines
        if (!trimmed || trimmed.startsWith('#')) {
          return line;
        }
        
        // Handle segment URLs (non-comment, non-empty lines)
        const absoluteUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
        return `${proxyBase}${encodeURIComponent(absoluteUrl)}`;
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
