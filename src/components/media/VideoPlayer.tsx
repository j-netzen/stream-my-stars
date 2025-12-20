import { useRef, useEffect, useState, useCallback } from "react";
import Artplayer from "artplayer";
import { Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { getImageUrl } from "@/lib/tmdb";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const { progress, isLoading: progressLoading, updateProgress } = useWatchProgress();

  const [isRestoringHandle, setIsRestoringHandle] = useState(false);
  const [src, setSrc] = useState("");
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const objectUrlRef = useRef<string | null>(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const restoredMediaIdRef = useRef<string | null>(null);
  const filePickerRef = useRef<HTMLInputElement>(null);

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
    durationRef.current = 0;
    currentTimeRef.current = 0;
    restoredMediaIdRef.current = null;

    init();

    return () => {
      cancelled = true;
    };
  }, [media.id, media.source_url]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  // Save progress callback
  const saveProgressNow = useCallback(() => {
    const d = durationRef.current;
    if (d <= 0) return;

    const t = currentTimeRef.current;
    updateProgress.mutate({
      mediaId: media.id,
      progressSeconds: t,
      durationSeconds: d,
      completed: t / d > 0.95,
    });
  }, [media.id, updateProgress]);

  // Keep the latest callback in a ref
  const saveProgressNowRef = useRef(saveProgressNow);
  useEffect(() => {
    saveProgressNowRef.current = saveProgressNow;
  }, [saveProgressNow]);

  // Periodic save
  useEffect(() => {
    const interval = window.setInterval(() => saveProgressNowRef.current(), 10000);
    return () => window.clearInterval(interval);
  }, []);

  // Save on unmount
  useEffect(() => {
    return () => {
      saveProgressNowRef.current();
    };
  }, []);

  // Initialize ArtPlayer when src changes
  useEffect(() => {
    if (!containerRef.current || !src) return;

    // Destroy previous instance
    if (artRef.current) {
      artRef.current.destroy();
      artRef.current = null;
    }

    const backdropUrl = media.backdrop_path
      ? getImageUrl(media.backdrop_path, "original")
      : undefined;

    // Determine video type for better handling
    const getVideoType = (url: string): string => {
      const lowerUrl = url.toLowerCase();
      if (lowerUrl.includes('.mkv')) return 'video/x-matroska';
      if (lowerUrl.includes('.avi')) return 'video/x-msvideo';
      if (lowerUrl.includes('.webm')) return 'video/webm';
      if (lowerUrl.includes('.mov')) return 'video/quicktime';
      if (lowerUrl.includes('.m4v')) return 'video/mp4';
      if (lowerUrl.includes('.flv')) return 'video/x-flv';
      if (lowerUrl.includes('.wmv')) return 'video/x-ms-wmv';
      return 'video/mp4';
    };

    try {
      const art = new Artplayer({
        container: containerRef.current,
        url: src,
        type: getVideoType(src),
        poster: backdropUrl,
        volume: 1,
        isLive: false,
        muted: false,
        autoplay: false,
        pip: true,
        autoSize: false,
        autoMini: false,
        screenshot: true,
        setting: true,
        loop: false,
        flip: true,
        playbackRate: true,
        aspectRatio: true,
        fullscreen: true,
        fullscreenWeb: true,
        subtitleOffset: false,
        miniProgressBar: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        autoPlayback: true, // Remember playback position
        airplay: true,
        theme: 'hsl(var(--primary))',
        lang: 'en',
        moreVideoAttr: {
          crossOrigin: 'anonymous',
          playsInline: true,
        },
        settings: [
          {
            html: 'Playback Speed',
            selector: [
              { html: '0.5x', value: 0.5 },
              { html: '0.75x', value: 0.75 },
              { html: 'Normal', value: 1, default: true },
              { html: '1.25x', value: 1.25 },
              { html: '1.5x', value: 1.5 },
              { html: '2x', value: 2 },
            ],
            onSelect: function (item) {
              art.playbackRate = item.value as number;
              return item.html;
            },
          },
        ],
        controls: [
          {
            name: 'fast-rewind',
            position: 'left',
            html: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>',
            tooltip: 'Rewind 10s',
            click: function () {
              art.seek = art.currentTime - 10;
            },
          },
          {
            name: 'fast-forward',
            position: 'left',
            html: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>',
            tooltip: 'Forward 10s',
            click: function () {
              art.seek = art.currentTime + 10;
            },
          },
        ],
      });

      art.on('video:timeupdate', () => {
        currentTimeRef.current = art.currentTime;
        durationRef.current = art.duration;
      });

      art.on('ready', () => {
        durationRef.current = art.duration;
        
        // Restore saved progress
        if (!progressLoading && restoredMediaIdRef.current !== media.id) {
          const savedProgress = progress.find(
            (p) =>
              p.media_id === media.id &&
              p.episode_number === null &&
              p.season_number === null
          );

          if (savedProgress && savedProgress.progress_seconds) {
            art.seek = savedProgress.progress_seconds;
            currentTimeRef.current = savedProgress.progress_seconds;
          }

          restoredMediaIdRef.current = media.id;
        }
      });

      art.on('error', () => {
        const isMkv = src.toLowerCase().includes('.mkv');
        const isAvi = src.toLowerCase().includes('.avi');
        
        let message: string;
        if (isMkv || isAvi) {
          message = `${isMkv ? 'MKV' : 'AVI'} playback failed. Your browser may not support the video codec. Try Chrome/Edge, or consider transcoding the file.`;
        } else {
          message = "Playback failed. The video URL may be invalid or the format isn't supported by your browser.";
        }
        
        setPlaybackError(message);
        toast.error(message);
      });

      artRef.current = art;
    } catch (err) {
      console.error('ArtPlayer initialization error:', err);
      setPlaybackError("Failed to initialize video player.");
      toast.error("Failed to initialize video player.");
    }

    return () => {
      if (artRef.current) {
        saveProgressNowRef.current();
        artRef.current.destroy();
        artRef.current = null;
      }
    };
  }, [src, media.id, media.title, media.backdrop_path, progress, progressLoading]);

  const openFilePicker = async () => {
    // Try File System Access API first for persistence
    if (isFileSystemAccessSupported()) {
      try {
        // @ts-ignore
        const [handle]: FileSystemFileHandle[] = await window.showOpenFilePicker({
          types: [
            {
              description: "Video Files",
              accept: { "video/*": [".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v", ".flv", ".wmv"] },
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
  };

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
    <div className="fixed inset-0 z-50 bg-black">
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          saveProgressNowRef.current();
          onClose();
        }}
        className="absolute top-4 right-4 z-[100] text-white hover:bg-white/20"
      >
        <X className="w-6 h-6" />
      </Button>

      {/* Title overlay */}
      <div className="absolute top-4 left-4 z-[100] pointer-events-none">
        <h1 className="text-xl font-bold text-white text-shadow">{media.title}</h1>
        {media.release_date && (
          <p className="text-sm text-white/70">
            {media.release_date.split("-")[0]}
          </p>
        )}
      </div>

      {/* ArtPlayer container */}
      <div 
        ref={containerRef} 
        className="w-full h-full"
        style={{ aspectRatio: '16/9' }}
      />

      <input
        ref={filePickerRef}
        type="file"
        accept="video/*,.mkv,.avi,.mov,.wmv,.flv"
        onChange={handleLocalFileSelected}
        className="hidden"
      />

      {playbackError && (
        <div className="absolute inset-0 z-[110] grid place-items-center bg-background/80 backdrop-blur-sm p-6">
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
    </div>
  );
}
