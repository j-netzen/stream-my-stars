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
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getFileHandle,
  storeFileHandle,
  requestFileFromHandle,
  isFileSystemAccessSupported,
} from "@/lib/fileHandleStore";

// Special marker URL for local files stored via File System Access API
const LOCAL_FILE_MARKER = "local-file://stored-handle";

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
  const [isRestoringHandle, setIsRestoringHandle] = useState(false);

  const controlsTimeoutRef = useRef<NodeJS.Timeout>();
  const filePickerRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const restoredMediaIdRef = useRef<string | null>(null);

  const [src, setSrc] = useState("");
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Attempt to restore file handle on mount or media change
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const rawUrl = media.source_url || "";

      // If it's our special marker, try to restore the handle
      if (rawUrl === LOCAL_FILE_MARKER) {
        setIsRestoringHandle(true);
        const handle = await getFileHandle(media.id);
        if (cancelled) return;

        if (handle) {
          const file = await requestFileFromHandle(handle);
          if (cancelled) return;

          if (file) {
            const url = URL.createObjectURL(file);
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = url;
            setSrc(url);
            setPlaybackError(null);
            setIsRestoringHandle(false);
            return;
          }
        }

        // Handle not found or permission denied
        setIsRestoringHandle(false);
        setPlaybackError("Local file handle expired or permission denied. Please re-select the file.");
        return;
      }

      // Regular URL
      setSrc(rawUrl);
      setPlaybackError(null);
    };

    // Reset state
    setPlaybackError(null);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setIsPlaying(false);
    setIsBuffering(false);
    setDuration(0);
    durationRef.current = 0;
    setCurrentTime(0);
    currentTimeRef.current = 0;
    restoredMediaIdRef.current = null;

    init();

    return () => {
      cancelled = true;
    };
  }, [media.id, media.source_url]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

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
  }, [media.id, updateProgress.mutate]);

  // Keep the latest callback in a ref so effects don't re-run every render
  const saveProgressNowRef = useRef(saveProgressNow);
  useEffect(() => {
    saveProgressNowRef.current = saveProgressNow;
  }, [saveProgressNow]);

  useEffect(() => {
    const interval = window.setInterval(() => saveProgressNowRef.current(), 10000);
    return () => window.clearInterval(interval);
  }, []);

  // Save on unmount only
  useEffect(() => {
    return () => {
      saveProgressNowRef.current();
    };
  }, []);

  const openFilePicker = async () => {
    // Try File System Access API first for persistence
    if (isFileSystemAccessSupported()) {
      try {
        // @ts-ignore
        const [handle]: FileSystemFileHandle[] = await window.showOpenFilePicker({
          types: [
            {
              description: "Video Files",
              accept: { "video/*": [".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v"] },
            },
          ],
          multiple: false,
        });

        const file = await handle.getFile();
        const url = URL.createObjectURL(file);

        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = url;

        // Store handle for future sessions
        await storeFileHandle(media.id, handle);

        setSrc(url);
        setPlaybackError(null);
        toast.success("File loaded – will persist across refresh");

        requestAnimationFrame(() => {
          videoRef.current?.play().catch(() => {});
        });
        return;
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("File picker error:", err);
        }
      }
    }

    // Fallback to regular file input
    filePickerRef.current?.click();
  };

  const handleLocalFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;

    setSrc(url);
    setPlaybackError(null);
    toast.info("File loaded (won't persist after refresh)");

    requestAnimationFrame(() => {
      videoRef.current?.play().catch(() => {});
    });
  };

  const handleVideoError = () => {
    const raw = src || media.source_url || "";
    const isBlob = raw.startsWith("blob:");
    const looksLikePath = raw.startsWith("\\\\") || /^[a-zA-Z]:\\/.test(raw);
    const isLocalMarker = raw === LOCAL_FILE_MARKER;

    const message = isLocalMarker
      ? "Local file handle not found. Please re-select the file."
      : isBlob
        ? "This looks like a temporary local-file link. Please re-select the video file to play."
        : looksLikePath
          ? "Browsers can't play Windows file paths directly. Please use the file picker or a hosted URL."
          : "Playback failed. The video URL may be invalid or the format isn't supported by your browser.";

    setPlaybackError(message);
    toast.error(message);
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      return;
    }

    const p = videoRef.current.play();
    if (p) {
      p.then(() => setIsPlaying(true)).catch(() => handleVideoError());
    } else {
      setIsPlaying(true);
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

  // Show loading state while restoring file handle
  if (isRestoringHandle) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
          <p className="text-white/70">Restoring local file access...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black"
      onMouseMove={handleMouseMove}
    >
      {/* Video */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleVideoError}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onClick={handlePlayPause}
        poster={backdropUrl || undefined}
        preload="metadata"
        playsInline
      />

      <input
        ref={filePickerRef}
        type="file"
        accept="video/*"
        onChange={handleLocalFileSelected}
        className="hidden"
      />

      {playbackError && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-4 shadow-lg">
            <h2 className="text-base font-semibold">Can't play this video</h2>
            <p className="mt-1 text-sm text-muted-foreground">{playbackError}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button onClick={openFilePicker}>Choose file</Button>
            </div>
          </div>
        </div>
      )}

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
