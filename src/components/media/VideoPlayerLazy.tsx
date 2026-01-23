import { lazy, Suspense, useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { useNativePlayer } from "@/hooks/useNativePlayer";
import { toast } from "sonner";

// Lazy load the VideoPlayer component with video.js
const VideoPlayerComponent = lazy(() => import("./VideoPlayer"));

interface Media {
  id: string;
  title: string;
  source_url?: string | null;
  backdrop_path?: string | null;
  poster_path?: string | null;
}

export interface StreamQualityInfo {
  quality: string;
  size?: string;
  qualityRank?: number;
}

interface VideoPlayerLazyProps {
  media: Media;
  onClose: () => void;
  streamQuality?: StreamQualityInfo;
  onPlaybackError?: () => void;
}

// Loading fallback component
function VideoPlayerLoading() {
  return (
    <div className="fixed left-0 top-0 z-[100] w-screen h-screen h-[100svh] bg-black flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground text-sm">Loading player...</p>
      </div>
    </div>
  );
}

/**
 * VideoPlayerLazy - Smart player selector that routes to native VLC or web player
 * 
 * On native Capacitor platforms with VLC available:
 * - Automatically uses VLC for MKV, AVI, and streams with DTS/TrueHD audio
 * - Falls back to web player for standard formats
 * 
 * In browser:
 * - Uses Video.js web player
 * - Shows compatibility warnings for problematic formats
 */
export function VideoPlayerLazy(props: VideoPlayerLazyProps) {
  const { media, onClose, streamQuality, onPlaybackError } = props;
  const { 
    isNativePlatform, 
    isVLCAvailable, 
    shouldUseNativePlayer, 
    playWithVLC, 
    getCompatibilityWarning 
  } = useNativePlayer();
  
  const [useNativeVLC, setUseNativeVLC] = useState(false);
  const [isNativePlayerActive, setIsNativePlayerActive] = useState(false);

  // Determine player type on mount
  useEffect(() => {
    if (media.source_url && isNativePlatform && isVLCAvailable) {
      const shouldUseNative = shouldUseNativePlayer(media.source_url);
      setUseNativeVLC(shouldUseNative);
      
      if (shouldUseNative) {
        console.log('[VideoPlayerLazy] Using native VLC player for:', media.title);
      }
    }
  }, [media.source_url, isNativePlatform, isVLCAvailable, shouldUseNativePlayer, media.title]);

  // Show compatibility warning in browser for problematic formats
  useEffect(() => {
    if (!isNativePlatform && media.source_url) {
      const warning = getCompatibilityWarning(media.source_url);
      if (warning) {
        toast.warning(warning, {
          icon: <AlertTriangle className="w-4 h-4" />,
          duration: 6000,
        });
      }
    }
  }, [media.source_url, isNativePlatform, getCompatibilityWarning]);

  // Handle native VLC playback
  useEffect(() => {
    if (useNativeVLC && media.source_url && !isNativePlayerActive) {
      setIsNativePlayerActive(true);
      
      playWithVLC({
        url: media.source_url,
        title: media.title,
        aspectRatio: 'fit',
      })
        .then((result) => {
          console.log('[VideoPlayerLazy] VLC playback result:', result);
          onClose();
        })
        .catch((error) => {
          console.error('[VideoPlayerLazy] VLC playback failed:', error);
          toast.error('Native player failed. Trying web player...');
          // Fall back to web player
          setUseNativeVLC(false);
          setIsNativePlayerActive(false);
        });
    }
  }, [useNativeVLC, media.source_url, media.title, isNativePlayerActive, playWithVLC, onClose]);

  // If using native VLC, show loading state while it launches
  if (useNativeVLC) {
    return (
      <div className="fixed left-0 top-0 z-[100] w-screen h-screen h-[100svh] bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-muted-foreground text-sm">Launching native player...</p>
        </div>
      </div>
    );
  }

  // Use web player with Video.js
  return (
    <Suspense fallback={<VideoPlayerLoading />}>
      <VideoPlayerComponent 
        media={media}
        onClose={onClose}
        streamQuality={streamQuality}
        onPlaybackError={onPlaybackError}
      />
    </Suspense>
  );
}

export default VideoPlayerLazy;
