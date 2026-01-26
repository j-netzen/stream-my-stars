/**
 * Video Player Wrapper
 * 
 * Selects and renders the appropriate video player based on user settings.
 */

import { Media } from "@/hooks/useMedia";
import { usePlaybackSettings } from "@/hooks/usePlaybackSettings";
import { SimpleHLSPlayer } from "./SimpleHLSPlayer";
import { MinimalVideoPlayer } from "./MinimalVideoPlayer";

interface VideoPlayerWrapperProps {
  media: Media;
  streamUrl: string;
  onClose: () => void;
  episodeNumber?: number;
  seasonNumber?: number;
}

export function VideoPlayerWrapper({ 
  media, 
  streamUrl, 
  onClose,
  episodeNumber,
  seasonNumber 
}: VideoPlayerWrapperProps) {
  const { settings } = usePlaybackSettings();

  console.log(`[VideoPlayerWrapper] Using player: ${settings.playerType}, URL: ${streamUrl.substring(0, 50)}...`);

  if (settings.playerType === 'minimal') {
    return (
      <MinimalVideoPlayer
        media={media}
        streamUrl={streamUrl}
        onClose={onClose}
        episodeNumber={episodeNumber}
        seasonNumber={seasonNumber}
      />
    );
  }

  // Default to Simple HLS Player
  return (
    <SimpleHLSPlayer
      media={media}
      streamUrl={streamUrl}
      onClose={onClose}
      episodeNumber={episodeNumber}
      seasonNumber={seasonNumber}
    />
  );
}
