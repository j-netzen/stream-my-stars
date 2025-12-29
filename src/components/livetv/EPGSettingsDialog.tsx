import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { EPG_SOURCES } from '@/types/livetv';
import { Loader2, Globe, RefreshCw } from 'lucide-react';

interface EPGSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRegion: string;
  onSelectRegion: (region: string) => void;
  onRefreshEPG: () => void;
  isLoading: boolean;
}

export function EPGSettingsDialog({
  open,
  onOpenChange,
  selectedRegion,
  onSelectRegion,
  onRefreshEPG,
  isLoading,
}: EPGSettingsDialogProps) {
  const handleRefresh = () => {
    onRefreshEPG();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure Live TV settings and program guide
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">

          {/* EPG Region Selection */}
          <div className="py-4">
            <h4 className="font-medium mb-3">Program Guide Region</h4>
            <RadioGroup
              value={selectedRegion}
              onValueChange={onSelectRegion}
              className="space-y-3"
            >
              {EPG_SOURCES.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted cursor-pointer"
                  onClick={() => onSelectRegion(source.id)}
                >
                  <RadioGroupItem value={source.id} id={source.id} />
                  <Label htmlFor={source.id} className="flex-1 cursor-pointer">
                    <span className="font-medium">{source.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({source.region})
                    </span>
                  </Label>
                </div>
              ))}

              <div
                className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted cursor-pointer"
                onClick={() => onSelectRegion('mock')}
              >
                <RadioGroupItem value="mock" id="mock" />
                <Label htmlFor="mock" className="flex-1 cursor-pointer">
                  <span className="font-medium">Generated Guide</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    (Mock data)
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Load EPG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
