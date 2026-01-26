/**
 * PlayerPosterOverlay
 * 
 * Shows the poster image with play button before playback starts.
 */

import { Play, Loader2 } from "lucide-react";
import { getImageUrl } from "@/lib/tmdb";
import type { Media } from "@/hooks/useMedia";

interface PlayerPosterOverlayProps {
  media: Media;
  resumeTime: number;
  isLoading: boolean;
  error: string | null;
  timeoutMessage: string | null;
  retryCount: number;
  maxRetryAttempts: number;
  onPlay: () => void;
  onRetry: () => void;
  onChangeStream?: () => void;
  onClose: () => void;
}

export function PlayerPosterOverlay({
  media,
  resumeTime,
  isLoading,
  error,
  timeoutMessage,
  retryCount,
  maxRetryAttempts,
  onPlay,
  onRetry,
  onChangeStream,
  onClose,
}: PlayerPosterOverlayProps) {
  const posterUrl = media.backdrop_path
    ? getImageUrl(media.backdrop_path, "original")
    : media.poster_path
      ? getImageUrl(media.poster_path, "w500")
      : null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return `${hours}h ${remainingMins}m`;
    }
    return `${mins}m ${secs}s`;
  };

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{
        backgroundImage: posterUrl ? `url(${posterUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

      {/* Spacer to push content to bottom third */}
      <div className="flex-1" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center pb-[10vh] px-4">
        {/* Title */}
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white text-center mb-4 drop-shadow-lg max-w-2xl">
          {media.title}
        </h2>

        {/* Resume indicator */}
        {resumeTime > 0 && !error && !isLoading && (
          <p className="text-white/70 text-sm mb-3">
            Resume from {formatTime(resumeTime)}
          </p>
        )}

        {error ? (
          <ErrorState
            error={error}
            onRetry={onRetry}
            onChangeStream={onChangeStream}
            onClose={onClose}
          />
        ) : isLoading ? (
          <LoadingState
            timeoutMessage={timeoutMessage}
            retryCount={retryCount}
            maxRetryAttempts={maxRetryAttempts}
          />
        ) : (
          <button
            onClick={onPlay}
            className="group flex items-center justify-center w-20 h-20 bg-primary/90 hover:bg-primary rounded-full transition-all hover:scale-110 shadow-xl"
          >
            <Play className="w-10 h-10 text-primary-foreground fill-current ml-1" />
          </button>
        )}
      </div>
    </div>
  );
}

function LoadingState({
  timeoutMessage,
  retryCount,
  maxRetryAttempts,
}: {
  timeoutMessage: string | null;
  retryCount: number;
  maxRetryAttempts: number;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="w-16 h-16 text-white animate-spin" />
      <p className="text-white/80">
        {timeoutMessage || 'Loading stream...'}
      </p>
      {retryCount > 0 && (
        <p className="text-white/60 text-sm">
          Attempt {retryCount + 1} of {maxRetryAttempts}
        </p>
      )}
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
  onChangeStream,
  onClose,
}: {
  error: string;
  onRetry: () => void;
  onChangeStream?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="text-center">
      <p className="text-red-400 mb-4">{error}</p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={onRetry}
          className="px-6 py-3 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg transition-colors"
        >
          Retry
        </button>
        {onChangeStream && (
          <button
            onClick={onChangeStream}
            className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
          >
            Try Another Stream
          </button>
        )}
        <button
          onClick={onClose}
          className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
