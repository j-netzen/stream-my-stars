-- Drop existing policies and recreate with explicit auth checks

-- CATEGORIES TABLE
DROP POLICY IF EXISTS "Users can CRUD own categories" ON public.categories;
CREATE POLICY "Users can CRUD own categories" ON public.categories
FOR ALL USING (auth.role() = 'authenticated' AND auth.uid() = user_id)
WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- MEDIA TABLE  
DROP POLICY IF EXISTS "Users can CRUD own media" ON public.media;
CREATE POLICY "Users can CRUD own media" ON public.media
FOR ALL USING (auth.role() = 'authenticated' AND auth.uid() = user_id)
WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- PROFILES TABLE
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (auth.role() = 'authenticated' AND auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.role() = 'authenticated' AND auth.uid() = id);

CREATE POLICY "Users can delete own profile" ON public.profiles
FOR DELETE USING (auth.role() = 'authenticated' AND auth.uid() = id);

-- WATCH_PROGRESS TABLE
DROP POLICY IF EXISTS "Users can view own watch progress" ON public.watch_progress;
DROP POLICY IF EXISTS "Users can insert own watch progress" ON public.watch_progress;
DROP POLICY IF EXISTS "Users can update own watch progress" ON public.watch_progress;
DROP POLICY IF EXISTS "Users can delete own watch progress" ON public.watch_progress;

CREATE POLICY "Users can view own watch progress" ON public.watch_progress
FOR SELECT USING (auth.role() = 'authenticated' AND auth.uid() = user_id);

CREATE POLICY "Users can insert own watch progress" ON public.watch_progress
FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

CREATE POLICY "Users can update own watch progress" ON public.watch_progress
FOR UPDATE USING (auth.role() = 'authenticated' AND auth.uid() = user_id);

CREATE POLICY "Users can delete own watch progress" ON public.watch_progress
FOR DELETE USING (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- PLAYLISTS TABLE
DROP POLICY IF EXISTS "Anyone can view public playlists" ON public.playlists;
DROP POLICY IF EXISTS "Users can manage own playlists" ON public.playlists;

CREATE POLICY "Authenticated users can view public playlists" ON public.playlists
FOR SELECT USING (auth.role() = 'authenticated' AND (auth.uid() = user_id OR is_public = true));

CREATE POLICY "Users can manage own playlists" ON public.playlists
FOR ALL USING (auth.role() = 'authenticated' AND auth.uid() = user_id)
WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- PLAYLIST_ITEMS TABLE
DROP POLICY IF EXISTS "Anyone can view public playlist items" ON public.playlist_items;
DROP POLICY IF EXISTS "Users can manage own playlist items" ON public.playlist_items;

CREATE POLICY "Authenticated users can view public playlist items" ON public.playlist_items
FOR SELECT USING (
  auth.role() = 'authenticated' AND 
  EXISTS (
    SELECT 1 FROM playlists 
    WHERE playlists.id = playlist_items.playlist_id 
    AND (playlists.user_id = auth.uid() OR playlists.is_public = true)
  )
);

CREATE POLICY "Users can manage own playlist items" ON public.playlist_items
FOR ALL USING (
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1 FROM playlists 
    WHERE playlists.id = playlist_items.playlist_id 
    AND playlists.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1 FROM playlists 
    WHERE playlists.id = playlist_items.playlist_id 
    AND playlists.user_id = auth.uid()
  )
);