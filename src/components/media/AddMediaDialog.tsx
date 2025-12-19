import { useState, useRef, useEffect, useCallback } from "react";
import { useMedia, CreateMediaInput } from "@/hooks/useMedia";
import { useCategories } from "@/hooks/useCategories";
import { searchTMDB, getMovieDetails, getTVDetails, TMDBSearchResult, getImageUrl } from "@/lib/tmdb";
import { unrestrictLink, addMagnetAndWait, getTorrentInfo, listTorrents, listDownloads, RealDebridTorrent, RealDebridUnrestrictedLink } from "@/lib/realDebrid";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Loader2, Film, Tv, Link as LinkIcon, FolderOpen, ListPlus, FileVideo, Zap, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { NetworkPathHelper } from "./NetworkPathHelper";
import {
  storeFileHandle,
  isFileSystemAccessSupported,
} from "@/lib/fileHandleStore";

// Special marker URL for local files stored via File System Access API
const LOCAL_FILE_MARKER = "local-file://stored-handle";

interface AddMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMediaDialog({ open, onOpenChange }: AddMediaDialogProps) {
  const { addMedia } = useMedia();
  const { categories } = useCategories();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileHandleRef = useRef<FileSystemFileHandle | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TMDBSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<TMDBSearchResult | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualOverview, setManualOverview] = useState("");
  const [manualType, setManualType] = useState<"movie" | "tv" | "custom">("custom");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [hasStoredHandle, setHasStoredHandle] = useState(false);
  
  // Real-Debrid state
  const [rdLink, setRdLink] = useState("");
  const [rdProgress, setRdProgress] = useState(0);
  const [rdStatus, setRdStatus] = useState<string | null>(null);
  const [isUnrestricting, setIsUnrestricting] = useState(false);
  const [rdTorrents, setRdTorrents] = useState<RealDebridTorrent[]>([]);
  const [rdDownloadsList, setRdDownloadsList] = useState<RealDebridUnrestrictedLink[]>([]);
  const [filteredRdItems, setFilteredRdItems] = useState<{ label: string; value: string; type: "torrent" | "download" }[]>([]);
  const [isLoadingRdItems, setIsLoadingRdItems] = useState(false);
  const [showRdDropdown, setShowRdDropdown] = useState(false);
  const [isSearchingTmdbForDebrid, setIsSearchingTmdbForDebrid] = useState(false);
  const [tmdbDebridResults, setTmdbDebridResults] = useState<TMDBSearchResult[]>([]);
  const [showTmdbDebridDropdown, setShowTmdbDebridDropdown] = useState(false);

  // TMDB search for Debrid tab
  const handleTmdbSearchForDebrid = async () => {
    if (!manualTitle.trim()) {
      toast.error("Please enter a title to search");
      return;
    }
    setIsSearchingTmdbForDebrid(true);
    try {
      const results = await searchTMDB(manualTitle);
      setTmdbDebridResults(results);
      setShowTmdbDebridDropdown(true);
      if (results.length === 0) {
        toast.info("No TMDB results found");
      }
    } catch (error) {
      toast.error("TMDB search failed");
    }
    setIsSearchingTmdbForDebrid(false);
  };

  const handleSelectTmdbForDebrid = async (result: TMDBSearchResult) => {
    setShowTmdbDebridDropdown(false);
    try {
      let details: any = null;
      if (result.media_type === "movie") {
        details = await getMovieDetails(result.id);
      } else if (result.media_type === "tv") {
        details = await getTVDetails(result.id);
      }
      
      // Fill in metadata
      setManualTitle(result.title || result.name || "");
      setManualOverview(result.overview || "");
      setManualType(result.media_type === "movie" ? "movie" : result.media_type === "tv" ? "tv" : "custom");
      
      toast.success(`Loaded metadata for "${result.title || result.name}"`);
    } catch (error) {
      // Still use basic info if details fail
      setManualTitle(result.title || result.name || "");
      setManualOverview(result.overview || "");
      setManualType(result.media_type === "movie" ? "movie" : result.media_type === "tv" ? "tv" : "custom");
    }
  };

  const fetchRdItems = useCallback(async () => {
    setIsLoadingRdItems(true);
    try {
      const [torrents, downloads] = await Promise.all([
        listTorrents().catch(() => []),
        listDownloads().catch(() => [])
      ]);
      setRdTorrents(torrents);
      setRdDownloadsList(downloads);
    } catch (error) {
      console.error("Failed to fetch Real-Debrid items:", error);
    }
    setIsLoadingRdItems(false);
  }, []);

  // Filter RD items based on title (show all if title is empty)
  useEffect(() => {
    const searchTerm = manualTitle.toLowerCase().trim();
    const items: { label: string; value: string; type: "torrent" | "download" }[] = [];

    // Filter torrents - use first link from each torrent
    rdTorrents
      .filter(t => t.links.length > 0 && (searchTerm === "" || t.filename.toLowerCase().includes(searchTerm)))
      .forEach(t => {
        items.push({
          label: `[Torrent] ${t.filename}`,
          value: t.links[0], // First link from torrent
          type: "torrent"
        });
      });

    // Filter downloads
    rdDownloadsList
      .filter(d => searchTerm === "" || d.filename.toLowerCase().includes(searchTerm))
      .forEach(d => {
        items.push({
          label: `[Download] ${d.filename}`,
          value: d.link,
          type: "download"
        });
      });

    setFilteredRdItems(items);
  }, [manualTitle, rdTorrents, rdDownloadsList]);

  // Fetch RD items when dialog opens
  useEffect(() => {
    if (open) {
      fetchRdItems();
    }
  }, [open, fetchRdItems]);

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
    if (!manualTitle.trim()) {
      toast.error("Please provide a title");
      return;
    }

    // Must have a URL or a stored handle
    const useStoredHandle = hasStoredHandle && pendingFileHandleRef.current;
    if (!useStoredHandle && !sourceUrl.trim()) {
      toast.error("Please provide a source URL or select a local file");
      return;
    }

    setIsAdding(true);
    try {
      const input: CreateMediaInput = {
        title: manualTitle,
        media_type: manualType,
        source_type: "url",
        // Use marker URL for stored handle; otherwise use whatever user entered
        source_url: useStoredHandle ? LOCAL_FILE_MARKER : sourceUrl,
        category_id: selectedCategory || undefined,
        overview: manualOverview,
      };

      const created = await addMedia.mutateAsync(input);

      // If we have a pending file handle, store it for persistent playback
      if (useStoredHandle && created?.id) {
        await storeFileHandle(created.id, pendingFileHandleRef.current!);
      }

      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to add media");
    }
    setIsAdding(false);
  };

  const handleBulkAdd = async (
    entries: Array<{ title: string; path: string }>,
    mediaType: string,
    categoryId?: string
  ) => {
    setIsAdding(true);
    try {
      for (const entry of entries) {
        const input: CreateMediaInput = {
          title: entry.title,
          media_type: mediaType as "movie" | "tv" | "custom",
          source_type: "url",
          source_url: entry.path,
          category_id: categoryId,
        };
        await addMedia.mutateAsync(input);
      }
      toast.success(`Added ${entries.length} items to library`);
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to add some media items");
    }
    setIsAdding(false);
  };

  // Real-Debrid handler
  const handleRealDebrid = async () => {
    if (!rdLink.trim()) {
      toast.error("Please enter a link or magnet");
      return;
    }

    if (!manualTitle.trim()) {
      toast.error("Please provide a title");
      return;
    }

    setIsUnrestricting(true);
    setRdProgress(0);
    setRdStatus(null);

    try {
      let streamUrl: string;

      // Check if it's a magnet link
      if (rdLink.startsWith("magnet:")) {
        setRdStatus("Adding magnet to Real-Debrid...");
        const torrent = await addMagnetAndWait(rdLink, (progress) => {
          setRdProgress(progress);
          setRdStatus(`Downloading: ${progress}%`);
        });

        if (torrent.links && torrent.links.length > 0) {
          setRdStatus("Unrestricting download link...");
          const unrestricted = await unrestrictLink(torrent.links[0]);
          streamUrl = unrestricted.download;
        } else {
          throw new Error("No download links available from torrent");
        }
      } else {
        // Regular link - just unrestrict
        setRdStatus("Unrestricting link...");
        const unrestricted = await unrestrictLink(rdLink);
        streamUrl = unrestricted.download;
      }

      setRdStatus("Adding to library...");

      const input: CreateMediaInput = {
        title: manualTitle,
        media_type: manualType,
        source_type: "url",
        source_url: streamUrl,
        category_id: selectedCategory || undefined,
        overview: manualOverview,
      };

      await addMedia.mutateAsync(input);
      toast.success("Media added via Real-Debrid!");
      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Real-Debrid error:", error);
      toast.error(error.message || "Failed to process with Real-Debrid");
      setRdStatus(null);
    }
    setIsUnrestricting(false);
  };

  // Use File System Access API if supported for persistent handles
  const handleBrowseFile = async () => {
    if (isFileSystemAccessSupported()) {
      try {
        // @ts-ignore - showOpenFilePicker may not be in TS defs
        const [handle]: FileSystemFileHandle[] = await window.showOpenFilePicker({
          types: [
            {
              description: "Video Files",
              accept: { "video/*": [".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v"] },
            },
          ],
          multiple: false,
        });

        const file = await handle.getFile();

        // Store handle for later
        pendingFileHandleRef.current = handle;
        setHasStoredHandle(true);
        setSelectedFileName(file.name);

        // Auto-fill title
        if (!manualTitle) {
          const titleFromFile = file.name.replace(/\.[^/.]+$/, "").replace(/[._-]/g, " ");
          setManualTitle(titleFromFile);
        }

        // Create blob URL for immediate preview if needed
        const blobUrl = URL.createObjectURL(file);
        setSourceUrl(blobUrl);

        toast.success("File selected – will persist across refresh");
      } catch (err: any) {
        // User cancelled or API error
        if (err.name !== "AbortError") {
          console.warn("File picker error:", err);
          // Fallback to regular file input
          fileInputRef.current?.click();
        }
      }
    } else {
      // Fallback for browsers without File System Access API
      fileInputRef.current?.click();
    }
  };

  // Fallback handler for regular file input
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
      const blobUrl = URL.createObjectURL(file);
      setSourceUrl(blobUrl);
      setHasStoredHandle(false);
      pendingFileHandleRef.current = null;

      if (!manualTitle) {
        const titleFromFile = file.name.replace(/\.[^/.]+$/, "").replace(/[._-]/g, " ");
        setManualTitle(titleFromFile);
      }
      toast.info("File ready (won't persist after refresh – use Chrome/Edge for persistence)");
    }
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
    setSelectedFileName("");
    setHasStoredHandle(false);
    pendingFileHandleRef.current = null;
    setRdLink("");
    setRdProgress(0);
    setRdStatus(null);
    setShowRdDropdown(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Add Media</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="tmdb" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="tmdb" className="gap-2">
              <Search className="w-4 h-4" />
              TMDB
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <LinkIcon className="w-4 h-4" />
              URL
            </TabsTrigger>
            <TabsTrigger value="debrid" className="gap-2">
              <Zap className="w-4 h-4" />
              Debrid
            </TabsTrigger>
            <TabsTrigger value="network" className="gap-2">
              <FolderOpen className="w-4 h-4" />
              Network
            </TabsTrigger>
            <TabsTrigger value="bulk" className="gap-2">
              <ListPlus className="w-4 h-4" />
              Bulk
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

          <TabsContent value="debrid" className="space-y-4 mt-4">
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm">
              <p className="font-medium text-foreground mb-1 flex items-center gap-2">
                <Zap className="w-4 h-4 text-green-500" />
                Real-Debrid Integration
              </p>
              <p className="text-muted-foreground">
                Paste a magnet link or download URL to unrestrict it through Real-Debrid and add it to your library.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <div className="relative">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter media title"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTmdbSearchForDebrid}
                    disabled={isSearchingTmdbForDebrid}
                    title="Fetch metadata from TMDB"
                  >
                    {isSearchingTmdbForDebrid ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      fetchRdItems();
                      setShowRdDropdown(true);
                    }}
                    disabled={isLoadingRdItems}
                    title="Search Real-Debrid for matching links"
                  >
                    {isLoadingRdItems ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                {showTmdbDebridDropdown && tmdbDebridResults.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
                    {tmdbDebridResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-3"
                        onClick={() => handleSelectTmdbForDebrid(result)}
                      >
                        {result.poster_path ? (
                          <img 
                            src={getImageUrl(result.poster_path, "w200") || ""} 
                            alt="" 
                            className="w-8 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-8 h-12 bg-muted rounded flex items-center justify-center">
                            {result.media_type === "movie" ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{result.title || result.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {result.media_type === "movie" ? "Movie" : "TV"} • {result.release_date?.slice(0, 4) || result.first_air_date?.slice(0, 4) || "N/A"}
                            {result.vote_average > 0 && ` • ${result.vote_average.toFixed(1)}★`}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
              <Label className="flex items-center justify-between">
                <span>Magnet Link or Download URL *</span>
                <button
                  type="button"
                  onClick={() => fetchRdItems()}
                  disabled={isLoadingRdItems}
                  className="p-1 hover:bg-accent rounded transition-colors disabled:opacity-50"
                  title="Refresh Real-Debrid items"
                >
                  {isLoadingRdItems ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                </button>
              </Label>
              <div className="relative">
                <Textarea
                  placeholder="magnet:?xt=urn:btih:... or https://..."
                  value={rdLink}
                  onChange={(e) => setRdLink(e.target.value)}
                  onFocus={() => setShowRdDropdown(true)}
                  className="min-h-[80px] font-mono text-sm"
                />
                {showRdDropdown && filteredRdItems.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredRdItems.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent truncate"
                        onClick={() => {
                          setRdLink(item.value);
                          setShowRdDropdown(false);
                          // Auto-fill title from filename (remove [Torrent] or [Download] prefix)
                          const filename = item.label.replace(/^\[(Torrent|Download)\]\s*/, '');
                          // Clean up filename: remove extension and common separators
                          const cleanTitle = filename
                            .replace(/\.[^/.]+$/, '') // Remove file extension
                            .replace(/\./g, ' ') // Replace dots with spaces
                            .replace(/_/g, ' ') // Replace underscores with spaces
                            .trim();
                          setManualTitle(cleanTitle);
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {filteredRdItems.length > 0 
                  ? `${filteredRdItems.length} matching Real-Debrid item(s) found - click to select`
                  : "Supported: Magnet links, torrent URLs, or any link from supported hosters"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Description (Optional)</Label>
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

            {rdStatus && (
              <div className="space-y-2 p-3 bg-secondary/30 rounded-lg">
                <p className="text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {rdStatus}
                </p>
                {rdProgress > 0 && rdProgress < 100 && (
                  <Progress value={rdProgress} className="h-2" />
                )}
              </div>
            )}

            <Button
              onClick={handleRealDebrid}
              disabled={isUnrestricting || isAdding}
              className="w-full"
            >
              {isUnrestricting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
              ) : (
                <><Zap className="w-4 h-4 mr-2" /> Add via Real-Debrid</>
              )}
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
                  <SelectItem value="custom">Custom / Home Video</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Browse Local File</Label>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBrowseFile}
                  className="flex-1"
                >
                  <FileVideo className="w-4 h-4 mr-2" />
                  {selectedFileName || "Browse File..."}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {hasStoredHandle
                  ? "✓ File will persist across refresh (Chrome/Edge)"
                  : "Select a video file from your computer for local streaming"}
              </p>
            </div>

            <div className="relative flex items-center gap-4 py-2">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="flex-1 border-t border-border" />
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

          <TabsContent value="bulk" className="mt-4">
            <NetworkPathHelper
              onAddEntries={handleBulkAdd}
              categories={categories}
              isAdding={isAdding}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
