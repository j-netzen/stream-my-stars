import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting configuration - more restrictive for this admin function
const RATE_LIMIT = {
  maxRequests: 10,      // 10 requests
  windowMs: 60 * 1000,  // per minute
};

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(req: Request): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `categorize:${ip}`;
  
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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Check rate limit
  const rateLimit = checkRateLimit(req);
  if (!rateLimit.allowed) {
    console.warn("Rate limit exceeded for categorize-media function");
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
    console.log("Starting media categorization job...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller's identity using their JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.warn("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with anon key to verify the user's JWT
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    
    if (authError || !user) {
      console.warn("Authentication failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Authenticated user: ${user.id}`);

    // Now use service role client for database operations (bypasses RLS for efficiency)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get only THIS USER's media without a category but with genres
    const { data: uncategorizedMedia, error: fetchError } = await supabase
      .from("media")
      .select("id, user_id, genres, title")
      .eq("user_id", user.id)  // Only process authenticated user's media
      .is("category_id", null)
      .not("genres", "is", null);

    if (fetchError) {
      console.error("Error fetching media:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${uncategorizedMedia?.length || 0} uncategorized media items for user ${user.id}`);

    if (!uncategorizedMedia || uncategorizedMedia.length === 0) {
      return new Response(
        JSON.stringify({ message: "No uncategorized media found", categorized: 0 }),
        { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          } 
        }
      );
    }

    let categorizedCount = 0;
    let createdCategories = 0;

    // Process each media item
    for (const media of uncategorizedMedia) {
      if (!media.genres || media.genres.length === 0) {
        console.log(`Skipping "${media.title}" - no genres`);
        continue;
      }

      const firstGenre = media.genres[0];
      console.log(`Processing "${media.title}" with genre "${firstGenre}"`);

      // Look for existing category
      let { data: existingCategory } = await supabase
        .from("categories")
        .select("id")
        .eq("user_id", media.user_id)
        .ilike("name", firstGenre)
        .maybeSingle();

      let categoryId = existingCategory?.id;

      // Create category if it doesn't exist
      if (!categoryId) {
        console.log(`Creating new category "${firstGenre}" for user ${media.user_id}`);
        const { data: newCategory, error: createError } = await supabase
          .from("categories")
          .insert({
            name: firstGenre,
            user_id: media.user_id,
            description: "Auto-created from genre",
          })
          .select("id")
          .single();

        if (createError) {
          console.error(`Error creating category for "${media.title}":`, createError);
          continue;
        }

        categoryId = newCategory.id;
        createdCategories++;
      }

      // Update media with category
      const { error: updateError } = await supabase
        .from("media")
        .update({ category_id: categoryId })
        .eq("id", media.id);

      if (updateError) {
        console.error(`Error updating media "${media.title}":`, updateError);
        continue;
      }

      console.log(`Categorized "${media.title}" into "${firstGenre}"`);
      categorizedCount++;
    }

    const result = {
      message: "Categorization complete",
      categorized: categorizedCount,
      newCategories: createdCategories,
      total: uncategorizedMedia.length,
    };

    console.log("Job completed:", result);

    return new Response(JSON.stringify(result), {
      headers: { 
        ...corsHeaders, 
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in categorize-media function:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
