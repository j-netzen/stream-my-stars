-- Drop the proxy_mode column from livetv_channels
ALTER TABLE public.livetv_channels DROP COLUMN IF EXISTS proxy_mode;