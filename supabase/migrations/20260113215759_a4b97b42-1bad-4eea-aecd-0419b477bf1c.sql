-- Drop the existing policies that may not properly restrict anonymous reads
DROP POLICY IF EXISTS "Users can view own watch progress" ON public.watch_progress;
DROP POLICY IF EXISTS "Users can insert own watch progress" ON public.watch_progress;
DROP POLICY IF EXISTS "Users can update own watch progress" ON public.watch_progress;
DROP POLICY IF EXISTS "Users can delete own watch progress" ON public.watch_progress;

-- Create policies that explicitly target authenticated role to prevent anonymous access

-- SELECT: Only authenticated users can view their own watch progress
CREATE POLICY "Users can view own watch progress"
ON public.watch_progress
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- INSERT: Only authenticated users can create their own watch progress
CREATE POLICY "Users can insert own watch progress"
ON public.watch_progress
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Only authenticated users can update their own watch progress
CREATE POLICY "Users can update own watch progress"
ON public.watch_progress
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Only authenticated users can delete their own watch progress
CREATE POLICY "Users can delete own watch progress"
ON public.watch_progress
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);