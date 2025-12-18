import { useState } from "react";
import { useMedia, CreateMediaInput } from "@/hooks/useMedia";
import { useCategories } from "@/hooks/useCategories";
import { searchTMDB, getMovieDetails, getTVDetails, TMDBSearchResult, getImageUrl } from "@/lib/tmdb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Loader2, Film, Tv, Link as LinkIcon, FolderOpen } from "lucide-react";
import { toast } from "sonner";

interface AddMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMediaDialog({ open, onOpenChange }: AddMediaDialogProps) {
  const { addMedia } = useMedia();
  const { categories } = useCategories();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TMDBSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<TMDBSearchResult | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualOverview, setManualOverview] = useState("");
  const [manualType, setManualType] = useState<"movie" | "tv" | "custom">("custom");
  const [isAdding, setIsAdding] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchTMDB(searchQuery);
      setSearchResults(results);
    } catch (error) {
      toast.error("Search failed");
    }
    setIsSearching(false);
  };

  const handleSelectResult = (result: TMDBSearchResult) => {
    setSelectedResult(result);
  };

  const handleAddFromTMDB = async () => {
    if (!selectedResult || !sourceUrl.trim()) {
      toast.error("Please provide a video source URL");
      return;
    }

    setIsAdding(true);
    try {
      let details: any = null;
      if (selectedResult.media_type === "movie") {
        details = await getMovieDetails(selectedResult.id);
      } else if (selectedResult.media_type === "tv") {
        details = await getTVDetails(selectedResult.id);
      }

      const input: CreateMediaInput = {
        title: selectedResult.title || selectedResult.name || "Unknown",
        media_type: selectedResult.media_type as "movie" | "tv",
        source_type: "url",
        source_url: sourceUrl,
        category_id: selectedCategory || undefined,
        tmdb_id: selectedResult.id,
        poster_path: selectedResult.poster_path,
        backdrop_path: selectedResult.backdrop_path,
        overview: selectedResult.overview,
        release_date: selectedResult.release_date || selectedResult.first_air_date,
        rating: selectedResult.vote_average,
        genres: details?.genres?.map((g: any) => g.name) || [],
        runtime: details?.runtime,
        seasons: details?.number_of_seasons,
        episodes: details?.number_of_episodes,
        cast_members: details?.credits?.cast?.slice(0, 10) || [],
      };

      await addMedia.mutateAsync(input);
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to add media");
    }
    setIsAdding(false);
  };

  const handleAddManual = async () => {
    if (!manualTitle.trim() || !sourceUrl.trim()) {
      toast.error("Please provide title and source URL");
      return;
    }

    setIsAdding(true);
    try {
      const input: CreateMediaInput = {
        title: manualTitle,
        media_type: manualType,
        source_type: "url",
        source_url: sourceUrl,
        category_id: selectedCategory || undefined,
        overview: manualOverview,
      };

      await addMedia.mutateAsync(input);
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to add media");
    }
    setIsAdding(false);
  };

  const resetForm = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSelectedResult(null);
    setSourceUrl("");
    setSelectedCategory("");
    setManualTitle("");
    setManualOverview("");
    setManualType("custom");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Add Media</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="tmdb" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tmdb" className="gap-2">
              <Search className="w-4 h-4" />
              Search TMDB
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <LinkIcon className="w-4 h-4" />
              URL Entry
            </TabsTrigger>
            <TabsTrigger value="network" className="gap-2">
              <FolderOpen className="w-4 h-4" />
              Network Path
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tmdb" className="space-y-4 mt-4">
            {/* Search */}
            <div className="flex gap-2">
              <Input
                placeholder="Search movies or TV shows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={isSearching}>
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && !selectedResult && (
              <div className="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                {searchResults.map((result) => (
                  <button
                    key={`${result.media_type}-${result.id}`}
                    onClick={() => handleSelectResult(result)}
                    className="text-left p-2 rounded-lg border border-border hover:border-primary transition-colors"
                  >
                    <div className="flex gap-2">
                      {result.poster_path ? (
                        <img
                          src={getImageUrl(result.poster_path, "w200")!}
                          alt={result.title || result.name}
                          className="w-12 h-18 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-18 bg-secondary rounded flex items-center justify-center">
                          {result.media_type === "movie" ? (
                            <Film className="w-4 h-4" />
                          ) : (
                            <Tv className="w-4 h-4" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-2">
                          {result.title || result.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(result.release_date || result.first_air_date)?.split("-")[0]}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Selected Result */}
            {selectedResult && (
              <div className="space-y-4">
                <div className="flex gap-4 p-4 bg-secondary/30 rounded-lg">
                  {selectedResult.poster_path && (
                    <img
                      src={getImageUrl(selectedResult.poster_path, "w200")!}
                      alt={selectedResult.title || selectedResult.name}
                      className="w-20 rounded"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold">
                      {selectedResult.title || selectedResult.name}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {selectedResult.overview}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedResult(null)}
                      className="mt-2"
                    >
                      Change
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Video Source URL *</Label>
                  <Input
                    placeholder="https://example.com/video.mp4"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Category (Optional)</Label>
                  <Select value={selectedCategory || "none"} onValueChange={(v) => setSelectedCategory(v === "none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleAddFromTMDB}
                  disabled={isAdding}
                  className="w-full"
                >
                  {isAdding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Add to Library
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                placeholder="Enter title"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={manualType} onValueChange={(v) => setManualType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movie">Movie</SelectItem>
                  <SelectItem value="tv">TV Show</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Video Source URL *</Label>
              <Input
                placeholder="https://example.com/video.mp4"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Enter description"
                value={manualOverview}
                onChange={(e) => setManualOverview(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Category (Optional)</Label>
              <Select value={selectedCategory || "none"} onValueChange={(v) => setSelectedCategory(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleAddManual}
              disabled={isAdding}
              className="w-full"
            >
              {isAdding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add to Library
            </Button>
          </TabsContent>

          <TabsContent value="network" className="space-y-4 mt-4">
            <div className="p-3 bg-secondary/30 rounded-lg text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Windows Shared Folder</p>
              <p>Enter a network path to access media from shared folders on your local network.</p>
              <p className="mt-2 font-mono text-xs">Example: \\\\SERVER\\Movies\\video.mp4</p>
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                placeholder="Enter title"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={manualType} onValueChange={(v) => setManualType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movie">Movie</SelectItem>
                  <SelectItem value="tv">TV Show</SelectItem>
                  <SelectItem value="custom">Custom / Home Movie</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Network Path *</Label>
              <Input
                placeholder="\\\\SERVER\\Share\\folder\\video.mp4"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use double backslashes (\\\\) or forward slashes (//server/share)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Enter description"
                value={manualOverview}
                onChange={(e) => setManualOverview(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Category (Optional)</Label>
              <Select value={selectedCategory || "none"} onValueChange={(v) => setSelectedCategory(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleAddManual}
              disabled={isAdding}
              className="w-full"
            >
              {isAdding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add to Library
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
