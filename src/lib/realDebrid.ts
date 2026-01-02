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
    
    // Check for token errors in response
    if (isTokenError(errorString) && retryCount === 0) {
      console.log("Token error in response, attempting refresh...");
      const newToken = await getValidAccessTokenWithRefresh();
      if (newToken) {
        return invokeRealDebrid(body, retryCount + 1);
      }
      throw new Error("Session expired. Please re-link your Real-Debrid account in Settings.");
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
  
  // Poll for links to become available (not full download)
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds max wait for links
  
  do {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
    torrent = await getTorrentInfo(torrentId);
    
    if (onProgress && torrent.progress) {
      onProgress(torrent.progress);
    }
    
    attempts++;
    
    if (torrent.status === "error" || torrent.status === "dead") {
      throw new Error(`Torrent failed with status: ${torrent.status}`);
    }
    
    // Links become available once downloading starts, not when complete
    if (torrent.links && torrent.links.length > 0) {
      return torrent;
    }
  } while (attempts < maxAttempts);
  
  // If still no links after waiting, throw error
  if (!torrent.links || torrent.links.length === 0) {
    throw new Error("Could not get streaming links. The torrent may not be cached. Try a different stream.");
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
