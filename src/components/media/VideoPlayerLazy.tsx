import React, { lazy, Suspense, useEffect, useState, ComponentType } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { useNativePlayer } from "@/hooks/useNativePlayer";
import { toast } from "sonner";

// Retry wrapper for dynamic imports that handles chunk loading failures
function lazyWithRetry<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>,
  retries = 3,
  delay = 1000
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: Error | null = null;
    
    for (let i = 0; i < retries; i++) {
      try {
        // Add cache-busting on retry attempts
        if (i > 0) {
          console.log(`[VideoPlayerLazy] Retry ${i}/${retries} loading VideoPlayer chunk...`);
          await new Promise(r => setTimeout(r, delay));
        }
        return await importFn();
      } catch (error) {
        lastError = error as Error;
        console.warn(`[VideoPlayerLazy] Chunk load attempt ${i + 1} failed:`, error);
        
        // On failure, try clearing the module from cache and force reload
        if (i < retries - 1 && 'caches' in window) {
          try {
            const cacheNames = await caches.keys();
            for (const name of cacheNames) {
              const cache = await caches.open(name);
              const keys = await cache.keys();
              for (const key of keys) {
                if (key.url.includes('VideoPlayer')) {
                  await cache.delete(key);
                  console.log('[VideoPlayerLazy] Cleared stale cache entry:', key.url);
                }
              }
            }
          } catch (cacheError) {
            console.warn('[VideoPlayerLazy] Cache clear failed:', cacheError);
          }
        }
      }
    }
    
    // All retries failed - offer page reload
    console.error('[VideoPlayerLazy] All chunk load retries failed');
    throw lastError;
  });
}

// Lazy load the VideoPlayer component with retry logic for chunk failures
const VideoPlayerComponent = lazyWithRetry(() => import("./VideoPlayer"));

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

// Error fallback for chunk loading failures
function VideoPlayerError({ onClose, onRetry }: { onClose: () => void; onRetry: () => void }) {
  return (
    <div className="fixed left-0 top-0 z-[100] w-screen h-screen h-[100svh] bg-black flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center p-6 max-w-md">
        <AlertTriangle className="w-12 h-12 text-destructive" />
        <h3 className="text-lg font-semibold text-foreground">Failed to load player</h3>
        <p className="text-muted-foreground text-sm">
          The video player could not be loaded. This may be due to a cached update.
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
          >
            Reload Page
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border text-foreground rounded-md hover:bg-accent transition-colors"
          >
            Close
          </button>
        </div>
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
  const [chunkLoadError, setChunkLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

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

  // Handle chunk load errors
  if (chunkLoadError) {
    return (
      <VideoPlayerError 
        onClose={onClose}
        onRetry={() => {
          setChunkLoadError(false);
          setRetryKey(k => k + 1);
        }}
      />
    );
  }

  // Use web player with Video.js
  return (
    <Suspense fallback={<VideoPlayerLoading />}>
      <ErrorBoundaryForChunk 
        onError={() => setChunkLoadError(true)}
        key={retryKey}
      >
        <VideoPlayerComponent 
          media={media}
          onClose={onClose}
          streamQuality={streamQuality}
          onPlaybackError={onPlaybackError}
        />
      </ErrorBoundaryForChunk>
    </Suspense>
  );
}

// Simple error boundary to catch chunk loading errors
class ErrorBoundaryForChunk extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundaryForChunk] Caught error:', error);
    if (error.message.includes('dynamically imported module') || 
        error.message.includes('Loading chunk') ||
        error.message.includes('Failed to fetch')) {
      this.props.onError();
    }
  }

  render() {
    if (this.state.hasError) {
      return null; // Parent will handle display
    }
    return this.props.children;
  }
}

export default VideoPlayerLazy;
