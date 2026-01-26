/**
 * PlayerDebugPanel
 * 
 * On-screen debug overlay showing HLS state, buffer ranges, and errors.
 */

import { useState } from "react";
import { Bug, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HlsDebugState } from "../hooks/useHlsPlayback";

interface PlayerDebugPanelProps {
  debugState: HlsDebugState;
  streamUrl: string;
  isPlaying: boolean;
}

export function PlayerDebugPanel({ debugState, streamUrl, isPlaying }: PlayerDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBitrate = (bitrate: number) => {
    if (bitrate >= 1000000) return `${(bitrate / 1000000).toFixed(1)} Mbps`;
    if (bitrate >= 1000) return `${(bitrate / 1000).toFixed(0)} Kbps`;
    return `${bitrate} bps`;
  };

  const formatTimestamp = (ts: number | null) => {
    if (!ts) return null;
    return new Date(ts).toLocaleTimeString();
  };

  if (!isPlaying) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className={cn(
          "absolute top-4 left-4 z-50 p-2 rounded-full transition-colors",
          isVisible ? "bg-primary text-primary-foreground" : "bg-black/50 hover:bg-black/70 text-white"
        )}
        title="Toggle debug panel"
      >
        <Bug className="w-5 h-5" />
      </button>

      {/* Debug panel */}
      {isVisible && (
        <div className="absolute top-14 left-4 z-50 bg-black/90 text-white text-xs font-mono rounded-lg overflow-hidden max-w-sm">
          {/* Header */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10"
          >
            <span className="font-semibold">HLS Debug</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Content */}
          <div className={cn("px-3 pb-3 space-y-2", !isExpanded && "hidden")}>
            {/* Status indicators */}
            <div className="flex flex-wrap gap-2">
              <StatusBadge 
                label="HLS" 
                active={debugState.hlsAttached} 
              />
              <StatusBadge 
                label="Manifest" 
                active={debugState.manifestLoaded} 
              />
            </div>

            {/* Time info */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div>Time:</div>
              <div>{formatTime(debugState.currentTime)} / {formatTime(debugState.duration)}</div>
            </div>

            {/* Quality levels */}
            {debugState.levels.length > 0 && (
              <div className="space-y-1">
                <div className="text-muted-foreground">Quality Levels:</div>
                <div className="flex flex-wrap gap-1">
                  {debugState.levels.map((level, i) => (
                    <span
                      key={i}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px]",
                        i === debugState.currentLevel 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-white/20"
                      )}
                    >
                      {level.height}p ({formatBitrate(level.bitrate)})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Buffer ranges */}
            <div className="space-y-1">
              <div className="text-muted-foreground">Buffer Ranges:</div>
              {debugState.bufferedRanges.length > 0 ? (
                <div className="space-y-0.5">
                  {debugState.bufferedRanges.map((range, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-white/20 rounded overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{
                            marginLeft: `${(range.start / debugState.duration) * 100}%`,
                            width: `${((range.end - range.start) / debugState.duration) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] w-24 text-right">
                        {formatTime(range.start)} - {formatTime(range.end)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground italic">No buffer</div>
              )}
            </div>

            {/* Last error */}
            {debugState.lastError && (
              <div className="space-y-1">
                <div className="text-red-400">Last Error:</div>
                <div className="text-red-300 break-all">{debugState.lastError}</div>
                {debugState.lastErrorTime && (
                  <div className="text-muted-foreground text-[10px]">
                    at {formatTimestamp(debugState.lastErrorTime)}
                  </div>
                )}
              </div>
            )}

            {/* Stream URL */}
            <div className="space-y-1">
              <div className="text-muted-foreground">Stream:</div>
              <div className="text-[10px] break-all opacity-60 max-h-12 overflow-y-auto">
                {streamUrl}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded text-[10px] font-medium",
        active ? "bg-green-500/30 text-green-300" : "bg-red-500/30 text-red-300"
      )}
    >
      {label}: {active ? "✓" : "✗"}
    </span>
  );
}
