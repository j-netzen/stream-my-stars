/**
 * Stream Debug Log - Minimal stub for compatibility
 * Full logging was removed with video player cleanup.
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

/**
 * Get debug logs - Returns empty array (logging disabled)
 */
export function getDebugLogs(): StreamDebugEntry[] {
  return [];
}

/**
 * Add debug log - No-op (logging disabled)
 */
export function addDebugLog(_entry: Omit<StreamDebugEntry, 'id' | 'timestamp'>): void {
  // No-op - logging disabled
}

/**
 * Clear debug logs - No-op (logging disabled)
 */
export function clearDebugLogs(): void {
  // No-op - logging disabled
}

/**
 * Classify error type from error message
 */
export function classifyError(error: unknown): { type: StreamDebugEntry['errorType']; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  return { type: 'unknown', message };
}

/**
 * Format timestamp for display
 */
export function formatLogTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Get error type display info
 */
export function getErrorTypeInfo(type: StreamDebugEntry['errorType']): { label: string; color: string } {
  const labels: Record<string, { label: string; color: string }> = {
    copyright: { label: 'Copyright', color: 'text-red-400 bg-red-500/20' },
    uncached: { label: 'Not Cached', color: 'text-yellow-400 bg-yellow-500/20' },
    timeout: { label: 'Timeout', color: 'text-orange-400 bg-orange-500/20' },
    network: { label: 'Network', color: 'text-blue-400 bg-blue-500/20' },
    playback: { label: 'Playback', color: 'text-purple-400 bg-purple-500/20' },
    unknown: { label: 'Unknown', color: 'text-gray-400 bg-gray-500/20' },
  };
  return labels[type] || labels.unknown;
}
