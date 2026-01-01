import { useRef, useEffect, useState, useCallback, forwardRef } from 'react';
import Hls from 'hls.js';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Play, Pause, Volume2, VolumeX, Maximize, X, RefreshCw, Settings, Wifi, WifiOff, Cpu, Zap, Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useVideoPlayerOrientation } from '@/hooks/useScreenOrientation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';


// HEVC/H.265 codec detection
interface HEVCSupport {
  supported: boolean;
  hardwareAccelerated: boolean;
}

const checkHEVCSupport = (): HEVCSupport => {
  const video = document.createElement('video');
  
  // Check various HEVC codec strings
  const hevcCodecs = [
    'video/mp4; codecs="hvc1"',
    'video/mp4; codecs="hev1"',
    'video/mp4; codecs="hvc1.1.6.L93.B0"',
    'video/mp4; codecs="hev1.1.6.L93.B0"',
    'video/quicktime; codecs="hvc1"',
  ];
  
  let supported = false;
  let probablySupported = false;
  
  for (const codec of hevcCodecs) {
    const result = video.canPlayType(codec);
    if (result === 'probably') {
      probablySupported = true;
      supported = true;
      break;
    } else if (result === 'maybe') {
      supported = true;
    }
  }
  
  // Hardware acceleration is likely if we get "probably" on Safari/Edge
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isEdge = /edg/i.test(navigator.userAgent);
  const hardwareAccelerated = probablySupported && (isSafari || isEdge);
  
  return { supported, hardwareAccelerated };
};

// Error type detection
interface StreamError {
  type: 'cors' | 'forbidden' | 'network' | 'media' | 'codec' | 'unknown';
  message: string;
  suggestion: string;
}

interface QualityLevel {
  height: number;
  bitrate: number;
  index: number;
}

const detectErrorType = (error: any, response?: any): StreamError => {
  const status = response?.code || response?.status;
  
  if (status === 403) {
    return {
      type: 'forbidden',
      message: 'Stream blocked by provider (403 Forbidden)',
      suggestion: 'Try a different source or proxy'
    };
  }
  
  if (status === 404) {
    return {
      type: 'network',
      message: 'Stream not found (404)',
      suggestion: 'The stream URL may have changed or expired'
    };
  }
  
  if (!status && (error?.message?.includes('network') || error?.type === Hls?.ErrorTypes?.NETWORK_ERROR)) {
    return {
      type: 'cors',
      message: 'Request blocked by browser (CORS)',
      suggestion: 'Try a different stream URL'
    };
  }

  
  if (error?.type === 'mediaError' || error?.type === Hls?.ErrorTypes?.MEDIA_ERROR) {
    // Check for specific codec incompatibility (HEVC/H.265)
    if (error?.message?.includes('IncompatibleCodecs') || 
        error?.details?.includes('IncompatibleCodecs') ||
        error?.message?.includes('manifestIncompatibleCodecsError')) {
      const hevcSupport = checkHEVCSupport();
      return {
        type: 'codec',
        message: 'Unsupported video codec (HEVC/H.265)',
        suggestion: hevcSupport.supported 
          ? 'Try enabling hardware acceleration in your browser settings'
          : 'Use Safari, Edge, or a browser with HEVC support'
      };
    }
    return {
      type: 'media',
      message: 'Media format error',
      suggestion: 'The stream format may not be compatible'
    };
  }
  
  return {
    type: 'unknown',
    message: 'Stream failed to load',
    suggestion: 'Check if the stream is online'
  };
};

interface HLSPlayerProps {
  url: string;
  originalUrl?: string;
  channelId?: string;
  channelName: string;
  channelLogo?: string;
  isUnstable?: boolean;
  hwAccelEnabled?: boolean;
  controlsVisible?: boolean;
  onError?: () => void;
  onClose?: () => void;
}

export const HLSPlayer = forwardRef<HTMLDivElement, HLSPlayerProps>(({ 
  url, 
  originalUrl,
  channelId,
  channelName, 
  channelLogo,
  isUnstable,
  hwAccelEnabled = true,
  controlsVisible: externalControlsVisible,
  onError, 
  onClose 
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasShownErrorToast = useRef(false);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [streamError, setStreamError] = useState<StreamError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 = auto
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  const [hwAccelStatus, setHwAccelStatus] = useState<'unknown' | 'active' | 'unavailable'>('unknown');
  const [isBehindLive, setIsBehindLive] = useState(false);

  // Lock to landscape orientation on native apps when fullscreen
  useVideoPlayerOrientation(isFullscreen);
  
  // Compute effective controls visibility (internal OR external control)
  const effectiveShowControls = externalControlsVisible !== undefined 
    ? externalControlsVisible && showControls 
    : showControls;


  // Initialize HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    const systemCheck = async (reason: string) => {
      const target = (originalUrl || url || '').trim();
      if (!target) return;

      try {
        const { data, error } = await supabase.functions.invoke('stream-check', {
          body: { url: target },
        });
        console.log('[SystemCheck]', { reason, target, data, error });
      } catch (err) {
        console.log('[SystemCheck]', { reason, target, error: err });
      }
    };

    setStreamError(null);
    setIsLoading(true);
    setConnectionStatus('connecting');
    hasShownErrorToast.current = false;

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const effectiveUrl = url;
    console.log(`Loading stream: ${effectiveUrl}`);


    if (Hls.isSupported()) {
      // Configure HLS.js based on hardware acceleration setting
      const hlsConfig: Partial<Hls['config']> = {
        enableWorker: true,
        lowLatencyMode: hwAccelEnabled, // Disable low latency in software mode for stability
        backBufferLength: hwAccelEnabled ? 90 : 30, // Smaller buffer for software decoding
        maxBufferLength: hwAccelEnabled ? 30 : 15,
        maxMaxBufferLength: hwAccelEnabled ? 600 : 120,
        startLevel: currentQuality, // Start at selected quality or auto (-1)
        // Enhanced codec compatibility settings
        preferManagedMediaSource: hwAccelEnabled, // Use ManagedMediaSource when HW accel enabled
        progressive: true, // Enable progressive loading for better compatibility
        // Prefer H.264/AVC over HEVC when multiple renditions available
        capLevelToPlayerSize: !hwAccelEnabled, // Force cap to player size when software decoding
        testBandwidth: true,
        // Hardware acceleration optimizations
        renderTextTracksNatively: true,
        // Allow hardware decoder to handle more codecs when enabled
        videoPreference: {
          preferHDR: hwAccelEnabled, // Only allow HDR when hardware acceleration is on
        },
        // Allow codec switching during playback
        // When stream has multiple codec variants, HLS.js can switch between them
        xhrSetup: function (xhr: XMLHttpRequest, xhrUrl: string) {
          xhr.withCredentials = false;
          
          try {
            xhr.setRequestHeader('Accept', '*/*');
          } catch (e) {
            console.debug('Could not set some headers:', e);
          }
          
          xhr.addEventListener('load', function() {
            if (xhr.status >= 400) {
              console.warn(`Stream request failed with status ${xhr.status}`);
            }
          });
          
          xhr.addEventListener('error', function() {
            console.warn('XHR network error - likely CORS blocked');
          });
        },
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 15000,
        levelLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 5,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        // More aggressive recovery settings
        fragLoadingMaxRetryTimeout: 64000,
        levelLoadingMaxRetryTimeout: 64000,
        // Audio codec preferences - helps with streams that have audio issues
        audioStreamController: undefined, // Use default audio handling
      };

      const hls = new Hls(hlsConfig);

      hls.loadSource(effectiveUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setIsLoading(false);
        setStreamError(null);
        setConnectionStatus('connected');
        retryCountRef.current = 0;
        
        // Extract quality levels
        const levels: QualityLevel[] = data.levels.map((level, index) => ({
          height: level.height,
          bitrate: level.bitrate,
          index,
        }));
        setQualityLevels(levels);
        
        // Detect hardware acceleration status based on codec and browser capabilities
        const detectHwAccel = () => {
          // Check if stream uses hardware-accelerated codecs
          const codecInfo = data.levels[0]?.codecSet || '';
          const isHEVC = codecInfo.toLowerCase().includes('hvc1') || codecInfo.toLowerCase().includes('hev1');
          const isAV1 = codecInfo.toLowerCase().includes('av01');
          const isH264 = codecInfo.toLowerCase().includes('avc') || !isHEVC && !isAV1;
          
          // Check browser/platform for hardware acceleration likelihood
          const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
          const isChrome = /chrome/i.test(navigator.userAgent) && !/edg/i.test(navigator.userAgent);
          const isEdge = /edg/i.test(navigator.userAgent);
          const isFirefox = /firefox/i.test(navigator.userAgent);
          
          // Check for WebGL (good indicator of GPU availability)
          let hasGPU = false;
          try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            hasGPU = !!gl;
          } catch {
            hasGPU = false;
          }
          
          // H.264 is hardware accelerated on virtually all modern devices
          // HEVC is hardware accelerated on Safari/Edge and some Chrome platforms
          // AV1 hardware support is newer but growing
          if (hasGPU) {
            if (isH264) {
              setHwAccelStatus('active'); // H.264 is almost always HW accelerated
            } else if (isHEVC && (isSafari || isEdge)) {
              setHwAccelStatus('active');
            } else if (isAV1 && (isChrome || isEdge)) {
              // AV1 HW support on newer GPUs
              setHwAccelStatus('active');
            } else if (isHEVC || isAV1) {
              // These codecs on unsupported browsers likely use software decoding
              setHwAccelStatus('unavailable');
            } else {
              setHwAccelStatus('active');
            }
          } else {
            setHwAccelStatus('unavailable');
          }
        };
        
        detectHwAccel();
        
        video.play().catch(() => {
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        console.log(`Quality switched to level ${data.level}`);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error('Fatal HLS error:', data.type, data.details);
          setConnectionStatus('failed');
          
          const errorInfo = detectErrorType(
            { type: data.type, message: data.details },
            data.response
          );
          
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR: {
              const isHttpStream = url.startsWith('http://');
              const isHttpsSite = typeof window !== 'undefined' && window.location.protocol === 'https:';
              const isMixedContent = isHttpStream && isHttpsSite;

              // Direct-only: mixed content will never work on HTTPS pages.
              if (isMixedContent) {
                void systemCheck('mixed_content_blocked');
                if (!hasShownErrorToast.current) {
                  hasShownErrorToast.current = true;
                  toast.error('Stream blocked by browser (mixed content)', { duration: 5000 });
                }
                setStreamError({
                  type: 'network',
                  message: 'Mixed content blocked',
                  suggestion: 'This HTTP stream cannot play on an HTTPS site.'
                });
                setIsLoading(false);
                break;
              }

              retryCountRef.current++;

              if (retryCountRef.current <= maxRetries) {
                console.log(`Retry attempt ${retryCountRef.current}/${maxRetries}`);
                hls.startLoad();
                return;
              }

              void systemCheck('network_error_exhausted');
              if (!hasShownErrorToast.current) {
                hasShownErrorToast.current = true;
                toast.error('Stream unavailable', { duration: 5000 });
              }
              setStreamError({
                type: 'network',
                message: 'Connection failed',
                suggestion: 'The stream may be geo-restricted or offline'
              });
              setIsLoading(false);
              break;
            }

            case Hls.ErrorTypes.MEDIA_ERROR:
              // Check if this is an unrecoverable codec error (HEVC/H.265)
              if (data.details === 'manifestIncompatibleCodecsError') {
                console.error('Unrecoverable codec error - stream uses unsupported codec');
                const hevcSupport = checkHEVCSupport();
                
                if (!hasShownErrorToast.current) {
                  hasShownErrorToast.current = true;
                  if (hevcSupport.supported) {
                    toast.error('HEVC stream detected. Try enabling hardware acceleration.', { 
                      duration: 6000,
                      description: 'Your browser may support HEVC with hardware acceleration enabled.'
                    });
                  } else {
                    toast.error('Your browser does not support HEVC. Please use Safari/Edge or enable hardware acceleration.', { 
                      duration: 6000 
                    });
                  }
                }
                
                setStreamError({
                  type: 'codec',
                  message: 'Unsupported codec (HEVC/H.265)',
                  suggestion: hevcSupport.supported 
                    ? 'Try enabling hardware acceleration in your browser settings'
                    : 'Use Safari, Edge, or a browser with HEVC codec support'
                });
                setIsLoading(false);
                onError?.();
              } else {
                console.log('Media error, attempting recovery...');
                hls.recoverMediaError();
              }
              break;

            default:
              void systemCheck('fatal_error');
              setStreamError(errorInfo);
              setIsLoading(false);
              onError?.();
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = effectiveUrl;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        setConnectionStatus('connected');
        video.play().catch(() => setIsPlaying(false));
      });
      
      video.addEventListener('error', () => {
        void systemCheck('safari_error');
        if (!hasShownErrorToast.current) {
          hasShownErrorToast.current = true;
          toast.error('Stream unavailable', {
            duration: 5000,
          });
        }
        setStreamError({
          type: 'network',
          message: 'Connection failed',
          suggestion: 'This stream may be geo-restricted or offline'
        });
        setIsLoading(false);
        setConnectionStatus('failed');
      });

    } else {
      setStreamError({
        type: 'unknown',
        message: 'HLS not supported in this browser',
        suggestion: 'Try using Chrome, Firefox, or Safari'
      });
      setIsLoading(false);
      setConnectionStatus('failed');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url, originalUrl, onError, currentQuality, reloadKey, hwAccelEnabled]);


  // Handle quality change
  const handleQualityChange = useCallback((levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentQuality(levelIndex);
      toast.success(levelIndex === -1 ? 'Quality: Auto' : `Quality: ${qualityLevels.find(l => l.index === levelIndex)?.height}p`, {
        duration: 2000,
      });
    }
  }, [qualityLevels]);

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
    
    // Check if we're behind live edge
    const checkBehindLive = () => {
      if (video.duration && isFinite(video.duration)) {
        // Consider "behind live" if more than 10 seconds from the live edge
        const behindBy = video.duration - video.currentTime;
        setIsBehindLive(behindBy > 10);
      } else {
        setIsBehindLive(false);
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', checkBehindLive);
    
    // Also check periodically (for when paused, the live edge keeps moving)
    const intervalId = setInterval(checkBehindLive, 1000);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', checkBehindLive);
      clearInterval(intervalId);
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

  // Listen for fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    
    // Hide controls after 5 seconds
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 5000);
  }, []);

  // Start the controls timer when video starts playing
  useEffect(() => {
    if (isPlaying) {
      resetControlsTimer();
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isPlaying, resetControlsTimer]);

  // Retry loading
  const retry = useCallback(() => {
    hasShownErrorToast.current = false;
    retryCountRef.current = 0;
    setStreamError(null);
    setIsLoading(true);
    setConnectionStatus('connecting');
    setReloadKey((k) => k + 1);
  }, []);

  // Skip to live edge
  const skipToLive = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    // Seek to the live edge (end of the stream)
    if (video.duration && isFinite(video.duration)) {
      video.currentTime = video.duration;
    }
    
    // If paused, also start playing
    if (video.paused) {
      video.play().catch(() => {});
    }
    
    // Note: isBehindLive will be updated by the interval/timeupdate check
    toast.success('Jumped to live', { duration: 2000 });
  }, []);


  // Handle player area interaction
  const handlePlayerInteraction = useCallback(() => {
    resetControlsTimer();
  }, [resetControlsTimer]);

  // Keyboard controls for fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      handlePlayerInteraction();
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'Escape') {
        toggleFullscreen();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, handlePlayerInteraction, togglePlay, toggleFullscreen]);

  // Format bitrate for display
  const formatBitrate = (bitrate: number) => {
    if (bitrate >= 1000000) {
      return `${(bitrate / 1000000).toFixed(1)} Mbps`;
    }
    return `${(bitrate / 1000).toFixed(0)} Kbps`;
  };

  return (
    <div
      ref={(node) => {
        // Handle both refs
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      }}
      className={cn(
        "relative bg-black group",
        isFullscreen ? "fixed inset-0 z-[100]" : "w-full aspect-video rounded-lg overflow-hidden"
      )}
      style={{ touchAction: 'manipulation' }}
      onMouseMove={handlePlayerInteraction}
      onTouchStart={handlePlayerInteraction}
      onTouchEnd={() => isFullscreen && handlePlayerInteraction()}
      onClick={handlePlayerInteraction}
    >
      {/* Video Element */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        crossOrigin="anonymous"
        style={{ 
          transform: 'translateZ(0)', // Force GPU layer
          backfaceVisibility: 'hidden',
          willChange: 'transform',
        }}
        {...{ 'x-webkit-airplay': 'allow' } as any}
      />
      
      {/* Click overlay for play/pause - separate from video to not block controls */}
      <div 
        className="absolute inset-0 z-10" 
        onClick={(e) => {
          handlePlayerInteraction();
          if (e.target === e.currentTarget) {
            togglePlay();
          }
        }}
        onTouchStart={() => handlePlayerInteraction()}
      />


      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-2">
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
              : streamError.type === 'codec'
              ? "text-purple-500"
              : "text-yellow-500"
          )} />
          <div className="text-center max-w-md">
            <p className="text-white font-medium mb-2">{streamError.message}</p>
            <p className="text-white/70 text-sm">{streamError.suggestion}</p>
            {streamError.type === 'codec' && (
              <p className="text-white/50 text-xs mt-2">
                HEVC/H.265 requires Safari, Edge, or hardware acceleration support.
              </p>
            )}
          </div>
          
          <div className="flex flex-wrap gap-2 justify-center">
            <Button variant="outline" onClick={retry} size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            {onError && (
              <Button variant="destructive" onClick={onError} size="sm">
                Mark Unstable
              </Button>
            )}
          </div>

        </div>
      )}

      {/* Connection & Hardware Status Indicators */}
      <div className={cn(
        "absolute top-4 right-4 flex items-center gap-2 transition-opacity",
        effectiveShowControls ? "opacity-100" : "opacity-0"
      )}>
        {/* Hardware Acceleration Badge */}
        {connectionStatus === 'connected' && hwAccelStatus !== 'unknown' && (
          <Badge 
            variant={hwAccelStatus === 'active' ? 'default' : 'secondary'}
            className={cn(
              "flex items-center gap-1 text-xs",
              hwAccelStatus === 'active' 
                ? "bg-purple-600/90 hover:bg-purple-600/90 text-white border-purple-500/50" 
                : "bg-muted/80 text-muted-foreground"
            )}
          >
            {hwAccelStatus === 'active' ? (
              <>
                <Zap className="h-3 w-3" />
                <span>HW Accel</span>
              </>
            ) : (
              <>
                <Cpu className="h-3 w-3" />
                <span>Software</span>
              </>
            )}
          </Badge>
        )}
        
        {/* Connection Status */}
        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs",
          connectionStatus === 'connected' ? "bg-green-500/80 text-white" : 
          connectionStatus === 'connecting' ? "bg-yellow-500/80 text-black" : 
          "bg-red-500/80 text-white"
        )}>
          {connectionStatus === 'connected' ? (
            <><Wifi className="h-3 w-3" /> Direct</>
          ) : connectionStatus === 'connecting' ? (
            <><RefreshCw className="h-3 w-3 animate-spin" /> Connecting...</>
          ) : (
            <><WifiOff className="h-3 w-3" /> Failed</>
          )}
        </div>
      </div>

      {/* Unstable Warning */}
      {isUnstable && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-yellow-500/80 text-black px-3 py-1 rounded-full text-sm">
          <AlertTriangle className="h-4 w-4" />
          Unstable Stream
        </div>
      )}

      {/* Channel Info */}
      <div className={cn(
        "absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity z-20",
        effectiveShowControls ? "opacity-100" : "opacity-0 pointer-events-none"
      )} onClick={(e) => e.stopPropagation()}>
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
        "absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity z-20",
        effectiveShowControls ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </Button>

          {/* Live Button - always visible, changes state based on live edge */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "gap-1.5 px-3 transition-all",
              isBehindLive 
                ? "text-white/70 hover:bg-white/20 hover:text-white" 
                : "text-white hover:bg-white/20"
            )}
            onClick={isBehindLive ? skipToLive : undefined}
            disabled={!isBehindLive}
          >
            <Radio className={cn(
              "h-4 w-4 transition-colors",
              isBehindLive ? "text-white/50" : "text-red-500 animate-pulse"
            )} />
            <span className="text-sm font-medium">LIVE</span>
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

          {/* Settings (Quality) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {qualityLevels.length > 1 && (
                <>
                  <DropdownMenuLabel>Quality</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => handleQualityChange(-1)}
                    className={cn(currentQuality === -1 && "bg-accent")}
                  >
                    Auto
                  </DropdownMenuItem>
                  {qualityLevels
                    .sort((a, b) => b.height - a.height)
                    .map((level) => (
                      <DropdownMenuItem 
                        key={level.index}
                        onClick={() => handleQualityChange(level.index)}
                        className={cn(currentQuality === level.index && "bg-accent")}
                      >
                        {level.height}p ({formatBitrate(level.bitrate)})
                      </DropdownMenuItem>
                    ))}
                  <DropdownMenuSeparator />
                </>
              )}

            </DropdownMenuContent>
          </DropdownMenu>

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
});

HLSPlayer.displayName = 'HLSPlayer';
