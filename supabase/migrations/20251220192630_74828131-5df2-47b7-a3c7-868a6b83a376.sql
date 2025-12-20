-- Add policy to allow authenticated users to view public profile fields (display_name)
-- This enables social features like shared playlists showing owner names

CREATE POLICY "Authenticated users can view public profile fields"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Note: The profiles table only contains id, display_name, created_at, updated_at
-- All of these are safe to expose publicly for social features