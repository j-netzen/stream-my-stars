import { useRef, useEffect, useState, useCallback } from "react";
import { Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { getImageUrl } from "@/lib/tmdb";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  media: Media;
  onClose: () => void;
}

export function VideoPlayer({ media, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { progress, isLoading: progressLoading, updateProgress } = useWatchProgress();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);

  const controlsTimeoutRef = useRef<NodeJS.Timeout>();
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const restoredMediaIdRef = useRef<string | null>(null);

  // Load saved progress (once per media)
  useEffect(() => {
    if (progressLoading) return;
    if (restoredMediaIdRef.current === media.id) return;

    const savedProgress = progress.find(
      (p) =>
        p.media_id === media.id &&
        p.episode_number === null &&
        p.season_number === null
    );

    if (savedProgress && videoRef.current) {
      const t = savedProgress.progress_seconds ?? 0;
      videoRef.current.currentTime = t;
      currentTimeRef.current = t;
      setCurrentTime(t);
    }

    restoredMediaIdRef.current = media.id;
  }, [media.id, progress, progressLoading]);

  const saveProgressNow = useCallback(() => {
    const d = durationRef.current;
    if (!videoRef.current || d <= 0) return;

    const t = currentTimeRef.current;
    updateProgress.mutate({
      mediaId: media.id,
      progressSeconds: t,
      durationSeconds: d,
      completed: t / d > 0.95,
    });
  }, [media.id, updateProgress]);

  useEffect(() => {
    const interval = window.setInterval(saveProgressNow, 10000);
    return () => window.clearInterval(interval);
  }, [saveProgressNow]);

  // Save on unmount
  useEffect(() => {
    return () => {
      saveProgressNow();
    };
  }, [saveProgressNow]);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    currentTimeRef.current = t;
    setCurrentTime(t);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const d = Number.isFinite(videoRef.current.duration)
        ? videoRef.current.duration
        : 0;
      durationRef.current = d;
      setDuration(d);
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = t;
    }
    currentTimeRef.current = t;
    setCurrentTime(t);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = v;
    }
    setVolume(v);
    setIsMuted(v === 0);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const skipTime = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const backdropUrl = media.backdrop_path
    ? getImageUrl(media.backdrop_path, "original")
    : null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black"
      onMouseMove={handleMouseMove}
    >
      {/* Video */}
      <video
        ref={videoRef}
        src={media.source_url || ""}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onClick={handlePlayPause}
        poster={backdropUrl || undefined}
      />

      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-shadow">{media.title}</h1>
            {media.release_date && (
              <p className="text-sm text-white/70">
                {media.release_date.split("-")[0]}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white hover:bg-white/20"
          >
            <X className="w-6 h-6" />
          </Button>
        </div>

        {/* Center Play Button */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button
              size="lg"
              onClick={handlePlayPause}
              className="w-20 h-20 rounded-full bg-primary/90 hover:bg-primary"
            >
              <Play className="w-10 h-10 fill-current" />
            </Button>
          </div>
        )}

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-4">
          {/* Progress Bar - Native range input */}
          {duration > 0 && (
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={currentTime}
              onChange={handleSeekChange}
              className="w-full h-2 bg-white/30 rounded-full appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
            />
          )}

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => skipTime(-10)}
                className="text-white hover:bg-white/20"
              >
                <SkipBack className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePlayPause}
                className="text-white hover:bg-white/20"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => skipTime(10)}
                className="text-white hover:bg-white/20"
              >
                <SkipForward className="w-5 h-5" />
              </Button>

              <span className="text-sm text-white/90 ml-2">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Volume */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="text-white hover:bg-white/20"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </Button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-2 bg-white/30 rounded-full appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                />
              </div>

              {/* Fullscreen */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                className="text-white hover:bg-white/20"
              >
                {isFullscreen ? (
                  <Minimize className="w-5 h-5" />
                ) : (
                  <Maximize className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
