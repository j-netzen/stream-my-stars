import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { AlertCircle, RefreshCw, X, Bug, ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePlaybackSettings } from "@/hooks/usePlaybackSettings";
import { useVideoPlayerOrientation } from "@/hooks/useScreenOrientation";
import { 
  forceHttps, 
  prepareStreamUrlWithDebug, 
  maskUrlForDebug,
  StreamDebugInfo 
} from "@/lib/streamUtils";

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

/**
 * Debug Overlay Component - shows stream analysis info with quality data
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

  // Parse quality info to extract resolution, codec, size
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
    <div className="absolute top-14 right-2 z-30">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2 py-1 bg-black/70 hover:bg-black/90 text-xs text-muted-foreground rounded border border-border/50 transition-colors"
      >
        <Bug className="w-3 h-3" />
        Debug
        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      
      {isExpanded && (
        <div className="mt-1 p-3 bg-black/90 rounded-lg border border-border/50 text-xs font-mono space-y-2 max-w-xs">
          {/* Stream Quality Section */}
          {streamQuality && (
            <div className="pb-2 border-b border-border/30">
              <span className="text-muted-foreground block mb-1">Quality Info:</span>
              <div className="flex flex-wrap gap-1.5">
                {resolution && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                    {resolution}
                  </span>
                )}
                {codec && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                    {codec}
                  </span>
                )}
                {streamQuality.size && (
                  <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
                    {streamQuality.size}
                  </span>
                )}
              </div>
              {streamQuality.quality && !resolution && (
                <p className="text-foreground mt-1 break-all">{streamQuality.quality}</p>
              )}
            </div>
          )}
          
          {/* URL Info */}
          <div>
            <span className="text-muted-foreground">URL: </span>
            <span className="text-foreground break-all">{maskUrlForDebug(debugInfo.originalUrl)}</span>
          </div>
          
          {/* Source Type Badges */}
          <div className="flex flex-wrap gap-2">
            <span className={`px-1.5 py-0.5 rounded ${
              debugInfo.sourceType === 'torbox' ? 'bg-green-500/20 text-green-400' :
              debugInfo.sourceType === 'hls' ? 'bg-blue-500/20 text-blue-400' :
              debugInfo.sourceType === 'direct' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-muted text-muted-foreground'
            }`}>
              {debugInfo.sourceType}
            </span>
            {debugInfo.isHls && (
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                HLS
              </span>
            )}
          </div>
          
          {/* Proxy & Player Info */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">CORS Proxy:</span>
              <span className={debugInfo.usedCorsProxy ? 'text-green-400' : 'text-yellow-400'}>
                {debugInfo.usedCorsProxy ? 'Yes' : 'No'}
              </span>
            </div>
            {debugInfo.usedBackendProxy && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Backend Proxy:</span>
                <span className="text-green-400">Yes</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Player Mode:</span>
              <span className="text-foreground">{debugInfo.playerMode}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * BasicVideoPlayer
 * - Plain <video> element
 * - Uses hls.js only when the browser can't play HLS natively
 * - Debug overlay for stream diagnostics
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
  const [showDebug, setShowDebug] = useState(false);

  const src = media.source_url;
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Get auth token for backend proxy requests
  useEffect(() => {
    const getToken = async () => {
      const { data: { session } } = await (await import("@/integrations/supabase/client")).supabase.auth.getSession();
      setAuthToken(session?.access_token ?? null);
    };
    getToken();
  }, []);

  // Use smart URL preparation with debug info
  const debugInfo = useMemo<StreamDebugInfo | null>(() => {
    if (!src) return null;
    return prepareStreamUrlWithDebug(
      src, 
      settings.useCorsProxy, 
      settings.useSmartProxy ?? true,
      settings.proxyMode ?? 'public'
    );
  }, [src, settings.useCorsProxy, settings.useSmartProxy, settings.proxyMode]);

  const preparedUrl = debugInfo?.preparedUrl ?? null;
  const isHls = debugInfo?.isHls ?? false;
  const usesBackendProxy = debugInfo?.usedBackendProxy ?? false;

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
        const hlsConfig: Partial<Hls["config"]> = { 
          enableWorker: true,
        };
        
        // Add auth headers for backend proxy
        if (usesBackendProxy && authToken) {
          hlsConfig.xhrSetup = (xhr: XMLHttpRequest, url: string) => {
            xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
          };
        }
        
        const hls = new Hls(hlsConfig as Hls["config"]);
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
  }, [preparedUrl, isHls, usesBackendProxy, authToken, reloadKey, teardown, fail]);

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

        {/* Debug Overlay */}
        <DebugOverlay 
          debugInfo={debugInfo}
          streamQuality={streamQuality}
          isExpanded={showDebug}
          onToggle={() => setShowDebug(v => !v)}
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
