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
import { Plus, Globe, Trash2, Tv, List, Grid3X3, X, Maximize2, Minimize2, Shield, ShieldOff, Zap, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type ViewMode = 'list' | 'guide' | 'fullscreen';

const STORAGE_KEY = 'livetv-view-mode';

export default function LiveTVPage() {
  const {
    channels,
    programs,
    selectedRegion,
    isLoading,
    settings,
    sortEnabled,
    proxyEnabled,
    hwAccelEnabled,
    addChannelsFromM3U,
    addChannelByUrl,
    toggleUnstable,
    toggleFavorite,
    removeChannel,
    updateChannel,
    fetchEPG,
    getCurrentProgram,
    clearAllData,
    setSelectedRegion,
    toggleSort,
    toggleProxy,
    toggleHwAccel,
    getProxiedUrl,
    downloadM3U8,
    downloadJSON,
    importFromJSON,
    copyShareableData,
    importFromShareableData,
    refreshChannels,
    isSyncing,
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header - hidden in fullscreen mode */}
      {viewMode !== 'fullscreen' && (
        <div className="flex flex-col gap-2 p-4 border-b border-border z-30 bg-background flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Tv className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">Live TV</h1>
              <span className="text-sm text-muted-foreground">
                {channels.length} channel{channels.length !== 1 ? 's' : ''}
              </span>
              {/* Sync Status Indicator */}
              {isSyncing && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full animate-pulse">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  Syncing...
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Hardware Acceleration Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={hwAccelEnabled ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      "h-8 px-3 transition-colors",
                      hwAccelEnabled 
                        ? "bg-purple-600 hover:bg-purple-700 text-white" 
                        : "text-muted-foreground"
                    )}
                    onClick={toggleHwAccel}
                  >
                    {hwAccelEnabled ? (
                      <Zap className="h-4 w-4" />
                    ) : (
                      <Cpu className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{hwAccelEnabled ? 'Hardware Acceleration ON' : 'Hardware Acceleration OFF - Software decoding'}</p>
                </TooltipContent>
              </Tooltip>

              {/* Proxy Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={proxyEnabled ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      "h-8 px-3 transition-colors",
                      proxyEnabled 
                        ? "bg-green-600 hover:bg-green-700 text-white" 
                        : "text-muted-foreground"
                    )}
                    onClick={toggleProxy}
                  >
                    {proxyEnabled ? (
                      <Shield className="h-4 w-4" />
                    ) : (
                      <ShieldOff className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{proxyEnabled ? 'Proxy ON - Bypassing regional blocks' : 'Proxy OFF - Direct connection'}</p>
                </TooltipContent>
              </Tooltip>

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

          {/* Second row with EPG and Add Channels */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowEPGDialog(true)}>
              <Globe className="mr-2 h-4 w-4" />
              EPG
            </Button>

            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Channels
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {channels.length === 0 ? (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <Tv className="h-16 w-16 text-muted-foreground" />
            <h2 className="text-xl font-medium">No Channels Added</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Add channels by pasting a stream URL or importing an M3U playlist to get started with Live TV.
            </p>
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Channel
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const result = await refreshChannels();
                  if (result === undefined) {
                    toast.message('Sign in to sync My Channels');
                  } else if (result) {
                    toast.success('Synced My Channels');
                  } else {
                    toast.message('No channels found in cloud');
                  }
                }}
              >
                Sync My Channels
              </Button>
            </div>
          </div>
        ) : viewMode === 'list' ? (
          /* Split-Screen Layout: Channel list on left (scrollable), Player on right (sticky) */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Mobile: Stacked layout with sticky mini-player at top */}
            {/* Desktop: Side-by-side with sticky player sidebar on right */}
            
            {/* Channel List - Left side on desktop, scrollable */}
            <div className="flex-1 overflow-auto order-2 md:order-1">
              <ChannelList
                channels={channels}
                currentPrograms={currentPrograms}
                selectedChannelId={selectedChannel?.id}
                sortEnabled={sortEnabled}
                isSyncing={isSyncing}
                onSelectChannel={handleSelectChannel}
                onChannelSettings={handleChannelSettings}
                onDeleteChannel={removeChannel}
                onToggleSort={toggleSort}
                onDownloadM3U8={downloadM3U8}
                onDownloadJSON={downloadJSON}
                onImportJSON={importFromJSON}
                onCopyShareable={copyShareableData}
                onImportShareable={importFromShareableData}
                onRefresh={refreshChannels}
              />
            </div>

            {/* Player Sidebar - Right side on desktop, sticky mini-player on mobile */}
            <div className="w-full md:w-[45%] lg:w-[50%] xl:w-[55%] flex-shrink-0 order-1 md:order-2 
                          sticky top-0 z-20 md:h-full md:overflow-hidden
                          bg-background border-b md:border-b-0 md:border-l border-border">
              <div className="md:sticky md:top-0 md:h-full md:flex md:flex-col">
                {selectedChannel ? (
                  <div className="aspect-video md:aspect-auto md:flex-1 md:min-h-0">
                    <div className="h-full">
                      <HLSPlayer
                        url={getProxiedUrl(selectedChannel.url)}
                        originalUrl={selectedChannel.originalUrl}
                        channelId={selectedChannel.id}
                        channelName={selectedChannel.name}
                        channelLogo={selectedChannel.logo}
                        isUnstable={selectedChannel.isUnstable}
                        hwAccelEnabled={hwAccelEnabled}
                        onError={handleStreamError}
                        onClose={() => setSelectedChannel(null)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video md:aspect-auto md:flex-1 flex items-center justify-center bg-muted/50">
                    <p className="text-muted-foreground text-center px-4">Select a channel to start watching</p>
                  </div>
                )}
              </div>
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
                    url={getProxiedUrl(selectedChannel.url)}
                    originalUrl={selectedChannel.originalUrl}
                    channelId={selectedChannel.id}
                    channelName={selectedChannel.name}
                    channelLogo={selectedChannel.logo}
                    isUnstable={selectedChannel.isUnstable}
                    hwAccelEnabled={hwAccelEnabled}
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
      />

      <EPGSettingsDialog
        open={showEPGDialog}
        onOpenChange={setShowEPGDialog}
        selectedRegion={selectedRegion}
        onSelectRegion={setSelectedRegion}
        onRefreshEPG={() => fetchEPG()}
        isLoading={isLoading}
      />
    </div>
  );
}
