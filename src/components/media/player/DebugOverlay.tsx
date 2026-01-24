import { Bug, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { StreamDebugInfo, maskUrlForDebug } from "@/lib/streamUtils";

export interface StreamQualityInfo {
  quality: string;
  size?: string;
  qualityRank?: number;
}

interface DebugOverlayProps {
  debugInfo: StreamDebugInfo | null;
  streamQuality?: StreamQualityInfo;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Parse quality string to extract resolution and codec
 */
function parseQualityInfo(quality?: string) {
  if (!quality) return { resolution: null, codec: null };
  const resMatch = quality.match(/(\d{3,4}p)/i);
  const codecMatch = quality.match(/(x264|x265|HEVC|h\.?264|h\.?265|AV1|VP9|HDR|DV|Dolby)/i);
  return {
    resolution: resMatch ? resMatch[1] : null,
    codec: codecMatch ? codecMatch[1].toUpperCase() : null,
  };
}

/**
 * Minimalist Debug Overlay for video player
 */
export function DebugOverlay({ 
  debugInfo, 
  streamQuality,
  isExpanded, 
  onToggle 
}: DebugOverlayProps) {
  if (!debugInfo) return null;

  const { resolution, codec } = parseQualityInfo(streamQuality?.quality);
  
  return (
    <div className="absolute top-4 right-4 z-30">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2 py-1 bg-black/70 hover:bg-black/90 text-xs text-white/70 rounded transition-colors"
      >
        <Bug className="w-3 h-3" />
        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      
      {isExpanded && (
        <div className="mt-1 p-3 bg-black/90 rounded-lg text-xs font-mono space-y-2 max-w-xs">
          {streamQuality && (
            <div className="pb-2 border-b border-white/10">
              <span className="text-white/50 block mb-1">Quality:</span>
              <div className="flex flex-wrap gap-1.5">
                {resolution && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">{resolution}</span>
                )}
                {codec && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">{codec}</span>
                )}
                {streamQuality.size && (
                  <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">{streamQuality.size}</span>
                )}
              </div>
            </div>
          )}
          
          <div>
            <span className="text-white/50">URL: </span>
            <span className="text-white/80 break-all">{maskUrlForDebug(debugInfo.originalUrl)}</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <span className={cn(
              "px-1.5 py-0.5 rounded",
              debugInfo.sourceType === 'torbox' ? 'bg-green-500/20 text-green-400' :
              debugInfo.sourceType === 'hls' ? 'bg-blue-500/20 text-blue-400' :
              'bg-yellow-500/20 text-yellow-400'
            )}>
              {debugInfo.sourceType}
            </span>
            {debugInfo.isHls && (
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">HLS</span>
            )}
          </div>
          
          <div className="space-y-1 text-white/60">
            <div>Proxy: {debugInfo.usedCorsProxy ? 'Yes' : 'No'}</div>
            <div>Mode: {debugInfo.playerMode}</div>
          </div>
        </div>
      )}
    </div>
  );
}
