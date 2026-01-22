import { supabase } from "@/integrations/supabase/client";
import {
  clearRealDebridServiceUnavailable,
  setRealDebridServiceUnavailable,
} from "@/lib/realDebridStatusStore";
import {
  getStoredTokens,
  refreshAccessToken,
  storeTokens,
  clearStoredTokens,
} from "@/lib/realDebridOAuth";

// Token refresh state to prevent concurrent refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/**
 * Get a valid access token, refreshing if necessary
 * Uses a mutex pattern to prevent concurrent refresh attempts
 */
async function getValidAccessTokenWithRefresh(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  // Check if token is still valid (with 5 min buffer)
  const isExpired = Date.now() > tokens.expiresAt - 5 * 60 * 1000;
  
  if (!isExpired) {
    return tokens.accessToken;
  }

  // Token is expired, need to refresh
  // Use mutex to prevent concurrent refresh attempts
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      console.log("Refreshing Real-Debrid access token...");
      const newTokens = await refreshAccessToken(
        tokens.clientId,
        tokens.clientSecret,
        tokens.refreshToken
      );
      storeTokens(newTokens, tokens.clientId, tokens.clientSecret);
      console.log("Real-Debrid token refreshed successfully");
      return newTokens.access_token;
    } catch (error) {
      console.error("Failed to refresh Real-Debrid token:", error);
      clearStoredTokens();
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export interface RealDebridUser {
  id: number;
  username: string;
  email: string;
  points: number;
  locale: string;
  avatar: string;
  type: string;
  premium: number;
  expiration: string;
}

export interface RealDebridUnrestrictedLink {
  id: string;
  filename: string;
  mimeType: string;
  filesize: number;
  link: string;
  host: string;
  chunks: number;
  download: string;
  streamable: number;
}

export interface RealDebridStreamingLinks {
  [quality: string]: {
    full: string;
  };
}

export interface RealDebridTorrent {
  id: string;
  filename: string;
  hash: string;
  bytes: number;
  host: string;
  split: number;
  progress: number;
  status: string;
  added: string;
  links: string[];
  ended?: string;
}

export interface RealDebridMagnetResponse {
  id: string;
  uri: string;
}

/**
 * Check if an error indicates an expired/invalid token
 */
function isTokenError(error: unknown): boolean {
  if (!error) return false;
  const message = String(error);
  return (
    message.includes("401") ||
    message.includes("Bad Token") ||
    message.includes("bad_token") ||
    message.includes("expired") ||
    message.includes("invalid_grant") ||
    message.includes("Unauthorized")
  );
}

/**
 * Check if an error is a "skip this stream" error (copyright, unavailable, etc.)
 * These errors should trigger automatic fallback to the next stream
 */
function isSkipStreamError(error: unknown): boolean {
  if (!error) return false;
  const message = String(error).toLowerCase();
  return (
    message.includes("copyright") ||
    message.includes("infringing") ||
    message.includes("unavailable") ||
    message.includes("dmca") ||
    message.includes("451") ||
    message.includes("file_unavailable") ||
    message.includes("hoster_unavailable")
  );
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
 * Main function to invoke Real-Debrid API with automatic token refresh
 */
async function invokeRealDebrid(body: Record<string, unknown>, retryCount = 0): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("real-debrid", { body });
  
  if (error) {
    console.error("Real-Debrid API error:", error);
    
    // Check if it's a token error and we haven't retried yet
    if (isTokenError(error) && retryCount === 0) {
      console.log("Token error detected, attempting refresh...");
      const newToken = await getValidAccessTokenWithRefresh();
      if (newToken) {
        // Retry the request after token refresh
        return invokeRealDebrid(body, retryCount + 1);
      }
      throw new Error("Session expired. Please re-link your Real-Debrid account in Settings.");
    }
    
    // Check for skip-stream errors (copyright, unavailable, etc.)
    if (isSkipStreamError(error.message || error)) {
      throw new StreamUnavailableError("Stream blocked - trying next");
    }
    
    // Check if it's a service unavailable error
    const errorMessage = error.message || "";
    if (errorMessage.includes("503") || errorMessage.includes("service_unavailable")) {
      const serviceError = "Real-Debrid servers are temporarily overloaded. Please wait 30 seconds and try again.";
      setRealDebridServiceUnavailable(serviceError);
      throw new Error(serviceError);
    }
    throw new Error(error.message || "Real-Debrid API error");
  }
  
  if (data?.error) {
    const errorString = String(data.error || "");
    const errorCode = data.details?.error_code;
    
    // Check for token errors in response
    if (isTokenError(errorString) && retryCount === 0) {
      console.log("Token error in response, attempting refresh...");
      const newToken = await getValidAccessTokenWithRefresh();
      if (newToken) {
        return invokeRealDebrid(body, retryCount + 1);
      }
      throw new Error("Session expired. Please re-link your Real-Debrid account in Settings.");
    }
    
    // Check for skip-stream errors (copyright DMCA, file unavailable, etc.)
    // Error codes: 35 = infringing_file, 7 = hoster_unavailable, 8 = file_unavailable
    if (isSkipStreamError(errorString) || [35, 7, 8].includes(errorCode)) {
      console.log("Stream unavailable (copyright/DMCA), triggering fallback");
      throw new StreamUnavailableError("Stream blocked - trying next");
    }
    
    // Check for service unavailable in data error
    if (data.details?.error_code === 25 || String(data.httpStatus || "").includes("503") || errorString.includes("overloaded")) {
      const serviceError = "Real-Debrid servers are temporarily overloaded. Please wait 30 seconds and try again.";
      setRealDebridServiceUnavailable(serviceError);
      throw new Error(serviceError);
    }
    throw new Error(errorString || "Unknown Real-Debrid error");
  }
  
  // Success - clear any previous failure state
  clearRealDebridServiceUnavailable();
  return data;
}

export async function getRealDebridUser(): Promise<RealDebridUser> {
  return invokeRealDebrid({ action: "user" }) as Promise<RealDebridUser>;
}

export async function unrestrictLink(link: string): Promise<RealDebridUnrestrictedLink> {
  return invokeRealDebrid({ action: "unrestrict", link }) as Promise<RealDebridUnrestrictedLink>;
}

export async function getStreamingLinks(fileId: string): Promise<RealDebridStreamingLinks> {
  return invokeRealDebrid({ action: "streaming", fileId }) as Promise<RealDebridStreamingLinks>;
}

export async function addMagnet(magnet: string): Promise<RealDebridMagnetResponse> {
  return invokeRealDebrid({ action: "add_magnet", magnet }) as Promise<RealDebridMagnetResponse>;
}

export async function addTorrentFile(torrentFileBase64: string): Promise<RealDebridMagnetResponse> {
  return invokeRealDebrid({ action: "add_torrent", torrentFile: torrentFileBase64 }) as Promise<RealDebridMagnetResponse>;
}

export async function selectTorrentFiles(torrentId: string): Promise<{ success: boolean }> {
  return invokeRealDebrid({ action: "select_files", torrentId }) as Promise<{ success: boolean }>;
}

export async function getTorrentInfo(torrentId: string): Promise<RealDebridTorrent> {
  return invokeRealDebrid({ action: "torrent_info", torrentId }) as Promise<RealDebridTorrent>;
}

export async function listTorrents(): Promise<RealDebridTorrent[]> {
  return invokeRealDebrid({ action: "torrents" }) as Promise<RealDebridTorrent[]>;
}

export async function listDownloads(): Promise<RealDebridUnrestrictedLink[]> {
  return invokeRealDebrid({ action: "downloads" }) as Promise<RealDebridUnrestrictedLink[]>;
}

export async function getSupportedHosts(): Promise<Record<string, unknown>> {
  return invokeRealDebrid({ action: "hosts" }) as Promise<Record<string, unknown>>;
}

/**
 * Check instant availability for multiple torrent hashes
 * Returns a map of hash -> cached file info (empty object if not cached)
 * This allows pre-filtering streams to only show cached ones
 * 
 * NOTE: Real-Debrid may disable this endpoint (error code 37). When disabled,
 * this returns an empty object and the caller should proceed without cache filtering.
 */
export async function checkInstantAvailability(hashes: string[]): Promise<Record<string, unknown>> {
  if (hashes.length === 0) return {};
  // RD API has a limit, batch if needed
  const batchSize = 50;
  const results: Record<string, unknown> = {};
  
  for (let i = 0; i < hashes.length; i += batchSize) {
    const batch = hashes.slice(i, i + batchSize);
    try {
      const data = await invokeRealDebrid({ action: "instant_availability", hashes: batch }) as Record<string, unknown>;
      
      // Check if endpoint is disabled (error 37)
      if (data && typeof data === 'object' && 'error' in data) {
        const errorData = data as { error?: string; error_code?: number };
        if (errorData.error === 'disabled_endpoint' || errorData.error_code === 37) {
          console.warn("[Real-Debrid] Instant availability endpoint is disabled (error 37). Skipping cache check.");
          return {}; // Return empty - caller will proceed without cache filtering
        }
      }
      
      Object.assign(results, data);
    } catch (err: unknown) {
      // Check if error indicates disabled endpoint
      const errMsg = String(err);
      if (errMsg.includes('disabled_endpoint') || errMsg.includes('error_code: 37') || errMsg.includes('403')) {
        console.warn("[Real-Debrid] Instant availability endpoint is disabled. Skipping cache check.");
        return {}; // Return empty - caller will proceed without cache filtering
      }
      console.warn("Instant availability check failed for batch:", err);
    }
  }
  
  return results;
}

/**
 * Check if a hash is cached based on instant availability response
 */
export function isHashCached(hash: string, availabilityData: Record<string, unknown>): boolean {
  const hashData = availabilityData[hash.toLowerCase()];
  if (!hashData || typeof hashData !== 'object') return false;
  
  // RD returns { rd: [...] } for cached torrents, empty {} for uncached
  const rdData = (hashData as Record<string, unknown>).rd;
  return Array.isArray(rdData) && rdData.length > 0;
}

// Helper to add a magnet and wait for links to be available (not full download)
export async function addMagnetAndWait(
  magnet: string,
  onProgress?: (progress: number) => void
): Promise<RealDebridTorrent> {
  // Add the magnet
  const { id } = await addMagnet(magnet);
  
  return waitForTorrentLinks(id, onProgress);
}

// Helper to add a torrent file and wait for links to be available
export async function addTorrentFileAndWait(
  torrentFileBase64: string,
  onProgress?: (progress: number) => void
): Promise<RealDebridTorrent> {
  // Add the torrent file
  const { id } = await addTorrentFile(torrentFileBase64);
  
  return waitForTorrentLinks(id, onProgress);
}

// Internal helper to wait for torrent links
async function waitForTorrentLinks(
  torrentId: string,
  onProgress?: (progress: number) => void
): Promise<RealDebridTorrent> {
  // Select all files
  await selectTorrentFiles(torrentId);
  
  // Wait a moment for RD to process
  await new Promise((resolve) => setTimeout(resolve, 1000));
  
  // Check torrent info - links may be available immediately if cached
  let torrent = await getTorrentInfo(torrentId);
  
  // If links are already available (cached), return immediately
  if (torrent.links && torrent.links.length > 0) {
    if (onProgress) onProgress(100);
    return torrent;
  }
  
  // Check for immediate errors
  if (torrent.status === "error" || torrent.status === "dead" || torrent.status === "virus") {
    // These are non-recoverable errors - trigger fallback
    const errorMsg = torrent.status === "virus" 
      ? "Stream blocked (copyright)" 
      : "Stream unavailable";
    throw new Error(errorMsg);
  }
  
  // If status is "waiting_files_selection" or "magnet_conversion", give it more time
  if (torrent.status === "waiting_files_selection" || torrent.status === "magnet_conversion") {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    torrent = await getTorrentInfo(torrentId);
  }
  
  // Poll for links to become available (not full download)
  let attempts = 0;
  const maxAttempts = 20; // 20 seconds max wait for links (reduced from 30)
  
  do {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
    torrent = await getTorrentInfo(torrentId);
    
    if (onProgress && torrent.progress) {
      onProgress(torrent.progress);
    }
    
    attempts++;
    
    // Check for error states that should trigger fallback
    if (torrent.status === "error" || torrent.status === "dead" || torrent.status === "virus") {
      throw new Error("Stream unavailable - trying next");
    }
    
    // Links become available once downloading starts, not when complete
    if (torrent.links && torrent.links.length > 0) {
      return torrent;
    }
  } while (attempts < maxAttempts);
  
  // If still no links after waiting, throw error to trigger fallback
  if (!torrent.links || torrent.links.length === 0) {
    throw new Error("Not cached - trying next stream");
  }
  
  return torrent;
}

// Convert a File object to base64 string
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (data:application/x-bittorrent;base64,)
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
