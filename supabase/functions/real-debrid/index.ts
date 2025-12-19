import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RD_API_BASE = "https://api.real-debrid.com/rest/1.0";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    const { action, link, magnet, torrentId } = await req.json();
    console.log("Real-Debrid request:", { action, link: link ? "provided" : "none", magnet: magnet ? "provided" : "none" });

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
        if (!link) {
          return new Response(
            JSON.stringify({ error: "Link is required for unrestrict action" }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log("Unrestricting link...");
        response = await fetch(`${RD_API_BASE}/unrestrict/link`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `link=${encodeURIComponent(link)}`,
        });
        data = await response.json();
        console.log("Unrestrict response status:", response.status);
        break;

      case "add_magnet":
        // Add a magnet link
        if (!magnet) {
          return new Response(
            JSON.stringify({ error: "Magnet link is required" }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log("Adding magnet...");
        response = await fetch(`${RD_API_BASE}/torrents/addMagnet`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `magnet=${encodeURIComponent(magnet)}`,
        });
        data = await response.json();
        console.log("Add magnet response status:", response.status);
        break;

      case "select_files":
        // Select all files from a torrent
        if (!torrentId) {
          return new Response(
            JSON.stringify({ error: "Torrent ID is required" }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
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
        if (!torrentId) {
          return new Response(
            JSON.stringify({ error: "Torrent ID is required" }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
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
          JSON.stringify({ error: `Unknown action: ${action}` }),
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
