import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, FolderOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GeneratedEntry {
  title: string;
  path: string;
}

interface NetworkPathHelperProps {
  onAddEntries: (entries: GeneratedEntry[], mediaType: string) => void;
  isAdding?: boolean;
}

export function NetworkPathHelper({ onAddEntries, isAdding }: NetworkPathHelperProps) {
  const [basePath, setBasePath] = useState("");
  const [fileNames, setFileNames] = useState("");
  const [mediaType, setMediaType] = useState<"movie" | "tv" | "custom">("custom");
  const [generatedEntries, setGeneratedEntries] = useState<GeneratedEntry[]>([]);

  const generateEntries = () => {
    if (!basePath || !fileNames.trim()) return;

    const names = fileNames
      .split("\n")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    const entries = names.map((name) => {
      // Extract title from filename (remove extension)
      const title = name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      
      // Build full path
      const normalizedBase = basePath.endsWith("\\") || basePath.endsWith("/") 
        ? basePath 
        : basePath + "\\";
      const fullPath = normalizedBase + name;

      return { title, path: fullPath };
    });

    setGeneratedEntries(entries);
  };

  const updateEntry = (index: number, field: "title" | "path", value: string) => {
    setGeneratedEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  };

  const removeEntry = (index: number) => {
    setGeneratedEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddAll = () => {
    if (generatedEntries.length === 0) return;
    onAddEntries(generatedEntries, mediaType);
    setGeneratedEntries([]);
    setFileNames("");
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-secondary/30 rounded-lg text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Path Template Helper</p>
        <p>Enter a base folder path and list filenames to generate multiple entries at once.</p>
      </div>

      <div className="space-y-2">
        <Label>Base Folder Path</Label>
        <Input
          placeholder="\\\\SERVER\\Movies\\ or //server/movies/"
          value={basePath}
          onChange={(e) => setBasePath(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={mediaType} onValueChange={(v) => setMediaType(v as any)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="movie">Movie</SelectItem>
            <SelectItem value="tv">TV Show</SelectItem>
            <SelectItem value="custom">Home Video</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>File Names (one per line)</Label>
        <Textarea
          placeholder="vacation_2023.mp4&#10;birthday_party.mkv&#10;family_gathering.avi"
          value={fileNames}
          onChange={(e) => setFileNames(e.target.value)}
          rows={4}
        />
      </div>

      <Button onClick={generateEntries} variant="secondary" className="w-full gap-2">
        <FolderOpen className="w-4 h-4" />
        Generate Entries
      </Button>

      {generatedEntries.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base">Generated Entries ({generatedEntries.length})</Label>
          </div>
          
          <ScrollArea className="h-48 border rounded-lg p-2">
            <div className="space-y-2">
              {generatedEntries.map((entry, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-secondary/20 rounded">
                  <div className="flex-1 min-w-0 space-y-1">
                    <Input
                      value={entry.title}
                      onChange={(e) => updateEntry(index, "title", e.target.value)}
                      className="h-8 text-sm"
                      placeholder="Title"
                    />
                    <p className="text-xs text-muted-foreground truncate px-1">{entry.path}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => removeEntry(index)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>

          <Button onClick={handleAddAll} disabled={isAdding} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add All {generatedEntries.length} Entries to Library
          </Button>
        </div>
      )}
    </div>
  );
}