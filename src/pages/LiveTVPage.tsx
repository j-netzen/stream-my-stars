import { useState, useMemo, useCallback, useEffect } from 'react';
import { useLiveTV } from '@/hooks/useLiveTV';
import { Channel, Program } from '@/types/livetv';
import { HLSPlayer } from '@/components/livetv/HLSPlayer';
import { ChannelList } from '@/components/livetv/ChannelList';
import { EPGTimeline } from '@/components/livetv/EPGTimeline';
import { AddChannelDialog } from '@/components/livetv/AddChannelDialog';
import { ChannelSettingsDialog } from '@/components/livetv/ChannelSettingsDialog';
import { EPGSettingsDialog } from '@/components/livetv/EPGSettingsDialog';
import { Button } from '@/components/ui/button';
import { Plus, Globe, Trash2, Tv, List, Grid3X3, X, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type ViewMode = 'list' | 'guide' | 'fullscreen';

const STORAGE_KEY = 'livetv-view-mode';

export default function LiveTVPage() {
  const {
    channels,
    programs,
    selectedRegion,
    isLoading,
    settings,
    addChannelsFromM3U,
    addChannelByUrl,
    toggleUnstable,
    toggleFavorite,
    removeChannel,
    updateChannel,
    setChannelUseProxy,
    fetchEPG,
    getCurrentProgram,
    clearAllData,
    setSelectedRegion,
    setGlobalProxyEnabled,
  } = useLiveTV();

  // Load persisted view mode
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'list' || saved === 'guide' || saved === 'fullscreen') {
      return saved;
    }
    return 'list';
  });

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [settingsChannel, setSettingsChannel] = useState<Channel | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showEPGDialog, setShowEPGDialog] = useState(false);
  const [playerControlsVisible, setPlayerControlsVisible] = useState(true);

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, viewMode);
  }, [viewMode]);

  // ESC key handler to exit guide and fullscreen modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewMode === 'fullscreen') {
          setViewMode('guide');
        } else if (viewMode === 'guide') {
          setViewMode('list');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);

  // Auto-hide player controls when EPG is visible
  useEffect(() => {
    if (viewMode === 'guide' || viewMode === 'fullscreen') {
      setPlayerControlsVisible(true);
      const timer = setTimeout(() => {
        setPlayerControlsVisible(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setPlayerControlsVisible(true);
    }
  }, [viewMode, selectedChannel]);

  // Build current programs map
  const currentPrograms = useMemo(() => {
    const map = new Map<string, Program | undefined>();
    channels.forEach(c => {
      map.set(c.id, getCurrentProgram(c.id));
    });
    return map;
  }, [channels, getCurrentProgram]);

  const handleSelectChannel = useCallback((channel: Channel) => {
    setSelectedChannel(channel);
    // Reset controls visibility timer when channel changes
    setPlayerControlsVisible(true);
  }, []);

  const handleChannelSettings = useCallback((channel: Channel) => {
    setSettingsChannel(channel);
    setShowSettingsDialog(true);
  }, []);

  const handleSelectProgram = useCallback((program: Program, channel: Channel) => {
    setSelectedChannel(channel);
    setPlayerControlsVisible(true);
  }, []);

  const handleStreamError = useCallback(() => {
    if (selectedChannel) {
      toggleUnstable(selectedChannel.id);
    }
  }, [selectedChannel, toggleUnstable]);

  const handleProxyRequired = useCallback((channelId: string) => {
    setChannelUseProxy(channelId, true);
  }, [setChannelUseProxy]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleBackToList = useCallback(() => {
    if (viewMode === 'fullscreen') {
      setViewMode('guide');
    } else {
      setViewMode('list');
    }
  }, [viewMode]);

  const handleToggleFullscreen = useCallback(() => {
    setViewMode(prev => prev === 'fullscreen' ? 'guide' : 'fullscreen');
  }, []);

  // Restore player controls on mouse activity in guide/fullscreen mode
  const handlePlayerAreaActivity = useCallback(() => {
    if (viewMode === 'guide' || viewMode === 'fullscreen') {
      setPlayerControlsVisible(true);
    }
  }, [viewMode]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header - hidden in fullscreen mode */}
      {viewMode !== 'fullscreen' && (
        <div className="flex items-center justify-between p-4 border-b border-border z-30 bg-background">
          <div className="flex items-center gap-3">
            <Tv className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Live TV</h1>
            <span className="text-sm text-muted-foreground">
              {channels.length} channel{channels.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => handleViewModeChange('list')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode !== 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => handleViewModeChange('guide')}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </div>

            <Button variant="outline" size="sm" onClick={() => setShowEPGDialog(true)}>
              <Globe className="mr-2 h-4 w-4" />
              EPG
            </Button>

            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Channels
            </Button>

            {channels.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm('Clear all channels and data?')) {
                    clearAllData();
                    setSelectedChannel(null);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {channels.length === 0 ? (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <Tv className="h-16 w-16 text-muted-foreground" />
            <h2 className="text-xl font-medium">No Channels Added</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Add channels by pasting a stream URL or importing an M3U playlist to get started with Live TV.
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Channel
            </Button>
          </div>
        ) : viewMode === 'list' ? (
          /* List View */
          <div className="flex-1 flex overflow-hidden">
            {/* Channel Sidebar */}
            <div className="w-80 flex-shrink-0 z-10">
              <ChannelList
                channels={channels}
                currentPrograms={currentPrograms}
                selectedChannelId={selectedChannel?.id}
                onSelectChannel={handleSelectChannel}
                onChannelSettings={handleChannelSettings}
                onToggleFavorite={toggleFavorite}
                onDeleteChannel={removeChannel}
              />
            </div>

            {/* Player Area */}
            <div className="flex-1 p-4 flex flex-col z-10">
              {selectedChannel ? (
                <HLSPlayer
                  url={selectedChannel.url}
                  originalUrl={selectedChannel.originalUrl}
                  channelId={selectedChannel.id}
                  channelName={selectedChannel.name}
                  channelLogo={selectedChannel.logo}
                  isUnstable={selectedChannel.isUnstable}
                  globalProxyEnabled={settings.globalProxyEnabled}
                  proxyModeEnabled={selectedChannel.useProxy}
                  onProxyRequired={handleProxyRequired}
                  onError={handleStreamError}
                  onClose={() => setSelectedChannel(null)}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center bg-muted rounded-lg">
                  <p className="text-muted-foreground">Select a channel to start watching</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Guide / Fullscreen View */
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* Player Section - Sticky at top, always mounted to keep stream running */}
            <div 
              className={cn(
                "flex-shrink-0 z-20 relative",
                viewMode === 'fullscreen' && "hidden"
              )}
              onMouseMove={handlePlayerAreaActivity}
              onTouchStart={handlePlayerAreaActivity}
            >
              {selectedChannel ? (
                <div className={cn(
                  "h-48 md:h-64 transition-opacity duration-300",
                  !playerControlsVisible && "opacity-90"
                )}>
                  <HLSPlayer
                    url={selectedChannel.url}
                    originalUrl={selectedChannel.originalUrl}
                    channelId={selectedChannel.id}
                    channelName={selectedChannel.name}
                    channelLogo={selectedChannel.logo}
                    isUnstable={selectedChannel.isUnstable}
                    globalProxyEnabled={settings.globalProxyEnabled}
                    proxyModeEnabled={selectedChannel.useProxy}
                    onProxyRequired={handleProxyRequired}
                    onError={handleStreamError}
                    onClose={() => setSelectedChannel(null)}
                    controlsVisible={playerControlsVisible}
                  />
                </div>
              ) : (
                <div className="h-48 md:h-64 flex items-center justify-center bg-muted/50">
                  <p className="text-muted-foreground">Select a channel from the guide below</p>
                </div>
              )}
            </div>

            {/* EPG Timeline Section - Scrolls independently with fixed height */}
            <div className={cn(
              "flex-1 flex flex-col min-h-0 z-10 bg-background",
              viewMode === 'fullscreen' && "absolute inset-0"
            )}>
              {/* Guide Header with controls */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background z-30 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleBackToList}
                    className="h-8"
                  >
                    <X className="h-4 w-4 mr-1" />
                    {viewMode === 'fullscreen' ? 'Exit Full Guide' : 'Close Guide'}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground hidden sm:inline">ESC to go back</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToggleFullscreen}
                    className="h-8"
                  >
                    {viewMode === 'fullscreen' ? (
                      <><Minimize2 className="h-4 w-4 mr-1" /> Minimize</>
                    ) : (
                      <><Maximize2 className="h-4 w-4 mr-1" /> Full Guide</>
                    )}
                  </Button>
                </div>
              </div>

              {/* EPG Content - scrollable container with fixed height */}
              <div className="flex-1 min-h-0 overflow-hidden p-4">
                <EPGTimeline
                  channels={channels}
                  programs={programs}
                  selectedChannelId={selectedChannel?.id}
                  onSelectChannel={handleSelectChannel}
                  onSelectProgram={handleSelectProgram}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AddChannelDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAddUrl={addChannelByUrl}
        onAddM3U={addChannelsFromM3U}
      />

      <ChannelSettingsDialog
        channel={settingsChannel}
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        onUpdate={updateChannel}
        onDelete={removeChannel}
        onToggleUnstable={toggleUnstable}
        onToggleFavorite={toggleFavorite}
        onToggleProxy={setChannelUseProxy}
      />

      <EPGSettingsDialog
        open={showEPGDialog}
        onOpenChange={setShowEPGDialog}
        selectedRegion={selectedRegion}
        onSelectRegion={setSelectedRegion}
        onRefreshEPG={() => fetchEPG()}
        isLoading={isLoading}
        globalProxyEnabled={settings.globalProxyEnabled}
        onGlobalProxyChange={setGlobalProxyEnabled}
      />
    </div>
  );
}
