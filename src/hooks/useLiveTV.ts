import { useState, useEffect, useCallback, useRef } from 'react';
import { Channel, Program, EPG_SOURCES, LiveTVSettings } from '@/types/livetv';
import { parseM3U, mergeChannels, hashUrl } from '@/lib/m3uParser';
import { parseEPGXML, matchEPGToChannels, generateMockEPG } from '@/lib/epgParser';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const PROGRAMS_STORAGE_KEY = 'livetv_programs';
const EPG_REGION_KEY = 'livetv_epg_region';
const SETTINGS_STORAGE_KEY = 'livetv_settings';
const SORT_ENABLED_KEY = 'livetv_sort_enabled';

const DEFAULT_SETTINGS: LiveTVSettings = {};

export function useLiveTV() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('us');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<LiveTVSettings>(DEFAULT_SETTINGS);
  const [sortEnabled, setSortEnabled] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const isSyncing = useRef(false); // Prevent sync loops from realtime updates

  // Sort channels alphabetically (case-insensitive)
  const sortChannelsAlphabetically = useCallback((channelList: Channel[]): Channel[] => {
    return [...channelList].sort((a, b) => 
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }, []);

  // Sync channels to database
  const syncChannelsToDb = useCallback(async (channelList: Channel[]) => {
    if (!user) return;

    try {
      // Delete existing channels for this user
      await supabase
        .from('livetv_channels')
        .delete()
        .eq('user_id', user.id);

      // Insert all current channels
      if (channelList.length > 0) {
        const dbChannels = channelList.map((channel, index) => ({
          user_id: user.id,
          channel_id: channel.id,
          name: channel.name,
          url: channel.url,
          original_url: channel.originalUrl || null,
          logo: channel.logo || '',
          channel_group: channel.group || 'My Channels',
          epg_id: channel.epgId || '',
          is_unstable: channel.isUnstable,
          is_favorite: channel.isFavorite,
          sort_order: index,
        }));

        const { error } = await supabase
          .from('livetv_channels')
          .insert(dbChannels);

        if (error) {
          console.error('Error syncing channels to database:', error);
        }
      }
    } catch (err) {
      console.error('Error syncing channels:', err);
    }
  }, [user]);

  // Load channels from database
  const loadChannelsFromDb = useCallback(async () => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('livetv_channels')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('Error loading channels from database:', error);
        return [];
      }

      if (data && data.length > 0) {
        return data.map((row) => ({
          id: row.channel_id,
          name: row.name,
          url: row.url,
          originalUrl: row.original_url || undefined,
          logo: row.logo || '',
          group: row.channel_group || 'My Channels',
          epgId: row.epg_id || '',
          isUnstable: row.is_unstable || false,
          isFavorite: row.is_favorite || false,
        })) as Channel[];
      }
    } catch (err) {
      console.error('Error loading channels:', err);
    }
    return [];
  }, [user]);

  // Load data on mount and when user changes
  useEffect(() => {
    const loadData = async () => {
      try {
        const storedPrograms = localStorage.getItem(PROGRAMS_STORAGE_KEY);
        const storedRegion = localStorage.getItem(EPG_REGION_KEY);
        const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
        const storedSortEnabled = localStorage.getItem(SORT_ENABLED_KEY);
        
        // Load channels from database if user is logged in
        if (user) {
          const dbChannels = await loadChannelsFromDb();
          let channelList = dbChannels;
          
          // Apply sorting if enabled
          if (storedSortEnabled === 'true' && channelList.length > 0) {
            channelList = sortChannelsAlphabetically(channelList);
          }
          setChannels(channelList);
        } else {
          setChannels([]);
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
        if (storedSortEnabled) {
          setSortEnabled(storedSortEnabled === 'true');
        }
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setIsInitialized(true);
      }
    };

    loadData();
  }, [user, loadChannelsFromDb, sortChannelsAlphabetically]);

  // Sync channels to database when they change (after initialization)
  useEffect(() => {
    if (isInitialized && user && !isSyncing.current) {
      syncChannelsToDb(channels);
    }
  }, [channels, isInitialized, user, syncChannelsToDb]);

  // Real-time subscription for channel changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('livetv-channels-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'livetv_channels',
          filter: `user_id=eq.${user.id}`,
        },
        async () => {
          // Debounce and reload channels from DB
          isSyncing.current = true;
          const dbChannels = await loadChannelsFromDb();
          if (dbChannels.length > 0 || channels.length === 0) {
            let channelList = dbChannels;
            if (sortEnabled && channelList.length > 0) {
              channelList = sortChannelsAlphabetically(channelList);
            }
            setChannels(channelList);
          }
          setTimeout(() => {
            isSyncing.current = false;
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadChannelsFromDb, sortEnabled, sortChannelsAlphabetically, channels.length]);

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

  // Save sort preference to localStorage
  useEffect(() => {
    localStorage.setItem(SORT_ENABLED_KEY, String(sortEnabled));
  }, [sortEnabled]);

  // Toggle alphabetical sorting
  const toggleSort = useCallback(() => {
    setSortEnabled(prev => {
      const newValue = !prev;
      if (newValue) {
        setChannels(prevChannels => sortChannelsAlphabetically(prevChannels));
      }
      return newValue;
    });
  }, [sortChannelsAlphabetically]);

  // Export channels to M3U8 format
  const exportToM3U8 = useCallback((): string => {
    let m3uContent = '#EXTM3U\n';
    
    channels.forEach(channel => {
      const logoAttr = channel.logo ? ` tvg-logo="${channel.logo}"` : '';
      const groupAttr = ` group-title="${channel.group || 'My Channels'}"`;
      m3uContent += `#EXTINF:-1${logoAttr}${groupAttr},${channel.name}\n`;
      m3uContent += `${channel.url}\n`;
    });
    
    return m3uContent;
  }, [channels]);

  // Download M3U8 file
  const downloadM3U8 = useCallback(() => {
    const m3uContent = exportToM3U8();
    const blob = new Blob([m3uContent], { type: 'application/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my_playlist.m3u8';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportToM3U8]);

  // Export channels to JSON format (with all metadata)
  const exportToJSON = useCallback((): string => {
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      channels: channels.map(channel => ({
        id: channel.id,
        name: channel.name,
        url: channel.url,
        originalUrl: channel.originalUrl,
        logo: channel.logo,
        group: channel.group,
        epgId: channel.epgId,
        isFavorite: channel.isFavorite,
        isUnstable: channel.isUnstable,
      })),
    };
    return JSON.stringify(exportData, null, 2);
  }, [channels]);

  // Download JSON backup file
  const downloadJSON = useCallback(() => {
    const jsonContent = exportToJSON();
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `livetv-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Channels exported successfully');
  }, [exportToJSON]);

  // Import channels from JSON backup
  const importFromJSON = useCallback((jsonContent: string): number => {
    try {
      const data = JSON.parse(jsonContent);
      
      if (!data.channels || !Array.isArray(data.channels)) {
        throw new Error('Invalid backup format');
      }

      const importedChannels: Channel[] = data.channels.map((ch: any) => ({
        id: ch.id || hashUrl(ch.url),
        name: ch.name,
        url: ch.url,
        originalUrl: ch.originalUrl,
        logo: ch.logo || '',
        group: ch.group || 'Imported',
        epgId: ch.epgId || '',
        isFavorite: ch.isFavorite || false,
        isUnstable: ch.isUnstable || false,
      }));

      setChannels(prev => {
        const merged = mergeChannels(prev, importedChannels);
        return sortEnabled ? sortChannelsAlphabetically(merged) : merged;
      });

      return importedChannels.length;
    } catch (err) {
      console.error('Error importing JSON:', err);
      throw new Error('Failed to parse backup file');
    }
  }, [sortEnabled, sortChannelsAlphabetically]);

  // Copy shareable link to clipboard
  const copyShareableData = useCallback(async () => {
    const jsonContent = exportToJSON();
    const base64 = btoa(unescape(encodeURIComponent(jsonContent)));
    await navigator.clipboard.writeText(base64);
    toast.success('Channel list copied to clipboard! Share this with others to import.');
  }, [exportToJSON]);

  // Import from shareable data
  const importFromShareableData = useCallback((base64Data: string): number => {
    try {
      const jsonContent = decodeURIComponent(escape(atob(base64Data)));
      return importFromJSON(jsonContent);
    } catch {
      throw new Error('Invalid share data');
    }
  }, [importFromJSON]);

  // Add channels from M3U content
  const addChannelsFromM3U = useCallback((m3uContent: string) => {
    const newChannels = parseM3U(m3uContent);
    setChannels(prev => {
      const merged = mergeChannels(prev, newChannels);
      return sortEnabled ? sortChannelsAlphabetically(merged) : merged;
    });
    return newChannels.length;
  }, [sortEnabled, sortChannelsAlphabetically]);

  // Add a single channel by URL
  const addChannelByUrl = useCallback((url: string, name?: string) => {
    const id = hashUrl(url);
    const newChannel: Channel = {
      id,
      name: name || `Channel ${id.slice(0, 6)}`,
      url,
      logo: '',
      group: 'My Channels',
      epgId: '',
      isUnstable: false,
      isFavorite: false,
    };
    
    setChannels(prev => {
      if (prev.some(c => c.id === id)) {
        return prev; // Already exists
      }
      const updated = [...prev, newChannel];
      return sortEnabled ? sortChannelsAlphabetically(updated) : updated;
    });
    
    return newChannel;
  }, [sortEnabled, sortChannelsAlphabetically]);

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
  const clearAllData = useCallback(async () => {
    setChannels([]);
    setPrograms([]);
    localStorage.removeItem(PROGRAMS_STORAGE_KEY);
    
    // Also clear from database
    if (user) {
      await supabase
        .from('livetv_channels')
        .delete()
        .eq('user_id', user.id);
    }
  }, [user]);

  return {
    channels,
    programs,
    selectedRegion,
    isLoading,
    error,
    settings,
    sortEnabled,
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
    toggleSort,
    downloadM3U8,
    downloadJSON,
    importFromJSON,
    copyShareableData,
    importFromShareableData,
  };
}
