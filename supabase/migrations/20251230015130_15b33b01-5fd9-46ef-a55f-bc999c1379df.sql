-- Add unique constraint on user_id and channel_id for upsert operations
ALTER TABLE public.livetv_channels 
ADD CONSTRAINT livetv_channels_user_channel_unique UNIQUE (user_id, channel_id);