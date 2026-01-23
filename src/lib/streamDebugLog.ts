/**
 * Stream Debug Log
 * 
 * Captures and stores stream failure information for debugging purposes.
 * Logs are stored in localStorage and displayed in Settings.
 */

export interface StreamDebugEntry {
  id: string;
  timestamp: number;
  mediaTitle: string;
  streamTitle?: string;
  streamUrl?: string;
  errorType: 'network' | 'copyright' | 'uncached' | 'timeout' | 'playback' | 'unknown';
  errorMessage: string;
  errorDetails?: string;
  action: 'skipped' | 'retry' | 'failed';
}

const STORAGE_KEY = 'stream-debug-log';
const MAX_ENTRIES = 50;

/**
 * Get all debug log entries
 */
export function getDebugLogs(): StreamDebugEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load debug logs:', e);
  }
  return [];
}

/**
 * Add a new debug log entry
 */
export function addDebugLog(entry: Omit<StreamDebugEntry, 'id' | 'timestamp'>): void {
  try {
    const logs = getDebugLogs();
    const newEntry: StreamDebugEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    
    // Add to beginning (newest first)
    logs.unshift(newEntry);
    
    // Limit to max entries
    const trimmed = logs.slice(0, MAX_ENTRIES);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    
    // Also log to console for immediate debugging
    console.log('[StreamDebug]', newEntry.errorType, ':', newEntry.errorMessage, entry);
  } catch (e) {
    console.warn('Failed to save debug log:', e);
  }
}

/**
 * Clear all debug logs
 */
export function clearDebugLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear debug logs:', e);
  }
}

/**
 * Classify error type from error message
 */
export function classifyError(error: unknown): { type: StreamDebugEntry['errorType']; message: string } {
  const errorStr = String(error).toLowerCase();
  const message = error instanceof Error ? error.message : String(error);
  
  if (errorStr.includes('copyright') || errorStr.includes('infringing') || errorStr.includes('dmca') || errorStr.includes('451')) {
    return { type: 'copyright', message };
  }
  
  if (errorStr.includes('not cached') || errorStr.includes('uncached') || errorStr.includes('error 37') || errorStr.includes('disabled_endpoint')) {
    return { type: 'uncached', message };
  }
  
  if (errorStr.includes('timeout') || errorStr.includes('timed out') || errorStr.includes('aborted')) {
    return { type: 'timeout', message };
  }
  
  if (errorStr.includes('network') || errorStr.includes('fetch') || errorStr.includes('cors') || errorStr.includes('403') || errorStr.includes('404')) {
    return { type: 'network', message };
  }
  
  if (errorStr.includes('playback') || errorStr.includes('media') || errorStr.includes('codec') || errorStr.includes('hls')) {
    return { type: 'playback', message };
  }
  
  return { type: 'unknown', message };
}

/**
 * Format timestamp for display
 */
export function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;
  
  // Less than 1 minute ago
  if (diff < 60000) {
    return 'Just now';
  }
  
  // Less than 1 hour ago
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }
  
  // Less than 24 hours ago
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }
  
  // Show date
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Get error type display info
 */
export function getErrorTypeInfo(type: StreamDebugEntry['errorType']): { label: string; color: string } {
  switch (type) {
    case 'copyright':
      return { label: 'Copyright', color: 'text-red-400 bg-red-500/20' };
    case 'uncached':
      return { label: 'Not Cached', color: 'text-yellow-400 bg-yellow-500/20' };
    case 'timeout':
      return { label: 'Timeout', color: 'text-orange-400 bg-orange-500/20' };
    case 'network':
      return { label: 'Network', color: 'text-blue-400 bg-blue-500/20' };
    case 'playback':
      return { label: 'Playback', color: 'text-purple-400 bg-purple-500/20' };
    default:
      return { label: 'Unknown', color: 'text-gray-400 bg-gray-500/20' };
  }
}
