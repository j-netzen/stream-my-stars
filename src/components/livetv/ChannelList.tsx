import { useState, useMemo } from 'react';
import { Channel, Program } from '@/types/livetv';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, ChevronDown, ChevronRight, Search, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChannelListProps {
  channels: Channel[];
  currentPrograms: Map<string, Program | undefined>;
  selectedChannelId?: string;
  onSelectChannel: (channel: Channel) => void;
  onChannelSettings: (channel: Channel) => void;
}

export function ChannelList({
  channels,
  currentPrograms,
  selectedChannelId,
  onSelectChannel,
  onChannelSettings,
}: ChannelListProps) {
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['All Channels']));

  // Filter and group channels
  const { filteredChannels, groups } = useMemo(() => {
    const filtered = channels.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.group.toLowerCase().includes(search.toLowerCase())
    );

    const groupMap = new Map<string, Channel[]>();
    filtered.forEach(channel => {
      const group = channel.group || 'Uncategorized';
      if (!groupMap.has(group)) {
        groupMap.set(group, []);
      }
      groupMap.get(group)!.push(channel);
    });

    return {
      filteredChannels: filtered,
      groups: Array.from(groupMap.entries()).sort((a, b) => a[0].localeCompare(b[0])),
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
        <p className="text-xs text-muted-foreground mt-2">
          {filteredChannels.length} channel{filteredChannels.length !== 1 ? 's' : ''}
        </p>
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
