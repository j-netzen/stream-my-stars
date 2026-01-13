-- Drop the existing ALL policy that may not properly restrict anonymous reads
DROP POLICY IF EXISTS "Users can CRUD own categories" ON public.categories;

-- Create separate policies for each operation to properly restrict access

-- SELECT: Only authenticated users can view their own categories
CREATE POLICY "Users can view own categories"
ON public.categories
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- INSERT: Only authenticated users can create their own categories
CREATE POLICY "Users can create own categories"
ON public.categories
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Only authenticated users can update their own categories
CREATE POLICY "Users can update own categories"
ON public.categories
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Only authenticated users can delete their own categories
CREATE POLICY "Users can delete own categories"
ON public.categories
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);