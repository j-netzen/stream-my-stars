-- Drop the existing policy that allows unauthenticated reads
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Create updated policy that requires authentication
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING ((auth.role() = 'authenticated'::text) AND (auth.uid() = id));