import { WebPlugin } from '@capacitor/core';
import type { VLCPlayerPlugin, VLCPlayerOptions, VLCPlayerResult } from './VLCPlayerPlugin';

/**
 * Web fallback for VLC Player - indicates VLC is not available in browser
 */
export class VLCPlayerWeb extends WebPlugin implements VLCPlayerPlugin {
  async playVideo(_options: VLCPlayerOptions): Promise<VLCPlayerResult> {
    console.warn('[VLCPlayerWeb] Native VLC player not available in browser');
    throw new Error('VLC player is only available on native platforms');
  }

  async isAvailable(): Promise<{ available: boolean }> {
    return { available: false };
  }
}
