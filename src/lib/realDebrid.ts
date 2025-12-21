import { supabase } from "@/integrations/supabase/client";

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

async function invokeRealDebrid(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("real-debrid", { body });
  
  if (error) {
    console.error("Real-Debrid API error:", error);
    throw new Error(error.message || "Real-Debrid API error");
  }
  
  if (data?.error) {
    throw new Error(data.error);
  }
  
  return data;
}

export async function getRealDebridUser(): Promise<RealDebridUser> {
  return invokeRealDebrid({ action: "user" });
}

export async function unrestrictLink(link: string): Promise<RealDebridUnrestrictedLink> {
  return invokeRealDebrid({ action: "unrestrict", link });
}

export async function getStreamingLinks(link: string): Promise<RealDebridStreamingLinks> {
  return invokeRealDebrid({ action: "streaming", link });
}

export async function addMagnet(magnet: string): Promise<RealDebridMagnetResponse> {
  return invokeRealDebrid({ action: "add_magnet", magnet });
}

export async function addTorrentFile(torrentFileBase64: string): Promise<RealDebridMagnetResponse> {
  return invokeRealDebrid({ action: "add_torrent", torrentFile: torrentFileBase64 });
}

export async function selectTorrentFiles(torrentId: string): Promise<{ success: boolean }> {
  return invokeRealDebrid({ action: "select_files", torrentId });
}

export async function getTorrentInfo(torrentId: string): Promise<RealDebridTorrent> {
  return invokeRealDebrid({ action: "torrent_info", torrentId });
}

export async function listTorrents(): Promise<RealDebridTorrent[]> {
  return invokeRealDebrid({ action: "torrents" });
}

export async function listDownloads(): Promise<RealDebridUnrestrictedLink[]> {
  return invokeRealDebrid({ action: "downloads" });
}

export async function getSupportedHosts(): Promise<Record<string, unknown>> {
  return invokeRealDebrid({ action: "hosts" });
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
