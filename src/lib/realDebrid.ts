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

export async function addMagnet(magnet: string): Promise<RealDebridMagnetResponse> {
  return invokeRealDebrid({ action: "add_magnet", magnet });
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

// Helper to add a magnet and wait for it to be ready
export async function addMagnetAndWait(
  magnet: string,
  onProgress?: (progress: number) => void
): Promise<RealDebridTorrent> {
  // Add the magnet
  const { id } = await addMagnet(magnet);
  
  // Select all files
  await selectTorrentFiles(id);
  
  // Poll for status
  let torrent: RealDebridTorrent;
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max
  
  do {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
    torrent = await getTorrentInfo(id);
    
    if (onProgress && torrent.progress) {
      onProgress(torrent.progress);
    }
    
    attempts++;
    
    if (torrent.status === "error" || torrent.status === "dead") {
      throw new Error(`Torrent failed with status: ${torrent.status}`);
    }
  } while (torrent.status !== "downloaded" && attempts < maxAttempts);
  
  if (torrent.status !== "downloaded") {
    throw new Error("Torrent download timed out");
  }
  
  return torrent;
}
