import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting media categorization job...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all media without a category but with genres
    const { data: uncategorizedMedia, error: fetchError } = await supabase
      .from("media")
      .select("id, user_id, genres, title")
      .is("category_id", null)
      .not("genres", "is", null);

    if (fetchError) {
      console.error("Error fetching media:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${uncategorizedMedia?.length || 0} uncategorized media items`);

    if (!uncategorizedMedia || uncategorizedMedia.length === 0) {
      return new Response(
        JSON.stringify({ message: "No uncategorized media found", categorized: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
