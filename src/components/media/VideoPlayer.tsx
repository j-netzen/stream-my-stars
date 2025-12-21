import { useRef, useEffect, useState, useCallback } from "react";
import { Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { useTVMode } from "@/hooks/useTVMode";
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
  Copy,
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
  const { isTVMode } = useTVMode();
  const [focusedControl, setFocusedControl] = useState<string>("play");

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
  const audioHealthCheckTimeoutRef = useRef<number | null>(null);

  const [src, setSrc] = useState("");
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [showCopyUrl, setShowCopyUrl] = useState(false);
  const [hasWarnedNoAudio, setHasWarnedNoAudio] = useState(false);

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
    setShowCopyUrl(false);
    setHasWarnedNoAudio(false);
    if (audioHealthCheckTimeoutRef.current) {
      window.clearTimeout(audioHealthCheckTimeoutRef.current);
      audioHealthCheckTimeoutRef.current = null;
    }
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
      if (audioHealthCheckTimeoutRef.current) {
        window.clearTimeout(audioHealthCheckTimeoutRef.current);
        audioHealthCheckTimeoutRef.current = null;
      }
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
              accept: { 
                "video/*": [".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v", ".ts", ".m2ts", ".flv", ".wmv", ".3gp", ".ogv"],
              },
            },
            {
              description: "Audio Files",
              accept: {
                "audio/*": [".mp3", ".aac", ".m4a", ".ogg", ".oga", ".opus", ".flac", ".wav", ".weba", ".ac3", ".eac3", ".dts", ".wma"],
              },
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

  const copyUrlToClipboard = async () => {
    const url = src || media.source_url || "";
    if (url && !url.startsWith("blob:") && url !== LOCAL_FILE_MARKER) {
      await navigator.clipboard.writeText(url);
      toast.success("URL copied! Open in VLC or another media player for better MKV support.");
    }
  };

  const handleVideoError = () => {
    const raw = src || media.source_url || "";
    const isBlob = raw.startsWith("blob:");
    const looksLikePath = raw.startsWith("\\\\") || /^[a-zA-Z]:\\/.test(raw);
    const isLocalMarker = raw === LOCAL_FILE_MARKER;
    const isMkvFile = raw.toLowerCase().includes('.mkv');

    let message: string;
    let showCopyOption = false;
    
    if (isLocalMarker) {
      message = "Local file handle not found. Please re-select the file.";
    } else if (isBlob) {
      message = "This looks like a temporary local-file link. Please re-select the video file to play.";
    } else if (looksLikePath) {
      message = "Browsers can't play Windows file paths directly. Please use the file picker or a hosted URL.";
    } else if (isMkvFile) {
      message = "MKV playback requires codec support. Try Chrome/Edge, or copy the URL to play in VLC.";
      showCopyOption = true;
    } else {
      message = "Playback failed. The video URL may be invalid or the format isn't supported by your browser.";
      showCopyOption = !isBlob && !isLocalMarker;
    }

    setPlaybackError(message);
    setShowCopyUrl(showCopyOption);
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

  // TV remote keyboard navigation
  const controlOrder = ["skipBack", "play", "skipForward", "volume", "copy", "fullscreen", "close"];
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const currentIndex = controlOrder.indexOf(focusedControl);
    
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        if (currentIndex > 0) {
          setFocusedControl(controlOrder[currentIndex - 1]);
        } else {
          skipTime(-10);
        }
        setShowControls(true);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (currentIndex < controlOrder.length - 1) {
          setFocusedControl(controlOrder[currentIndex + 1]);
        } else {
          skipTime(10);
        }
        setShowControls(true);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (focusedControl === "volume") {
          const newVol = Math.min(1, volume + 0.1);
          if (videoRef.current) videoRef.current.volume = newVol;
          setVolume(newVol);
          setIsMuted(false);
        } else {
          skipTime(30);
        }
        setShowControls(true);
        break;
      case "ArrowDown":
        e.preventDefault();
        if (focusedControl === "volume") {
          const newVol = Math.max(0, volume - 0.1);
          if (videoRef.current) videoRef.current.volume = newVol;
          setVolume(newVol);
          setIsMuted(newVol === 0);
        } else {
          skipTime(-30);
        }
        setShowControls(true);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        setShowControls(true);
        switch (focusedControl) {
          case "play":
            handlePlayPause();
            break;
          case "skipBack":
            skipTime(-10);
            break;
          case "skipForward":
            skipTime(10);
            break;
          case "volume":
            toggleMute();
            break;
          case "fullscreen":
            toggleFullscreen();
            break;
          case "close":
            onClose();
            break;
          case "copy":
            if (src && !src.startsWith('blob:')) {
              navigator.clipboard.writeText(src);
              toast.success("Stream URL copied!");
            }
            break;
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }, [focusedControl, volume, src, isPlaying]);

  useEffect(() => {
    if (isTVMode) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isTVMode, handleKeyDown]);

  // Get MIME type based on file extension for better codec handling
  const getMimeType = (url: string): string => {
    const lowerUrl = url.toLowerCase();

    // Streaming manifests
    if (lowerUrl.includes(".m3u8")) return "application/vnd.apple.mpegurl";
    if (lowerUrl.includes(".mpd")) return "application/dash+xml";

    // Video formats
    if (lowerUrl.includes('.webm')) return 'video/webm';
    if (lowerUrl.includes('.mp4') || lowerUrl.includes('.m4v')) return 'video/mp4';
    if (lowerUrl.includes('.mov')) return 'video/quicktime';
    if (lowerUrl.includes('.ogv') || lowerUrl.includes('.ogg')) return 'video/ogg';
    if (lowerUrl.includes('.ts') || lowerUrl.includes('.m2ts')) return 'video/mp2t';
    if (lowerUrl.includes('.avi')) return 'video/x-msvideo';
    if (lowerUrl.includes('.flv')) return 'video/x-flv';
    if (lowerUrl.includes('.wmv')) return 'video/x-ms-wmv';
    if (lowerUrl.includes('.3gp')) return 'video/3gpp';
    if (lowerUrl.includes('.3g2')) return 'video/3gpp2';
    if (lowerUrl.includes('.mkv')) return 'video/x-matroska';

    // Audio-only formats (for audio files played in video element)
    if (lowerUrl.includes('.mp3')) return 'audio/mpeg';
    if (lowerUrl.includes('.aac')) return 'audio/aac';
    if (lowerUrl.includes('.m4a')) return 'audio/mp4';
    if (lowerUrl.includes('.ogg') || lowerUrl.includes('.oga')) return 'audio/ogg';
    if (lowerUrl.includes('.opus')) return 'audio/opus';
    if (lowerUrl.includes('.flac')) return 'audio/flac';
    if (lowerUrl.includes('.wav')) return 'audio/wav';
    if (lowerUrl.includes('.weba')) return 'audio/webm';
    if (lowerUrl.includes('.ac3')) return 'audio/ac3';
    if (lowerUrl.includes('.eac3') || lowerUrl.includes('.ec3')) return 'audio/eac3';
    if (lowerUrl.includes('.dts')) return 'audio/vnd.dts';
    if (lowerUrl.includes('.wma')) return 'audio/x-ms-wma';

    return 'video/mp4'; // Default fallback
  };

  const getSourceTypeHint = (url: string): string | undefined => {
    // We can't reliably hint blobs/handles, and an incorrect hint can prevent playback.
    if (!url || url.startsWith("blob:") || url === LOCAL_FILE_MARKER) return undefined;

    const type = getMimeType(url);
    const safeTypeHints = [
      "video/mp4",
      "video/webm",
      "video/ogg",
      "audio/mpeg",
      "audio/aac",
      "audio/mp4",
      "audio/ogg",
      "audio/opus",
      "audio/flac",
      "audio/wav",
      "audio/webm",
      "application/vnd.apple.mpegurl",
      "application/dash+xml",
    ];

    return safeTypeHints.includes(type) ? type : undefined;
  };

  // Check if browser supports a specific codec
  const checkCodecSupport = useCallback((mimeType: string): boolean => {
    const video = document.createElement('video');
    
    // Common codec strings to check
    const codecVariants: Record<string, string[]> = {
      'video/mp4': [
        'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', // H.264 + AAC
        'video/mp4; codecs="avc1.4D401E, mp4a.40.2"', // H.264 Main + AAC
        'video/mp4; codecs="avc1.64001E, mp4a.40.2"', // H.264 High + AAC
        'video/mp4; codecs="hev1.1.6.L93.B0"', // H.265/HEVC
        'video/mp4; codecs="av01.0.00M.08"', // AV1
        'video/mp4; codecs="mp4a.40.2"', // AAC
        'video/mp4; codecs="mp4a.40.5"', // AAC HE
        'video/mp4; codecs="ac-3"', // Dolby AC3
        'video/mp4; codecs="ec-3"', // Dolby E-AC3
        'video/mp4; codecs="flac"', // FLAC in MP4
        'video/mp4; codecs="opus"', // Opus in MP4
      ],
      'video/webm': [
        'video/webm; codecs="vp8, vorbis"',
        'video/webm; codecs="vp9, opus"',
        'video/webm; codecs="vp9"',
        'video/webm; codecs="av01.0.00M.08"', // AV1
        'video/webm; codecs="opus"',
        'video/webm; codecs="vorbis"',
      ],
      'video/ogg': [
        'video/ogg; codecs="theora, vorbis"',
        'video/ogg; codecs="theora"',
        'video/ogg; codecs="opus"',
      ],
      'audio/mpeg': ['audio/mpeg'],
      'audio/aac': ['audio/aac'],
      'audio/ogg': [
        'audio/ogg; codecs="vorbis"',
        'audio/ogg; codecs="opus"',
        'audio/ogg; codecs="flac"',
      ],
      'audio/opus': ['audio/opus'],
      'audio/flac': ['audio/flac'],
      'audio/wav': ['audio/wav'],
      'audio/webm': [
        'audio/webm; codecs="opus"',
        'audio/webm; codecs="vorbis"',
      ],
      'audio/ac3': ['audio/ac3'],
      'audio/eac3': ['audio/eac3'],
    };

    const variants = codecVariants[mimeType] || [mimeType];
    
    for (const codec of variants) {
      const support = video.canPlayType(codec);
      if (support === 'probably' || support === 'maybe') {
        return true;
      }
    }
    
    return false;
  }, []);

  // Log supported codecs on mount for debugging
  useEffect(() => {
    const video = document.createElement('video');
    const audioCodecs = [
      'audio/mpeg', 'audio/aac', 'audio/ogg; codecs="vorbis"', 
      'audio/ogg; codecs="opus"', 'audio/opus', 'audio/flac',
      'audio/wav', 'audio/webm; codecs="opus"', 'audio/ac3', 'audio/eac3',
      'audio/mp4; codecs="mp4a.40.2"', 'audio/mp4; codecs="ac-3"',
      'audio/mp4; codecs="ec-3"', 'audio/mp4; codecs="flac"',
    ];
    
    const supported = audioCodecs.filter(codec => {
      const support = video.canPlayType(codec);
      return support === 'probably' || support === 'maybe';
    });
    
    console.log('Supported audio codecs:', supported);
  }, []);

  const scheduleAudioHealthCheck = useCallback(() => {
    if (audioHealthCheckTimeoutRef.current) {
      window.clearTimeout(audioHealthCheckTimeoutRef.current);
      audioHealthCheckTimeoutRef.current = null;
    }

    // Only meaningful for remote streams; local blobs typically either work or hard-fail
    if (!src || src.startsWith("blob:") || src === LOCAL_FILE_MARKER) return;

    audioHealthCheckTimeoutRef.current = window.setTimeout(() => {
      const v: any = videoRef.current;
      if (!v || v.paused || v.ended) return;
      if (hasWarnedNoAudio) return;

      const t = typeof v.currentTime === "number" ? v.currentTime : 0;

      const mozHasAudio: boolean | null =
        typeof v.mozHasAudio === "boolean" ? v.mozHasAudio : null;

      const webkitAudioDecoded: number | null =
        typeof v.webkitAudioDecodedByteCount === "number"
          ? v.webkitAudioDecodedByteCount
          : null;

      const audioTracksLen: number | null =
        v.audioTracks && typeof v.audioTracks.length === "number"
          ? v.audioTracks.length
          : null;

      const hasAudio: boolean | null =
        mozHasAudio !== null
          ? mozHasAudio
          : webkitAudioDecoded !== null
            ? webkitAudioDecoded > 0
            : audioTracksLen !== null
              ? audioTracksLen > 0
              : null;

      if (t > 1 && hasAudio === false) {
        setHasWarnedNoAudio(true);
        setShowCopyUrl(true);
        toast.warning(
          "No audio detected for this stream in your browser. Try another stream (AAC/Opus), or copy the URL to VLC."
        );
      }
    }, 4500);
  }, [hasWarnedNoAudio, src]);

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
      className="fixed inset-0 z-50 bg-black gpu-accelerated"
      onMouseMove={handleMouseMove}
      style={{ 
        transform: 'translateZ(0)',
        willChange: 'transform',
        backfaceVisibility: 'hidden'
      }}
    >
      {/* Video - Hardware accelerated */}
      <video
        key={src || media.id}
        ref={videoRef}
        className="w-full h-full object-contain gpu-accelerated"
        style={{
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          perspective: 1000,
          WebkitBackfaceVisibility: 'hidden',
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          handleLoadedMetadata();
          // Audio sync optimizations and ensure audio is enabled
          const video = videoRef.current;
          if (video) {
            // Ensure audio is not muted and volume is set
            video.muted = false;
            video.volume = volume;
            // Set optimal audio buffer for sync
            video.preservesPitch = true;
            // Reduce audio latency
            if ('mozPreservesPitch' in video) {
              (video as any).mozPreservesPitch = true;
            }
            if ('webkitPreservesPitch' in video) {
              (video as any).webkitPreservesPitch = true;
            }
            console.log('Video loaded - audio enabled, volume:', video.volume, 'muted:', video.muted);
          }
        }}
        onCanPlay={() => {
          // Double-check audio state when video is ready to play
          const video = videoRef.current;
          if (video) {
            video.muted = isMuted;
            video.volume = volume;
            console.log('Video can play - audio state:', { muted: video.muted, volume: video.volume });
          }
        }}
        onError={handleVideoError}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          scheduleAudioHealthCheck();
        }}
        onClick={handlePlayPause}
        poster={backdropUrl || undefined}
        preload="auto"
        playsInline
        muted={isMuted}
      >
        {src ? (
          <source key={src} src={src} type={getSourceTypeHint(src)} />
        ) : null}
      </video>

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
              {showCopyUrl && (
                <Button variant="outline" onClick={copyUrlToClipboard} className="gap-2">
                  <Copy className="w-4 h-4" />
                  Copy URL
                </Button>
              )}
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
        <div className={cn(
          "absolute top-0 left-0 right-0 flex items-center justify-between",
          isTVMode ? "p-6" : "p-4"
        )}>
          <div>
            <h1 className={cn(
              "font-bold text-shadow",
              isTVMode ? "text-3xl" : "text-xl"
            )}>{media.title}</h1>
            {media.release_date && (
              <p className={cn(
                "text-white/70",
                isTVMode ? "text-lg" : "text-sm"
              )}>
                {media.release_date.split("-")[0]}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size={isTVMode ? "lg" : "icon"}
            onClick={onClose}
            className={cn(
              "text-white hover:bg-white/20",
              isTVMode && focusedControl === "close" && "ring-4 ring-primary bg-white/20",
              isTVMode && "w-14 h-14"
            )}
          >
            <X className={cn(isTVMode ? "w-8 h-8" : "w-6 h-6")} />
          </Button>
        </div>

        {/* Center Play Button */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button
              size="lg"
              onClick={handlePlayPause}
              className={cn(
                "rounded-full bg-primary/90 hover:bg-primary",
                isTVMode ? "w-32 h-32" : "w-20 h-20",
                isTVMode && focusedControl === "play" && "ring-4 ring-white"
              )}
            >
              <Play className={cn(isTVMode ? "w-16 h-16" : "w-10 h-10", "fill-current")} />
            </Button>
          </div>
        )}

        {/* Bottom Controls */}
        <div className={cn(
          "absolute bottom-0 left-0 right-0 space-y-4",
          isTVMode ? "p-8" : "p-4"
        )}>
          {/* Progress Bar - Native range input */}
          {duration > 0 && (
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={currentTime}
              onChange={handleSeekChange}
              className={cn(
                "w-full bg-white/30 rounded-full appearance-none cursor-pointer accent-primary",
                isTVMode 
                  ? "h-3 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6" 
                  : "h-2 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
                "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
              )}
            />
          )}

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className={cn("flex items-center", isTVMode ? "gap-4" : "gap-2")}>
              <Button
                variant="ghost"
                size={isTVMode ? "lg" : "icon"}
                onClick={() => skipTime(-10)}
                className={cn(
                  "text-white hover:bg-white/20",
                  isTVMode && "w-16 h-16",
                  isTVMode && focusedControl === "skipBack" && "ring-4 ring-primary bg-white/20"
                )}
              >
                <SkipBack className={cn(isTVMode ? "w-8 h-8" : "w-5 h-5")} />
              </Button>
              <Button
                variant="ghost"
                size={isTVMode ? "lg" : "icon"}
                onClick={handlePlayPause}
                className={cn(
                  "text-white hover:bg-white/20",
                  isTVMode && "w-20 h-20",
                  isTVMode && focusedControl === "play" && "ring-4 ring-primary bg-white/20"
                )}
              >
                {isPlaying ? (
                  <Pause className={cn(isTVMode ? "w-10 h-10" : "w-6 h-6")} />
                ) : (
                  <Play className={cn(isTVMode ? "w-10 h-10" : "w-6 h-6")} />
                )}
              </Button>
              <Button
                variant="ghost"
                size={isTVMode ? "lg" : "icon"}
                onClick={() => skipTime(10)}
                className={cn(
                  "text-white hover:bg-white/20",
                  isTVMode && "w-16 h-16",
                  isTVMode && focusedControl === "skipForward" && "ring-4 ring-primary bg-white/20"
                )}
              >
                <SkipForward className={cn(isTVMode ? "w-8 h-8" : "w-5 h-5")} />
              </Button>

              <span className={cn(
                "text-white/90 ml-2",
                isTVMode ? "text-xl" : "text-sm"
              )}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className={cn("flex items-center", isTVMode ? "gap-4" : "gap-2")}>
              {/* Copy URL for external players */}
              {src && !src.startsWith('blob:') && (
                <Button
                  variant="ghost"
                  size={isTVMode ? "lg" : "icon"}
                  onClick={() => {
                    navigator.clipboard.writeText(src);
                    toast.success("Stream URL copied! Paste in VLC or another player.");
                  }}
                  className={cn(
                    "text-white hover:bg-white/20",
                    isTVMode && "w-14 h-14",
                    isTVMode && focusedControl === "copy" && "ring-4 ring-primary bg-white/20"
                  )}
                  title="Copy stream URL for VLC"
                >
                  <Copy className={cn(isTVMode ? "w-7 h-7" : "w-5 h-5")} />
                </Button>
              )}

              {/* Volume */}
              <div className={cn("flex items-center", isTVMode ? "gap-3" : "gap-2")}>
                <Button
                  variant="ghost"
                  size={isTVMode ? "lg" : "icon"}
                  onClick={toggleMute}
                  className={cn(
                    "text-white hover:bg-white/20",
                    isTVMode && "w-14 h-14",
                    isTVMode && focusedControl === "volume" && "ring-4 ring-primary bg-white/20"
                  )}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className={cn(isTVMode ? "w-7 h-7" : "w-5 h-5")} />
                  ) : (
                    <Volume2 className={cn(isTVMode ? "w-7 h-7" : "w-5 h-5")} />
                  )}
                </Button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className={cn(
                    "bg-white/30 rounded-full appearance-none cursor-pointer accent-primary",
                    isTVMode 
                      ? "w-32 h-3 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5" 
                      : "w-20 h-2 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3",
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                  )}
                />
              </div>

              {/* Fullscreen */}
              <Button
                variant="ghost"
                size={isTVMode ? "lg" : "icon"}
                onClick={toggleFullscreen}
                className={cn(
                  "text-white hover:bg-white/20",
                  isTVMode && "w-14 h-14",
                  isTVMode && focusedControl === "fullscreen" && "ring-4 ring-primary bg-white/20"
                )}
              >
                {isFullscreen ? (
                  <Minimize className={cn(isTVMode ? "w-7 h-7" : "w-5 h-5")} />
                ) : (
                  <Maximize className={cn(isTVMode ? "w-7 h-7" : "w-5 h-5")} />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
