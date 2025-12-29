import { useState, useMemo, useRef } from 'react';
import { Channel, Program } from '@/types/livetv';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertTriangle, ArrowDownAZ, ChevronDown, ChevronRight, Copy, Download, FileDown, FileUp, RefreshCw, Search, Settings, Share2, Star, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ChannelListProps {
  channels: Channel[];
  currentPrograms: Map<string, Program | undefined>;
  selectedChannelId?: string;
  sortEnabled?: boolean;
  onSelectChannel: (channel: Channel) => void;
  onChannelSettings: (channel: Channel) => void;
  onToggleFavorite: (channelId: string) => void;
  onDeleteChannel: (channelId: string) => void;
  onToggleSort?: () => void;
  onDownloadM3U8?: () => void;
  onDownloadJSON?: () => void;
  onImportJSON?: (content: string) => number;
  onCopyShareable?: () => void;
  onImportShareable?: (data: string) => number;
  onRefresh?: () => Promise<boolean | undefined>;
}

export function ChannelList({
  channels,
  currentPrograms,
  selectedChannelId,
  sortEnabled = false,
  onSelectChannel,
  onChannelSettings,
  onToggleFavorite,
  onDeleteChannel,
  onToggleSort,
  onDownloadM3U8,
  onDownloadJSON,
  onImportJSON,
  onCopyShareable,
  onImportShareable,
  onRefresh,
}: ChannelListProps) {
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['⭐ Favorites', 'All Channels']));
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh?.();
      toast.success('Channels Reloaded');
    } catch {
      toast.error('Failed to refresh channels');
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  const handleDownloadM3U = () => {
    onDownloadM3U8?.();
  };

  const handleDownloadJSON = () => {
    onDownloadJSON?.();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const count = onImportJSON?.(content) ?? 0;
        toast.success(`Imported ${count} channels`);
      } catch (err) {
        toast.error('Failed to import backup file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const count = onImportShareable?.(text) ?? 0;
      toast.success(`Imported ${count} channels from clipboard`);
    } catch {
      toast.error('Failed to read from clipboard or invalid share data');
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, channel: Channel) => {
    e.stopPropagation();
    
    if (pendingDeleteId === channel.id) {
      // Second click - confirm delete
      onDeleteChannel(channel.id);
      setPendingDeleteId(null);
      toast.success(`"${channel.name}" removed from channels`);
    } else {
      // First click - show confirmation
      setPendingDeleteId(channel.id);
      toast.info(`Click again to confirm deleting "${channel.name}"`, {
        duration: 3000,
      });
      // Auto-reset after 3 seconds
      setTimeout(() => setPendingDeleteId(null), 3000);
    }
  };

  // Filter and group channels with favorites at the top
  const { filteredChannels, groups } = useMemo(() => {
    const filtered = channels.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.group.toLowerCase().includes(search.toLowerCase())
    );

    // Separate favorites
    const favorites = filtered.filter(c => c.isFavorite);
    const nonFavorites = filtered.filter(c => !c.isFavorite);

    const groupMap = new Map<string, Channel[]>();
    
    // Add favorites group first if there are any
    if (favorites.length > 0) {
      groupMap.set('⭐ Favorites', favorites);
    }
    
    // Group the rest by their group
    nonFavorites.forEach(channel => {
      const group = channel.group || 'Uncategorized';
      if (!groupMap.has(group)) {
        groupMap.set(group, []);
      }
      groupMap.get(group)!.push(channel);
    });

    return {
      filteredChannels: filtered,
      groups: Array.from(groupMap.entries()),
    };
  }, [channels, search]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileImport}
      />

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search channels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">
            {filteredChannels.length} channel{filteredChannels.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1">
            {/* Refresh Button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh channels"
            >
              <RefreshCw className={cn(
                "h-3.5 w-3.5",
                isRefreshing && "animate-spin"
              )} />
            </Button>

            <Button
              variant={sortEnabled ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onToggleSort}
              title="Sort A-Z"
            >
              <ArrowDownAZ className="h-3.5 w-3.5 mr-1" />
              A-Z
            </Button>
            
            {/* Import/Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={channels.length === 0 && !onImportJSON}
                >
                  <Share2 className="h-3.5 w-3.5 mr-1" />
                  Share
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleDownloadJSON} disabled={channels.length === 0}>
                  <FileDown className="h-4 w-4 mr-2" />
                  Export Backup (JSON)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadM3U} disabled={channels.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Playlist (M3U)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <FileUp className="h-4 w-4 mr-2" />
                  Import from File
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onCopyShareable} disabled={channels.length === 0}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleImportFromClipboard}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import from Clipboard
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Channel Groups */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {groups.map(([groupName, groupChannels]) => (
            <Collapsible
              key={groupName}
              open={expandedGroups.has(groupName)}
              onOpenChange={() => toggleGroup(groupName)}
            >
              <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-2 text-sm font-medium hover:bg-muted rounded-md">
                {expandedGroups.has(groupName) ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="flex-1 text-left">{groupName}</span>
                <span className="text-xs text-muted-foreground">{groupChannels.length}</span>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="ml-2 space-y-1">
                  {groupChannels.map((channel) => {
                    const currentProgram = currentPrograms.get(channel.id);
                    const isSelected = channel.id === selectedChannelId;

                    return (
                      <div
                        key={channel.id}
                        className={cn(
                          "group relative flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors",
                          isSelected ? "bg-primary/20 border border-primary/50" : "hover:bg-muted",
                          channel.isUnstable && "opacity-50 grayscale"
                        )}
                        onClick={() => onSelectChannel(channel)}
                      >
                        {/* Channel Logo */}
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                          {channel.logo ? (
                            <img
                              src={channel.logo}
                              alt={channel.name}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <span className="text-xs font-bold text-muted-foreground">
                              {channel.name.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>

                        {/* Channel Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{channel.name}</span>
                            {channel.isFavorite && (
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                            )}
                            {channel.isUnstable && (
                              <AlertTriangle className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                            )}
                          </div>
                          {currentProgram && (
                            <p className="text-xs text-muted-foreground truncate">
                              {currentProgram.title}
                            </p>
                          )}
                        </div>

                        {/* Favorite Button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7 transition-opacity",
                            channel.isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(channel.id);
                          }}
                        >
                          <Star className={cn(
                            "h-4 w-4",
                            channel.isFavorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"
                          )} />
                        </Button>

                        {/* Delete Button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7 opacity-0 group-hover:opacity-100 transition-all",
                            pendingDeleteId === channel.id 
                              ? "opacity-100 text-destructive bg-destructive/10" 
                              : "text-muted-foreground hover:text-destructive"
                          )}
                          onClick={(e) => handleDeleteClick(e, channel)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>

                        {/* Settings Button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChannelSettings(channel);
                          }}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}

          {groups.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">No channels found</p>
              <p className="text-xs mt-1">Add channels to get started</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
