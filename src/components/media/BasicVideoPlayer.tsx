import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import Hls from "hls.js";
import { AlertCircle, RefreshCw, X, Bug, ChevronDown, ChevronUp, Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { usePlaybackSettings } from "@/hooks/usePlaybackSettings";
import { useVideoPlayerOrientation } from "@/hooks/useScreenOrientation";
import { 
  forceHttps, 
  prepareStreamUrlWithDebug, 
  maskUrlForDebug,
  StreamDebugInfo 
} from "@/lib/streamUtils";
import { StreamPreparationOverlay } from "./StreamPreparationOverlay";
import { getTorrentInfo, getStreamableUrl, findLargestVideoFile, TorBoxTorrent } from "@/lib/torbox";

interface Media {
  id: string;
  title: string;
  source_url?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  // TorBox-specific fields for non-cached streams
  torboxTorrentId?: number;
  torboxFileId?: number;
}

export interface StreamQualityInfo {
  quality: string;
  size?: string;
  qualityRank?: number;
}

interface BasicVideoPlayerProps {
  media: Media;
  onClose: () => void;
  streamQuality?: StreamQualityInfo;
  onPlaybackError?: () => void;
  // Callback when user wants to go back to stream selection
  onBackToSelection?: () => void;
}

// TMDB image helper
const getImageUrl = (path: string | null | undefined, size: string = "original") => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

/**
 * Minimalist Debug Overlay
 */
function DebugOverlay({ 
  debugInfo, 
  streamQuality,
  isExpanded, 
  onToggle 
}: { 
  debugInfo: StreamDebugInfo | null; 
  streamQuality?: StreamQualityInfo;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  if (!debugInfo) return null;

  const parseQualityInfo = (quality?: string) => {
    if (!quality) return { resolution: null, codec: null };
    const resMatch = quality.match(/(\d{3,4}p)/i);
    const codecMatch = quality.match(/(x264|x265|HEVC|h\.?264|h\.?265|AV1|VP9|HDR|DV|Dolby)/i);
    return {
      resolution: resMatch ? resMatch[1] : null,
      codec: codecMatch ? codecMatch[1].toUpperCase() : null,
    };
  };

  const { resolution, codec } = parseQualityInfo(streamQuality?.quality);
  
  return (
    <div className="absolute top-4 right-4 z-30">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2 py-1 bg-black/70 hover:bg-black/90 text-xs text-white/70 rounded transition-colors"
      >
        <Bug className="w-3 h-3" />
        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      
      {isExpanded && (
        <div className="mt-1 p-3 bg-black/90 rounded-lg text-xs font-mono space-y-2 max-w-xs">
          {streamQuality && (
            <div className="pb-2 border-b border-white/10">
              <span className="text-white/50 block mb-1">Quality:</span>
              <div className="flex flex-wrap gap-1.5">
                {resolution && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">{resolution}</span>
                )}
                {codec && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">{codec}</span>
                )}
                {streamQuality.size && (
                  <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">{streamQuality.size}</span>
                )}
              </div>
            </div>
          )}
          
          <div>
            <span className="text-white/50">URL: </span>
            <span className="text-white/80 break-all">{maskUrlForDebug(debugInfo.originalUrl)}</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <span className={cn(
              "px-1.5 py-0.5 rounded",
              debugInfo.sourceType === 'torbox' ? 'bg-green-500/20 text-green-400' :
              debugInfo.sourceType === 'hls' ? 'bg-blue-500/20 text-blue-400' :
              'bg-yellow-500/20 text-yellow-400'
            )}>
              {debugInfo.sourceType}
            </span>
            {debugInfo.isHls && (
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">HLS</span>
            )}
          </div>
          
          <div className="space-y-1 text-white/60">
            <div>Proxy: {debugInfo.usedCorsProxy ? 'Yes' : 'No'}</div>
            <div>Mode: {debugInfo.playerMode}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Format time in MM:SS or HH:MM:SS
 */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * BasicVideoPlayer - Rebuilt for stability with Click-to-Fullscreen flow
 * 
 * Features:
 * - Clean "Ready" state with poster and centered play button
 * - Single synchronous click → fullscreen + play
 * - HLS.js with automatic error recovery (2004 fix)
 * - Auto-hiding controls after 2s inactivity
 * - object-fit: contain for proper aspect ratio
 */
export default function BasicVideoPlayer({
  media,
  onClose,
  streamQuality,
  onPlaybackError,
  onBackToSelection,
}: BasicVideoPlayerProps) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recoveryAttemptRef = useRef(0);

  // Settings
  const { settings } = usePlaybackSettings();
  useVideoPlayerOrientation(true);

  // State - Added "preparing" state for non-cached TorBox streams
  const [playerState, setPlayerState] = useState<"checking" | "preparing" | "ready" | "loading" | "playing" | "paused" | "error">("checking");
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

  // Determine effective source URL (resolved or original)
  const effectiveSrc = resolvedStreamUrl || media.source_url;

  // Get poster image
  const posterImage = useMemo(() => {
    return getImageUrl(media.backdrop_path, "w1280") || 
           getImageUrl(media.poster_path, "w780") || 
           null;
  }, [media.backdrop_path, media.poster_path]);

  // Prepare stream URL with debug info
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

  // Check TorBox stream availability on mount
  useEffect(() => {
    const checkTorBoxAvailability = async () => {
      // If we have a direct URL (not TorBox-managed), skip to ready
      if (media.source_url && !media.torboxTorrentId) {
        // Check if this looks like a TorBox CDN URL - those are already resolved
        if (media.source_url.includes('torbox') || 
            media.source_url.includes('.m3u8') || 
            media.source_url.startsWith('http')) {
          setPlayerState("ready");
          return;
        }
      }

      // If we have a TorBox torrent ID, check if it's ready
      if (media.torboxTorrentId) {
        try {
          const torrent = await getTorrentInfo(media.torboxTorrentId);
          
          // If ready, resolve the stream URL
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
            // Not ready - show preparation overlay
            setPreparingTorrentId(media.torboxTorrentId);
            setPlayerState("preparing");
          }
        } catch (err) {
          console.error("Failed to check TorBox availability:", err);
          // Fall through to ready state - let playback fail naturally
          setPlayerState("ready");
        }
      } else {
        // No TorBox ID - assume direct URL is ready
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

  // Handle preparation error
  const handlePreparationError = useCallback((message: string) => {
    console.error("Preparation error:", message);
    // Keep the overlay visible - it will show the error state
  }, []);

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

  // Handle mouse movement
  const handleMouseMove = useCallback(() => {
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  // Fullscreen handling
  const enterFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if ((container as any).webkitRequestFullscreen) {
        await (container as any).webkitRequestFullscreen();
      } else if ((container as any).msRequestFullscreen) {
        await (container as any).msRequestFullscreen();
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
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
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

  // Initialize HLS with error recovery
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
    
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    
    const onDurationChange = () => {
      setDuration(video.duration);
    };
    
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
      if (code === 4) {
        msg = "Source not supported. Try another stream.";
      } else if (code === 2) {
        msg = "Network error. Check your connection.";
      }
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
          startLevel: -1, // Auto quality
        };

        // Add auth headers for backend proxy
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
            switch (data.type) {
              case Hls.ErrorTypes.MEDIA_ERROR:
                // Attempt recovery for media errors
                if (recoveryAttemptRef.current < 3) {
                  recoveryAttemptRef.current++;
                  console.log(`[HLS] Attempting media recovery (attempt ${recoveryAttemptRef.current})`);
                  hls.recoverMediaError();
                } else {
                  setPlayerState("error");
                  setErrorMessage("Media playback error. Try refreshing or another stream.");
                  onPlaybackError?.();
                }
                break;

              case Hls.ErrorTypes.NETWORK_ERROR:
                // Attempt recovery for network errors
                if (recoveryAttemptRef.current < 3) {
                  recoveryAttemptRef.current++;
                  console.log(`[HLS] Attempting network recovery (attempt ${recoveryAttemptRef.current})`);
                  hls.startLoad();
                } else {
                  setPlayerState("error");
                  setErrorMessage("Network error. Check connection or try another stream.");
                  onPlaybackError?.();
                }
                break;

              default:
                setPlayerState("error");
                setErrorMessage("Stream failed to load. Try another stream.");
                onPlaybackError?.();
                break;
            }
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log("[HLS] Manifest parsed, ready to play");
        });

        hls.loadSource(preparedUrl);
        hls.attachMedia(video);
      } else {
        // Fallback: try native
        video.src = preparedUrl;
      }
    } else {
      // Direct video source
      video.src = preparedUrl;
    }

    // Return cleanup function
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
  }, [preparedUrl, isHls, usesBackendProxy, authToken, teardownHls, resetControlsTimeout, onPlaybackError]);

  // THE CLICK-TO-FULLSCREEN FLOW
  const handlePlayClick = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Initialize player if in ready state
    if (playerState === "ready") {
      initializePlayer();
    }

    // Synchronous: Request fullscreen then play
    enterFullscreen();
    
    // Slight delay to ensure video is ready
    setTimeout(() => {
      video.play().catch((err) => {
        console.warn("Play failed:", err);
        // Still try to play without fullscreen
      });
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
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const handleVolumeChange = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value[0];
    if (value[0] > 0 && video.muted) {
      video.muted = false;
    }
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

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black flex flex-col"
      onMouseMove={handleMouseMove}
      onTouchStart={handleMouseMove}
    >
      {/* Header - always visible */}
      <div 
        className={cn(
          "absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-white font-medium truncate">{media.title}</p>
          {streamQuality?.quality && (
            <p className="text-white/60 text-xs truncate">{streamQuality.quality}</p>
          )}
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose} 
          className="text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Video container */}
      <div className="relative flex-1 flex items-center justify-center">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          poster={posterImage || undefined}
          onClick={playerState === "playing" || playerState === "paused" ? togglePlayPause : undefined}
        />

        {/* Debug Overlay */}
        <DebugOverlay 
          debugInfo={debugInfo}
          streamQuality={streamQuality}
          isExpanded={showDebug}
          onToggle={() => setShowDebug(v => !v)}
        />

        {/* CHECKING STATE - Initial availability check */}
        {playerState === "checking" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
              <p className="text-muted-foreground text-sm">Checking stream availability...</p>
            </div>
          </div>
        )}

        {/* PREPARING STATE - TorBox stream preparation overlay */}
        {playerState === "preparing" && preparingTorrentId && (
          <StreamPreparationOverlay
            torrentId={preparingTorrentId}
            onReady={handleStreamReady}
            onBack={handlePreparationBack}
            onError={handlePreparationError}
          />
        )}

        {/* READY STATE - Centered Play Button */}
        {playerState === "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
            <button
              onClick={handlePlayClick}
              className="group relative w-24 h-24 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center transition-all duration-300 hover:scale-110 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              <Play className="w-12 h-12 text-white ml-1 transition-transform group-hover:scale-110" fill="white" />
            </button>
            <p className="mt-6 text-white/80 text-lg font-medium">Ready to Play</p>
            <p className="mt-2 text-white/50 text-sm">Click to start in fullscreen</p>
          </div>
        )}

        {/* LOADING STATE - Soft Pulsing Animation */}
        {playerState === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex flex-col items-center gap-4">
              {/* Pulsing loader */}
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-white/10 animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                </div>
              </div>
              <p className="text-white/70 text-sm animate-pulse">Loading stream…</p>
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {playerState === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="max-w-md w-full rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-md p-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-white font-semibold text-lg mb-2">Playback Error</p>
              <p className="text-white/70 text-sm mb-6">{errorMessage}</p>

              <div className="flex flex-col gap-3">
                <Button
                  variant="outline"
                  onClick={handleRetry}
                  className="gap-2 border-white/20 text-white hover:bg-white/10"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={onClose}
                  className="text-white/70 hover:text-white hover:bg-white/10"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls - Auto-hide after 2s */}
      {(playerState === "playing" || playerState === "paused") && (
        <div 
          className={cn(
            "absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-16 transition-opacity duration-300",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          {/* Progress bar */}
          <div className="mb-3">
            <div className="relative h-1 group">
              {/* Buffered progress */}
              <div 
                className="absolute inset-y-0 left-0 bg-white/30 rounded-full"
                style={{ width: `${(buffered / duration) * 100 || 0}%` }}
              />
              {/* Seek slider */}
              <Slider
                value={[currentTime]}
                min={0}
                max={duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                className="absolute inset-0"
              />
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Play/Pause */}
              <button
                onClick={togglePlayPause}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                {playerState === "playing" ? (
                  <Pause className="w-5 h-5 text-white" fill="white" />
                ) : (
                  <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                )}
              </button>

              {/* Volume */}
              <div className="flex items-center gap-2 group">
                <button
                  onClick={toggleMute}
                  className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-white" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-white" />
                  )}
                </button>
                <div className="w-20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={handleVolumeChange}
                  />
                </div>
              </div>

              {/* Time display */}
              <span className="text-white/80 text-sm font-mono ml-2">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Fullscreen toggle */}
              <button
                onClick={toggleFullscreen}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                {isFullscreen ? (
                  <Minimize className="w-4 h-4 text-white" />
                ) : (
                  <Maximize className="w-4 h-4 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
