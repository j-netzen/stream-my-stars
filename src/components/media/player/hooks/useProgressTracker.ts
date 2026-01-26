/**
 * useProgressTracker Hook
 * 
 * Manages watch progress saving at regular intervals.
 */

import { useRef, useCallback } from "react";
import { useWatchProgress } from "@/hooks/useWatchProgress";

interface UseProgressTrackerOptions {
  mediaId: string;
  episodeNumber?: number;
  seasonNumber?: number;
  saveIntervalMs?: number;
}

export function useProgressTracker({
  mediaId,
  episodeNumber,
  seasonNumber,
  saveIntervalMs = 15000,
}: UseProgressTrackerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);

  const { getProgressForMedia, updateProgress } = useWatchProgress();
  const savedProgress = getProgressForMedia(mediaId, episodeNumber, seasonNumber);
  const resumeTime = savedProgress?.progress_seconds || 0;

  const saveProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.paused) return;

    const currentTime = Math.floor(video.currentTime);
    const duration = Math.floor(video.duration) || null;
    const completed = duration ? currentTime >= duration - 30 : false;

    if (currentTime > 10) {
      updateProgress.mutate({
        mediaId,
        progressSeconds: currentTime,
        durationSeconds: duration || undefined,
        completed,
        episodeNumber,
        seasonNumber,
      });
    }
  }, [mediaId, episodeNumber, seasonNumber, updateProgress]);

  const startTracking = useCallback(() => {
    if (progressIntervalRef.current) return;
    progressIntervalRef.current = window.setInterval(saveProgress, saveIntervalMs);
  }, [saveProgress, saveIntervalMs]);

  const stopTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    saveProgress(); // Save one final time
  }, [saveProgress]);

  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
  }, []);

  return {
    resumeTime,
    saveProgress,
    startTracking,
    stopTracking,
    setVideoElement,
  };
}
