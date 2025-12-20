-- Drop existing policy on watch_progress
DROP POLICY IF EXISTS "Users can CRUD own watch progress" ON public.watch_progress;

-- Create explicit authenticated-only policies for watch_progress
CREATE POLICY "Users can view own watch progress"
ON public.watch_progress
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watch progress"
ON public.watch_progress
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watch progress"
ON public.watch_progress
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own watch progress"
ON public.watch_progress
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);