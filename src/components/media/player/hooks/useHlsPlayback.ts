/**
 * useHlsPlayback Hook
 * 
 * Manages HLS.js instance lifecycle, stream loading, and playback state.
 */

import { useRef, useCallback, useState } from "react";
import Hls from "hls.js";

export interface HlsDebugState {
  hlsAttached: boolean;
  manifestLoaded: boolean;
  currentLevel: number;
  levels: { height: number; bitrate: number }[];
  bufferedRanges: { start: number; end: number }[];
  currentTime: number;
  duration: number;
  lastError: string | null;
  lastErrorTime: number | null;
}

interface UseHlsPlaybackOptions {
  onManifestParsed?: () => void;
  onError?: (message: string) => void;
  onPlaybackStarted?: () => void;
  onMutedAutoplay?: () => void; // Called when we had to mute for autoplay
}

const LOAD_TIMEOUT_MS = 25000;
const MAX_RETRY_ATTEMPTS = 3;

export function useHlsPlayback(options: UseHlsPlaybackOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const loadTimeoutRef = useRef<number | null>(null);
  const currentUrlRef = useRef<string>("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [timeoutMessage, setTimeoutMessage] = useState<string | null>(null);
  
  const [debugState, setDebugState] = useState<HlsDebugState>({
    hlsAttached: false,
    manifestLoaded: false,
    currentLevel: -1,
    levels: [],
    bufferedRanges: [],
    currentTime: 0,
    duration: 0,
    lastError: null,
    lastErrorTime: null,
  });

  const updateDebugState = useCallback((updates: Partial<HlsDebugState>) => {
    setDebugState(prev => ({ ...prev, ...updates }));
  }, []);

  const updateBufferInfo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const buffered = video.buffered;
    const ranges: { start: number; end: number }[] = [];
    for (let i = 0; i < buffered.length; i++) {
      ranges.push({ start: buffered.start(i), end: buffered.end(i) });
    }
    
    updateDebugState({
      bufferedRanges: ranges,
      currentTime: video.currentTime,
      duration: video.duration || 0,
    });
  }, [updateDebugState]);

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const cleanup = useCallback((resetState = true) => {
    clearLoadTimeout();
    
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    
    if (resetState) {
      setIsLoading(false);
      setError(null);
      setTimeoutMessage(null);
      updateDebugState({
        hlsAttached: false,
        manifestLoaded: false,
        currentLevel: -1,
        levels: [],
        bufferedRanges: [],
        lastError: null,
      });
    }
  }, [clearLoadTimeout, updateDebugState]);

  const startLoadTimeout = useCallback((onTimeout: () => void) => {
    clearLoadTimeout();
    loadTimeoutRef.current = window.setTimeout(() => {
      if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
        console.log(`[useHlsPlayback] Load timeout, retrying (${retryCount + 1}/${MAX_RETRY_ATTEMPTS})...`);
        setTimeoutMessage(`Stream taking too long. Retrying (${retryCount + 2}/${MAX_RETRY_ATTEMPTS})...`);
        setRetryCount(prev => prev + 1);
        onTimeout();
      } else {
        console.error('[useHlsPlayback] Load timeout after all retries');
        setTimeoutMessage(null);
        setError('Stream failed to load. The source may be unavailable or too slow.');
        updateDebugState({ lastError: 'Load timeout', lastErrorTime: Date.now() });
        setIsLoading(false);
      }
    }, LOAD_TIMEOUT_MS);
  }, [clearLoadTimeout, retryCount, updateDebugState]);

  const loadSource = useCallback((url: string, resumeTime = 0) => {
    const video = videoRef.current;
    if (!video) return;

    console.log('[useHlsPlayback] Loading source:', url);
    currentUrlRef.current = url;
    setIsLoading(true);
    setError(null);
    setTimeoutMessage(null);

    const isHLS = url.includes('.m3u8') || url.includes('m3u8');

    const startPlayback = async () => {
      clearLoadTimeout();
      if (resumeTime > 0) {
        video.currentTime = resumeTime;
      }
      
      try {
        // Try unmuted autoplay first
        await video.play();
        setIsLoading(false);
        setTimeoutMessage(null);
        setRetryCount(0);
        options.onPlaybackStarted?.();
      } catch (e) {
        console.log('[useHlsPlayback] Unmuted autoplay blocked, trying muted...');
        // Fallback to muted autoplay
        video.muted = true;
        try {
          await video.play();
          setIsLoading(false);
          setTimeoutMessage(null);
          setRetryCount(0);
          options.onPlaybackStarted?.();
          options.onMutedAutoplay?.(); // Notify that we had to mute
        } catch (mutedError) {
          console.error('[useHlsPlayback] Even muted autoplay failed:', mutedError);
          setError('Tap video to play');
          updateDebugState({ lastError: 'Autoplay blocked', lastErrorTime: Date.now() });
          setIsLoading(false);
        }
      }
    };

    const handleRetry = () => {
      cleanup(false);
      setIsLoading(true);
      loadSource(url, resumeTime);
    };

    startLoadTimeout(handleRetry);

    try {
      if (isHLS && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
        });
        hlsRef.current = hls;
        updateDebugState({ hlsAttached: true });

        hls.on(Hls.Events.LEVEL_LOADED, () => {
          updateDebugState({
            levels: hls.levels.map(l => ({ height: l.height, bitrate: l.bitrate })),
            currentLevel: hls.currentLevel,
          });
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
          updateDebugState({ currentLevel: data.level });
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          console.error('[useHlsPlayback] HLS Error:', data);
          updateDebugState({ 
            lastError: `${data.type}: ${data.details}`, 
            lastErrorTime: Date.now() 
          });
          
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('[useHlsPlayback] Network error, trying to recover...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('[useHlsPlayback] Media error, trying to recover...');
                hls.recoverMediaError();
                break;
              default:
                clearLoadTimeout();
                setError('Playback error. Try another stream.');
                setIsLoading(false);
                break;
            }
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[useHlsPlayback] Manifest parsed');
          updateDebugState({ manifestLoaded: true });
          options.onManifestParsed?.();
          startPlayback();
        });

        hls.loadSource(url);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          updateDebugState({ manifestLoaded: true });
          startPlayback();
        }, { once: true });
      } else {
        // Direct video source
        video.src = url;
        video.addEventListener('canplay', () => {
          startPlayback();
        }, { once: true });

        video.addEventListener('error', () => {
          clearLoadTimeout();
          console.error('[useHlsPlayback] Video error:', video.error);
          setError('Source not supported. Try another stream.');
          updateDebugState({ 
            lastError: video.error?.message || 'Unknown video error', 
            lastErrorTime: Date.now() 
          });
          setIsLoading(false);
        }, { once: true });
      }
    } catch (e) {
      clearLoadTimeout();
      console.error('[useHlsPlayback] Setup error:', e);
      setError('Failed to initialize player');
      updateDebugState({ 
        lastError: e instanceof Error ? e.message : String(e), 
        lastErrorTime: Date.now() 
      });
      setIsLoading(false);
    }
  }, [cleanup, clearLoadTimeout, startLoadTimeout, updateDebugState, options]);

  const retry = useCallback(() => {
    setRetryCount(0);
    setError(null);
    if (currentUrlRef.current) {
      loadSource(currentUrlRef.current);
    }
  }, [loadSource]);

  return {
    videoRef,
    hlsRef,
    isLoading,
    error,
    retryCount,
    timeoutMessage,
    debugState,
    loadSource,
    cleanup,
    retry,
    updateBufferInfo,
    maxRetryAttempts: MAX_RETRY_ATTEMPTS,
  };
}
