import { useState, useMemo, useCallback } from 'react';
import { useLiveTV } from '@/hooks/useLiveTV';
import { Channel, Program } from '@/types/livetv';
import { HLSPlayer } from '@/components/livetv/HLSPlayer';
import { ChannelList } from '@/components/livetv/ChannelList';
import { EPGTimeline } from '@/components/livetv/EPGTimeline';
import { AddChannelDialog } from '@/components/livetv/AddChannelDialog';
import { ChannelSettingsDialog } from '@/components/livetv/ChannelSettingsDialog';
import { EPGSettingsDialog } from '@/components/livetv/EPGSettingsDialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Globe, Trash2, Tv, List, Grid3X3 } from 'lucide-react';

export default function LiveTVPage() {
  const {
    channels,
    programs,
    selectedRegion,
    isLoading,
    addChannelsFromM3U,
    addChannelByUrl,
    toggleUnstable,
    removeChannel,
    updateChannel,
    fetchEPG,
    getCurrentProgram,
    clearAllData,
    setSelectedRegion,
  } = useLiveTV();

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [settingsChannel, setSettingsChannel] = useState<Channel | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showEPGDialog, setShowEPGDialog] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'epg'>('list');

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
  }, []);

  const handleChannelSettings = useCallback((channel: Channel) => {
    setSettingsChannel(channel);
    setShowSettingsDialog(true);
  }, []);

  const handleSelectProgram = useCallback((program: Program, channel: Channel) => {
    setSelectedChannel(channel);
  }, []);

  const handleStreamError = useCallback(() => {
    if (selectedChannel) {
      toggleUnstable(selectedChannel.id);
    }
  }, [selectedChannel, toggleUnstable]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Tv className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">Live TV</h1>
          <span className="text-sm text-muted-foreground">
            {channels.length} channel{channels.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'epg')}>
            <TabsList className="h-9">
              <TabsTrigger value="list" className="px-3">
                <List className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="epg" className="px-3">
                <Grid3X3 className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>

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

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
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
            <div className="w-80 flex-shrink-0">
              <ChannelList
                channels={channels}
                currentPrograms={currentPrograms}
                selectedChannelId={selectedChannel?.id}
                onSelectChannel={handleSelectChannel}
                onChannelSettings={handleChannelSettings}
              />
            </div>

            {/* Player Area */}
            <div className="flex-1 p-4 flex flex-col">
              {selectedChannel ? (
                <HLSPlayer
                  url={selectedChannel.url}
                  channelName={selectedChannel.name}
                  channelLogo={selectedChannel.logo}
                  isUnstable={selectedChannel.isUnstable}
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
          /* EPG View */
          <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
            {selectedChannel && (
              <div className="h-64 flex-shrink-0">
                <HLSPlayer
                  url={selectedChannel.url}
                  channelName={selectedChannel.name}
                  channelLogo={selectedChannel.logo}
                  isUnstable={selectedChannel.isUnstable}
                  onError={handleStreamError}
                  onClose={() => setSelectedChannel(null)}
                />
              </div>
            )}
            <div className="flex-1 min-h-0">
              <EPGTimeline
                channels={channels}
                programs={programs}
                selectedChannelId={selectedChannel?.id}
                onSelectChannel={handleSelectChannel}
                onSelectProgram={handleSelectProgram}
              />
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
