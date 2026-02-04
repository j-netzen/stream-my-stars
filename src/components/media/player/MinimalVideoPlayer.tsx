/**
 * Minimal Video Player
 * 
 * The most basic video player possible:
 * - HTML5 video element
 * - Native browser controls
 * - Fullscreen support
 * - Watch progress tracking
 */

import { useRef, useEffect, useCallback, useState } from "react";
import { Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { usePlaybackSettings } from "@/hooks/usePlaybackSettings";
import { getImageUrl } from "@/lib/tmdb";
import { X, VolumeX } from "lucide-react";

interface MinimalVideoPlayerProps {
  media: Media;
  streamUrl: string;
  onClose: () => void;
  episodeNumber?: number;
  seasonNumber?: number;
}

export function MinimalVideoPlayer({ 
  media, 
  streamUrl, 
  onClose,
  episodeNumber,
  seasonNumber 
}: MinimalVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const [showUnmutePrompt, setShowUnmutePrompt] = useState(false);

  const { settings, updateSetting } = usePlaybackSettings();
  const { getProgressForMedia, updateProgress } = useWatchProgress();
  const savedProgress = getProgressForMedia(media.id, episodeNumber, seasonNumber);
  const resumeTime = savedProgress?.progress_seconds || 0;

  // Get poster image
  const posterUrl = media.backdrop_path 
    ? getImageUrl(media.backdrop_path, "original") 
    : media.poster_path 
      ? getImageUrl(media.poster_path, "w500")
      : undefined;

  // Save progress
  const saveProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.paused) return;

    const currentTime = Math.floor(video.currentTime);
    const duration = Math.floor(video.duration) || null;
    const completed = duration ? currentTime >= duration - 30 : false;

    if (currentTime > 10) {
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

  // Attempt autoplay with fallback to muted
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Resume from saved position
    if (resumeTime > 0) {
      video.currentTime = resumeTime;
    }

    // Set initial volume from saved preference
    if (settings.rememberVolume) {
      video.volume = settings.lastVolume;
    }

    const attemptAutoplay = async () => {
      // If user previously unmuted, try unmuted first
      const tryUnmutedFirst = settings.rememberVolume && settings.preferUnmuted;
      
      if (tryUnmutedFirst) {
        try {
          await video.play();
          console.log('[MinimalVideoPlayer] Unmuted autoplay succeeded (user preference)');
          return;
        } catch (error) {
          console.log('[MinimalVideoPlayer] Unmuted autoplay blocked despite preference');
        }
      }

      try {
        // Try unmuted autoplay
        await video.play();
        console.log('[MinimalVideoPlayer] Unmuted autoplay succeeded');
        // User successfully played unmuted, remember this
        if (settings.rememberVolume) {
          updateSetting('preferUnmuted', true);
        }
      } catch (error) {
        console.log('[MinimalVideoPlayer] Unmuted autoplay blocked, trying muted...');
        video.muted = true;
        try {
          await video.play();
          setShowUnmutePrompt(true);
          console.log('[MinimalVideoPlayer] Muted autoplay succeeded');
        } catch (mutedError) {
          console.error('[MinimalVideoPlayer] Even muted autoplay failed:', mutedError);
        }
      }
    };

    attemptAutoplay();

    // Start progress tracking
    progressIntervalRef.current = window.setInterval(saveProgress, 15000);

    video.focus();

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      saveProgress();
    };
  }, [resumeTime, saveProgress, settings.rememberVolume, settings.preferUnmuted, settings.lastVolume, updateSetting]);

  // Handle unmute
  const handleUnmute = () => {
    const video = videoRef.current;
    if (video) {
      video.muted = false;
      setShowUnmutePrompt(false);
      // Remember that user prefers unmuted
      if (settings.rememberVolume) {
        updateSetting('preferUnmuted', true);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Unmute prompt */}
      {showUnmutePrompt && (
        <button
          onClick={handleUnmute}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full transition-colors animate-pulse"
        >
          <VolumeX className="w-5 h-5" />
          <span>Tap to unmute</span>
        </button>
      )}

      {/* Title */}
      <div className="absolute top-4 left-4 z-40">
        <h2 className="text-white text-lg font-medium drop-shadow-lg">
          {media.title}
        </h2>
      </div>

      {/* Native HTML5 Video */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        src={streamUrl}
        poster={posterUrl}
        controls
        playsInline
        onPause={saveProgress}
        onEnded={saveProgress}
        onVolumeChange={(e) => {
          const video = e.currentTarget;
          if (!video.muted) {
            setShowUnmutePrompt(false);
            // Remember user prefers unmuted and save volume
            if (settings.rememberVolume) {
              updateSetting('preferUnmuted', true);
              updateSetting('lastVolume', video.volume);
            }
          }
        }}
      >
        Your browser does not support video playback.
      </video>
    </div>
  );
}
