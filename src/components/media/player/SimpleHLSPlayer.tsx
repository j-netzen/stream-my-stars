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
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Media } from "@/hooks/useMedia";
import { useHlsPlayback } from "./hooks/useHlsPlayback";
import { useProgressTracker } from "./hooks/useProgressTracker";
import { PlayerPosterOverlay } from "./components/PlayerPosterOverlay";
import { PlayerDebugPanel } from "./components/PlayerDebugPanel";

interface SimpleHLSPlayerProps {
  media: Media;
  streamUrl: string;
  onClose: () => void;
  onChangeStream?: () => void;
  episodeNumber?: number;
  seasonNumber?: number;
}

export function SimpleHLSPlayer({
  media,
  streamUrl,
  onClose,
  onChangeStream,
  episodeNumber,
  seasonNumber,
}: SimpleHLSPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitializingRef = useRef(false);
  const currentStreamUrlRef = useRef<string>(streamUrl);

  const [isPlaying, setIsPlaying] = useState(false);

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
  });

  // Sync video ref with progress tracker
  useEffect(() => {
    setVideoElement(videoRef.current);
  }, [videoRef.current, setVideoElement]);

  // Update buffer info periodically when playing
  useEffect(() => {
    if (!isPlaying) return;
    
    const interval = setInterval(updateBufferInfo, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, updateBufferInfo]);

  // Exit fullscreen handler
  const handleFullscreenChange = useCallback(() => {
    if (isInitializingRef.current) return;
    if (!document.fullscreenElement) {
      stopTracking();
      cleanup();
      setIsPlaying(false);
      onClose();
    }
  }, [cleanup, stopTracking, onClose]);

  // Lock body scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Fullscreen listener
  useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      stopTracking();
      cleanup();
    };
  }, [handleFullscreenChange, cleanup, stopTracking]);

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
      
      if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if ((container as any).webkitRequestFullscreen) {
        await (container as any).webkitRequestFullscreen();
      }
      
      setTimeout(() => {
        isInitializingRef.current = false;
      }, 100);

      loadSource(streamUrl, resumeTime);
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
    >
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Debug panel */}
      <PlayerDebugPanel
        debugState={debugState}
        streamUrl={streamUrl}
        isPlaying={isPlaying}
      />

      {/* Video element */}
      <video
        ref={videoRef}
        className={cn(
          "w-full h-full object-contain",
          !isPlaying && "hidden"
        )}
        controls
        playsInline
        onPause={saveProgress}
        onEnded={stopTracking}
      />

      {/* Poster overlay (shown before playback) */}
      {!isPlaying && (
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
