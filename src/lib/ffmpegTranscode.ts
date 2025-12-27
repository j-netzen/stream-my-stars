import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

// Progress callback type
export type TranscodeProgressCallback = (progress: number, message: string) => void;

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
    ffmpeg.on('progress', ({ progress, time }) => {
      const percent = Math.round(progress * 100);
      onProgress?.(percent, `Transcoding: ${percent}%`);
    });

    onProgress?.(5, 'Loading FFmpeg...');

    // Load FFmpeg core from CDN with proper CORS headers
    // Using unpkg as it provides proper CORS headers
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

  try {
    onProgress?.(15, 'Downloading video...');
    
    // Fetch the input file
    const inputData = await fetchFile(inputUrl);
    
    onProgress?.(30, 'Preparing video...');
    
    // Write input file to FFmpeg virtual filesystem
    await ffmpeg.writeFile(inputFileName, inputData);

    onProgress?.(35, 'Remuxing to MP4...');

    // Try remuxing first (fast, just repackages without re-encoding)
    // -c copy = copy streams without transcoding
    // -movflags +faststart = optimize for web streaming
    try {
      await ffmpeg.exec([
        '-i', inputFileName,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputFileName
      ]);
    } catch (remuxError) {
      console.warn('Remuxing failed, trying transcode:', remuxError);
      
      onProgress?.(40, 'Transcoding video (this may take a while)...');
      
      // Fallback to transcoding with browser-compatible codecs
      await ffmpeg.exec([
        '-i', inputFileName,
        '-c:v', 'libx264',      // H.264 video codec (widely supported)
        '-preset', 'ultrafast', // Fastest encoding
        '-crf', '23',           // Quality (lower = better, 23 is default)
        '-c:a', 'aac',          // AAC audio codec (widely supported)
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
    
    // Convert to regular ArrayBuffer to avoid SharedArrayBuffer issues with Blob
    let arrayBuffer: ArrayBuffer;
    if (outputData instanceof Uint8Array) {
      // Copy the buffer to a regular ArrayBuffer
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

  try {
    onProgress?.(15, 'Reading file...');
    
    // Read file as ArrayBuffer
    const inputArrayBuffer = await file.arrayBuffer();
    const inputData = new Uint8Array(inputArrayBuffer);
    
    onProgress?.(30, 'Preparing video...');
    
    // Write input file to FFmpeg virtual filesystem
    await ffmpeg.writeFile(inputFileName, inputData);

    onProgress?.(35, 'Remuxing to MP4...');

    // Try remuxing first (fast)
    try {
      await ffmpeg.exec([
        '-i', inputFileName,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputFileName
      ]);
    } catch (remuxError) {
      console.warn('Remuxing failed, trying transcode:', remuxError);
      
      onProgress?.(40, 'Transcoding video (this may take a while)...');
      
      // Fallback to transcoding
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

    // Convert to regular ArrayBuffer to avoid SharedArrayBuffer issues with Blob
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
