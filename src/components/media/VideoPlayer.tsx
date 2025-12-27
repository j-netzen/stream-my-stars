import { useState, useRef, useEffect, useCallback } from "react";
import { X, Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

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
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();
  const hasAutoPlayedRef = useRef(false);
  const hasAutoFullscreenedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const src = media.source_url || null;
  const backdropUrl = media.backdrop_path 
    ? `https://image.tmdb.org/t/p/w1280${media.backdrop_path}`
    : media.poster_path 
      ? `https://image.tmdb.org/t/p/w780${media.poster_path}`
      : null;

  // Try to enter fullscreen
  const enterFullscreen = useCallback(async () => {
    if (hasAutoFullscreenedRef.current) return;
    
    const element = containerRef.current;
    if (!element) return;
    
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) {
        await (element as any).webkitRequestFullscreen();
      } else if ((element as any).msRequestFullscreen) {
        await (element as any).msRequestFullscreen();
      }
      setIsFullscreen(true);
      hasAutoFullscreenedRef.current = true;
    } catch (err) {
      console.warn("Fullscreen request failed (requires user gesture):", err);
    }
  }, []);

  // Handle first user click to enter fullscreen (browsers require user gesture)
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Only trigger fullscreen on first interaction if not already fullscreen
    if (!hasAutoFullscreenedRef.current && !document.fullscreenElement) {
      enterFullscreen();
    }
  }, [enterFullscreen]);

  // Auto-play and auto-fullscreen when video can play
  const handleCanPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Set audio state
    video.muted = isMuted;
    video.volume = volume;

    // Auto-play if not already playing
    if (!hasAutoPlayedRef.current) {
      video.play().then(() => {
        setIsPlaying(true);
        hasAutoPlayedRef.current = true;
        // Enter fullscreen after playback starts
        enterFullscreen();
      }).catch((err) => {
        console.warn("Auto-play failed:", err);
        // Try muted autoplay as fallback
        video.muted = true;
        setIsMuted(true);
        video.play().then(() => {
          setIsPlaying(true);
          hasAutoPlayedRef.current = true;
          enterFullscreen();
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

  // Handle fullscreen changes
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

  // Hide controls after inactivity
  useEffect(() => {
    if (showControls && isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, isPlaying]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
  };

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
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  };

  const skipTime = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    }
  };

  const handleVideoError = () => {
    setPlaybackError("Failed to load video. The format may not be supported.");
    if (onPlaybackError) {
      onPlaybackError();
    }
  };

  const handleClose = () => {
    // Exit fullscreen before closing
    if (document.fullscreenElement) {
      document.exitFullscreen().then(onClose).catch(onClose);
    } else {
      onClose();
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

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) {
        handleClose();
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

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, volume]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={handleContainerClick}
    >
      {/* Video element */}
      <video
        key={src || media.id}
        ref={videoRef}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleCanPlay}
        onError={handleVideoError}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onClick={(e) => {
          e.stopPropagation();
          handlePlayPause();
          // Also try fullscreen on video click
          if (!hasAutoFullscreenedRef.current) {
            enterFullscreen();
          }
        }}
        poster={backdropUrl || undefined}
        preload="auto"
        playsInline
        muted={isMuted}
        controls={false}
      >
        {src && <source src={src} />}
      </video>

      {/* Buffering indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Error overlay */}
      {playbackError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center p-6 max-w-md">
            <p className="text-white text-lg mb-4">{playbackError}</p>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Top bar */}
        <div className="bg-gradient-to-b from-black/80 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
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
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </div>

        {/* Center play button */}
        {!isPlaying && !isBuffering && !playbackError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Button
              variant="ghost"
              size="icon"
              className="w-20 h-20 rounded-full bg-white/20 hover:bg-white/30 text-white pointer-events-auto"
              onClick={handlePlayPause}
            >
              <Play className="h-10 w-10 ml-1" />
            </Button>
          </div>
        )}

        {/* Bottom controls */}
        <div className="bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Progress bar */}
          <div className="mb-4">
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
              >
                <SkipBack className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={handlePlayPause}
              >
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => skipTime(10)}
              >
                <SkipForward className="h-5 w-5" />
              </Button>

              <span className="text-white text-sm ml-2">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={toggleMute}
              >
                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </Button>

              <div className="w-24 hidden sm:block">
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
              >
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoPlayer;
