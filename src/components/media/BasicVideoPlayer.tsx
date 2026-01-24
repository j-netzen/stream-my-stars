import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { AlertCircle, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePlaybackSettings } from "@/hooks/usePlaybackSettings";
import { useVideoPlayerOrientation } from "@/hooks/useScreenOrientation";
import { forceHttps, prepareStreamUrl } from "@/lib/streamUtils";

interface Media {
  id: string;
  title: string;
  source_url?: string | null;
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
}

function isHlsUrl(url: string) {
  const u = url.toLowerCase();
  return u.includes(".m3u8") || u.includes("m3u8");
}

/**
 * BasicVideoPlayer
 * - Plain <video> element
 * - Uses hls.js only when the browser can't play HLS natively
 * Designed to be simpler than Video.js (avoid VHS 2004/2002 path).
 */
export default function BasicVideoPlayer({
  media,
  onClose,
  streamQuality,
  onPlaybackError,
}: BasicVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const { settings } = usePlaybackSettings();

  useVideoPlayerOrientation(true);

  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const src = media.source_url;

  const preparedUrl = useMemo(() => {
    if (!src) return null;
    return settings.useCorsProxy ? prepareStreamUrl(src, true) : forceHttps(src);
  }, [src, settings.useCorsProxy]);

  const isHls = useMemo(() => (src ? isHlsUrl(src) : false), [src]);

  const teardown = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        // ignore
      }
      hlsRef.current = null;
    }
  }, []);

  const fail = useCallback(
    (message: string) => {
      setIsLoading(false);
      setHasError(true);
      setErrorMessage(message);
      onPlaybackError?.();
    },
    [onPlaybackError]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !preparedUrl) return;

    setHasError(false);
    setErrorMessage("");
    setIsLoading(true);

    teardown();

    const onPlaying = () => setIsLoading(false);
    const onCanPlay = () => setIsLoading(false);
    const onLoadedMetadata = () => setIsLoading(false);
    const onWaiting = () => setIsLoading(true);
    const onNativeError = () => {
      const code = video.error?.code;
      const msg =
        code === 4
          ? "Source not supported. Try another stream."
          : "Playback failed. Try another stream.";
      fail(msg);
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("error", onNativeError);

    // ensure a clean reload
    video.removeAttribute("src");
    video.load();

    if (isHls) {
      const canPlayNativeHls = !!video.canPlayType("application/vnd.apple.mpegurl");

      if (canPlayNativeHls) {
        video.src = preparedUrl;
      } else if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            fail("Stream playlist failed to load. Try another stream.");
          }
        });

        hls.loadSource(preparedUrl);
        hls.attachMedia(video);
      } else {
        // last-ditch attempt
        video.src = preparedUrl;
      }
    } else {
      video.src = preparedUrl;
    }

    video.play().catch(() => {
      // autoplay blocked is fine
    });

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("error", onNativeError);
      teardown();
    };
  }, [preparedUrl, isHls, reloadKey, teardown, fail]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed left-0 top-0 z-[100] w-screen h-screen h-[100svh] bg-black flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background/5">
        <div className="min-w-0">
          <p className="text-foreground font-medium truncate">{media.title}</p>
          {streamQuality?.quality ? (
            <p className="text-muted-foreground text-xs truncate">{streamQuality.quality}</p>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close player">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="relative flex-1 bg-black">
        <video
          ref={videoRef}
          className="w-full h-full"
          controls
          playsInline
          autoPlay
          muted
        />

        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-muted-foreground text-sm">Loading stream…</p>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
              <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
              <p className="text-foreground font-semibold mb-1">Playback Error</p>
              <p className="text-muted-foreground text-sm mb-4">{errorMessage}</p>

              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setHasError(false);
                    setErrorMessage("");
                    setReloadKey((k) => k + 1);
                  }}
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
