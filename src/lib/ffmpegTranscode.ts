import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

// Progress callback type - now includes optional ETA in seconds
export type TranscodeProgressCallback = (progress: number, message: string, etaSeconds?: number) => void;

// ETA tracker class
class ETATracker {
  private startTime: number = 0;
  private lastProgress: number = 0;

  start() {
    this.startTime = Date.now();
    this.lastProgress = 0;
  }

  getETA(currentProgress: number): { etaSeconds: number; etaFormatted: string } | null {
    if (currentProgress <= 0 || currentProgress >= 100) {
      return null;
    }

    const elapsed = (Date.now() - this.startTime) / 1000; // seconds
    if (elapsed < 1) {
      return null; // Not enough data yet
    }

    // Calculate estimated total time based on current progress
    const estimatedTotal = (elapsed / currentProgress) * 100;
    const remaining = Math.max(0, estimatedTotal - elapsed);

    return {
      etaSeconds: Math.round(remaining),
      etaFormatted: this.formatTime(remaining)
    };
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  }
}

// Global ETA tracker instance
const etaTracker = new ETATracker();

// Codec information type
export interface CodecInfo {
  videoCodec: string | null;
  audioCodec: string | null;
  resolution: string | null;
  duration: string | null;
}

// Store detected codec info for display
let lastDetectedCodecs: CodecInfo | null = null;

/**
 * Get the last detected codec information
 */
export function getLastDetectedCodecs(): CodecInfo | null {
  return lastDetectedCodecs;
}

/**
 * Parse FFmpeg output to extract codec information
 */
function parseCodecInfo(logMessages: string[]): CodecInfo {
  const info: CodecInfo = {
    videoCodec: null,
    audioCodec: null,
    resolution: null,
    duration: null
  };

  const fullLog = logMessages.join('\n');

  // Parse video codec (e.g., "Video: h264", "Video: hevc")
  const videoMatch = fullLog.match(/Video:\s*(\w+)/i);
  if (videoMatch) {
    info.videoCodec = videoMatch[1].toUpperCase();
  }

  // Parse audio codec (e.g., "Audio: aac", "Audio: ac3")
  const audioMatch = fullLog.match(/Audio:\s*(\w+)/i);
  if (audioMatch) {
    info.audioCodec = audioMatch[1].toUpperCase();
  }

  // Parse resolution (e.g., "1920x1080")
  const resMatch = fullLog.match(/(\d{3,4}x\d{3,4})/);
  if (resMatch) {
    info.resolution = resMatch[1];
  }

  // Parse duration (e.g., "Duration: 01:30:45.00")
  const durMatch = fullLog.match(/Duration:\s*(\d{2}:\d{2}:\d{2})/);
  if (durMatch) {
    info.duration = durMatch[1];
  }

  return info;
}

/**
 * Format codec info for display
 */
export function formatCodecInfo(info: CodecInfo): string {
  const parts: string[] = [];
  
  if (info.videoCodec) {
    parts.push(`Video: ${info.videoCodec}`);
  }
  if (info.audioCodec) {
    parts.push(`Audio: ${info.audioCodec}`);
  }
  if (info.resolution) {
    parts.push(info.resolution);
  }
  if (info.duration) {
    parts.push(`Duration: ${info.duration}`);
  }
  
  return parts.length > 0 ? parts.join(' | ') : 'Unknown format';
}

/**
 * Load and initialize FFmpeg with SharedArrayBuffer support check
 */
async function loadFFmpeg(onProgress?: TranscodeProgressCallback): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) {
    return ffmpegInstance;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    // Set up logging
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    // Set up progress tracking
    ffmpeg.on('progress', ({ progress }) => {
      const percent = Math.round(progress * 100);
      onProgress?.(percent, `Transcoding: ${percent}%`);
    });

    onProgress?.(5, 'Loading FFmpeg...');

    // Load FFmpeg core from CDN with proper CORS headers
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      ffmpegInstance = ffmpeg;
      onProgress?.(10, 'FFmpeg loaded');
      return ffmpeg;
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      loadPromise = null;
      throw new Error('Failed to load FFmpeg. Your browser may not support WebAssembly.');
    }
  })();

  return loadPromise;
}

/**
 * Check if a URL points to an MKV file
 */
export function isMkvFile(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes('.mkv') || lowerUrl.endsWith('.mkv');
}

/**
 * Transcode/remux MKV to MP4 for browser playback
 * This uses remuxing when possible (fast) and transcoding as fallback
 */
export async function transcodeMkvToMp4(
  inputUrl: string,
  onProgress?: TranscodeProgressCallback
): Promise<string> {
  const ffmpeg = await loadFFmpeg(onProgress);
  
  const inputFileName = 'input.mkv';
  const outputFileName = 'output.mp4';
  const logMessages: string[] = [];

  // Capture logs for codec detection
  const logHandler = ({ message }: { message: string }) => {
    logMessages.push(message);
  };
  ffmpeg.on('log', logHandler);

  try {
    etaTracker.start();
    onProgress?.(15, 'Downloading video...');
    
    // Fetch the input file
    const inputData = await fetchFile(inputUrl);
    
    onProgress?.(30, 'Analyzing video...');
    
    // Write input file to FFmpeg virtual filesystem
    await ffmpeg.writeFile(inputFileName, inputData);

    // First, probe the file to get codec info
    try {
      await ffmpeg.exec(['-i', inputFileName]);
    } catch {
      // FFmpeg returns error when no output specified, but logs contain codec info
    }

    // Parse and store codec info
    const codecInfo = parseCodecInfo(logMessages);
    lastDetectedCodecs = codecInfo;
    
    const codecDisplay = formatCodecInfo(codecInfo);
    onProgress?.(35, `Detected: ${codecDisplay}`);

    // Small delay to show codec info
    await new Promise(resolve => setTimeout(resolve, 1000));

    const eta = etaTracker.getETA(40);
    onProgress?.(40, `Converting to MP4 (stream copy)...${eta ? ` ~${eta.etaFormatted} remaining` : ''}`, eta?.etaSeconds);

    // Try stream copy first (fast, no re-encoding)
    let streamCopyFailed = false;
    try {
      await ffmpeg.exec([
        '-i', inputFileName,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputFileName
      ]);
    } catch (copyError) {
      console.warn('Stream copy failed, will try re-encoding:', copyError);
      streamCopyFailed = true;
    }

    // Check if output file exists and has content
    if (!streamCopyFailed) {
      try {
        const testOutput = await ffmpeg.readFile(outputFileName);
        if (testOutput instanceof Uint8Array && testOutput.length < 1000) {
          streamCopyFailed = true;
        }
      } catch {
        streamCopyFailed = true;
      }
    }

    // Fallback to re-encoding if stream copy failed
    if (streamCopyFailed) {
      // Reset ETA tracker for re-encoding phase
      etaTracker.start();
      
      const reencodeEta = etaTracker.getETA(5);
      onProgress?.(45, `Re-encoding required (slower)...${reencodeEta ? ` ~${reencodeEta.etaFormatted} remaining` : ''}`, reencodeEta?.etaSeconds);
      
      // Clean up failed output
      try {
        await ffmpeg.deleteFile(outputFileName);
      } catch {
        // Ignore if file doesn't exist
      }

      await ffmpeg.exec([
        '-i', inputFileName,
        '-c:v', 'libx264',      // H.264 video codec
        '-preset', 'ultrafast', // Fastest encoding
        '-crf', '23',           // Quality (lower = better)
        '-c:a', 'aac',          // AAC audio codec
        '-b:a', '128k',         // Audio bitrate
        '-movflags', '+faststart',
        outputFileName
      ]);
    }

    onProgress?.(90, 'Finalizing...');

    // Read the output file
    const outputData = await ffmpeg.readFile(outputFileName);
    
    // Clean up virtual filesystem
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);
    
    // Convert to regular ArrayBuffer
    let arrayBuffer: ArrayBuffer;
    if (outputData instanceof Uint8Array) {
      arrayBuffer = outputData.buffer instanceof ArrayBuffer 
        ? outputData.buffer 
        : new Uint8Array(outputData).buffer;
    } else {
      arrayBuffer = new TextEncoder().encode(outputData as string).buffer;
    }

    // Create blob URL for the transcoded video
    const blob = new Blob([new Uint8Array(arrayBuffer)], { type: 'video/mp4' });
    const blobUrl = URL.createObjectURL(blob);

    onProgress?.(100, 'Complete!');

    return blobUrl;
  } catch (error) {
    console.error('Transcoding failed:', error);
    throw new Error(`Failed to transcode video: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    ffmpeg.off('log', logHandler);
  }
}

/**
 * Transcode a File object (from file picker) to MP4
 */
export async function transcodeFileToMp4(
  file: File,
  onProgress?: TranscodeProgressCallback
): Promise<string> {
  const ffmpeg = await loadFFmpeg(onProgress);
  
  const inputFileName = `input.${file.name.split('.').pop() || 'mkv'}`;
  const outputFileName = 'output.mp4';
  const logMessages: string[] = [];

  // Capture logs for codec detection
  const logHandler = ({ message }: { message: string }) => {
    logMessages.push(message);
  };
  ffmpeg.on('log', logHandler);

  try {
    etaTracker.start();
    onProgress?.(15, 'Reading file...');
    
    // Read file as ArrayBuffer
    const inputArrayBuffer = await file.arrayBuffer();
    const inputData = new Uint8Array(inputArrayBuffer);
    
    onProgress?.(30, 'Analyzing video...');
    
    // Write input file to FFmpeg virtual filesystem
    await ffmpeg.writeFile(inputFileName, inputData);

    // Probe the file to get codec info
    try {
      await ffmpeg.exec(['-i', inputFileName]);
    } catch {
      // FFmpeg returns error when no output specified, but logs contain codec info
    }

    // Parse and store codec info
    const codecInfo = parseCodecInfo(logMessages);
    lastDetectedCodecs = codecInfo;
    
    const codecDisplay = formatCodecInfo(codecInfo);
    onProgress?.(35, `Detected: ${codecDisplay}`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const eta = etaTracker.getETA(40);
    onProgress?.(40, `Converting to MP4 (stream copy)...${eta ? ` ~${eta.etaFormatted} remaining` : ''}`, eta?.etaSeconds);

    // Try stream copy first
    let streamCopyFailed = false;
    try {
      await ffmpeg.exec([
        '-i', inputFileName,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputFileName
      ]);
    } catch (copyError) {
      console.warn('Stream copy failed, will try re-encoding:', copyError);
      streamCopyFailed = true;
    }

    // Check if output file exists and has content
    if (!streamCopyFailed) {
      try {
        const testOutput = await ffmpeg.readFile(outputFileName);
        if (testOutput instanceof Uint8Array && testOutput.length < 1000) {
          streamCopyFailed = true;
        }
      } catch {
        streamCopyFailed = true;
      }
    }

    // Fallback to re-encoding if stream copy failed
    if (streamCopyFailed) {
      etaTracker.start();
      const reencodeEta = etaTracker.getETA(5);
      onProgress?.(45, `Re-encoding required (slower)...${reencodeEta ? ` ~${reencodeEta.etaFormatted} remaining` : ''}`, reencodeEta?.etaSeconds);
      
      try {
        await ffmpeg.deleteFile(outputFileName);
      } catch {
        // Ignore
      }

      await ffmpeg.exec([
        '-i', inputFileName,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputFileName
      ]);
    }

    onProgress?.(90, 'Finalizing...');

    // Read the output file
    const outputData = await ffmpeg.readFile(outputFileName);
    
    // Clean up
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);

    // Convert to regular ArrayBuffer
    let outputBuffer: ArrayBuffer;
    if (outputData instanceof Uint8Array) {
      outputBuffer = outputData.buffer instanceof ArrayBuffer 
        ? outputData.buffer 
        : new Uint8Array(outputData).buffer;
    } else {
      outputBuffer = new TextEncoder().encode(outputData as string).buffer;
    }

    // Create blob URL
    const blob = new Blob([new Uint8Array(outputBuffer)], { type: 'video/mp4' });
    const blobUrl = URL.createObjectURL(blob);

    onProgress?.(100, 'Complete!');

    return blobUrl;
  } catch (error) {
    console.error('Transcoding failed:', error);
    throw new Error(`Failed to transcode video: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    ffmpeg.off('log', logHandler);
  }
}

/**
 * Check if the browser supports the required features for FFmpeg.wasm
 */
export function checkBrowserSupport(): { supported: boolean; reason?: string } {
  // Check for WebAssembly
  if (typeof WebAssembly === 'undefined') {
    return { supported: false, reason: 'WebAssembly is not supported in this browser.' };
  }

  // Check for SharedArrayBuffer (required for multi-threaded FFmpeg)
  // Note: SharedArrayBuffer requires specific CORS headers (COOP/COEP)
  // If not available, we'll use single-threaded mode which is slower but works
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  if (!hasSharedArrayBuffer) {
    console.warn('SharedArrayBuffer not available - FFmpeg will run in single-threaded mode (slower)');
  }

  return { supported: true };
}

/**
 * Preload FFmpeg to speed up first use
 */
export async function preloadFFmpeg(): Promise<void> {
  try {
    await loadFFmpeg();
    console.log('FFmpeg preloaded successfully');
  } catch (error) {
    console.warn('Failed to preload FFmpeg:', error);
  }
}
