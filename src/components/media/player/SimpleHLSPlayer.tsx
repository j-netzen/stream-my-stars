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
  onChangeStream?: () => void; // Callback to open stream selection
  episodeNumber?: number;
  seasonNumber?: number;
}

const LOAD_TIMEOUT_MS = 25000; // 25 second timeout
const MAX_RETRY_ATTEMPTS = 3;

export function SimpleHLSPlayer({ 
  media, 
  streamUrl, 
  onClose,
  onChangeStream,
  episodeNumber,
  seasonNumber 
}: SimpleHLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const loadTimeoutRef = useRef<number | null>(null);
  const currentStreamUrlRef = useRef<string>(streamUrl);
  const isInitializingRef = useRef(false); // Guard against fullscreen race condition
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [timeoutMessage, setTimeoutMessage] = useState<string | null>(null);

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

  // Clear load timeout
  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  // Cleanup HLS instance and video element
  const cleanupHls = useCallback((resetState = true) => {
    stopProgressTracking();
    clearLoadTimeout();
    
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
    if (resetState) {
      setIsPlaying(false);
      setIsLoading(false);
      setError(null);
      setTimeoutMessage(null);
    }
  }, [stopProgressTracking, clearLoadTimeout]);

  // Exit fullscreen handler - only cleanup when exiting, not during initialization
  const handleFullscreenChange = useCallback(() => {
    // Skip if we're in the middle of initializing (entering fullscreen)
    if (isInitializingRef.current) {
      return;
    }
    // Only cleanup when exiting fullscreen (not when entering)
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

  // Start load timeout
  const startLoadTimeout = useCallback(() => {
    clearLoadTimeout();
    loadTimeoutRef.current = window.setTimeout(() => {
      if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
        console.log(`[SimpleHLSPlayer] Load timeout, retrying (${retryCount + 1}/${MAX_RETRY_ATTEMPTS})...`);
        setTimeoutMessage(`Stream taking too long. Retrying (${retryCount + 2}/${MAX_RETRY_ATTEMPTS})...`);
        setRetryCount(prev => prev + 1);
        // Trigger retry by cleaning up and restarting
        cleanupHls(false);
        setIsLoading(true);
      } else {
        console.error('[SimpleHLSPlayer] Load timeout after all retries');
        setTimeoutMessage(null);
        setError('Stream failed to load. The source may be unavailable or too slow.');
        setIsLoading(false);
      }
    }, LOAD_TIMEOUT_MS);
  }, [clearLoadTimeout, retryCount, cleanupHls]);

  // Core playback initialization (extracted for reuse)
  const initializePlayback = useCallback(async (url: string, enterFullscreen = false) => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    console.log('[SimpleHLSPlayer] Initializing playback for:', url);
    
    setIsLoading(true);
    setError(null);
    setTimeoutMessage(null);
    currentStreamUrlRef.current = url;

    // Start timeout for this load attempt
    startLoadTimeout();

    try {
      // Request fullscreen if needed
      if (enterFullscreen && !document.fullscreenElement) {
        isInitializingRef.current = true; // Guard against fullscreenchange handler
        try {
          if (container.requestFullscreen) {
            await container.requestFullscreen();
          } else if ((container as any).webkitRequestFullscreen) {
            await (container as any).webkitRequestFullscreen();
          }
        } finally {
          // Small delay to ensure fullscreen is stable before clearing guard
          setTimeout(() => {
            isInitializingRef.current = false;
          }, 100);
        }
      }

      const urlIsHLS = url.includes('.m3u8') || url.includes('m3u8');

      // Setup video source
      if (urlIsHLS && Hls.isSupported()) {
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
                clearLoadTimeout();
                setError('Playback error. Try another stream.');
                setIsLoading(false);
                break;
            }
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[SimpleHLSPlayer] Manifest parsed, starting playback');
          clearLoadTimeout();
          // Resume from saved position
          if (resumeTime > 0) {
            video.currentTime = resumeTime;
          }
          video.play()
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
              setTimeoutMessage(null);
              setRetryCount(0);
              startProgressTracking();
            })
            .catch((e) => {
              console.error('[SimpleHLSPlayer] Play failed:', e);
              setError('Failed to start playback');
              setIsLoading(false);
            });
        });

        hls.loadSource(url);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          clearLoadTimeout();
          if (resumeTime > 0) {
            video.currentTime = resumeTime;
          }
          video.play()
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
              setTimeoutMessage(null);
              setRetryCount(0);
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
        video.src = url;
        video.addEventListener('canplay', () => {
          clearLoadTimeout();
          if (resumeTime > 0) {
            video.currentTime = resumeTime;
          }
          video.play()
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
              setTimeoutMessage(null);
              setRetryCount(0);
              startProgressTracking();
            })
            .catch((e) => {
              console.error('[SimpleHLSPlayer] Direct play failed:', e);
              setError('Failed to start playback');
              setIsLoading(false);
            });
        }, { once: true });

        video.addEventListener('error', () => {
          clearLoadTimeout();
          console.error('[SimpleHLSPlayer] Video error:', video.error);
          setError('Source not supported. Try another stream.');
          setIsLoading(false);
        }, { once: true });
      }
    } catch (e) {
      clearLoadTimeout();
      console.error('[SimpleHLSPlayer] Setup error:', e);
      setError('Failed to initialize player');
      setIsLoading(false);
    }
  }, [resumeTime, startProgressTracking, startLoadTimeout, clearLoadTimeout]);

  // Handle retry after timeout
  useEffect(() => {
    if (retryCount > 0 && isLoading) {
      initializePlayback(currentStreamUrlRef.current, false);
    }
  }, [retryCount]);

  // Seamless stream switching - watch for streamUrl changes
  useEffect(() => {
    if (streamUrl !== currentStreamUrlRef.current && isPlaying) {
      console.log('[SimpleHLSPlayer] Stream URL changed, switching...');
      cleanupHls(false);
      setRetryCount(0);
      initializePlayback(streamUrl, false);
    }
  }, [streamUrl, isPlaying, cleanupHls, initializePlayback]);

  // Play button handler - enters fullscreen and starts playback
  const handlePlayClick = async () => {
    setRetryCount(0);
    await initializePlayback(streamUrl, true);
  };

  // Retry handler
  const handleRetry = async () => {
    setRetryCount(0);
    setError(null);
    await initializePlayback(currentStreamUrlRef.current, false);
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
          {/* Gradient overlay - stronger at bottom (must not block clicks) */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

          {/* Spacer to push content to bottom third */}
          <div className="flex-1" />

          {/* Content - vertically centered in bottom portion */}
          <div className="relative z-10 flex flex-col items-center justify-center pb-[10vh] px-4">
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
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleRetry}
                    className="px-6 py-3 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg transition-colors"
                  >
                    Retry
                  </button>
                  {onChangeStream && (
                    <button
                      onClick={onChangeStream}
                      className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
                    >
                      Try Another Stream
                    </button>
                  )}
                  <button
                    onClick={handleClose}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-16 h-16 text-white animate-spin" />
                <p className="text-white/80">
                  {timeoutMessage || 'Loading stream...'}
                </p>
                {retryCount > 0 && (
                  <p className="text-white/60 text-sm">
                    Attempt {retryCount + 1} of {MAX_RETRY_ATTEMPTS}
                  </p>
                )}
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
