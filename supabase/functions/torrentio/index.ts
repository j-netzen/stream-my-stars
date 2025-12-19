import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Torrentio base URL - using realdebrid provider
const TORRENTIO_BASE = "https://torrentio.strem.fun";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, imdbId, type, season, episode } = await req.json();
    console.log("Torrentio request:", { action, imdbId, type, season, episode });

    if (action === "search") {
      if (!imdbId || !type) {
        return new Response(
          JSON.stringify({ error: "IMDB ID and type are required" }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get Real-Debrid API key for authenticated streams
      const rdApiKey = Deno.env.get('REAL_DEBRID_API_KEY');
      
      // Build the stream ID - for series, include season:episode
      let streamId = imdbId;
      if (type === "series" && season !== undefined && episode !== undefined) {
        streamId = `${imdbId}:${season}:${episode}`;
      }
      
      // Build Torrentio URL with Real-Debrid provider if available
      let torrentioUrl: string;
      if (rdApiKey) {
        // Use realdebrid provider for direct streaming links
        torrentioUrl = `${TORRENTIO_BASE}/realdebrid=${rdApiKey}/stream/${type}/${streamId}.json`;
      } else {
        // Fallback to regular torrents (magnet links)
        torrentioUrl = `${TORRENTIO_BASE}/stream/${type}/${streamId}.json`;
      }

      console.log("Fetching from Torrentio:", torrentioUrl.replace(rdApiKey || '', '***'));
      const response = await fetch(torrentioUrl);
      
      if (!response.ok) {
        console.error("Torrentio API error:", response.status);
        return new Response(
          JSON.stringify({ error: "Failed to fetch streams", status: response.status }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      console.log(`Found ${data.streams?.length || 0} streams`);

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
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
