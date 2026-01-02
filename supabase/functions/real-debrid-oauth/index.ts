import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RD_OAUTH_BASE = "https://api.real-debrid.com/oauth/v2";
const OPEN_SOURCE_CLIENT_ID = "X245A4XAIBGVM";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, device_code, client_id, client_secret, refresh_token } = await req.json();

    let response: Response;

    switch (action) {
      case "device_code":
        // Phase 1: Request device code
        response = await fetch(
          `${RD_OAUTH_BASE}/device/code?client_id=${OPEN_SOURCE_CLIENT_ID}&new_credentials=yes`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
          }
        );
        break;

      case "credentials":
        // Phase 3: Poll for credentials
        if (!device_code) {
          return new Response(
            JSON.stringify({ error: "device_code required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        response = await fetch(
          `${RD_OAUTH_BASE}/device/credentials?client_id=${OPEN_SOURCE_CLIENT_ID}&code=${device_code}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
          }
        );
        break;

      case "token":
        // Phase 4: Exchange for tokens
        if (!client_id || !client_secret || !device_code) {
          return new Response(
            JSON.stringify({ error: "client_id, client_secret, and device_code required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const tokenParams = new URLSearchParams({
          client_id,
          client_secret,
          code: device_code,
          grant_type: "http://oauth.net/grant_type/device/1.0",
        });
        response = await fetch(`${RD_OAUTH_BASE}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: tokenParams.toString(),
        });
        break;

      case "refresh":
        // Refresh token
        if (!client_id || !client_secret || !refresh_token) {
          return new Response(
            JSON.stringify({ error: "client_id, client_secret, and refresh_token required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const refreshParams = new URLSearchParams({
          client_id,
          client_secret,
          code: refresh_token,
          grant_type: "http://oauth.net/grant_type/device/1.0",
        });
        response = await fetch(`${RD_OAUTH_BASE}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: refreshParams.toString(),
        });
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const data = await response.text();
    
    return new Response(data, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Real-Debrid OAuth error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
