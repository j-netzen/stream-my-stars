-- Create a security definer function to safely get own profile data
-- This ensures profile access only happens through controlled means
CREATE OR REPLACE FUNCTION public.get_own_profile()
RETURNS TABLE (
  id uuid,
  display_name text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, display_name, created_at, updated_at
  FROM public.profiles
  WHERE id = auth.uid()
$$;

-- Create a function to safely update own profile
CREATE OR REPLACE FUNCTION public.update_own_profile(new_display_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate input
  IF new_display_name IS NULL OR length(trim(new_display_name)) = 0 THEN
    RAISE EXCEPTION 'Display name cannot be empty';
  END IF;
  
  IF length(new_display_name) > 100 THEN
    RAISE EXCEPTION 'Display name too long (max 100 characters)';
  END IF;

  UPDATE public.profiles
  SET display_name = trim(new_display_name),
      updated_at = now()
  WHERE id = auth.uid();
  
  RETURN FOUND;
END;
$$;

-- Grant execute permissions to authenticated users only
GRANT EXECUTE ON FUNCTION public.get_own_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_profile(text) TO authenticated;

-- Revoke from anon to prevent anonymous access
REVOKE EXECUTE ON FUNCTION public.get_own_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_own_profile(text) FROM anon;