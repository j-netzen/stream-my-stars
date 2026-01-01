import { useState, useRef, useEffect, useCallback } from "react";
import { X, Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { usePlaybackSettings } from "@/hooks/usePlaybackSettings";
import { useVideoPlayerOrientation } from "@/hooks/useScreenOrientation";

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

interface VideoPlayerProps {
  media: Media;
  onClose: () => void;
  streamQuality?: StreamQualityInfo;
  onPlaybackError?: () => void;
}

export function VideoPlayer({ media, onClose, streamQuality, onPlaybackError }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoPlayedRef = useRef(false);
  const hasAutoFullscreenedRef = useRef(false);
  const bufferCheckIntervalRef = useRef<NodeJS.Timeout>();
  const lastBufferTimeRef = useRef<number>(0);
  const bufferStallCountRef = useRef<number>(0);

  const { settings } = usePlaybackSettings();
  
  // Lock to landscape orientation on native apps
  useVideoPlayerOrientation(true);

  // Load persisted volume from localStorage
  const getPersistedVolume = () => {
    try {
      const saved = localStorage.getItem('videoPlayerVolume');
      if (saved) {
        const parsed = parseFloat(saved);
        return isNaN(parsed) ? 1 : Math.max(0, Math.min(1, parsed));
      }
    } catch (e) {
      console.warn('Failed to load volume from localStorage');
    }
    return 1;
  };

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(getPersistedVolume);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCustomFullscreen, setIsCustomFullscreen] = useState(false); // Custom fullscreen state
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showPlayScreen, setShowPlayScreen] = useState(true);
  const [showMutedOverlay, setShowMutedOverlay] = useState(false); // Shows when video starts muted due to autoplay policy
  
  const [bufferHealth, setBufferHealth] = useState<'good' | 'warning' | 'poor'>('good');
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [showBufferWarning, setShowBufferWarning] = useState(false);

  const src = media.source_url || null;
  const backdropUrl = media.backdrop_path 
    ? `https://image.tmdb.org/t/p/w1280${media.backdrop_path}`
    : media.poster_path 
      ? `https://image.tmdb.org/t/p/w780${media.poster_path}`
      : null;

  // Try to enter fullscreen - using custom implementation for better control
  const enterFullscreen = useCallback(async () => {
    if (hasAutoFullscreenedRef.current) return;
    
    const element = containerRef.current;
    if (!element) return;
    
    try {
      // Try native fullscreen first on the container
      if (element.requestFullscreen) {
        await element.requestFullscreen();
        setIsFullscreen(true);
      } else if ((element as any).webkitRequestFullscreen) {
        await (element as any).webkitRequestFullscreen();
        setIsFullscreen(true);
      } else if ((element as any).msRequestFullscreen) {
        await (element as any).msRequestFullscreen();
        setIsFullscreen(true);
      } else {
        // Fallback to custom fullscreen
        setIsCustomFullscreen(true);
        setIsFullscreen(true);
      }
      hasAutoFullscreenedRef.current = true;
    } catch (err) {
      console.warn("Native fullscreen failed, using custom fullscreen:", err);
      // Use custom fullscreen as fallback
      setIsCustomFullscreen(true);
      setIsFullscreen(true);
      hasAutoFullscreenedRef.current = true;
    }
  }, []);

  // Handle first user click to enter fullscreen (browsers require user gesture)
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Only trigger fullscreen on first interaction if not already fullscreen
    if (!hasAutoFullscreenedRef.current && !document.fullscreenElement) {
      enterFullscreen();
    }
  }, [enterFullscreen]);

  // Monitor buffer health
  const updateBufferHealth = useCallback(() => {
    const video = videoRef.current;
    if (!video || !duration) return;

    const buffered = video.buffered;
    if (buffered.length === 0) {
      setBufferHealth('poor');
      setBufferedPercent(0);
      return;
    }

    // Find the buffer range that contains current time
    let bufferEnd = 0;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= video.currentTime && buffered.end(i) >= video.currentTime) {
        bufferEnd = buffered.end(i);
        break;
      }
    }

    const bufferedAhead = bufferEnd - video.currentTime;
    const totalBuffered = (bufferEnd / duration) * 100;
    setBufferedPercent(totalBuffered);

    // Check buffer health based on settings
    const targetBuffer = settings.bufferAhead;
    if (bufferedAhead >= targetBuffer * 0.8) {
      setBufferHealth('good');
      setShowBufferWarning(false);
      bufferStallCountRef.current = 0;
    } else if (bufferedAhead >= targetBuffer * 0.3) {
      setBufferHealth('warning');
    } else {
      setBufferHealth('poor');
      
      // Track buffer stalls
      if (bufferedAhead < 2 && isPlaying) {
        bufferStallCountRef.current++;
        if (bufferStallCountRef.current >= 3) {
          setShowBufferWarning(true);
        }
      }
    }

    lastBufferTimeRef.current = bufferedAhead;
  }, [duration, isPlaying, settings.bufferAhead]);

  // Buffer monitoring interval
  useEffect(() => {
    if (isPlaying) {
      bufferCheckIntervalRef.current = setInterval(updateBufferHealth, 1000);
    } else {
      if (bufferCheckIntervalRef.current) {
        clearInterval(bufferCheckIntervalRef.current);
      }
    }

    return () => {
      if (bufferCheckIntervalRef.current) {
        clearInterval(bufferCheckIntervalRef.current);
      }
    };
  }, [isPlaying, updateBufferHealth]);

  // Auto-play and auto-fullscreen when video can play - ALWAYS enabled
  const handleCanPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Set audio state
    video.muted = isMuted;
    video.volume = volume;

    // Always auto-play and enter fullscreen
    if (!hasAutoPlayedRef.current) {
      video.play().then(() => {
        setIsPlaying(true);
        hasAutoPlayedRef.current = true;
        // Always enter fullscreen after playback starts
        enterFullscreen();
      }).catch((err) => {
        console.warn("Auto-play failed:", err);
        // Try muted autoplay as fallback and show unmute overlay
        video.muted = true;
        setIsMuted(true);
        video.play().then(() => {
          setIsPlaying(true);
          hasAutoPlayedRef.current = true;
          enterFullscreen();
          // Show muted overlay so user can tap to unmute
          setShowMutedOverlay(true);
        }).catch(() => {
          console.warn("Muted auto-play also failed");
        });
      });
    }
  }, [isMuted, volume, enterFullscreen]);

  // Reset auto-play/fullscreen refs when media changes
  useEffect(() => {
    hasAutoPlayedRef.current = false;
    hasAutoFullscreenedRef.current = false;
  }, [media.id, src]);

  // Handle fullscreen changes - sync custom state with native
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNativeFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNativeFullscreen || isCustomFullscreen);
      
      // If exiting native fullscreen via system command, also exit custom
      if (!isNativeFullscreen && !isCustomFullscreen) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, [isCustomFullscreen]);

  // Hide controls after inactivity (works for mouse + touch)
  const resetControlsHideTimer = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }

    if (!isPlaying) return;

    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  const handleUserActivity = useCallback(() => {
    setShowControls(true);
    resetControlsHideTimer();
  }, [resetControlsHideTimer]);

  useEffect(() => {
    if (isPlaying) {
      resetControlsHideTimer();
    } else if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
    };
  }, [isPlaying, resetControlsHideTimer]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(console.error);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeekChange = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
    // Persist volume to localStorage
    try {
      localStorage.setItem('videoPlayerVolume', String(newVolume));
    } catch (e) {
      console.warn('Failed to save volume to localStorage');
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
      setShowMutedOverlay(false); // Hide overlay when user manually unmutes
    }
  };

  // Handle tap-to-unmute from overlay
  const handleUnmuteFromOverlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = false;
      setIsMuted(false);
      setShowMutedOverlay(false);
    }
  };

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement && !isCustomFullscreen) {
        // Try native fullscreen first
        try {
          await containerRef.current.requestFullscreen();
          setIsFullscreen(true);
        } catch {
          // Fallback to custom fullscreen
          setIsCustomFullscreen(true);
          setIsFullscreen(true);
        }
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else if (isCustomFullscreen) {
        setIsCustomFullscreen(false);
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  }, [isCustomFullscreen]);

  const skipTime = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    }
  };

  const handleVideoError = () => {
    // Just call the error callback silently - no error message displayed
    if (onPlaybackError) {
      onPlaybackError();
    }
  };

  const handleClose = useCallback(() => {
    // Exit fullscreen before closing
    if (document.fullscreenElement) {
      document.exitFullscreen().then(onClose).catch(onClose);
    } else if (isCustomFullscreen) {
      setIsCustomFullscreen(false);
      setIsFullscreen(false);
      onClose();
    } else {
      onClose();
    }
  }, [isCustomFullscreen, onClose]);

  // Handle click on the "Click to Play" screen
  const handlePlayScreenClick = async () => {
    setShowPlayScreen(false);
    
    // Enter fullscreen first (requires user gesture)
    await enterFullscreen();
    
    // Then start playback
    const video = videoRef.current;
    if (video) {
      try {
        await video.play();
        setIsPlaying(true);
        hasAutoPlayedRef.current = true;
      } catch (err) {
        console.warn("Play failed:", err);
        // Try muted playback as fallback and show unmute overlay
        video.muted = true;
        setIsMuted(true);
        try {
          await video.play();
          setIsPlaying(true);
          hasAutoPlayedRef.current = true;
          // Show muted overlay so user can tap to unmute
          setShowMutedOverlay(true);
        } catch (e) {
          console.warn("Muted play also failed:", e);
        }
      }
    }
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Global keyboard controls - handles Escape for exiting fullscreen and other shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Always show controls on any key press
      handleUserActivity();
      
      // Handle Escape - exit fullscreen or close player
      if (e.key === "Escape") {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else if (isCustomFullscreen) {
          setIsCustomFullscreen(false);
          setIsFullscreen(false);
        } else {
          handleClose();
        }
        return;
      }

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skipTime(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          skipTime(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          handleVolumeChange([Math.min(1, volume + 0.1)]);
          break;
        case "ArrowDown":
          e.preventDefault();
          handleVolumeChange([Math.max(0, volume - 0.1)]);
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
      }
    };

    // Use document-level listener for global key handling including in fullscreen
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, volume, isCustomFullscreen, handleUserActivity, handleClose, toggleFullscreen]);

  // Scroll to top and reset viewport when video player mounts/unmounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    
    // Reset viewport on unmount to fix any zoom issues
    return () => {
      // Reset viewport meta tag to ensure proper scale
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
      }
      // Force layout recalculation
      document.body.style.zoom = '1';
    };
  }, []);

  // Prevent body scroll and hide other elements when video is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Show "Click to Play" screen first
  if (showPlayScreen) {
    return (
      <div
        ref={containerRef}
        className="fixed left-0 top-0 z-[100] w-screen h-screen h-[100svh] bg-gradient-to-br from-background via-background to-primary/20 flex items-center justify-center overflow-hidden overscroll-none touch-none cursor-pointer"
        onClick={handlePlayScreenClick}
      >
        {/* Background poster with overlay */}
        {backdropUrl && (
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-30"
            style={{ backgroundImage: `url(${backdropUrl})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/60" />
        
        {/* Close button - positioned top right */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-20 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
        >
          <X className="w-6 h-6" />
        </Button>
        
        {/* Content - always horizontal, centered in viewport */}
        <div className="relative z-10 flex flex-row items-center gap-6 p-4">
          {/* Glowing play button */}
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 bg-primary/40 rounded-full blur-xl animate-pulse" />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-2xl hover:scale-105 transition-transform">
              <Play className="w-8 h-8 text-primary-foreground ml-0.5" />
            </div>
          </div>
          
          {/* Title and info */}
          <div className="text-left">
            <h1 className="text-lg font-bold text-foreground line-clamp-1">
              {media.title}
            </h1>
            {streamQuality && (
              <p className="text-muted-foreground text-xs">
                {streamQuality.quality} {streamQuality.size && `• ${streamQuality.size}`}
              </p>
            )}
            <p className="text-foreground/80 text-xs mt-1">
              Tap anywhere to play
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Determine if we're in any form of fullscreen
  const isInFullscreen = isFullscreen || isCustomFullscreen || !!document.fullscreenElement;

  return (
    <div
      ref={containerRef}
      className={cn(
        "bg-black flex items-center justify-center overflow-hidden overscroll-none",
        // Custom fullscreen uses fixed positioning
        isCustomFullscreen || !document.fullscreenElement
          ? "fixed left-0 top-0 z-[100] w-screen h-screen h-[100svh]"
          : "w-full h-full"
      )}
      style={{ touchAction: 'manipulation' }}
      onMouseMove={handleUserActivity}
      onPointerMove={handleUserActivity}
      onPointerDown={handleUserActivity}
      onTouchStart={handleUserActivity}
      onTouchEnd={() => isInFullscreen && handleUserActivity()}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onPointerLeave={() => isPlaying && setShowControls(false)}
      onClick={handleContainerClick}
    >
      {/* Video element - z-index 0 to stay below controls */}
      <video
        key={src || media.id}
        ref={videoRef}
        className="w-full h-full object-contain relative z-0"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleCanPlay}
        onError={handleVideoError}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        poster={backdropUrl || undefined}
        preload="auto"
        playsInline
        muted={isMuted}
        controls={false}
        style={{ pointerEvents: 'none' }} // Let overlay handle clicks
      >
        {src && <source src={src} />}
      </video>

      {/* Click overlay for play/pause - separate from video with pointer-events control */}
      <div 
        className="absolute inset-0 z-10"
        style={{ pointerEvents: 'auto' }}
        onClick={(e) => {
          handleUserActivity();
          if (e.target === e.currentTarget) {
            handlePlayPause();
            if (!hasAutoFullscreenedRef.current) {
              enterFullscreen();
            }
          }
        }}
        onTouchStart={() => handleUserActivity()}
      />

      {/* Buffering indicator with health status */}
      {isBuffering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          {settings.isSlowConnection && (
            <p className="text-white/80 text-sm mt-4 flex items-center gap-2">
              <WifiOff className="w-4 h-4" />
              Slow connection detected
            </p>
          )}
        </div>
      )}

      {/* Buffer health warning */}
      {showBufferWarning && !isBuffering && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-yellow-500/90 text-black px-4 py-2 rounded-lg flex items-center gap-2 pointer-events-none animate-pulse">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-sm font-medium">Connection unstable - buffering may occur</span>
        </div>
      )}

      {/* Buffer health indicator (shown with controls) */}
      {showControls && (
        <div className="absolute top-4 right-16 flex items-center gap-2 text-white/60 text-sm">
          <div className={cn(
            "w-2 h-2 rounded-full",
            bufferHealth === 'good' && "bg-green-500",
            bufferHealth === 'warning' && "bg-yellow-500",
            bufferHealth === 'poor' && "bg-red-500"
          )} />
          {settings.connectionSpeedMbps !== null && (
            <span className="flex items-center gap-1">
              <Wifi className="w-3 h-3" />
              {settings.connectionSpeedMbps.toFixed(1)} Mbps
            </span>
          )}
        </div>
      )}

      {/* Tap to unmute overlay - shown when video started muted due to autoplay policy */}
      {showMutedOverlay && isMuted && (
        <div 
          className="absolute top-20 left-1/2 -translate-x-1/2 z-20 cursor-pointer"
          onClick={handleUnmuteFromOverlay}
        >
          <div className="bg-black/80 backdrop-blur-sm text-white px-5 py-3 rounded-full flex items-center gap-3 shadow-lg border border-white/20 hover:bg-black/90 transition-colors">
            <div className="relative">
              <VolumeX className="w-5 h-5" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            </div>
            <span className="text-sm font-medium">Tap to unmute</span>
          </div>
        </div>
      )}

      {/* Center play button - visible when paused */}
      {!isPlaying && !isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <Button
            variant="ghost"
            size="icon"
            className="w-24 h-24 rounded-full bg-white/20 hover:bg-white/30 text-white pointer-events-auto"
            onClick={handlePlayPause}
          >
            <Play className="h-12 w-12 ml-1" />
          </Button>
        </div>
      )}

      {/* Controls overlay - z-20 to stay above video and click overlay */}
      <div
        className={cn(
          "absolute z-20 flex flex-col justify-between transition-opacity duration-300",
          // Use fixed inset-0 during fullscreen for UI persistence
          isInFullscreen ? "fixed inset-0" : "absolute inset-0",
          showControls ? "opacity-100" : "opacity-0"
        )}
        style={{ pointerEvents: showControls ? 'none' : 'none' }} // Background doesn't capture clicks
      >
        {/* Top bar */}
        <div 
          className="bg-gradient-to-b from-black/80 to-transparent p-4"
          style={{ pointerEvents: showControls ? 'auto' : 'none' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0" style={{ pointerEvents: 'none' }}>
              <h2 className="text-white text-lg font-medium truncate">{media.title}</h2>
              {streamQuality && (
                <p className="text-white/60 text-sm">{streamQuality.quality} • {streamQuality.size}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 ml-4"
              onClick={handleClose}
              style={{ pointerEvents: 'auto' }}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </div>

        {/* Bottom controls */}
        <div 
          className="bg-gradient-to-t from-black/80 to-transparent p-4"
          style={{ pointerEvents: showControls ? 'auto' : 'none' }}
        >
          {/* Progress bar */}
          <div className="mb-4" style={{ pointerEvents: 'auto' }}>
            <Slider
              value={[currentTime]}
              min={0}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeekChange}
              className="cursor-pointer"
            />
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => skipTime(-10)}
                style={{ pointerEvents: 'auto' }}
              >
                <SkipBack className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={handlePlayPause}
                style={{ pointerEvents: 'auto' }}
              >
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => skipTime(10)}
                style={{ pointerEvents: 'auto' }}
              >
                <SkipForward className="h-5 w-5" />
              </Button>

              <span className="text-white text-sm ml-2" style={{ pointerEvents: 'none' }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={toggleMute}
                style={{ pointerEvents: 'auto' }}
              >
                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </Button>

              <div className="w-24 hidden sm:block" style={{ pointerEvents: 'auto' }}>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={toggleFullscreen}
                style={{ pointerEvents: 'auto' }}
              >
                {isInFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoPlayer;
