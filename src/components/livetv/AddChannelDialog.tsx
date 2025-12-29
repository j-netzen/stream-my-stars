import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Link, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AddChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddUrl: (url: string, name?: string) => void;
  onAddM3U: (content: string) => number;
}

export function AddChannelDialog({
  open,
  onOpenChange,
  onAddUrl,
  onAddM3U,
}: AddChannelDialogProps) {
  const { toast } = useToast();
  const [singleUrl, setSingleUrl] = useState('');
  const [singleName, setSingleName] = useState('');
  const [m3uContent, setM3uContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Handle single URL submission
  const handleAddSingleUrl = useCallback(() => {
    if (!singleUrl.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a stream URL',
        variant: 'destructive',
      });
      return;
    }

    onAddUrl(singleUrl.trim(), singleName.trim() || undefined);
    setSingleUrl('');
    setSingleName('');
    onOpenChange(false);
    
    toast({
      title: 'Channel Added',
      description: 'The channel has been added to your list',
    });
  }, [singleUrl, singleName, onAddUrl, onOpenChange, toast]);

  // Handle M3U content submission
  const handleAddM3U = useCallback(() => {
    if (!m3uContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please paste M3U content or upload a file',
        variant: 'destructive',
      });
      return;
    }

    const count = onAddM3U(m3uContent);
    setM3uContent('');
    onOpenChange(false);

    toast({
      title: 'Channels Added',
      description: `${count} channel${count !== 1 ? 's' : ''} imported successfully`,
    });
  }, [m3uContent, onAddM3U, onOpenChange, toast]);

  // Handle file upload
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);

    try {
      const content = await file.text();
      
      if (file.name.endsWith('.xml') || content.trim().startsWith('<?xml')) {
        // XML EPG file - we'll handle this differently
        toast({
          title: 'EPG File Detected',
          description: 'EPG data will be imported. Use the EPG settings to configure.',
        });
        setM3uContent(content);
      } else {
        // M3U file
        setM3uContent(content);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to read file',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Handle URL fetch
  const handleFetchUrl = useCallback(async (url: string) => {
    if (!url.trim()) return;

    setIsLoading(true);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch');
      
      const content = await response.text();
      setM3uContent(content);

      toast({
        title: 'Content Loaded',
        description: 'M3U content loaded from URL',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch from URL. Try downloading and uploading the file instead.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Channels</DialogTitle>
          <DialogDescription>
            Add a single stream URL or import multiple channels from an M3U playlist
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="single" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              Single URL
            </TabsTrigger>
            <TabsTrigger value="playlist" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Playlist
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="stream-url">Stream URL</Label>
              <Input
                id="stream-url"
                placeholder="https://example.com/stream.m3u8"
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="channel-name">Channel Name (optional)</Label>
              <Input
                id="channel-name"
                placeholder="My Channel"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
              />
            </div>

            <Button onClick={handleAddSingleUrl} className="w-full">
              Add Channel
            </Button>
          </TabsContent>

          <TabsContent value="playlist" className="space-y-4 mt-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label>Upload File</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".m3u,.m3u8,.xml"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                  disabled={isLoading}
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  {isLoading ? (
                    <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                  ) : (
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    Click to upload .m3u, .m3u8, or .xml file
                  </span>
                </label>
              </div>
            </div>

            {/* Or paste content */}
            <div className="space-y-2">
              <Label htmlFor="m3u-content">Or paste M3U content</Label>
              <Textarea
                id="m3u-content"
                placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-logo=&quot;logo.png&quot; group-title=&quot;News&quot;,Channel Name&#10;http://example.com/stream.m3u8"
                value={m3uContent}
                onChange={(e) => setM3uContent(e.target.value)}
                rows={6}
              />
            </div>

            <Button 
              onClick={handleAddM3U} 
              className="w-full"
              disabled={!m3uContent.trim() || isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import Channels
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
