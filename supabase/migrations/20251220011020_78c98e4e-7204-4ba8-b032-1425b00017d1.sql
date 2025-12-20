-- Drop existing policy on playlists
DROP POLICY IF EXISTS "Users can CRUD own playlists" ON public.playlists;

-- Create separate policies for playlists

-- Owners can do everything with their own playlists
CREATE POLICY "Users can manage own playlists"
ON public.playlists
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Anyone authenticated can view public playlists
CREATE POLICY "Anyone can view public playlists"
ON public.playlists
FOR SELECT
TO authenticated
USING (is_public = true);

-- Drop existing policy on playlist_items
DROP POLICY IF EXISTS "Users can CRUD own playlist items" ON public.playlist_items;

-- Owners can manage their own playlist items
CREATE POLICY "Users can manage own playlist items"
ON public.playlist_items
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM playlists
  WHERE playlists.id = playlist_items.playlist_id
  AND playlists.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM playlists
  WHERE playlists.id = playlist_items.playlist_id
  AND playlists.user_id = auth.uid()
));

-- Anyone authenticated can view items from public playlists
CREATE POLICY "Anyone can view public playlist items"
ON public.playlist_items
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM playlists
  WHERE playlists.id = playlist_items.playlist_id
  AND playlists.is_public = true
));