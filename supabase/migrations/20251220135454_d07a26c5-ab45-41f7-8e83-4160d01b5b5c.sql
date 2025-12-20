-- Drop the existing SELECT policy and recreate with proper authentication check
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Create new SELECT policy that requires authentication AND limits to own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.role() = 'authenticated' AND auth.uid() = id);