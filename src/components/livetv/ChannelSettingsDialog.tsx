import { useState, useEffect } from 'react';
import { Channel, ProxyMode } from '@/types/livetv';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Star, Trash2, Wifi } from 'lucide-react';

interface ChannelSettingsDialogProps {
  channel: Channel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (channelId: string, updates: Partial<Channel>) => void;
  onDelete: (channelId: string) => void;
  onToggleUnstable: (channelId: string) => void;
  onToggleFavorite: (channelId: string) => void;
}

export function ChannelSettingsDialog({
  channel,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  onToggleUnstable,
  onToggleFavorite,
}: ChannelSettingsDialogProps) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [logo, setLogo] = useState('');
  const [epgId, setEpgId] = useState('');
  const [proxyMode, setProxyMode] = useState<ProxyMode>('auto');

  // Sync state when channel changes
  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setGroup(channel.group);
      setLogo(channel.logo);
      setEpgId(channel.epgId);
      setProxyMode(channel.proxyMode || 'auto');
    }
  }, [channel]);

  if (!channel) return null;

  const handleSave = () => {
    onUpdate(channel.id, {
      name,
      group,
      logo,
      epgId,
      proxyMode,
    });
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to remove this channel?')) {
      onDelete(channel.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Channel Settings</DialogTitle>
          <DialogDescription>
            Edit channel details and settings
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-4">
          {/* Channel Name */}
          <div className="space-y-2">
            <Label htmlFor="ch-name">Channel Name</Label>
            <Input
              id="ch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Group */}
          <div className="space-y-2">
            <Label htmlFor="ch-group">Group</Label>
            <Input
              id="ch-group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="e.g., News, Sports, Movies"
            />
          </div>

          {/* Logo URL */}
          <div className="space-y-2">
            <Label htmlFor="ch-logo">Logo URL</Label>
            <Input
              id="ch-logo"
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </div>

          {/* EPG ID */}
          <div className="space-y-2">
            <Label htmlFor="ch-epg">EPG ID (for program guide matching)</Label>
            <Input
              id="ch-epg"
              value={epgId}
              onChange={(e) => setEpgId(e.target.value)}
              placeholder="channel.epg.id"
            />
          </div>

          {/* Proxy Mode */}
          <div className="space-y-2">
            <Label htmlFor="ch-proxy">Connection Mode</Label>
            <Select value={proxyMode} onValueChange={(v) => setProxyMode(v as ProxyMode)}>
              <SelectTrigger id="ch-proxy" className="w-full">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4" />
                  <SelectValue placeholder="Select connection mode" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (recommended)</SelectItem>
                <SelectItem value="direct">Direct (no proxy)</SelectItem>
                <SelectItem value="proxy">Cloud Proxy</SelectItem>
                <SelectItem value="spoof">Cloud Proxy (Spoof)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {proxyMode === 'auto' && 'Automatically selects the best connection method based on stream type.'}
              {proxyMode === 'direct' && 'Connect directly without proxy. May fail for HTTP streams on HTTPS sites.'}
              {proxyMode === 'proxy' && 'Route through cloud proxy to bypass CORS restrictions.'}
              {proxyMode === 'spoof' && 'Cloud proxy with header spoofing for streams that block external requests.'}
            </p>
          </div>

          {/* Stream URL (read-only) */}
          <div className="space-y-2">
            <Label>Stream URL</Label>
            <Input
              value={channel.url}
              readOnly
              className="bg-muted text-muted-foreground"
            />
          </div>

          {/* Favorite Toggle */}
          <div className="flex items-center justify-between py-2 px-1">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              <Label htmlFor="favorite-toggle" className="cursor-pointer">
                Add to Favorites
              </Label>
            </div>
            <Switch
              id="favorite-toggle"
              checked={channel.isFavorite}
              onCheckedChange={() => onToggleFavorite(channel.id)}
            />
          </div>

          {channel.isFavorite && (
            <p className="text-xs text-muted-foreground bg-yellow-500/10 p-2 rounded">
              Favorite channels appear at the top of your channel list.
            </p>
          )}


          {/* Unstable Toggle */}
          <div className="flex items-center justify-between py-2 px-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <Label htmlFor="unstable-toggle" className="cursor-pointer">
                Mark as Unstable
              </Label>
            </div>
            <Switch
              id="unstable-toggle"
              checked={channel.isUnstable}
              onCheckedChange={() => onToggleUnstable(channel.id)}
            />
          </div>

          {channel.isUnstable && (
            <p className="text-xs text-muted-foreground bg-yellow-500/10 p-2 rounded">
              Unstable channels are displayed with reduced opacity and a warning icon.
              They may have playback issues.
            </p>
          )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button
            variant="destructive"
            onClick={handleDelete}
            className="sm:mr-auto"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove Channel
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
