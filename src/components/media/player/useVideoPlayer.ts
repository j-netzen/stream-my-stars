import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import Hls from "hls.js";
import { usePlaybackSettings } from "@/hooks/usePlaybackSettings";
import { useVideoPlayerOrientation } from "@/hooks/useScreenOrientation";
import { prepareStreamUrlWithDebug, StreamDebugInfo } from "@/lib/streamUtils";
import { getTorrentInfo, getStreamableUrl, findLargestVideoFile, TorBoxTorrent } from "@/lib/torbox";

export type PlayerState = "checking" | "preparing" | "ready" | "loading" | "playing" | "paused" | "error";

interface Media {
  id: string;
  title: string;
  source_url?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  torboxTorrentId?: number;
  torboxFileId?: number;
}

interface UseVideoPlayerOptions {
  media: Media;
  onPlaybackError?: () => void;
  onBackToSelection?: () => void;
  onClose: () => void;
}

// TMDB image helper
const getImageUrl = (path: string | null | undefined, size: string = "original") => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

export function useVideoPlayer({
  media,
  onPlaybackError,
  onBackToSelection,
  onClose,
}: UseVideoPlayerOptions) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recoveryAttemptRef = useRef(0);

  // Settings
  const { settings } = usePlaybackSettings();
  useVideoPlayerOrientation(true);

  // State
  const [playerState, setPlayerState] = useState<PlayerState>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [showControls, setShowControls] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [authToken, setAuthToken] = useState<string | null>(null);
  
  // TorBox preparation state
  const [preparingTorrentId, setPreparingTorrentId] = useState<number | null>(null);
  const [resolvedStreamUrl, setResolvedStreamUrl] = useState<string | null>(null);

  // Derived values
  const effectiveSrc = resolvedStreamUrl || media.source_url;
  
  const posterImage = useMemo(() => {
    return getImageUrl(media.backdrop_path, "w1280") || 
           getImageUrl(media.poster_path, "w780") || 
           null;
  }, [media.backdrop_path, media.poster_path]);

  const debugInfo = useMemo<StreamDebugInfo | null>(() => {
    if (!effectiveSrc) return null;
    return prepareStreamUrlWithDebug(
      effectiveSrc, 
      settings.useCorsProxy, 
      settings.useSmartProxy ?? true,
      settings.proxyMode ?? 'public'
    );
  }, [effectiveSrc, settings.useCorsProxy, settings.useSmartProxy, settings.proxyMode]);

  const preparedUrl = debugInfo?.preparedUrl ?? null;
  const isHls = debugInfo?.isHls ?? false;
  const usesBackendProxy = debugInfo?.usedBackendProxy ?? false;

  // Cleanup HLS instance
  const teardownHls = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        // Ignore cleanup errors
      }
      hlsRef.current = null;
    }
  }, []);

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    
    if (playerState === "playing") {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2000);
    }
  }, [playerState]);

  // Fullscreen handling
  const enterFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if ((container as any).webkitRequestFullscreen) {
        await (container as any).webkitRequestFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen request failed:", err);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      }
    } catch (err) {
      console.warn("Exit fullscreen failed:", err);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  // Initialize HLS player
  const initializePlayer = useCallback(() => {
    const video = videoRef.current;
    if (!video || !preparedUrl) return;

    setPlayerState("loading");
    setErrorMessage("");
    recoveryAttemptRef.current = 0;
    teardownHls();

    // Event handlers
    const onPlaying = () => {
      setPlayerState("playing");
      resetControlsTimeout();
    };
    
    const onPause = () => {
      setPlayerState("paused");
      setShowControls(true);
    };
    
    const onWaiting = () => {
      if (playerState !== "error") {
        setPlayerState("loading");
      }
    };
    
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration);
    
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    
    const onVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };

    const onNativeError = () => {
      const code = video.error?.code;
      let msg = "Playback failed. Try another stream.";
      if (code === 4) msg = "Source not supported. Try another stream.";
      else if (code === 2) msg = "Network error. Check your connection.";
      setPlayerState("error");
      setErrorMessage(msg);
      onPlaybackError?.();
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("progress", onProgress);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("error", onNativeError);

    // HLS.js setup with error recovery
    if (isHls) {
      const canPlayNativeHls = !!video.canPlayType("application/vnd.apple.mpegurl");

      if (canPlayNativeHls) {
        video.src = preparedUrl;
      } else if (Hls.isSupported()) {
        const hlsConfig: Partial<Hls["config"]> = {
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          startLevel: -1,
        };

        if (usesBackendProxy && authToken) {
          hlsConfig.xhrSetup = (xhr: XMLHttpRequest) => {
            xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
          };
        }

        const hls = new Hls(hlsConfig as Hls["config"]);
        hlsRef.current = hls;

        // HLS.js error handler with recovery (THE 2004 FIX)
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          console.warn("[HLS] Error:", data.type, data.details);

          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveryAttemptRef.current < 3) {
              recoveryAttemptRef.current++;
              console.log(`[HLS] Attempting media recovery (attempt ${recoveryAttemptRef.current})`);
              hls.recoverMediaError();
            } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recoveryAttemptRef.current < 3) {
              recoveryAttemptRef.current++;
              console.log(`[HLS] Attempting network recovery (attempt ${recoveryAttemptRef.current})`);
              hls.startLoad();
            } else {
              setPlayerState("error");
              setErrorMessage("Stream failed to load. Try another stream.");
              onPlaybackError?.();
            }
          }
        });

        hls.loadSource(preparedUrl);
        hls.attachMedia(video);
      } else {
        video.src = preparedUrl;
      }
    } else {
      video.src = preparedUrl;
    }

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("error", onNativeError);
      teardownHls();
    };
  }, [preparedUrl, isHls, usesBackendProxy, authToken, teardownHls, resetControlsTimeout, onPlaybackError, playerState]);

  // Play click handler
  const handlePlayClick = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (playerState === "ready") {
      initializePlayer();
    }

    enterFullscreen();
    setTimeout(() => {
      video.play().catch(console.warn);
    }, 100);
  }, [playerState, initializePlayer, enterFullscreen]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(console.warn);
    } else {
      video.pause();
    }
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  // Volume controls
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, []);

  const handleVolumeChange = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value[0];
    if (value[0] > 0 && video.muted) video.muted = false;
  }, []);

  // Seek
  const handleSeek = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value[0];
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  // Retry on error
  const handleRetry = useCallback(() => {
    setPlayerState("ready");
    setErrorMessage("");
    recoveryAttemptRef.current = 0;
  }, []);

  // Handle stream becoming ready from preparation overlay
  const handleStreamReady = useCallback(async (torrent: TorBoxTorrent) => {
    try {
      const fileId = media.torboxFileId || findLargestVideoFile(torrent)?.id;
      if (!fileId) {
        setPlayerState("error");
        setErrorMessage("No video file found in this torrent.");
        return;
      }

      const url = await getStreamableUrl(torrent.id, fileId);
      setResolvedStreamUrl(url);
      setPreparingTorrentId(null);
      setPlayerState("ready");
    } catch (err) {
      console.error("Failed to get stream URL:", err);
      setPlayerState("error");
      setErrorMessage("Failed to get stream URL. Please try again.");
    }
  }, [media.torboxFileId]);

  // Handle back from preparation overlay
  const handlePreparationBack = useCallback(() => {
    if (onBackToSelection) {
      onBackToSelection();
    } else {
      onClose();
    }
  }, [onBackToSelection, onClose]);

  // Check TorBox stream availability on mount
  useEffect(() => {
    const checkTorBoxAvailability = async () => {
      if (media.source_url && !media.torboxTorrentId) {
        if (media.source_url.includes('torbox') || 
            media.source_url.includes('.m3u8') || 
            media.source_url.startsWith('http')) {
          setPlayerState("ready");
          return;
        }
      }

      if (media.torboxTorrentId) {
        try {
          const torrent = await getTorrentInfo(media.torboxTorrentId);
          
          if (torrent.download_present || torrent.progress === 1) {
            const fileId = media.torboxFileId || findLargestVideoFile(torrent)?.id;
            if (fileId) {
              const url = await getStreamableUrl(media.torboxTorrentId, fileId);
              setResolvedStreamUrl(url);
              setPlayerState("ready");
            } else {
              setPlayerState("error");
              setErrorMessage("No video file found in this torrent.");
            }
          } else {
            setPreparingTorrentId(media.torboxTorrentId);
            setPlayerState("preparing");
          }
        } catch (err) {
          console.error("Failed to check TorBox availability:", err);
          setPlayerState("ready");
        }
      } else {
        setPlayerState("ready");
      }
    };

    checkTorBoxAvailability();
  }, [media.source_url, media.torboxTorrentId, media.torboxFileId]);

  // Get auth token for backend proxy
  useEffect(() => {
    const getToken = async () => {
      const { data: { session } } = await (await import("@/integrations/supabase/client")).supabase.auth.getSession();
      setAuthToken(session?.access_token ?? null);
    };
    getToken();
  }, []);

  // Track fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      teardownHls();
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [teardownHls]);

  return {
    // Refs
    containerRef,
    videoRef,
    // State
    playerState,
    errorMessage,
    showControls,
    showDebug,
    isFullscreen,
    isMuted,
    volume,
    currentTime,
    duration,
    buffered,
    preparingTorrentId,
    // Derived
    posterImage,
    debugInfo,
    isPlaying: playerState === "playing",
    // Actions
    handlePlayClick,
    togglePlayPause,
    toggleMute,
    handleVolumeChange,
    handleSeek,
    handleRetry,
    handleStreamReady,
    handlePreparationBack,
    toggleFullscreen,
    resetControlsTimeout,
    setShowDebug,
  };
}
