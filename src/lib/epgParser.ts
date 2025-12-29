import { Program, Channel } from '@/types/livetv';

/**
 * Simple fuzzy match for channel names
 */
function fuzzyMatch(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Simple Levenshtein-like similarity
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  
  let matches = 0;
  const minLen = Math.min(s1.length, s2.length);
  for (let i = 0; i < minLen; i++) {
    if (s1[i] === s2[i]) matches++;
  }
  
  return matches / maxLen;
}

/**
 * Parse XMLTV EPG data
 */
export async function parseEPGXML(xmlContent: string): Promise<Map<string, Program[]>> {
  const programsByChannel = new Map<string, Program[]>();
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');
    
    const programmes = doc.querySelectorAll('programme');
    
    programmes.forEach((prog, index) => {
      const channelId = prog.getAttribute('channel') || '';
      const start = prog.getAttribute('start') || '';
      const stop = prog.getAttribute('stop') || '';
      
      const titleEl = prog.querySelector('title');
      const descEl = prog.querySelector('desc');
      
      const title = titleEl?.textContent || 'Unknown Program';
      const desc = descEl?.textContent || '';
      
      // Parse XMLTV date format (20231225120000 +0000) to ISO
      const startDate = parseXMLTVDate(start);
      const stopDate = parseXMLTVDate(stop);
      
      if (startDate && stopDate) {
        const program: Program = {
          id: `${channelId}-${index}`,
          channelId,
          start: startDate.toISOString(),
          stop: stopDate.toISOString(),
          title,
          desc,
        };
        
        if (!programsByChannel.has(channelId)) {
          programsByChannel.set(channelId, []);
        }
        programsByChannel.get(channelId)!.push(program);
      }
    });
  } catch (error) {
    console.error('Error parsing EPG XML:', error);
  }
  
  return programsByChannel;
}

/**
 * Parse XMLTV date format to Date object
 */
function parseXMLTVDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  try {
    // Format: 20231225120000 +0000
    const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
    
    if (match) {
      const [, year, month, day, hour, minute, second, tz] = match;
      const isoStr = `${year}-${month}-${day}T${hour}:${minute}:${second}${tz ? tz.slice(0, 3) + ':' + tz.slice(3) : 'Z'}`;
      return new Date(isoStr);
    }
    
    return new Date(dateStr);
  } catch {
    return null;
  }
}

/**
 * Match EPG data to channels using fuzzy matching
 */
export function matchEPGToChannels(
  channels: Channel[],
  programsByChannel: Map<string, Program[]>
): Program[] {
  const matchedPrograms: Program[] = [];
  const epgChannelIds = Array.from(programsByChannel.keys());
  
  channels.forEach(channel => {
    // Try exact match first
    if (programsByChannel.has(channel.epgId)) {
      const programs = programsByChannel.get(channel.epgId)!;
      programs.forEach(p => {
        matchedPrograms.push({
          ...p,
          channelId: channel.id,
        });
      });
      return;
    }
    
    // Try fuzzy match
    let bestMatch = '';
    let bestScore = 0;
    
    for (const epgId of epgChannelIds) {
      const score = Math.max(
        fuzzyMatch(channel.name, epgId),
        fuzzyMatch(channel.epgId, epgId)
      );
      
      if (score > bestScore && score > 0.6) {
        bestScore = score;
        bestMatch = epgId;
      }
    }
    
    if (bestMatch) {
      const programs = programsByChannel.get(bestMatch)!;
      programs.forEach(p => {
        matchedPrograms.push({
          ...p,
          channelId: channel.id,
        });
      });
    }
  });
  
  return matchedPrograms;
}

/**
 * Generate mock EPG data for channels without real EPG
 */
export function generateMockEPG(channels: Channel[]): Program[] {
  const programs: Program[] = [];
  const now = new Date();
  
  // Generate 24 hours of 1-hour blocks
  channels.forEach(channel => {
    for (let i = -12; i < 12; i++) {
      const start = new Date(now);
      start.setHours(start.getHours() + i, 0, 0, 0);
      
      const stop = new Date(start);
      stop.setHours(stop.getHours() + 1);
      
      programs.push({
        id: `${channel.id}-mock-${i}`,
        channelId: channel.id,
        start: start.toISOString(),
        stop: stop.toISOString(),
        title: `${channel.name} Live Stream`,
        desc: 'Live programming',
      });
    }
  });
  
  return programs;
}

/**
 * Get programs for the current time window
 */
export function getProgramsInRange(
  programs: Program[],
  startTime: Date,
  endTime: Date
): Program[] {
  return programs.filter(p => {
    const pStart = new Date(p.start);
    const pStop = new Date(p.stop);
    return pStart < endTime && pStop > startTime;
  });
}
