// IndexedDB wrapper for storing File System Access API file handles
// These handles can be re-used across page refreshes after user grants permission

const DB_NAME = "media-hub-files";
const STORE_NAME = "file-handles";
const DB_VERSION = 1;

interface StoredHandle {
  mediaId: string;
  handle: FileSystemFileHandle;
  fileName: string;
  storedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "mediaId" });
      }
    };
  });
}

export async function storeFileHandle(
  mediaId: string,
  handle: FileSystemFileHandle
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const entry: StoredHandle = {
      mediaId,
      handle,
      fileName: handle.name,
      storedAt: Date.now(),
    };

    store.put(entry);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn("Failed to store file handle:", err);
  }
}

export async function getFileHandle(
  mediaId: string
): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(mediaId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close();
        const entry = request.result as StoredHandle | undefined;
        resolve(entry?.handle ?? null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn("Failed to retrieve file handle:", err);
    return null;
  }
}

export async function removeFileHandle(mediaId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(mediaId);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn("Failed to remove file handle:", err);
  }
}

/**
 * Request permission for a stored file handle and return a File if granted.
 * Falls back gracefully if the API isn't supported or user denies.
 */
export async function requestFileFromHandle(
  handle: FileSystemFileHandle
): Promise<File | null> {
  try {
    // Check if we already have permission
    const opts = { mode: "read" as const };

    // @ts-ignore - queryPermission may not be in all TS defs yet
    let permission = await handle.queryPermission?.(opts);

    if (permission !== "granted") {
      // @ts-ignore
      permission = await handle.requestPermission?.(opts);
    }

    if (permission === "granted") {
      return await handle.getFile();
    }

    return null;
  } catch (err) {
    console.warn("Permission request failed:", err);
    return null;
  }
}

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "showOpenFilePicker" in window &&
    typeof indexedDB !== "undefined"
  );
}
