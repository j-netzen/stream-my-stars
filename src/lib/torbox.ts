import { supabase } from "@/integrations/supabase/client";
import {
  clearTorBoxServiceUnavailable,
  setTorBoxServiceUnavailable,
} from "@/lib/torboxStatusStore";

export interface TorBoxUser {
  id: number;
  email: string;
  plan: number;
  total_downloaded: number;
  customer: string;
  is_subscribed: boolean;
  premium_expires_at: string | null;
  cooldown_until: string | null;
  auth_id: string;
  user_referral: string;
  base_email: string;
  created_at: string;
  updated_at: string;
}

export interface TorBoxTorrent {
  id: number;
  hash: string;
  created_at: string;
  updated_at: string;
  magnet: string;
  size: number;
  active: boolean;
  auth_id: string;
  download_state: string;
  seeds: number;
  peers: number;
  ratio: number;
  progress: number;
  download_speed: number;
  upload_speed: number;
  name: string;
  eta: number;
  server: number;
  torrent_file: boolean;
  expires_at: string | null;
  download_present: boolean;
  files: TorBoxFile[];
  download_path: string;
  inactive_check: number;
  availability: number;
}

export interface TorBoxFile {
  id: number;
  md5: string;
  s3_path: string;
  name: string;
  size: number;
  mimetype: string;
  short_name: string;
}

export interface TorBoxDownloadLink {
  data: string; // The CDN URL
}

export interface TorBoxMagnetResponse {
  torrent_id: number;
  name: string;
  hash: string;
}

/**
 * Custom error class for stream-specific errors that should trigger fallback
 */
export class StreamUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamUnavailableError";
  }
}

/**
 * Check if an error indicates an expired/invalid auth token
 */
function isTokenError(error: unknown): boolean {
  if (!error) return false;
  const message = String(error).toLowerCase();
  
  return (
    message.includes("401") ||
    message.includes("403") ||
    message.includes("unauthorized") ||
    message.includes("invalid api") ||
    message.includes("expired")
  ) && !message.includes("410");
}

/**
 * Check if an error is a "skip this stream" error
 */
function isSkipStreamError(error: unknown): boolean {
  if (!error) return false;
  
  const errorObj = error as { status?: number; skipStream?: boolean };
  if (errorObj.status === 410 || errorObj.skipStream === true) {
    return true;
  }
  
  const message = String(error).toLowerCase();
  return (
    message.includes("not found") ||
    message.includes("unavailable") ||
    message.includes("410") ||
    message.includes("expired") ||
    message.includes("dmca")
  );
}

/**
 * Check if an error is a transient gateway error that should be retried
 */
function isTransientGatewayError(error: unknown): boolean {
  if (!error) return false;
  
  const errorObj = error as { status?: number; message?: string };
  if (errorObj.status === 502 || errorObj.status === 504 || errorObj.status === 503) {
    return true;
  }
  
  const message = (errorObj.message || String(error)).toLowerCase();
  return (
    message.includes("502") ||
    message.includes("504") ||
    message.includes("503") ||
    message.includes("timeout") ||
    message.includes("connection") ||
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("non-2xx")
  );
}

/**
 * Main function to invoke TorBox API
 */
async function invokeTorBox(
  body: Record<string, unknown>, 
  retryCount = 0,
  maxRetries = 3
): Promise<unknown> {
  const startTime = performance.now();
  
  try {
    const { data, error } = await supabase.functions.invoke("torbox", { body });
    
    if (error) {
      console.error("TorBox API error:", error);
      
      if (isTransientGatewayError(error) && retryCount < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
        console.log(`[TB] Transient error, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return invokeTorBox(body, retryCount + 1, maxRetries);
      }
      
      if (isTokenError(error)) {
        throw new Error("TorBox authentication failed. Please check your API key in Settings.");
      }
      
      if (isSkipStreamError(error.message || error)) {
        throw new StreamUnavailableError("Stream unavailable - trying next");
      }
      
      const errorMessage = error.message || "";
      if (errorMessage.includes("503") || errorMessage.includes("service_unavailable")) {
        const serviceError = "TorBox servers are temporarily overloaded. Please wait and try again.";
        setTorBoxServiceUnavailable(serviceError);
        throw new Error(serviceError);
      }
      throw new Error(error.message || "TorBox API error");
    }
    
    const latency = Math.round(performance.now() - startTime);
    if (latency > 2000) {
      console.log(`[TB] Slow response: ${latency}ms for action: ${body.action}`);
    }
    
    return processTorBoxResponse(data, body, retryCount, maxRetries);
  } catch (err) {
    if (isTransientGatewayError(err) && retryCount < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
      console.log(`[TB] Network error, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return invokeTorBox(body, retryCount + 1, maxRetries);
    }
    throw err;
  }
}

/**
 * Process TorBox response data
 */
async function processTorBoxResponse(
  data: unknown,
  body: Record<string, unknown>,
  retryCount: number,
  maxRetries: number
): Promise<unknown> {
  const responseData = data as Record<string, unknown> | null;
  
  if (responseData?.error) {
    const errorString = String(responseData.error || "");
    const skipStream = responseData.skipStream === true;
    const httpStatus = responseData.httpStatus as number | undefined;
    
    if (skipStream || httpStatus === 410 || isSkipStreamError(errorString)) {
      console.log("Stream unavailable, triggering fallback");
      throw new StreamUnavailableError(errorString || "Stream unavailable - trying next");
    }
    
    if (isTokenError(errorString)) {
      throw new Error("TorBox authentication failed. Please check your API key in Settings.");
    }
    
    if (errorString.includes("503") || errorString.includes("overload")) {
      const serviceError = "TorBox servers are temporarily overloaded. Please wait and try again.";
      setTorBoxServiceUnavailable(serviceError);
      throw new Error(serviceError);
    }
    throw new Error(errorString || "Unknown TorBox error");
  }
  
  clearTorBoxServiceUnavailable();
  return data;
}

export async function getTorBoxUser(): Promise<TorBoxUser> {
  return invokeTorBox({ action: "user" }) as Promise<TorBoxUser>;
}

export async function requestDownloadLink(torrentId: number, fileId: number): Promise<string> {
  const result = await invokeTorBox({ action: "request_download", torrentId, fileId }) as string;
  return result;
}

export async function addMagnet(magnet: string): Promise<TorBoxMagnetResponse> {
  return invokeTorBox({ action: "add_magnet", magnet }) as Promise<TorBoxMagnetResponse>;
}

export async function addTorrentFile(torrentFileBase64: string): Promise<TorBoxMagnetResponse> {
  return invokeTorBox({ action: "add_torrent", torrentFile: torrentFileBase64 }) as Promise<TorBoxMagnetResponse>;
}

export async function getTorrentInfo(torrentId: number): Promise<TorBoxTorrent> {
  const result = await invokeTorBox({ action: "torrent_info", torrentId }) as TorBoxTorrent | TorBoxTorrent[];
  // API returns array when querying by ID, take first element
  return Array.isArray(result) ? result[0] : result;
}

export async function listTorrents(): Promise<TorBoxTorrent[]> {
  const result = await invokeTorBox({ action: "torrents" }) as TorBoxTorrent[] | null;
  return result || [];
}

export async function listDownloads(): Promise<TorBoxTorrent[]> {
  // For TorBox, "downloads" means completed torrents that are ready
  const torrents = await listTorrents();
  return torrents.filter(t => t.download_present && t.progress === 1);
}

/**
 * Check instant availability for multiple torrent hashes
 * Returns a map of hash -> cached info (null if not cached)
 */
export async function checkInstantAvailability(hashes: string[]): Promise<Record<string, unknown>> {
  if (hashes.length === 0) return {};
  
  const batchSize = 100;
  const results: Record<string, unknown> = {};
  
  for (let i = 0; i < hashes.length; i += batchSize) {
    const batch = hashes.slice(i, i + batchSize);
    try {
      const data = await invokeTorBox({ action: "check_cached", hashes: batch }) as Record<string, unknown>;
      Object.assign(results, data);
    } catch (err) {
      console.warn("Cache check failed for batch:", err);
    }
  }
  
  return results;
}

/**
 * Check if a hash is cached based on instant availability response
 */
export function isHashCached(hash: string, availabilityData: Record<string, unknown>): boolean {
  const hashData = availabilityData[hash.toLowerCase()] || availabilityData[hash.toUpperCase()];
  // TorBox returns the hash in the object if it's cached
  return hashData !== null && hashData !== undefined;
}

/**
 * Add a magnet and wait for it to be ready for streaming
 */
export async function addMagnetAndWait(
  magnet: string,
  onProgress?: (progress: number) => void
): Promise<TorBoxTorrent> {
  const { torrent_id } = await addMagnet(magnet);
  return waitForTorrentReady(torrent_id, onProgress);
}

/**
 * Add a torrent file and wait for it to be ready
 */
export async function addTorrentFileAndWait(
  torrentFileBase64: string,
  onProgress?: (progress: number) => void
): Promise<TorBoxTorrent> {
  const { torrent_id } = await addTorrentFile(torrentFileBase64);
  return waitForTorrentReady(torrent_id, onProgress);
}

/**
 * Wait for a torrent to be ready for streaming
 */
async function waitForTorrentReady(
  torrentId: number,
  onProgress?: (progress: number) => void
): Promise<TorBoxTorrent> {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  
  let torrent = await getTorrentInfo(torrentId);
  
  // If already ready (cached), return immediately
  if (torrent.download_present || torrent.progress === 1) {
    if (onProgress) onProgress(100);
    return torrent;
  }
  
  // Check for errors
  if (torrent.download_state === 'error' || torrent.download_state === 'stalled') {
    throw new StreamUnavailableError("Torrent failed to download");
  }
  
  // Poll for completion
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    torrent = await getTorrentInfo(torrentId);
    
    if (onProgress && typeof torrent.progress === 'number') {
      onProgress(Math.round(torrent.progress * 100));
    }
    
    if (torrent.download_present || torrent.progress === 1) {
      if (onProgress) onProgress(100);
      return torrent;
    }
    
    if (torrent.download_state === 'error' || torrent.download_state === 'stalled') {
      throw new StreamUnavailableError("Torrent failed to download");
    }
    
    attempts++;
  }
  
  throw new Error("Torrent download timed out. The torrent may still be downloading.");
}

/**
 * Get a streamable URL for a torrent file
 */
export async function getStreamableUrl(torrentId: number, fileId: number): Promise<string> {
  return requestDownloadLink(torrentId, fileId);
}

/**
 * Find the largest video file in a torrent (for auto-selection)
 */
export function findLargestVideoFile(torrent: TorBoxTorrent): TorBoxFile | null {
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.m4v', '.webm', '.mov'];
  
  const videoFiles = torrent.files.filter(f => 
    videoExtensions.some(ext => f.name.toLowerCase().endsWith(ext))
  );
  
  if (videoFiles.length === 0) return null;
  
  return videoFiles.reduce((largest, file) => 
    file.size > largest.size ? file : largest
  );
}

/**
 * Convert a File object to base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:application/x-bittorrent;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
