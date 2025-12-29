import { useState, useEffect } from 'react';
import { Channel } from '@/types/livetv';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, Star, Trash2, Shield } from 'lucide-react';

interface ChannelSettingsDialogProps {
  channel: Channel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (channelId: string, updates: Partial<Channel>) => void;
  onDelete: (channelId: string) => void;
  onToggleUnstable: (channelId: string) => void;
  onToggleFavorite: (channelId: string) => void;
  onToggleProxy: (channelId: string, useProxy: boolean) => void;
}

export function ChannelSettingsDialog({
  channel,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  onToggleUnstable,
  onToggleFavorite,
  onToggleProxy,
}: ChannelSettingsDialogProps) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [logo, setLogo] = useState('');
  const [epgId, setEpgId] = useState('');

  // Sync state when channel changes
  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setGroup(channel.group);
      setLogo(channel.logo);
      setEpgId(channel.epgId);
    }
  }, [channel]);

  if (!channel) return null;

  const handleSave = () => {
    onUpdate(channel.id, {
      name,
      group,
      logo,
      epgId,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Channel Settings</DialogTitle>
          <DialogDescription>
            Edit channel details and settings
          </DialogDescription>
        </DialogHeader>

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

          {/* Proxy Mode Toggle */}
          <div className="flex items-center justify-between py-2 px-1">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-500" />
              <Label htmlFor="proxy-toggle" className="cursor-pointer">
                Use Proxy Mode
              </Label>
            </div>
            <Switch
              id="proxy-toggle"
              checked={channel.useProxy}
              onCheckedChange={(checked) => onToggleProxy(channel.id, checked)}
            />
          </div>

          {channel.useProxy && (
            <p className="text-xs text-muted-foreground bg-blue-500/10 p-2 rounded">
              This channel will always use a CORS proxy to bypass streaming restrictions.
              The original URL is preserved for EPG matching.
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

        <DialogFooter className="flex-col sm:flex-row gap-2">
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
