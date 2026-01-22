import { useCallback, useRef, useState, useEffect } from 'react';
import { usePlaybackSettings } from './usePlaybackSettings';

// 128MB buffer target in bytes
const TARGET_BUFFER_SIZE = 128 * 1024 * 1024;

export interface BufferState {
  bufferedBytes: number;
  bufferedSeconds: number;
  bufferProgress: number; // 0-100
  isBufferHealthy: boolean;
  bufferHealth: 'filling' | 'healthy' | 'critical';
  adaptiveQuality: 'high' | 'medium' | 'low';
  estimatedBitrate: number;
}

export interface SmartBufferConfig {
  onBufferStateChange?: (state: BufferState) => void;
  aggressiveFill?: boolean;
}

export function useSmartBuffer(videoRef: React.RefObject<HTMLVideoElement>, config?: SmartBufferConfig) {
  const { settings, measureConnectionSpeed } = usePlaybackSettings();
  const [bufferState, setBufferState] = useState<BufferState>({
    bufferedBytes: 0,
    bufferedSeconds: 0,
    bufferProgress: 0,
    isBufferHealthy: false,
    bufferHealth: 'filling',
    adaptiveQuality: 'high',
    estimatedBitrate: 0,
  });
  
  const lastProgressRef = useRef<{ time: number; loaded: number }>({ time: 0, loaded: 0 });
  const bitrateHistoryRef = useRef<number[]>([]);
  const speedTestDoneRef = useRef(false);

  // Measure connection speed on mount if not already known
  useEffect(() => {
    if (!speedTestDoneRef.current && settings.connectionSpeedMbps === null) {
      measureConnectionSpeed().then(() => {
        speedTestDoneRef.current = true;
      });
    }
  }, [measureConnectionSpeed, settings.connectionSpeedMbps]);

  // Determine adaptive quality based on connection speed
  const calculateAdaptiveQuality = useCallback((speedMbps: number | null): 'high' | 'medium' | 'low' => {
    if (speedMbps === null) return 'medium'; // Default to medium if unknown
    
    if (speedMbps >= 25) return 'high';    // 4K capable
    if (speedMbps >= 10) return 'medium';  // 1080p capable
    return 'low';                           // 720p or below
  }, []);

  // Estimate bytes buffered based on video buffered ranges and estimated bitrate
  const estimateBufferedBytes = useCallback((video: HTMLVideoElement): number => {
    if (!video.buffered.length) return 0;
    
    let totalSeconds = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      totalSeconds += video.buffered.end(i) - video.buffered.start(i);
    }
    
    // Use detected bitrate or estimate based on quality
    const bitrate = bufferState.estimatedBitrate || 5000000; // Default 5 Mbps
    return (totalSeconds * bitrate) / 8;
  }, [bufferState.estimatedBitrate]);

  // Calculate buffer health
  const calculateBufferHealth = useCallback((bufferedAhead: number, bufferProgress: number): 'filling' | 'healthy' | 'critical' => {
    if (bufferProgress >= 80 || bufferedAhead >= 60) return 'healthy';
    if (bufferedAhead >= 10 || bufferProgress >= 30) return 'filling';
    return 'critical';
  }, []);

  // Main buffer monitoring function
  const updateBufferState = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const currentTime = video.currentTime;
    const duration = video.duration || 0;
    
    // Find buffered ahead of current position
    let bufferedAhead = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= currentTime && video.buffered.end(i) > currentTime) {
        bufferedAhead = video.buffered.end(i) - currentTime;
        break;
      }
    }

    // Estimate bitrate from download progress
    const now = performance.now();
    const loadedInfo = video as any;
    if (loadedInfo.webkitVideoDecodedByteCount !== undefined) {
      const bytesLoaded = loadedInfo.webkitVideoDecodedByteCount;
      const timeDiff = (now - lastProgressRef.current.time) / 1000;
      
      if (timeDiff > 0.5 && lastProgressRef.current.loaded > 0) {
        const bytesDiff = bytesLoaded - lastProgressRef.current.loaded;
        const instantBitrate = (bytesDiff * 8) / timeDiff;
        
        bitrateHistoryRef.current.push(instantBitrate);
        if (bitrateHistoryRef.current.length > 5) {
          bitrateHistoryRef.current.shift();
        }
      }
      
      lastProgressRef.current = { time: now, loaded: bytesLoaded };
    }

    // Average bitrate from history
    const avgBitrate = bitrateHistoryRef.current.length > 0
      ? bitrateHistoryRef.current.reduce((a, b) => a + b, 0) / bitrateHistoryRef.current.length
      : 5000000; // Default 5 Mbps

    const bufferedBytes = estimateBufferedBytes(video);
    const bufferProgress = Math.min(100, (bufferedBytes / TARGET_BUFFER_SIZE) * 100);
    const bufferHealth = calculateBufferHealth(bufferedAhead, bufferProgress);
    const adaptiveQuality = calculateAdaptiveQuality(settings.connectionSpeedMbps);

    const newState: BufferState = {
      bufferedBytes,
      bufferedSeconds: bufferedAhead,
      bufferProgress,
      isBufferHealthy: bufferHealth === 'healthy',
      bufferHealth,
      adaptiveQuality,
      estimatedBitrate: avgBitrate,
    };

    setBufferState(newState);
    config?.onBufferStateChange?.(newState);
  }, [videoRef, settings.connectionSpeedMbps, estimateBufferedBytes, calculateBufferHealth, calculateAdaptiveQuality, config]);

  // Set up monitoring interval
  useEffect(() => {
    const interval = setInterval(updateBufferState, 500);
    return () => clearInterval(interval);
  }, [updateBufferState]);

  // Aggressive pre-buffering on playback start
  const startAggressiveBuffer = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Request more data by seeking slightly
    const wasPlaying = !video.paused;
    const currentTime = video.currentTime;

    // Force preload
    video.preload = 'auto';
    
    // If connection is slow, we might want to pause briefly to fill buffer
    if (settings.isSlowConnection && config?.aggressiveFill) {
      video.pause();
      
      // Resume when buffer is healthier
      const checkBuffer = setInterval(() => {
        if (bufferState.bufferHealth !== 'critical') {
          clearInterval(checkBuffer);
          if (wasPlaying) {
            video.play().catch(console.warn);
          }
        }
      }, 500);

      // Timeout after 5 seconds
      setTimeout(() => clearInterval(checkBuffer), 5000);
    }
  }, [videoRef, settings.isSlowConnection, config?.aggressiveFill, bufferState.bufferHealth]);

  return {
    bufferState,
    startAggressiveBuffer,
    updateBufferState,
    targetBufferMB: TARGET_BUFFER_SIZE / (1024 * 1024),
  };
}

export default useSmartBuffer;
