/**
 * Simple HLS Player (Refactored)
 * 
 * A stable, simple video player that:
 * 1. Shows a poster image with play button on load
 * 2. Goes fullscreen and autoplays when play is clicked
 * 3. Uses HLS.js for streaming support
 * 4. Tracks watch progress and supports resume
 * 5. Includes debug panel for diagnostics
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { X, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Media } from "@/hooks/useMedia";
import { useHlsPlayback } from "./hooks/useHlsPlayback";
import { useProgressTracker } from "./hooks/useProgressTracker";
import { PlayerPosterOverlay } from "./components/PlayerPosterOverlay";
import { PlayerDebugPanel } from "./components/PlayerDebugPanel";
import { NextEpisodeOverlay } from "./components/NextEpisodeOverlay";

interface SimpleHLSPlayerProps {
  media: Media;
  streamUrl: string;
  onClose: () => void;
  onChangeStream?: () => void;
  episodeNumber?: number;
  seasonNumber?: number;
  onPlayNextEpisode?: () => void;
}

export function SimpleHLSPlayer({
  media,
  streamUrl,
  onClose,
  onChangeStream,
  episodeNumber,
  seasonNumber,
  onPlayNextEpisode,
}: SimpleHLSPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitializingRef = useRef(false);
  const currentStreamUrlRef = useRef<string>(streamUrl);

  const [isPlaying, setIsPlaying] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [showUnmutePrompt, setShowUnmutePrompt] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Auto-hide controls after 10 seconds
  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setControlsVisible(false);
      }
    }, 10000);
  }, [isPlaying]);

  // Handle mouse/touch activity
  const handleUserActivity = useCallback(() => {
    resetControlsTimer();
  }, [resetControlsTimer]);

  // Start timer when playback begins, clear on unmount
  useEffect(() => {
    if (isPlaying) {
      resetControlsTimer();
    } else {
      setControlsVisible(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isPlaying, resetControlsTimer]);

  // Determine if this is a TV show with episode context
  const isTVShow = media.media_type === "tv" && episodeNumber !== undefined && seasonNumber !== undefined;

  // Progress tracking
  const {
    resumeTime,
    saveProgress,
    startTracking,
    stopTracking,
    setVideoElement,
  } = useProgressTracker({
    mediaId: media.id,
    episodeNumber,
    seasonNumber,
  });

  // HLS playback
  const {
    videoRef,
    isLoading,
    error,
    retryCount,
    timeoutMessage,
    debugState,
    loadSource,
    cleanup,
    retry,
    updateBufferInfo,
    maxRetryAttempts,
  } = useHlsPlayback({
    onPlaybackStarted: () => {
      setIsPlaying(true);
      startTracking();
    },
    onMutedAutoplay: () => {
      console.log('[SimpleHLSPlayer] Autoplay required muting, showing unmute prompt');
      setShowUnmutePrompt(true);
    },
  });

  // Keep latest callbacks in refs so fullscreen listeners don't re-subscribe on every render.
  // This prevents a render -> effect cleanup -> cleanup() -> state update -> render loop.
  const cleanupRef = useRef(cleanup);
  const stopTrackingRef = useRef(stopTracking);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    cleanupRef.current = cleanup;
  }, [cleanup]);

  useEffect(() => {
    stopTrackingRef.current = stopTracking;
  }, [stopTracking]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Sync video ref with progress tracker (runs once after mount)
  useEffect(() => {
    if (videoRef.current) {
      setVideoElement(videoRef.current);
    }
  }, [setVideoElement]);

  // Update buffer info periodically when playing
  useEffect(() => {
    if (!isPlaying) return;
    
    const interval = setInterval(updateBufferInfo, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, updateBufferInfo]);

  // Lock body scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Fullscreen listener (subscribe once; use refs to access latest callbacks)
  useEffect(() => {
    const onFullscreenChange = () => {
      if (isInitializingRef.current) return;

      if (!document.fullscreenElement) {
        stopTrackingRef.current();
        // Avoid state resets here; the player is about to close/unmount.
        cleanupRef.current(false);
        setIsPlaying(false);
        onCloseRef.current();
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      stopTrackingRef.current();
      cleanupRef.current(false);
    };
  }, []);

  // Seamless stream switching
  useEffect(() => {
    if (streamUrl !== currentStreamUrlRef.current && isPlaying) {
      console.log('[SimpleHLSPlayer] Stream URL changed, switching...');
      currentStreamUrlRef.current = streamUrl;
      cleanup(false);
      loadSource(streamUrl, 0);
    }
  }, [streamUrl, isPlaying, cleanup, loadSource]);

  // Play button handler
  const handlePlayClick = async () => {
    const container = containerRef.current;
    if (!container) return;

    currentStreamUrlRef.current = streamUrl;

    try {
      isInitializingRef.current = true;

      // Start loading immediately while we still have a user gesture, then enter fullscreen.
      // (Some browsers drop autoplay permission if we wait on the fullscreen promise first.)
      loadSource(streamUrl, resumeTime);

      const fullscreenPromise = container.requestFullscreen
        ? container.requestFullscreen()
        : (container as any).webkitRequestFullscreen
          ? (container as any).webkitRequestFullscreen()
          : null;

      await (fullscreenPromise ?? Promise.resolve());

      setTimeout(() => {
        isInitializingRef.current = false;
      }, 100);
    } catch (e) {
      console.error('[SimpleHLSPlayer] Fullscreen/load error:', e);
      isInitializingRef.current = false;
    }
  };

  // Close handler
  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      stopTracking();
      cleanup();
      setIsPlaying(false);
      onClose();
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black overflow-hidden"
      style={{ height: '100vh', width: '100vw' }}
      onMouseMove={handleUserActivity}
      onTouchStart={handleUserActivity}
      onClick={handleUserActivity}
    >
      {/* Close button */}
      <button
        onClick={handleClose}
        className={cn(
          "absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-all duration-500",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Unmute prompt */}
      {showUnmutePrompt && isPlaying && (
        <button
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.muted = false;
              setShowUnmutePrompt(false);
            }
          }}
          className={cn(
            "absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full transition-all duration-500 animate-pulse",
            controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <VolumeX className="w-5 h-5" />
          <span>Tap to unmute</span>
        </button>
      )}

      {/* Debug panel */}
      <PlayerDebugPanel
        debugState={debugState}
        streamUrl={streamUrl}
        isPlaying={isPlaying}
        controlsVisible={controlsVisible}
      />

      {/* Video element */}
      <video
        ref={videoRef}
        className={cn(
          "w-full h-full object-contain",
          (!isPlaying || showNextEpisode) && "hidden"
        )}
        controls
        playsInline
        onPause={saveProgress}
        onEnded={() => {
          stopTracking();
          // Show next episode overlay for TV shows
          if (isTVShow && onPlayNextEpisode) {
            setShowNextEpisode(true);
          }
        }}
        onVolumeChange={(e) => {
          // Hide unmute prompt when user manually unmutes
          if (!e.currentTarget.muted) {
            setShowUnmutePrompt(false);
          }
        }}
      />

      {/* Next Episode Overlay (shown at end of TV episode) */}
      {showNextEpisode && isTVShow && onPlayNextEpisode && (
        <NextEpisodeOverlay
          showTitle={media.title}
          currentSeason={seasonNumber!}
          currentEpisode={episodeNumber!}
          totalEpisodes={media.episodes || undefined}
          onPlayNext={() => {
            setShowNextEpisode(false);
            cleanup();
            onPlayNextEpisode();
          }}
          onClose={handleClose}
        />
      )}

      {/* Poster overlay (shown before playback) */}
      {!isPlaying && !showNextEpisode && (
        <PlayerPosterOverlay
          media={media}
          resumeTime={resumeTime}
          isLoading={isLoading}
          error={error}
          timeoutMessage={timeoutMessage}
          retryCount={retryCount}
          maxRetryAttempts={maxRetryAttempts}
          onPlay={handlePlayClick}
          onRetry={retry}
          onChangeStream={onChangeStream}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
