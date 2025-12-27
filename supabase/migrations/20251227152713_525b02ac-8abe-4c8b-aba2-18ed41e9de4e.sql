-- Drop any existing SELECT policy if it exists and recreate with proper restrictions
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Create a proper SELECT policy that requires authentication
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.role() = 'authenticated' AND auth.uid() = id);