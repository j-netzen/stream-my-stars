import { Channel } from '@/types/livetv';

/**
 * Generate a hash from a URL for deduplication
 */
export function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Parse M3U/M3U8 playlist content into Channel objects
 */
export function parseM3U(content: string): Channel[] {
  const lines = content.split('\n').map(line => line.trim());
  const channels: Channel[] = [];
  
  let currentInfo: Partial<Channel> | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('#EXTINF:')) {
      // Parse EXTINF line
      const extinfMatch = line.match(/#EXTINF:(-?\d+)([^,]*),(.*)$/);
      
      if (extinfMatch) {
        const attributes = extinfMatch[2];
        const name = extinfMatch[3].trim();
        
        // Extract tvg-logo
        const logoMatch = attributes.match(/tvg-logo="([^"]*)"/);
        const logo = logoMatch ? logoMatch[1] : '';
        
        // Extract group-title
        const groupMatch = attributes.match(/group-title="([^"]*)"/);
        const group = groupMatch ? groupMatch[1] : 'Uncategorized';
        
        // Extract tvg-id for EPG matching
        const epgIdMatch = attributes.match(/tvg-id="([^"]*)"/);
        const epgId = epgIdMatch ? epgIdMatch[1] : '';
        
        // Extract tvg-name (fallback for matching)
        const tvgNameMatch = attributes.match(/tvg-name="([^"]*)"/);
        const tvgName = tvgNameMatch ? tvgNameMatch[1] : name;
        
        currentInfo = {
          name: name || tvgName,
          logo,
          group,
          epgId: epgId || tvgName.toLowerCase().replace(/\s+/g, '.'),
          isUnstable: false,
        };
      }
    } else if (line && !line.startsWith('#') && currentInfo) {
      // This is the URL line
      const url = line;
      
      if (url.startsWith('http')) {
        const id = hashUrl(url);
        
        channels.push({
          id,
          name: currentInfo.name || 'Unknown Channel',
          url,
          logo: currentInfo.logo || '',
          group: currentInfo.group || 'Uncategorized',
          epgId: currentInfo.epgId || '',
          isUnstable: false,
        });
      }
      
      currentInfo = null;
    }
  }
  
  return channels;
}

/**
 * Merge new channels with existing ones, avoiding duplicates
 */
export function mergeChannels(existing: Channel[], newChannels: Channel[]): Channel[] {
  const existingIds = new Set(existing.map(c => c.id));
  const uniqueNew = newChannels.filter(c => !existingIds.has(c.id));
  return [...existing, ...uniqueNew];
}

/**
 * Validate if a URL is likely an M3U/M3U8 stream
 */
export function isValidStreamUrl(url: string): boolean {
  return url.startsWith('http') && (
    url.includes('.m3u8') || 
    url.includes('.m3u') || 
    url.includes('/live/') ||
    url.includes('/stream/') ||
    url.includes('playlist.m3u8')
  );
}
