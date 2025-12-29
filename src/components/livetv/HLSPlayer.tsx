import { useRef, useEffect, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Play, Pause, Volume2, VolumeX, Maximize, X, RefreshCw, Shield } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

// CORS proxy options - user can configure in settings
const CORS_PROXIES = [
  '', // Direct (no proxy)
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
];

interface HLSPlayerProps {
  url: string;
  channelName: string;
  channelLogo?: string;
  isUnstable?: boolean;
  onError?: () => void;
  onClose?: () => void;
}

export function HLSPlayer({ 
  url, 
  channelName, 
  channelLogo,
  isUnstable,
  onError, 
  onClose 
}: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [proxyIndex, setProxyIndex] = useState(0);
  const [usingProxy, setUsingProxy] = useState(false);

  // Get proxied URL
  const getProxiedUrl = useCallback((originalUrl: string, proxyIdx: number) => {
    const proxy = CORS_PROXIES[proxyIdx];
    if (!proxy) return originalUrl;
    return proxy + encodeURIComponent(originalUrl);
  }, []);

  // Initialize HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    setError(null);
    setIsLoading(true);

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const streamUrl = getProxiedUrl(url, proxyIndex);
    setUsingProxy(proxyIndex > 0);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        // Allow cross-origin requests
        xhrSetup: function (xhr, url) {
          xhr.withCredentials = false;
        },
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        setError(null);
        video.play().catch(() => {
          // Autoplay blocked
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // If direct failed and we haven't tried all proxies, try next proxy
              if (proxyIndex < CORS_PROXIES.length - 1) {
                console.log('Network error, trying CORS proxy...');
                setProxyIndex(prev => prev + 1);
              } else {
                setError('Network error - stream may be blocked by CORS or offline');
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError('Media error - attempting recovery');
              hls.recoverMediaError();
              break;
            default:
              setError('Stream failed to load');
              onError?.();
              break;
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        video.play().catch(() => setIsPlaying(false));
      });
      video.addEventListener('error', () => {
        if (proxyIndex < CORS_PROXIES.length - 1) {
          setProxyIndex(prev => prev + 1);
        } else {
          setError('Network error - stream may be blocked by CORS or offline');
        }
      });
    } else {
      setError('HLS not supported in this browser');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url, proxyIndex, getProxiedUrl, onError]);

  // Handle play/pause
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  // Handle video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, []);

  // Handle volume
  const handleVolumeChange = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    
    const vol = value[0];
    video.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    if (isMuted) {
      video.volume = volume || 1;
      setIsMuted(false);
    } else {
      video.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  // Handle fullscreen
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  // Handle fullscreen change
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Retry loading - reset to direct first, then try proxies
  const retry = useCallback(() => {
    setProxyIndex(0);
    setError(null);
    setIsLoading(true);
  }, []);

  // Try with CORS proxy
  const tryWithProxy = useCallback(() => {
    if (proxyIndex < CORS_PROXIES.length - 1) {
      setProxyIndex(prev => prev + 1);
      setError(null);
      setIsLoading(true);
    }
  }, [proxyIndex]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative bg-black group",
        isFullscreen ? "fixed inset-0 z-50" : "w-full aspect-video rounded-lg overflow-hidden"
      )}
      onMouseMove={resetControlsTimer}
      onTouchStart={resetControlsTimer}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        onClick={togglePlay}
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-4">
          <AlertTriangle className="h-12 w-12 text-yellow-500" />
          <p className="text-white text-center px-4">{error}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={retry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            {proxyIndex < CORS_PROXIES.length - 1 && (
              <Button variant="secondary" onClick={tryWithProxy}>
                <Shield className="mr-2 h-4 w-4" />
                Try with Proxy
              </Button>
            )}
            {onError && (
              <Button variant="destructive" onClick={onError}>
                Mark as Unstable
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Using Proxy Indicator */}
      {usingProxy && !error && (
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-blue-500/80 text-white px-3 py-1 rounded-full text-sm">
          <Shield className="h-4 w-4" />
          Via Proxy
        </div>
      )}

      {/* Unstable Warning */}
      {isUnstable && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-yellow-500/80 text-black px-3 py-1 rounded-full text-sm">
          <AlertTriangle className="h-4 w-4" />
          Unstable Stream
        </div>
      )}

      {/* Channel Info */}
      <div className={cn(
        "absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity",
        showControls ? "opacity-100" : "opacity-0"
      )}>
        <div className="flex items-center gap-3">
          {channelLogo && (
            <img 
              src={channelLogo} 
              alt={channelName}
              className="h-8 w-auto rounded"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          )}
          <span className="text-white font-medium">{channelName}</span>
        </div>
      </div>

      {/* Controls */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity",
        showControls ? "opacity-100" : "opacity-0"
      )}>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </Button>

          <div className="flex items-center gap-2 w-32">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={toggleMute}
            >
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              max={1}
              step={0.1}
              onValueChange={handleVolumeChange}
              className="flex-1"
            />
          </div>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={toggleFullscreen}
          >
            <Maximize className="h-5 w-5" />
          </Button>

          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
