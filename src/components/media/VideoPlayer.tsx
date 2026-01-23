import { useState, useRef, useEffect, useCallback } from "react";
import { X, Play, ExternalLink, AlertCircle, RefreshCw } from "lucide-react";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";
import "video.js/dist/video-js.css";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePlaybackSettings } from "@/hooks/usePlaybackSettings";
import { useVideoPlayerOrientation } from "@/hooks/useScreenOrientation";
import { useBrowseHere } from "@/hooks/useBrowseHere";
import { prepareStreamUrl, forceHttps } from "@/lib/streamUtils";

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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoFullscreenedRef = useRef(false);

  const { settings } = usePlaybackSettings();
  const { useNativePlayer } = useBrowseHere();
  
  // Lock to landscape orientation on native apps
  useVideoPlayerOrientation(true);

  const [showPlayScreen, setShowPlayScreen] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isReady, setIsReady] = useState(false);
  const errorRetryCountRef = useRef(0);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_AUTO_RETRIES = 3;

  const src = media.source_url;
  const backdropUrl = media.backdrop_path 
    ? `https://image.tmdb.org/t/p/w1280${media.backdrop_path}`
    : media.poster_path 
      ? `https://image.tmdb.org/t/p/w780${media.poster_path}`
      : null;

  // Prepare stream URL with CORS proxy if enabled
  const getPreparedUrl = useCallback(() => {
    if (!src) return null;
    const isHlsStream = src.includes('.m3u8') || src.includes('m3u8');
    const useCorsProxy = settings.useCorsProxy;
    
    // For HLS, always use proxy if enabled
    if (isHlsStream && useCorsProxy) {
      return prepareStreamUrl(src, true);
    }
    
    // For direct streams, use CORS proxy if enabled
    return useCorsProxy ? prepareStreamUrl(src, true) : forceHttps(src);
  }, [src, settings.useCorsProxy]);

  // Open in VLC
  const openInVlc = useCallback(() => {
    if (!src) return;
    const vlcUrl = `vlc://${src}`;
    window.open(vlcUrl, "_blank");
  }, [src]);

  // Copy stream URL
  const copyStreamUrl = useCallback(async () => {
    if (!src) return;
    try {
      await navigator.clipboard.writeText(src);
    } catch (err) {
      console.error("Failed to copy stream URL:", err);
    }
  }, [src]);

  // Enter fullscreen
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
      hasAutoFullscreenedRef.current = true;
    } catch (err) {
      console.warn("Fullscreen failed:", err);
      hasAutoFullscreenedRef.current = true;
    }
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().then(onClose).catch(onClose);
    } else {
      onClose();
    }
  }, [onClose]);

  // Retry playback
  const handleRetry = useCallback(() => {
    setHasError(false);
    setErrorMessage("");
    errorRetryCountRef.current = 0; // Reset retry count on manual retry
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    if (playerRef.current && src) {
      const preparedUrl = getPreparedUrl();
      if (preparedUrl) {
        const isHls = src.includes('.m3u8');
        playerRef.current.src({
          src: preparedUrl,
          type: isHls ? 'application/x-mpegURL' : 'video/mp4'
        });
        playerRef.current.play()?.catch(console.error);
      }
    }
  }, [src, getPreparedUrl]);

  // Initialize Video.js player
  useEffect(() => {
    if (showPlayScreen || !videoRef.current || !src) return;

    const preparedUrl = getPreparedUrl();
    if (!preparedUrl) return;

    const isHlsStream = src.includes('.m3u8') || src.includes('m3u8');

    // Video.js options with professional configuration
    const options: any = {
      autoplay: true,
      controls: true,
      responsive: true,
      fluid: false,
      fill: true,
      preload: 'auto',
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
      controlBar: {
        children: [
          'playToggle',
          'volumePanel',
          'currentTimeDisplay',
          'timeDivider',
          'durationDisplay',
          'progressControl',
          'remainingTimeDisplay',
          'playbackRateMenuButton',
          'fullscreenToggle',
        ],
        volumePanel: {
          inline: false,
        },
      },
      html5: {
        vhs: {
          overrideNative: !useNativePlayer,
          enableLowInitialPlaylist: true,
          smoothQualityChange: true,
          handlePartialData: true,
        },
        nativeAudioTracks: useNativePlayer,
        nativeVideoTracks: useNativePlayer,
      },
      sources: [{
        src: preparedUrl,
        type: isHlsStream ? 'application/x-mpegURL' : 'video/mp4',
      }],
      poster: backdropUrl || undefined,
    };

    // Create Video.js player
    const player = videojs(videoRef.current, options, function onPlayerReady() {
      console.log('[VideoPlayer] Video.js player is ready');
      setIsReady(true);
      
      // Enter fullscreen after player is ready
      setTimeout(() => {
        enterFullscreen();
      }, 100);
    });

    playerRef.current = player;

    // Handle errors with retry logic
    player.on('error', () => {
      const error = player.error();
      console.error('[VideoPlayer] Video.js error:', error, 'Retry count:', errorRetryCountRef.current);
      
      // Clear any pending error timeout
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      
      // Auto-retry a few times before showing error
      if (errorRetryCountRef.current < MAX_AUTO_RETRIES) {
        errorRetryCountRef.current += 1;
        console.log(`[VideoPlayer] Auto-retrying... (${errorRetryCountRef.current}/${MAX_AUTO_RETRIES})`);
        
        // Wait and retry
        errorTimeoutRef.current = setTimeout(() => {
          if (playerRef.current && src) {
            const retryUrl = getPreparedUrl();
            if (retryUrl) {
              const isHls = src.includes('.m3u8');
              playerRef.current.src({
                src: retryUrl,
                type: isHls ? 'application/x-mpegURL' : 'video/mp4'
              });
              playerRef.current.play()?.catch(console.error);
            }
          }
        }, 1500);
        return;
      }
      
      // After max retries, show error after a delay to allow recovery
      errorTimeoutRef.current = setTimeout(() => {
        let message = 'Stream currently unavailable. Try another link or open in VLC.';
        
        if (error) {
          switch (error.code) {
            case 2: // MEDIA_ERR_NETWORK
              message = 'Network error. Check your connection or try VLC.';
              break;
            case 3: // MEDIA_ERR_DECODE
              message = 'Media decode error. This format may not be supported in browser.';
              break;
            case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
              message = 'Source not supported. Try opening in VLC.';
              break;
          }
        }
        
        setHasError(true);
        setErrorMessage(message);
        
        if (onPlaybackError) {
          onPlaybackError();
        }
      }, 2000);
    });

    // Handle ended
    player.on('ended', () => {
      console.log('[VideoPlayer] Playback ended');
    });

    // Cleanup on unmount
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [showPlayScreen, src, backdropUrl, getPreparedUrl, enterFullscreen, useNativePlayer, onPlaybackError]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          handleClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Handle play screen click
  const handlePlayScreenClick = () => {
    setShowPlayScreen(false);
  };

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
        
        {/* Close button */}
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
        
        {/* Content */}
        <div className="relative z-10 flex flex-row items-center gap-6 p-4">
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 bg-primary/40 rounded-full blur-xl animate-pulse" />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-2xl hover:scale-105 transition-transform">
              <Play className="w-8 h-8 text-primary-foreground ml-0.5" />
            </div>
          </div>
          
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

  return (
    <div
      ref={containerRef}
      className="fixed left-0 top-0 z-[100] w-screen h-screen h-[100svh] bg-black flex flex-col overflow-hidden"
    >
      {/* Video.js Player Container */}
      <div className="flex-1 relative">
        {/* Error State */}
        {hasError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-30 p-6">
            <div className="bg-destructive/20 border border-destructive/30 rounded-2xl p-8 max-w-md text-center">
              <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">Playback Error</h2>
              <p className="text-muted-foreground mb-6">{errorMessage}</p>
              
              <div className="flex flex-col gap-3">
                <Button onClick={handleRetry} variant="outline" className="w-full gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </Button>
                
                <Button onClick={openInVlc} className="w-full gap-2 bg-orange-500 hover:bg-orange-600 text-white">
                  <ExternalLink className="w-4 h-4" />
                  Open in VLC
                </Button>
                
                <Button onClick={handleClose} variant="ghost" className="w-full">
                  Close Player
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Video.js Element */}
        <div data-vjs-player className="w-full h-full">
          <video
            ref={videoRef}
            className={cn(
              "video-js vjs-big-play-centered vjs-theme-city",
              "w-full h-full"
            )}
            playsInline
          />
        </div>

        {/* Close button overlay */}
        {!hasError && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-40 text-white/80 hover:text-white hover:bg-white/20"
            onClick={handleClose}
          >
            <X className="w-6 h-6" />
          </Button>
        )}

        {/* Title overlay */}
        {isReady && !hasError && (
          <div className="absolute top-4 left-4 z-30 pointer-events-none">
            <h2 className="text-white text-lg font-medium drop-shadow-lg">{media.title}</h2>
            {streamQuality && (
              <p className="text-white/70 text-sm drop-shadow-lg">
                {streamQuality.quality} {streamQuality.size && `• ${streamQuality.size}`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* VLC Fallback Button - Below Player */}
      <div className="bg-black/95 border-t border-white/10 p-4">
        <div className="flex items-center justify-center gap-4 max-w-lg mx-auto">
          <Button
            onClick={openInVlc}
            variant="outline"
            className="flex-1 gap-2 bg-gradient-to-r from-orange-500/20 to-orange-600/20 border-orange-500/40 hover:bg-orange-500/30 text-orange-400 hover:text-orange-300"
          >
            <ExternalLink className="w-4 h-4" />
            External Player (VLC)
          </Button>
          
          <Button
            onClick={copyStreamUrl}
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
          >
            Copy URL
          </Button>
        </div>
      </div>
    </div>
  );
}

export default VideoPlayer;
