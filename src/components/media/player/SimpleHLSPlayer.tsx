/**
 * Simple HLS Player
 * 
 * A stable, simple video player that:
 * 1. Shows a poster image with play button on load
 * 2. Goes fullscreen and autoplays when play is clicked
 * 3. Uses HLS.js for streaming support
 * 4. Tracks watch progress and supports resume
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { getImageUrl } from "@/lib/tmdb";
import { Play, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SimpleHLSPlayerProps {
  media: Media;
  streamUrl: string;
  onClose: () => void;
  episodeNumber?: number;
  seasonNumber?: number;
}

export function SimpleHLSPlayer({ 
  media, 
  streamUrl, 
  onClose,
  episodeNumber,
  seasonNumber 
}: SimpleHLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { getProgressForMedia, updateProgress } = useWatchProgress();

  // Get saved progress for this media
  const savedProgress = getProgressForMedia(media.id, episodeNumber, seasonNumber);
  const resumeTime = savedProgress?.progress_seconds || 0;

  // Get poster image
  const posterUrl = media.backdrop_path 
    ? getImageUrl(media.backdrop_path, "original") 
    : media.poster_path 
      ? getImageUrl(media.poster_path, "w500")
      : null;

  // Check if URL is HLS
  const isHLS = streamUrl.includes('.m3u8') || streamUrl.includes('m3u8');

  // Save progress periodically
  const saveProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.paused) return;

    const currentTime = Math.floor(video.currentTime);
    const duration = Math.floor(video.duration) || null;
    const completed = duration ? currentTime >= duration - 30 : false;

    if (currentTime > 10) { // Only save if watched more than 10 seconds
      updateProgress.mutate({
        mediaId: media.id,
        progressSeconds: currentTime,
        durationSeconds: duration || undefined,
        completed,
        episodeNumber,
        seasonNumber,
      });
    }
  }, [media.id, episodeNumber, seasonNumber, updateProgress]);

  // Start progress tracking interval
  const startProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) return;
    progressIntervalRef.current = window.setInterval(saveProgress, 15000); // Save every 15 seconds
  }, [saveProgress]);

  // Stop progress tracking
  const stopProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    saveProgress(); // Save one final time
  }, [saveProgress]);

  // Cleanup HLS instance and video element
  const cleanupHls = useCallback(() => {
    stopProgressTracking();
    
    // Destroy HLS instance first
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    // Reset video element completely
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load(); // Reset the video element state
    }
    
    // Reset player state
    setIsPlaying(false);
    setIsLoading(false);
    setError(null);
  }, [stopProgressTracking]);

  // Exit fullscreen handler
  const handleFullscreenChange = useCallback(() => {
    if (!document.fullscreenElement) {
      cleanupHls();
      onClose();
    }
  }, [cleanupHls, onClose]);

  // Lock body scroll when player is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

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
          // Resume from saved position
          if (resumeTime > 0) {
            video.currentTime = resumeTime;
          }
          video.play()
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
              startProgressTracking();
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
          if (resumeTime > 0) {
            video.currentTime = resumeTime;
          }
          video.play()
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
              startProgressTracking();
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
          if (resumeTime > 0) {
            video.currentTime = resumeTime;
          }
          video.play()
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
              startProgressTracking();
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

  // Format time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return `${hours}h ${remainingMins}m`;
    }
    return `${mins}m ${secs}s`;
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black overflow-hidden"
      style={{ height: '100vh', width: '100vw' }}
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
        onPause={saveProgress}
        onEnded={stopProgressTracking}
      />

      {/* Poster with play button (shown before playback starts) */}
      {!isPlaying && (
        <div 
          className="absolute inset-0 flex flex-col overflow-hidden"
          style={{
            backgroundImage: posterUrl ? `url(${posterUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Gradient overlay - stronger at bottom */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

          {/* Spacer to push content to bottom third */}
          <div className="flex-1" />

          {/* Content - vertically centered in bottom portion */}
          <div className="flex flex-col items-center justify-center pb-[10vh] px-4">
            {/* Title */}
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white text-center mb-4 drop-shadow-lg max-w-2xl">
              {media.title}
            </h2>

            {/* Resume indicator */}
            {resumeTime > 0 && !error && !isLoading && (
              <p className="text-white/70 text-sm mb-3">
                Resume from {formatTime(resumeTime)}
              </p>
            )}

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
                className="group flex items-center justify-center w-20 h-20 bg-primary/90 hover:bg-primary rounded-full transition-all hover:scale-110 shadow-xl"
              >
                <Play className="w-10 h-10 text-primary-foreground fill-current ml-1" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
