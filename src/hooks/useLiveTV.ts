import { useState, useEffect, useCallback } from 'react';
import { Channel, Program, EPG_SOURCES, LiveTVSettings } from '@/types/livetv';
import { parseM3U, mergeChannels, hashUrl } from '@/lib/m3uParser';
import { parseEPGXML, matchEPGToChannels, generateMockEPG } from '@/lib/epgParser';

const CHANNELS_STORAGE_KEY = 'livetv_channels';
const PROGRAMS_STORAGE_KEY = 'livetv_programs';
const EPG_REGION_KEY = 'livetv_epg_region';
const SETTINGS_STORAGE_KEY = 'livetv_settings';

const DEFAULT_SETTINGS: LiveTVSettings = {
  globalProxyEnabled: false,
};

export function useLiveTV() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('us');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<LiveTVSettings>(DEFAULT_SETTINGS);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedChannels = localStorage.getItem(CHANNELS_STORAGE_KEY);
      const storedPrograms = localStorage.getItem(PROGRAMS_STORAGE_KEY);
      const storedRegion = localStorage.getItem(EPG_REGION_KEY);
      const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      
      if (storedChannels) {
        setChannels(JSON.parse(storedChannels));
      }
      if (storedPrograms) {
        setPrograms(JSON.parse(storedPrograms));
      }
      if (storedRegion) {
        setSelectedRegion(storedRegion);
      }
      if (storedSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) });
      }
    } catch (err) {
      console.error('Error loading from localStorage:', err);
    }
  }, []);

  // Save channels to localStorage
  useEffect(() => {
    if (channels.length > 0) {
      localStorage.setItem(CHANNELS_STORAGE_KEY, JSON.stringify(channels));
    }
  }, [channels]);

  // Save programs to localStorage
  useEffect(() => {
    if (programs.length > 0) {
      localStorage.setItem(PROGRAMS_STORAGE_KEY, JSON.stringify(programs));
    }
  }, [programs]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // Update global proxy setting
  const setGlobalProxyEnabled = useCallback((enabled: boolean) => {
    setSettings(prev => ({ ...prev, globalProxyEnabled: enabled }));
  }, []);

  // Add channels from M3U content
  const addChannelsFromM3U = useCallback((m3uContent: string) => {
    const newChannels = parseM3U(m3uContent);
    setChannels(prev => mergeChannels(prev, newChannels));
    return newChannels.length;
  }, []);

  // Add a single channel by URL
  const addChannelByUrl = useCallback((url: string, name?: string) => {
    const id = hashUrl(url);
    const newChannel: Channel = {
      id,
      name: name || `Channel ${id.slice(0, 6)}`,
      url,
      logo: '',
      group: 'Custom',
      epgId: '',
      isUnstable: false,
      isFavorite: false,
    };
    
    setChannels(prev => {
      if (prev.some(c => c.id === id)) {
        return prev; // Already exists
      }
      return [...prev, newChannel];
    });
    
    return newChannel;
  }, []);

  // Toggle channel favorite status
  const toggleFavorite = useCallback((channelId: string) => {
    setChannels(prev => 
      prev.map(c => 
        c.id === channelId ? { ...c, isFavorite: !c.isFavorite } : c
      )
    );
  }, []);

  // Toggle channel unstable status
  const toggleUnstable = useCallback((channelId: string) => {
    setChannels(prev => 
      prev.map(c => 
        c.id === channelId ? { ...c, isUnstable: !c.isUnstable } : c
      )
    );
  }, []);

  // Remove a channel
  const removeChannel = useCallback((channelId: string) => {
    setChannels(prev => prev.filter(c => c.id !== channelId));
    setPrograms(prev => prev.filter(p => p.channelId !== channelId));
  }, []);

  // Update channel
  const updateChannel = useCallback((channelId: string, updates: Partial<Channel>) => {
    setChannels(prev =>
      prev.map(c =>
        c.id === channelId ? { ...c, ...updates } : c
      )
    );
  }, []);

  // Fetch EPG data
  const fetchEPG = useCallback(async (region?: string) => {
    const targetRegion = region || selectedRegion;
    const source = EPG_SOURCES.find(s => s.id === targetRegion);
    
    if (!source) {
      // Generate mock EPG
      const mockPrograms = generateMockEPG(channels);
      setPrograms(mockPrograms);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Note: In production, you'd need a CORS proxy or edge function
      // For now, we'll generate mock data as fallback
      const response = await fetch(source.url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch EPG');
      }

      // Handle gzipped content
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      
      // Try to decompress if gzipped
      let xmlContent: string;
      try {
        const ds = new DecompressionStream('gzip');
        const decompressed = blob.stream().pipeThrough(ds);
        const reader = decompressed.getReader();
        const chunks: Uint8Array[] = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        
        // Concatenate all chunks properly
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        
        const decoder = new TextDecoder();
        xmlContent = decoder.decode(result);
      } catch {
        // Not gzipped, read as text
        xmlContent = await blob.text();
      }

      const programsByChannel = await parseEPGXML(xmlContent);
      const matchedPrograms = matchEPGToChannels(channels, programsByChannel);
      
      if (matchedPrograms.length === 0) {
        // Fallback to mock
        const mockPrograms = generateMockEPG(channels);
        setPrograms(mockPrograms);
      } else {
        setPrograms(matchedPrograms);
      }

      setSelectedRegion(targetRegion);
      localStorage.setItem(EPG_REGION_KEY, targetRegion);
    } catch (err) {
      console.error('Error fetching EPG:', err);
      // Fallback to mock EPG
      const mockPrograms = generateMockEPG(channels);
      setPrograms(mockPrograms);
      setError('Using generated program guide');
    } finally {
      setIsLoading(false);
    }
  }, [channels, selectedRegion]);

  // Get channels grouped by category
  const getChannelsByGroup = useCallback(() => {
    const groups = new Map<string, Channel[]>();
    
    channels.forEach(channel => {
      const group = channel.group || 'Uncategorized';
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(channel);
    });
    
    return groups;
  }, [channels]);

  // Get programs for a specific channel
  const getProgramsForChannel = useCallback((channelId: string) => {
    return programs.filter(p => p.channelId === channelId);
  }, [programs]);

  // Get current program for a channel
  const getCurrentProgram = useCallback((channelId: string) => {
    const now = new Date();
    return programs.find(p => {
      if (p.channelId !== channelId) return false;
      const start = new Date(p.start);
      const stop = new Date(p.stop);
      return now >= start && now < stop;
    });
  }, [programs]);

  // Get favorite channels
  const getFavoriteChannels = useCallback(() => {
    return channels.filter(c => c.isFavorite);
  }, [channels]);

  // Get channels sorted with favorites first
  const getSortedChannels = useCallback(() => {
    return [...channels].sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return 0;
    });
  }, [channels]);

  // Clear all data
  const clearAllData = useCallback(() => {
    setChannels([]);
    setPrograms([]);
    localStorage.removeItem(CHANNELS_STORAGE_KEY);
    localStorage.removeItem(PROGRAMS_STORAGE_KEY);
  }, []);

  return {
    channels,
    programs,
    selectedRegion,
    isLoading,
    error,
    settings,
    addChannelsFromM3U,
    addChannelByUrl,
    toggleUnstable,
    toggleFavorite,
    removeChannel,
    updateChannel,
    fetchEPG,
    getChannelsByGroup,
    getProgramsForChannel,
    getCurrentProgram,
    getFavoriteChannels,
    getSortedChannels,
    clearAllData,
    setSelectedRegion,
    setGlobalProxyEnabled,
  };
}
