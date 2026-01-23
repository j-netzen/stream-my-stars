import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

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

export function VideoPlayerLazy(props: VideoPlayerLazyProps) {
  return (
    <Suspense fallback={<VideoPlayerLoading />}>
      <VideoPlayerComponent {...props} />
    </Suspense>
  );
}

export default VideoPlayerLazy;
