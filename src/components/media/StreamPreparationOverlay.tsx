import { useState, useEffect, useRef, useCallback } from "react";
import { Play, ArrowLeft, Loader2, AlertTriangle, Download, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getTorrentInfo, TorBoxTorrent } from "@/lib/torbox";

export type PreparationStatus = 
  | "checking" 
  | "downloading" 
  | "ready" 
  | "stalled" 
  | "error";

interface StreamPreparationOverlayProps {
  torrentId: number;
  onReady: (torrent: TorBoxTorrent) => void;
  onBack: () => void;
  onError: (message: string) => void;
  className?: string;
}

/**
 * StreamPreparationOverlay - Calming progress visualization for non-cached streams
 * 
 * Features:
 * - 5-second polling for TorBox download progress
 * - Soft sage/teal color palette for anxiety reduction
 * - Intelligent play button that only enables when ready
 * - Helpful messaging for stalled downloads (0 seeds)
 */
export function StreamPreparationOverlay({
  torrentId,
  onReady,
  onBack,
  onError,
  className,
}: StreamPreparationOverlayProps) {
  const [status, setStatus] = useState<PreparationStatus>("checking");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Checking stream availability...");
  const [torrent, setTorrent] = useState<TorBoxTorrent | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptCountRef = useRef(0);
  const maxAttempts = 120; // 10 minutes at 5s intervals

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Check torrent status
  const checkStatus = useCallback(async () => {
    try {
      const info = await getTorrentInfo(torrentId);
      setTorrent(info);
      
      // Calculate progress percentage
      const progressPercent = Math.round((info.progress ?? 0) * 100);
      setProgress(progressPercent);

      // Check if ready (cached or download complete)
      if (info.download_present || info.progress === 1) {
        setStatus("ready");
        setStatusMessage("Stream is ready!");
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        return;
      }

      // Check for error state
      if (info.download_state === "error") {
        setStatus("error");
        setStatusMessage("Download failed. Please try another stream.");
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        onError("Download failed");
        return;
      }

      // Check for stalled state (no seeds)
      if (info.download_state === "stalled" || (info.seeds === 0 && info.progress < 1 && info.progress > 0)) {
        setStatus("stalled");
        setStatusMessage("This source is taking a moment to wake up. You might want to try a different link for faster playback.");
        return;
      }

      // Still downloading
      setStatus("downloading");
      
      // Update message based on progress
      if (progressPercent === 0) {
        setStatusMessage("Gathering data from peers...");
      } else if (progressPercent < 25) {
        setStatusMessage("Preparing your stream...");
      } else if (progressPercent < 50) {
        setStatusMessage("Almost there...");
      } else if (progressPercent < 75) {
        setStatusMessage("More than halfway done...");
      } else {
        setStatusMessage("Finalizing stream preparation...");
      }

      // Check max attempts
      attemptCountRef.current++;
      if (attemptCountRef.current >= maxAttempts) {
        setStatus("error");
        setStatusMessage("Download is taking too long. Please try another stream.");
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        onError("Timeout");
      }
    } catch (err) {
      console.error("Failed to check torrent status:", err);
      setStatus("error");
      setStatusMessage("Failed to check stream status. Please try again.");
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      onError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [torrentId, onError]);

  // Start polling on mount
  useEffect(() => {
    // Initial check
    checkStatus();
    
    // Set up 5-second polling interval
    pollingRef.current = setInterval(checkStatus, 5000);
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [checkStatus]);

  // Handle play button click
  const handlePlay = useCallback(() => {
    if (status !== "ready" || !torrent) return;
    
    // Smooth transition animation
    setIsTransitioning(true);
    
    setTimeout(() => {
      onReady(torrent);
    }, 300);
  }, [status, torrent, onReady]);

  // Get status icon
  const StatusIcon = () => {
    switch (status) {
      case "checking":
        return <Loader2 className="w-8 h-8 text-cosmic-teal animate-spin" />;
      case "downloading":
        return <Download className="w-8 h-8 text-cosmic-teal animate-pulse" />;
      case "ready":
        return <CheckCircle className="w-8 h-8 text-emerald-400" />;
      case "stalled":
        return <AlertTriangle className="w-8 h-8 text-amber-400" />;
      case "error":
        return <AlertTriangle className="w-8 h-8 text-destructive" />;
    }
  };

  return (
    <div 
      className={cn(
        "absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md transition-all duration-300",
        isTransitioning && "opacity-0 scale-105",
        className
      )}
    >
      {/* Main content container */}
      <div className="max-w-md w-full mx-4 text-center space-y-6">
        
        {/* Status Icon */}
        <div className="flex justify-center">
          <div className="relative">
            {/* Soft glow background */}
            <div 
              className={cn(
                "absolute inset-0 rounded-full blur-xl transition-colors duration-500",
                status === "ready" ? "bg-emerald-500/30" : 
                status === "stalled" ? "bg-amber-500/20" :
                status === "error" ? "bg-destructive/20" :
                "bg-cosmic-teal/20"
              )}
            />
            <div className="relative p-4">
              <StatusIcon />
            </div>
          </div>
        </div>

        {/* Progress Section */}
        {(status === "checking" || status === "downloading" || status === "stalled") && (
          <div className="space-y-3">
            {/* Progress Bar - Soft teal/sage color */}
            <div className="relative">
              <Progress 
                value={progress} 
                className="h-2 bg-muted/30"
              />
              {/* Shimmer effect for active downloading */}
              {status === "downloading" && (
                <div className="absolute inset-0 overflow-hidden rounded-full">
                  <div 
                    className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
                    style={{ 
                      animation: "shimmer 2s infinite",
                      left: "-25%",
                    }}
                  />
                </div>
              )}
            </div>
            
            {/* Progress percentage */}
            <p className="text-2xl font-light text-foreground/90 tabular-nums">
              {progress}%
            </p>
          </div>
        )}

        {/* Status Message */}
        <p 
          className={cn(
            "text-sm transition-colors duration-300",
            status === "ready" ? "text-emerald-400" :
            status === "stalled" ? "text-amber-400/90" :
            status === "error" ? "text-destructive/90" :
            "text-muted-foreground"
          )}
        >
          {statusMessage}
        </p>

        {/* Download stats for active downloads */}
        {status === "downloading" && torrent && (
          <div className="flex justify-center gap-6 text-xs text-muted-foreground/70">
            {torrent.seeds !== undefined && (
              <span>Seeds: {torrent.seeds}</span>
            )}
            {torrent.download_speed !== undefined && torrent.download_speed > 0 && (
              <span>
                Speed: {(torrent.download_speed / 1024 / 1024).toFixed(1)} MB/s
              </span>
            )}
            {torrent.eta !== undefined && torrent.eta > 0 && torrent.eta < 86400 && (
              <span>
                ETA: {Math.floor(torrent.eta / 60)}m {torrent.eta % 60}s
              </span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col items-center gap-3 pt-2">
          {/* Play Button - Only enabled when ready */}
          <button
            onClick={handlePlay}
            disabled={status !== "ready"}
            className={cn(
              "group relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500",
              status === "ready" 
                ? "bg-emerald-500/20 border-2 border-emerald-400/60 hover:scale-110 hover:bg-emerald-500/30 cursor-pointer" 
                : "bg-muted/20 border border-muted/30 cursor-not-allowed opacity-50"
            )}
          >
            {status === "ready" && (
              <>
                {/* Pulse ring for ready state */}
                <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
                <div className="absolute inset-0 rounded-full bg-emerald-400/10 animate-pulse" />
              </>
            )}
            <Play 
              className={cn(
                "w-10 h-10 ml-1 transition-all",
                status === "ready" 
                  ? "text-emerald-400 group-hover:scale-110" 
                  : "text-muted-foreground/50"
              )} 
              fill={status === "ready" ? "currentColor" : "none"}
            />
          </button>

          {/* Ready text below play button */}
          {status === "ready" && (
            <p className="text-sm text-emerald-400/80 animate-pulse">
              Click to start playback
            </p>
          )}

          {/* Back Button - Always visible */}
          <Button
            variant="ghost"
            onClick={onBack}
            className="gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/20"
          >
            <ArrowLeft className="w-4 h-4" />
            {status === "stalled" || status === "error" 
              ? "Try a different link" 
              : "Back to selection"
            }
          </Button>
        </div>
      </div>
    </div>
  );
}
