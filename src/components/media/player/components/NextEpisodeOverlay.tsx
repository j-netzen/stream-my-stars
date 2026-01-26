/**
 * Netflix-style Next Episode Overlay
 * 
 * Shows at the end of a TV episode with countdown to auto-play next episode.
 */

import { useState, useEffect, useRef } from "react";
import { Play, X, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NextEpisodeOverlayProps {
  showTitle: string;
  currentSeason: number;
  currentEpisode: number;
  totalEpisodes?: number;
  onPlayNext: () => void;
  onClose: () => void;
  autoPlayDelay?: number; // seconds before auto-playing next episode
}

export function NextEpisodeOverlay({
  showTitle,
  currentSeason,
  currentEpisode,
  totalEpisodes,
  onPlayNext,
  onClose,
  autoPlayDelay = 10,
}: NextEpisodeOverlayProps) {
  const [countdown, setCountdown] = useState(autoPlayDelay);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const nextEpisode = currentEpisode + 1;
  const hasNextEpisode = !totalEpisodes || nextEpisode <= totalEpisodes;

  // Countdown timer
  useEffect(() => {
    if (isPaused || !hasNextEpisode) return;

    intervalRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onPlayNext();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPaused, hasNextEpisode, onPlayNext]);

  // Cancel countdown on user interaction
  const handleCancel = () => {
    setIsPaused(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/90 animate-fade-in flex items-center justify-center">
      <div className="max-w-lg w-full mx-4 text-center">
        {/* Show info */}
        <div className="mb-8">
          <p className="text-white/60 text-sm uppercase tracking-wider mb-2">
            You just finished
          </p>
          <h2 className="text-white text-2xl font-bold mb-1">{showTitle}</h2>
          <p className="text-white/80">
            Season {currentSeason}, Episode {currentEpisode}
          </p>
        </div>

        {/* Next episode preview */}
        {hasNextEpisode ? (
          <div className="space-y-6">
            <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm">
              <div className="flex items-center justify-center gap-2 text-white/60 text-sm mb-3">
                <SkipForward className="w-4 h-4" />
                <span>Up Next</span>
              </div>
              <p className="text-white text-xl font-semibold">
                Season {currentSeason}, Episode {nextEpisode}
              </p>
              
              {/* Countdown ring */}
              {!isPaused && (
                <div className="mt-4 flex items-center justify-center">
                  <div className="relative w-16 h-16">
                    <svg className="w-16 h-16 transform -rotate-90">
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                        className="text-white/20"
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                        className="text-primary transition-all duration-1000"
                        strokeDasharray={176}
                        strokeDashoffset={176 - (176 * countdown) / autoPlayDelay}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-white text-lg font-bold">
                      {countdown}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                className="gap-2 min-w-[180px]"
                onClick={onPlayNext}
              >
                <Play className="w-5 h-5 fill-current" />
                Play Next Episode
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="gap-2 min-w-[180px]"
                onClick={() => {
                  handleCancel();
                  onClose();
                }}
              >
                <X className="w-5 h-5" />
                Back to App
              </Button>
            </div>

            {/* Cancel auto-play link */}
            {!isPaused && (
              <button
                onClick={handleCancel}
                className="text-white/50 hover:text-white/80 text-sm transition-colors"
              >
                Cancel auto-play
              </button>
            )}
          </div>
        ) : (
          /* No more episodes */
          <div className="space-y-6">
            <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm">
              <p className="text-white/80">
                That's the end of Season {currentSeason}!
              </p>
            </div>
            <Button
              size="lg"
              variant="secondary"
              className="gap-2"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
              Back to App
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
