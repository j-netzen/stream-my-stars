-- Remove conflicting SELECT policies and keep a single clear policy
-- The profiles table only contains: id, display_name, created_at, updated_at (all non-sensitive)

-- Drop the old restrictive policy that conflicts with the permissive one
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Drop the permissive policy we just created
DROP POLICY IF EXISTS "Authenticated users can view public profile fields" ON public.profiles;

-- Create a single clear policy: authenticated users can view all profiles for social features
-- This is appropriate since the table only contains non-sensitive data (display_name)
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);