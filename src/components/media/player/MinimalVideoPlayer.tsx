/**
 * Minimal Video Player
 * 
 * The most basic video player possible:
 * - HTML5 video element
 * - Native browser controls
 * - Fullscreen support
 */

import { useRef, useEffect } from "react";
import { Media } from "@/hooks/useMedia";
import { getImageUrl } from "@/lib/tmdb";
import { X } from "lucide-react";

interface MinimalVideoPlayerProps {
  media: Media;
  streamUrl: string;
  onClose: () => void;
}

export function MinimalVideoPlayer({ media, streamUrl, onClose }: MinimalVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Get poster image
  const posterUrl = media.backdrop_path 
    ? getImageUrl(media.backdrop_path, "original") 
    : media.poster_path 
      ? getImageUrl(media.poster_path, "w500")
      : undefined;

  // Auto-focus video on mount
  useEffect(() => {
    videoRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Title */}
      <div className="absolute top-4 left-4 z-40">
        <h2 className="text-white text-lg font-medium drop-shadow-lg">
          {media.title}
        </h2>
      </div>

      {/* Native HTML5 Video */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        src={streamUrl}
        poster={posterUrl}
        controls
        autoPlay
        playsInline
      >
        Your browser does not support video playback.
      </video>
    </div>
  );
}
