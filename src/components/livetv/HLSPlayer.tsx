import { useRef, useEffect, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Play, Pause, Volume2, VolumeX, Maximize, X, RefreshCw, Shield, ToggleLeft, ToggleRight } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

// CORS proxy options - can be extended with custom proxies
const CORS_PROXIES = [
  '', // Direct (no proxy)
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://cors-anywhere.herokuapp.com/',
  'https://cors.eu.org/',
];

// Error type detection
interface StreamError {
  type: 'cors' | 'forbidden' | 'network' | 'media' | 'unknown';
  message: string;
  suggestion: string;
}

const detectErrorType = (error: any, response?: any): StreamError => {
  // Handle HLS.js LoaderResponse or standard Response/XMLHttpRequest
  const status = response?.code || response?.status;
  
  if (status === 403) {
    return {
      type: 'forbidden',
      message: 'Stream blocked by provider (403 Forbidden)',
      suggestion: 'Enable Proxy Mode or try a different source'
    };
  }
  
  if (status === 404) {
    return {
      type: 'network',
      message: 'Stream not found (404)',
      suggestion: 'The stream URL may have changed or expired'
    };
  }
  
  // CORS detection - typically shows as network error with no status
  if (!status && (error?.message?.includes('network') || error?.type === Hls?.ErrorTypes?.NETWORK_ERROR)) {
    return {
      type: 'cors',
      message: 'Stream blocked by CORS policy',
      suggestion: 'Enable Proxy Mode to bypass CORS restrictions'
    };
  }
  
  if (error?.type === 'mediaError' || error?.type === Hls?.ErrorTypes?.MEDIA_ERROR) {
    return {
      type: 'media',
      message: 'Media format error',
      suggestion: 'The stream format may not be compatible'
    };
  }
  
  return {
    type: 'unknown',
    message: 'Stream failed to load',
    suggestion: 'Try enabling Proxy Mode or check if the stream is online'
  };
};

interface HLSPlayerProps {
  url: string;
  originalUrl?: string; // Preserved URL for EPG matching (use this for identification)
  channelId?: string; // Channel ID for proxy persistence
  channelName: string;
  channelLogo?: string;
  isUnstable?: boolean;
  globalProxyEnabled?: boolean;
  proxyModeEnabled?: boolean;
  controlsVisible?: boolean; // External control for controls visibility
  onProxyModeChange?: (enabled: boolean) => void;
  onProxyRequired?: (channelId: string) => void; // Callback when proxy is needed
  onError?: () => void;
  onClose?: () => void;
}

export function HLSPlayer({ 
  url, 
  originalUrl,
  channelId,
  channelName, 
  channelLogo,
  isUnstable,
  globalProxyEnabled = false,
  proxyModeEnabled = false,
  controlsVisible: externalControlsVisible,
  onProxyModeChange,
  onProxyRequired,
  onError, 
  onClose 
}: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasShownProxyToast = useRef(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isProxyOverlayVisible, setIsProxyOverlayVisible] = useState(true);
  const [streamError, setStreamError] = useState<StreamError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Compute effective controls visibility (internal OR external control)
  const effectiveShowControls = externalControlsVisible !== undefined 
    ? externalControlsVisible && showControls 
    : showControls;
  
  // Start with proxy if global proxy is enabled
  const initialProxyIndex = globalProxyEnabled || proxyModeEnabled ? 1 : 0;
  const [proxyIndex, setProxyIndex] = useState(initialProxyIndex);
  const [usingProxy, setUsingProxy] = useState(globalProxyEnabled || proxyModeEnabled);
  const [autoProxyAttempted, setAutoProxyAttempted] = useState(false);

  // Store the original URL for EPG matching - never modify this
  const epgMatchUrl = originalUrl || url;

  // Auto-hide proxy overlay after 5 seconds
  const resetOverlayTimer = useCallback(() => {
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }
    setIsProxyOverlayVisible(true);
    
    overlayTimeoutRef.current = setTimeout(() => {
      setIsProxyOverlayVisible(false);
    }, 5000);
  }, []);

  // Start overlay timer when stream starts playing
  useEffect(() => {
    if (!isLoading && !streamError) {
      resetOverlayTimer();
    }
    
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, [isLoading, streamError, url]); // Reset timer when stream changes

  // Sync proxy mode with global setting or external state
  useEffect(() => {
    const shouldUseProxy = globalProxyEnabled || proxyModeEnabled;
    if (shouldUseProxy && proxyIndex === 0) {
      setProxyIndex(1);
    } else if (!shouldUseProxy && proxyIndex > 0 && !autoProxyAttempted) {
      setProxyIndex(0);
    }
  }, [globalProxyEnabled, proxyModeEnabled]);

  // Get proxied URL
  const getProxiedUrl = useCallback((originalUrl: string, proxyIdx: number) => {
    const proxy = CORS_PROXIES[proxyIdx];
    if (!proxy) return originalUrl;
    
    // Different proxy services have different URL formats
    if (proxy.includes('allorigins')) {
      return proxy + encodeURIComponent(originalUrl);
    }
    if (proxy.includes('cors.eu.org')) {
      return proxy + originalUrl;
    }
    return proxy + encodeURIComponent(originalUrl);
  }, []);

  // Initialize HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    setStreamError(null);
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
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        // Enhanced XHR setup with header spoofing
        xhrSetup: function (xhr: XMLHttpRequest, xhrUrl: string) {
          xhr.withCredentials = false;
          
          // Add common headers to appear as a browser request
          try {
            xhr.setRequestHeader('Accept', '*/*');
            // Note: Some headers like Origin, Referer are restricted by browsers
            // and will be ignored, but we try anyway
          } catch (e) {
            // Header setting may fail for some restricted headers
            console.debug('Could not set some headers:', e);
          }
          
          // Track response for error detection
          xhr.addEventListener('load', function() {
            if (xhr.status >= 400) {
              console.warn(`Stream request failed with status ${xhr.status}`);
            }
          });
          
          xhr.addEventListener('error', function() {
            console.warn('XHR network error - likely CORS blocked');
          });
        },
        // Custom loader error handling
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 10000,
        levelLoadingTimeOut: 10000,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        setStreamError(null);
        setAutoProxyAttempted(false);
        video.play().catch(() => {
          // Autoplay blocked
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        console.log('HLS Error:', data.type, data.details, data);
        
        if (data.fatal) {
          const errorInfo = detectErrorType(
            { type: data.type, message: data.details },
            data.response
          );
          
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Show message that proxy is required but not supported
              if (!hasShownProxyToast.current) {
                hasShownProxyToast.current = true;
                toast.error('Can not add - proxy required', {
                  duration: 5000,
                });
              }
              setStreamError(errorInfo);
              setIsLoading(false);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Media error, attempting recovery...');
              hls.recoverMediaError();
              break;
            default:
              setStreamError(errorInfo);
              setIsLoading(false);
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
        // Auto-fallback to proxy on network errors
        if (proxyIndex < CORS_PROXIES.length - 1) {
          if (!hasShownProxyToast.current && proxyIndex === 0) {
            hasShownProxyToast.current = true;
            toast.info('CORS detected; switching to Proxy Mode...', {
              duration: 3000,
            });
            
            // Persist proxy requirement for this channel
            if (channelId && onProxyRequired) {
              onProxyRequired(channelId);
            }
          }
          setAutoProxyAttempted(true);
          setProxyIndex(prev => prev + 1);
        } else {
          setStreamError({
            type: 'cors',
            message: 'Stream blocked by CORS policy',
            suggestion: 'Enable Proxy Mode or use a CORS browser extension'
          });
          setIsLoading(false);
        }
      });
    } else {
      setStreamError({
        type: 'unknown',
        message: 'HLS not supported in this browser',
        suggestion: 'Try using Chrome, Firefox, or Safari'
      });
      setIsLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url, proxyIndex, getProxiedUrl, onError, autoProxyAttempted]);

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
    hasShownProxyToast.current = false;
    setAutoProxyAttempted(false);
    setProxyIndex(globalProxyEnabled || proxyModeEnabled ? 1 : 0);
    setStreamError(null);
    setIsLoading(true);
  }, [globalProxyEnabled, proxyModeEnabled]);

  // Toggle proxy mode
  const handleProxyModeToggle = useCallback((enabled: boolean) => {
    hasShownProxyToast.current = false;
    setAutoProxyAttempted(false);
    setStreamError(null);
    setIsLoading(true);
    setProxyIndex(enabled ? 1 : 0);
    onProxyModeChange?.(enabled);
  }, [onProxyModeChange]);

  // Try next proxy
  const tryNextProxy = useCallback(() => {
    if (proxyIndex < CORS_PROXIES.length - 1) {
      setProxyIndex(prev => prev + 1);
      setStreamError(null);
      setIsLoading(true);
    }
  }, [proxyIndex]);

  // Handle player area interaction - reset both controls and overlay timer
  const handlePlayerInteraction = useCallback(() => {
    resetControlsTimer();
    resetOverlayTimer();
  }, [resetControlsTimer, resetOverlayTimer]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative bg-black group",
        isFullscreen ? "fixed inset-0 z-50" : "w-full aspect-video rounded-lg overflow-hidden"
      )}
      onMouseMove={handlePlayerInteraction}
      onTouchStart={handlePlayerInteraction}
      onClick={handlePlayerInteraction}
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
      {streamError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-4 p-6">
          <AlertTriangle className={cn(
            "h-12 w-12",
            streamError.type === 'cors' || streamError.type === 'forbidden' 
              ? "text-orange-500" 
              : "text-yellow-500"
          )} />
          <div className="text-center max-w-md">
            <p className="text-white font-medium mb-2">{streamError.message}</p>
            <p className="text-white/70 text-sm">{streamError.suggestion}</p>
          </div>
          
          {/* Proxy Mode Toggle in Error State */}
          {(streamError.type === 'cors' || streamError.type === 'forbidden') && (
            <div className="flex items-center gap-3 bg-white/10 px-4 py-2 rounded-lg">
              <Shield className="h-5 w-5 text-blue-400" />
              <span className="text-white text-sm">Proxy Mode</span>
              <Switch
                checked={proxyIndex > 0}
                onCheckedChange={handleProxyModeToggle}
              />
            </div>
          )}
          
          <div className="flex flex-wrap gap-2 justify-center">
            <Button variant="outline" onClick={retry} size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry Direct
            </Button>
            {proxyIndex < CORS_PROXIES.length - 1 && (
              <Button variant="secondary" onClick={tryNextProxy} size="sm">
                <Shield className="mr-2 h-4 w-4" />
                Try Next Proxy
              </Button>
            )}
            {onError && (
              <Button variant="destructive" onClick={onError} size="sm">
                Mark Unstable
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Proxy Mode Toggle & Indicator - auto-hides after 5 seconds */}
      {!streamError && (
        <div
          className={cn(
            "absolute top-4 right-4 transition-opacity duration-500 ease-in-out",
            isProxyOverlayVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors",
                    usingProxy 
                      ? "bg-blue-500/80 text-white" 
                      : "bg-black/50 text-white/70 hover:bg-black/70"
                  )}
                  onClick={() => handleProxyModeToggle(!usingProxy)}
                >
                  <Shield className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {usingProxy ? 'Proxy On' : 'Proxy Off'}
                  </span>
                  {usingProxy ? (
                    <ToggleRight className="h-4 w-4" />
                  ) : (
                    <ToggleLeft className="h-4 w-4" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{usingProxy ? 'Disable proxy mode' : 'Enable proxy mode to bypass CORS'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
        "absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity z-10",
        effectiveShowControls ? "opacity-100" : "opacity-0 pointer-events-none"
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
        "absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity z-10",
        effectiveShowControls ? "opacity-100" : "opacity-0 pointer-events-none"
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

          {/* Quick Proxy Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "hover:bg-white/20",
                    usingProxy ? "text-blue-400" : "text-white"
                  )}
                  onClick={() => handleProxyModeToggle(!usingProxy)}
                >
                  <Shield className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{usingProxy ? 'Proxy On - Click to disable' : 'Proxy Off - Click to enable'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

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
