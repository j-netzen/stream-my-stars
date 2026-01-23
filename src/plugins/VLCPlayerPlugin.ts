import { registerPlugin } from '@capacitor/core';

export interface VLCPlayerOptions {
  url: string;
  title?: string;
  aspectRatio?: '16:9' | '4:3' | 'fit' | 'fill';
  startPosition?: number; // Start position in milliseconds
}

export interface VLCPlayerResult {
  completed: boolean;
  position: number; // Final position in milliseconds
  duration: number; // Total duration in milliseconds
}

export interface VLCPlayerPlugin {
  /**
   * Play a video using the native VLC player
   * @param options Video playback options
   * @returns Promise resolving when playback ends
   */
  playVideo(options: VLCPlayerOptions): Promise<VLCPlayerResult>;
  
  /**
   * Check if VLC player is available on this platform
   * @returns Promise with availability status
   */
  isAvailable(): Promise<{ available: boolean }>;
}

const VLCPlayer = registerPlugin<VLCPlayerPlugin>('VLCPlayer', {
  web: () => import('./VLCPlayerWeb').then(m => new m.VLCPlayerWeb()),
});

export default VLCPlayer;
