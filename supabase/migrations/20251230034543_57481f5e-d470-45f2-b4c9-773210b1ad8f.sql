-- Add proxy_mode column to livetv_channels
-- Values: null (auto/default), 'direct', 'proxy', 'spoof'
ALTER TABLE public.livetv_channels 
ADD COLUMN proxy_mode text DEFAULT NULL;