-- Add watch_providers column to store streaming platform info from TMDB
ALTER TABLE public.media 
ADD COLUMN IF NOT EXISTS watch_providers jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.media.watch_providers IS 'JSONB storing streaming providers from TMDB watch/providers API';