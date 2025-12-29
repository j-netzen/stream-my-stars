-- Create a table for storing Live TV channels per user
CREATE TABLE public.livetv_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  channel_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  original_url TEXT,
  logo TEXT DEFAULT '',
  channel_group TEXT DEFAULT 'My Channels',
  epg_id TEXT DEFAULT '',
  is_unstable BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, channel_id)
);

-- Enable Row Level Security
ALTER TABLE public.livetv_channels ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own channels" 
ON public.livetv_channels 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own channels" 
ON public.livetv_channels 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own channels" 
ON public.livetv_channels 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own channels" 
ON public.livetv_channels 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_livetv_channels_updated_at
BEFORE UPDATE ON public.livetv_channels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();