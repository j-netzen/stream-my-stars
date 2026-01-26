/**
 * Simple HLS Player
 * 
 * A stable, simple video player that:
 * 1. Shows a poster image with play button on load
 * 2. Goes fullscreen and autoplays when play is clicked
 * 3. Uses HLS.js for streaming support
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { Media } from "@/hooks/useMedia";
import { getImageUrl } from "@/lib/tmdb";
import { Play, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SimpleHLSPlayerProps {
  media: Media;
  streamUrl: string;
  onClose: () => void;
}

export function SimpleHLSPlayer({ media, streamUrl, onClose }: SimpleHLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get poster image
  const posterUrl = media.backdrop_path 
    ? getImageUrl(media.backdrop_path, "original") 
    : media.poster_path 
      ? getImageUrl(media.poster_path, "w500")
      : null;

  // Check if URL is HLS
  const isHLS = streamUrl.includes('.m3u8') || streamUrl.includes('m3u8');

  // Cleanup HLS instance
  const cleanupHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  // Exit fullscreen handler
  const handleFullscreenChange = useCallback(() => {
    if (!document.fullscreenElement) {
      // User exited fullscreen, close the player
      cleanupHls();
      onClose();
    }
  }, [cleanupHls, onClose]);

  useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      cleanupHls();
    };
  }, [handleFullscreenChange, cleanupHls]);

  // Play button handler - enters fullscreen and starts playback
  const handlePlayClick = async () => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    setIsLoading(true);
    setError(null);

    try {
      // Request fullscreen first
      if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if ((container as any).webkitRequestFullscreen) {
        await (container as any).webkitRequestFullscreen();
      }

      // Setup video source
      if (isHLS && Hls.isSupported()) {
        // Use HLS.js
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
        });
        hlsRef.current = hls;

        hls.on(Hls.Events.ERROR, (_event, data) => {
          console.error('[SimpleHLSPlayer] HLS Error:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('[SimpleHLSPlayer] Network error, trying to recover...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('[SimpleHLSPlayer] Media error, trying to recover...');
                hls.recoverMediaError();
                break;
              default:
                setError('Playback error. Try another stream.');
                setIsLoading(false);
                break;
            }
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[SimpleHLSPlayer] Manifest parsed, starting playback');
          video.play()
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
            })
            .catch((e) => {
              console.error('[SimpleHLSPlayer] Play failed:', e);
              setError('Failed to start playback');
              setIsLoading(false);
            });
        });

        hls.loadSource(streamUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play()
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
            })
            .catch((e) => {
              console.error('[SimpleHLSPlayer] Native HLS play failed:', e);
              setError('Failed to start playback');
              setIsLoading(false);
            });
        }, { once: true });
      } else {
        // Direct video source
        video.src = streamUrl;
        video.addEventListener('canplay', () => {
          video.play()
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
            })
            .catch((e) => {
              console.error('[SimpleHLSPlayer] Direct play failed:', e);
              setError('Failed to start playback');
              setIsLoading(false);
            });
        }, { once: true });

        video.addEventListener('error', () => {
          console.error('[SimpleHLSPlayer] Video error:', video.error);
          setError('Source not supported. Try another stream.');
          setIsLoading(false);
        }, { once: true });
      }
    } catch (e) {
      console.error('[SimpleHLSPlayer] Setup error:', e);
      setError('Failed to initialize player');
      setIsLoading(false);
    }
  };

  // Close button handler
  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      cleanupHls();
      onClose();
    }
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
    >
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Video element (hidden until playing) */}
      <video
        ref={videoRef}
        className={cn(
          "w-full h-full object-contain",
          !isPlaying && "hidden"
        )}
        controls
        playsInline
      />

      {/* Poster with play button (shown before playback starts) */}
      {!isPlaying && (
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            backgroundImage: posterUrl ? `url(${posterUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/60" />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center gap-6">
            <h2 className="text-2xl font-bold text-white text-center max-w-lg px-4">
              {media.title}
            </h2>

            {error ? (
              <div className="text-center">
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={handleClose}
                  className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-16 h-16 text-white animate-spin" />
                <p className="text-white/80">Loading stream...</p>
              </div>
            ) : (
              <button
                onClick={handlePlayClick}
                className="group flex items-center justify-center w-24 h-24 bg-primary/90 hover:bg-primary rounded-full transition-all hover:scale-110"
              >
                <Play className="w-12 h-12 text-primary-foreground fill-current ml-1" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
