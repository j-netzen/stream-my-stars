import { Play, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type PlayerState = "checking" | "preparing" | "ready" | "loading" | "playing" | "paused" | "error";

interface CheckingOverlayProps {
  visible: boolean;
}

interface ReadyOverlayProps {
  visible: boolean;
  onPlay: () => void;
}

interface LoadingOverlayProps {
  visible: boolean;
}

interface ErrorOverlayProps {
  visible: boolean;
  message: string;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * Checking state - Initial availability check
 */
export function CheckingOverlay({ visible }: CheckingOverlayProps) {
  if (!visible) return null;
  
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
        <p className="text-muted-foreground text-sm">Checking stream availability...</p>
      </div>
    </div>
  );
}

/**
 * Ready state - Centered Play Button
 */
export function ReadyOverlay({ visible, onPlay }: ReadyOverlayProps) {
  if (!visible) return null;
  
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
      <button
        onClick={onPlay}
        className="group relative w-24 h-24 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center transition-all duration-300 hover:scale-110 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
      >
        <Play className="w-12 h-12 text-white ml-1 transition-transform group-hover:scale-110" fill="white" />
      </button>
      <p className="mt-6 text-white/80 text-lg font-medium">Ready to Play</p>
      <p className="mt-2 text-white/50 text-sm">Click to start in fullscreen</p>
    </div>
  );
}

/**
 * Loading state - Soft Pulsing Animation
 */
export function LoadingOverlay({ visible }: LoadingOverlayProps) {
  if (!visible) return null;
  
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
      <div className="flex flex-col items-center gap-4">
        {/* Pulsing loader */}
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-white/10 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        </div>
        <p className="text-white/70 text-sm animate-pulse">Loading stream…</p>
      </div>
    </div>
  );
}

/**
 * Error state - Error message with retry options
 */
export function ErrorOverlay({ visible, message, onRetry, onClose }: ErrorOverlayProps) {
  if (!visible) return null;
  
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
      <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-destructive/10 backdrop-blur-md p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <p className="text-white font-semibold text-lg mb-2">Playback Error</p>
        <p className="text-white/70 text-sm mb-6">{message}</p>

        <div className="flex flex-col gap-3">
          <Button
            variant="outline"
            onClick={onRetry}
            className="gap-2 border-white/20 text-white hover:bg-white/10"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
