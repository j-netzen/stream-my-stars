import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StreamPreparationOverlay } from "./StreamPreparationOverlay";
import {
  DebugOverlay,
  PlayerControls,
  CheckingOverlay,
  ReadyOverlay,
  LoadingOverlay,
  ErrorOverlay,
  useVideoPlayer,
  type StreamQualityInfo,
} from "./player";

interface Media {
  id: string;
  title: string;
  source_url?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  torboxTorrentId?: number;
  torboxFileId?: number;
}

interface BasicVideoPlayerProps {
  media: Media;
  onClose: () => void;
  streamQuality?: StreamQualityInfo;
  onPlaybackError?: () => void;
  onBackToSelection?: () => void;
}

// Re-export for backwards compatibility
export type { StreamQualityInfo };

/**
 * BasicVideoPlayer - Rebuilt for stability with Click-to-Fullscreen flow
 * 
 * Features:
 * - Clean "Ready" state with poster and centered play button
 * - Single synchronous click → fullscreen + play
 * - HLS.js with automatic error recovery (2004 fix)
 * - Auto-hiding controls after 2s inactivity
 * - Stream preparation overlay for non-cached TorBox links
 */
export default function BasicVideoPlayer({
  media,
  onClose,
  streamQuality,
  onPlaybackError,
  onBackToSelection,
}: BasicVideoPlayerProps) {
  const {
    containerRef,
    videoRef,
    playerState,
    errorMessage,
    showControls,
    showDebug,
    isFullscreen,
    isMuted,
    volume,
    currentTime,
    duration,
    buffered,
    preparingTorrentId,
    posterImage,
    debugInfo,
    isPlaying,
    handlePlayClick,
    togglePlayPause,
    toggleMute,
    handleVolumeChange,
    handleSeek,
    handleRetry,
    handleStreamReady,
    handlePreparationBack,
    toggleFullscreen,
    resetControlsTimeout,
    setShowDebug,
  } = useVideoPlayer({
    media,
    onPlaybackError,
    onBackToSelection,
    onClose,
  });

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black flex flex-col"
      onMouseMove={resetControlsTimeout}
      onTouchStart={resetControlsTimeout}
    >
      {/* Header - always visible */}
      <div 
        className={cn(
          "absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-white font-medium truncate">{media.title}</p>
          {streamQuality?.quality && (
            <p className="text-white/60 text-xs truncate">{streamQuality.quality}</p>
          )}
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose} 
          className="text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Video container */}
      <div className="relative flex-1 flex items-center justify-center">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          poster={posterImage || undefined}
          onClick={playerState === "playing" || playerState === "paused" ? togglePlayPause : undefined}
        />

        {/* Debug Overlay */}
        <DebugOverlay 
          debugInfo={debugInfo}
          streamQuality={streamQuality}
          isExpanded={showDebug}
          onToggle={() => setShowDebug(v => !v)}
        />

        {/* State Overlays */}
        <CheckingOverlay visible={playerState === "checking"} />
        
        {playerState === "preparing" && preparingTorrentId && (
          <StreamPreparationOverlay
            torrentId={preparingTorrentId}
            onReady={handleStreamReady}
            onBack={handlePreparationBack}
            onError={() => {}}
          />
        )}
        
        <ReadyOverlay 
          visible={playerState === "ready"} 
          onPlay={handlePlayClick} 
        />
        
        <LoadingOverlay visible={playerState === "loading"} />
        
        <ErrorOverlay 
          visible={playerState === "error"} 
          message={errorMessage}
          onRetry={handleRetry}
          onClose={onClose}
        />
      </div>

      {/* Bottom Controls - Auto-hide after 2s */}
      {(playerState === "playing" || playerState === "paused") && (
        <PlayerControls
          isPlaying={isPlaying}
          isMuted={isMuted}
          volume={volume}
          currentTime={currentTime}
          duration={duration}
          buffered={buffered}
          isFullscreen={isFullscreen}
          showControls={showControls}
          onPlayPause={togglePlayPause}
          onMuteToggle={toggleMute}
          onVolumeChange={handleVolumeChange}
          onSeek={handleSeek}
          onFullscreenToggle={toggleFullscreen}
        />
      )}
    </div>
  );
}
