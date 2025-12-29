import { useState, useEffect, useCallback } from "react";
import { useMedia, CreateMediaInput } from "@/hooks/useMedia";
import { useCategories } from "@/hooks/useCategories";
import { useRealDebridStatus } from "@/hooks/useRealDebridStatus";
import { getMovieDetails, getTVDetails, TMDBSearchResult, getImageUrl } from "@/lib/tmdb";
import { unrestrictLink, addMagnetAndWait } from "@/lib/realDebrid";
import { searchTorrentio, getImdbIdFromTmdb, parseStreamInfo, TorrentioStream, isDirectRdLink, isMagnetLink, extractMagnetFromTorrentioUrl } from "@/lib/torrentio";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollAreaWithArrows } from "@/components/ui/scroll-area-with-arrows";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Film, Tv, Link as LinkIcon, Zap, RefreshCw, Sparkles, Star, Calendar, AlertTriangle, ListChecks } from "lucide-react";
import { toast } from "sonner";

interface AddFromDiscoverDialogProps {
  item: TMDBSearchResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TMDBDetails {
  tmdb_id: number;
  imdb_id?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  rating?: number;
  genres?: string[];
  runtime?: number;
  seasons?: number;
  episodes?: number;
  cast_members?: any;
  media_type: "movie" | "tv";
  overview?: string;
}

export function AddFromDiscoverDialog({ item, open, onOpenChange }: AddFromDiscoverDialogProps) {
  const { addMedia } = useMedia();
  const { categories } = useCategories();
  const { status: rdServiceStatus, refresh: refreshRdStatus } = useRealDebridStatus();

  const [tmdbDetails, setTmdbDetails] = useState<TMDBDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [isAdding, setIsAdding] = useState(false);

  // Real-Debrid state
  const [rdLink, setRdLink] = useState("");
  const [rdProgress, setRdProgress] = useState(0);
  const [rdStatus, setRdStatus] = useState<string | null>(null);
  const [isUnrestricting, setIsUnrestricting] = useState(false);

  // Torrentio search state
  const [isSearchingTorrentio, setIsSearchingTorrentio] = useState(false);
  const [torrentioResults, setTorrentioResults] = useState<TorrentioStream[]>([]);
  const [showTorrentioDropdown, setShowTorrentioDropdown] = useState(false);

  // TV show episode selection
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);

  // Batch episode queue
  const [batchQueue, setBatchQueue] = useState<Array<{
    season: number;
    episode: number;
    stream?: TorrentioStream;
    status: "pending" | "searching" | "ready" | "error";
  }>>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isBatchSearching, setIsBatchSearching] = useState(false);

  // Fetch TMDB details when item changes
  useEffect(() => {
    if (!item || !open) return;

    const fetchDetails = async () => {
      setIsLoadingDetails(true);
      try {
        let details: any = null;
        if (item.media_type === "movie") {
          details = await getMovieDetails(item.id);
        } else if (item.media_type === "tv") {
          details = await getTVDetails(item.id);
        }

        const mediaType = item.media_type === "movie" ? "movie" : "tv" as const;
        setTmdbDetails({
          tmdb_id: item.id,
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          release_date: item.release_date || item.first_air_date,
          rating: item.vote_average,
          overview: item.overview,
          genres: details?.genres?.map((g: any) => g.name) || [],
          runtime: details?.runtime,
          seasons: details?.number_of_seasons,
          episodes: details?.number_of_episodes,
          cast_members: details?.credits?.cast?.slice(0, 10) || [],
          media_type: mediaType,
          imdb_id: details?.external_ids?.imdb_id,
        });
      } catch (error) {
        // Use basic info if details fail
        const mediaType = item.media_type === "movie" ? "movie" : "tv" as const;
        setTmdbDetails({
          tmdb_id: item.id,
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          release_date: item.release_date || item.first_air_date,
          rating: item.vote_average,
          overview: item.overview,
          media_type: mediaType,
        });
      }
      setIsLoadingDetails(false);
    };

    fetchDetails();
  }, [item, open]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSourceUrl("");
      setSelectedCategory("");
      setRdLink("");
      setRdProgress(0);
      setRdStatus(null);
      setTorrentioResults([]);
      setShowTorrentioDropdown(false);
      setSelectedSeason(1);
      setSelectedEpisode(1);
      setBatchQueue([]);
      setIsBatchMode(false);
      setTmdbDetails(null);
    }
  }, [open]);

  // Search Torrentio for streams
  const handleTorrentioSearch = async () => {
    if (!tmdbDetails) {
      toast.error("Loading details, please wait...");
      return;
    }

    // For TV shows, require season/episode selection
    if (tmdbDetails.media_type === "tv" && (!selectedSeason || !selectedEpisode)) {
      toast.error("Please select a season and episode");
      return;
    }

    setIsSearchingTorrentio(true);
    setShowTorrentioDropdown(false);

    try {
      let imdbId = tmdbDetails.imdb_id;

      // If we don't have IMDB ID, fetch it
      if (!imdbId) {
        imdbId = await getImdbIdFromTmdb(tmdbDetails.tmdb_id, tmdbDetails.media_type) || undefined;

        if (!imdbId) {
          toast.error("Could not find IMDB ID for this title");
          setIsSearchingTorrentio(false);
          return;
        }

        setTmdbDetails(prev => prev ? { ...prev, imdb_id: imdbId } : null);
      }

      const type = tmdbDetails.media_type === "movie" ? "movie" : "series";

      const streams = await searchTorrentio(
        imdbId,
        type,
        type === "series" ? selectedSeason : undefined,
        type === "series" ? selectedEpisode : undefined
      );

      if (streams.length === 0) {
        toast.info("No streams found for this title");
      } else {
        setTorrentioResults(streams);
        setShowTorrentioDropdown(true);
        toast.success(`Found ${streams.length} stream(s) - sorted by quality`);
      }
    } catch (error: any) {
      console.error("Torrentio search error:", error);
      toast.error(error.message || "Failed to search for streams");
    }

    setIsSearchingTorrentio(false);
  };

  const handleSelectTorrentioStream = (stream: TorrentioStream) => {
    setRdLink(stream.url);
    setShowTorrentioDropdown(false);
  };

  // Batch mode functions
  const toggleBatchEpisode = (season: number, episode: number) => {
    const exists = batchQueue.some(q => q.season === season && q.episode === episode);
    if (exists) {
      setBatchQueue(prev => prev.filter(q => !(q.season === season && q.episode === episode)));
    } else {
      setBatchQueue(prev => [...prev, { season, episode, status: "pending" }]);
    }
  };

  const handleBatchSearch = async () => {
    if (!tmdbDetails || batchQueue.length === 0) return;

    setIsBatchSearching(true);

    let imdbId = tmdbDetails.imdb_id;
    if (!imdbId) {
      imdbId = await getImdbIdFromTmdb(tmdbDetails.tmdb_id, tmdbDetails.media_type) || undefined;

      if (!imdbId) {
        toast.error("Could not find IMDB ID");
        setIsBatchSearching(false);
        return;
      }
      setTmdbDetails(prev => prev ? { ...prev, imdb_id: imdbId } : null);
    }

    const updatedQueue = [...batchQueue];

    for (let i = 0; i < updatedQueue.length; i++) {
      const queueItem = updatedQueue[i];
      updatedQueue[i] = { ...queueItem, status: "searching" };
      setBatchQueue([...updatedQueue]);

      try {
        const streams = await searchTorrentio(imdbId!, "series", queueItem.season, queueItem.episode);
        if (streams.length > 0) {
          updatedQueue[i] = { ...queueItem, stream: streams[0], status: "ready" };
        } else {
          updatedQueue[i] = { ...queueItem, status: "error" };
        }
      } catch {
        updatedQueue[i] = { ...queueItem, status: "error" };
      }
      setBatchQueue([...updatedQueue]);
    }

    const readyCount = updatedQueue.filter(q => q.status === "ready").length;
    toast.success(`Found streams for ${readyCount}/${updatedQueue.length} episodes`);
    setIsBatchSearching(false);
  };

  const handleBatchAdd = async () => {
    const readyItems = batchQueue.filter(q => q.status === "ready" && q.stream);
    if (readyItems.length === 0 || !item || !tmdbDetails) {
      toast.error("No episodes ready to add");
      return;
    }

    setIsAdding(true);
    let added = 0;

    for (const queueItem of readyItems) {
      try {
        let downloadUrl: string;
        const streamUrl = queueItem.stream!.url;

        if (isDirectRdLink(streamUrl)) {
          downloadUrl = streamUrl;
        } else if (isMagnetLink(streamUrl)) {
          const torrent = await addMagnetAndWait(streamUrl, () => {});
          if (torrent.links && torrent.links.length > 0) {
            const unrestricted = await unrestrictLink(torrent.links[0]);
            downloadUrl = unrestricted.download;
          } else {
            throw new Error("No download links available from torrent");
          }
        } else {
          try {
            const unrestricted = await unrestrictLink(streamUrl);
            downloadUrl = unrestricted.download;
          } catch (unrestrictError: any) {
            const errorMessage = unrestrictError?.message || '';
            if (errorMessage.includes('hoster_unsupported') || errorMessage.includes('400')) {
              const magnetLink = extractMagnetFromTorrentioUrl(streamUrl);
              if (magnetLink) {
                const torrent = await addMagnetAndWait(magnetLink, () => {});
                if (torrent.links && torrent.links.length > 0) {
                  const unrestricted = await unrestrictLink(torrent.links[0]);
                  downloadUrl = unrestricted.download;
                } else {
                  throw new Error("No download links available from torrent");
                }
              } else {
                throw new Error("Link not supported and no magnet hash found");
              }
            } else {
              throw unrestrictError;
            }
          }
        }

        const title = item.title || item.name || "Unknown";
        const episodeTitle = `${title} - S${String(queueItem.season).padStart(2, '0')}E${String(queueItem.episode).padStart(2, '0')}`;

        const input: CreateMediaInput = {
          title: episodeTitle,
          media_type: "tv",
          source_type: "url",
          source_url: downloadUrl,
          category_id: selectedCategory || undefined,
          overview: tmdbDetails.overview,
          tmdb_id: tmdbDetails.tmdb_id,
          poster_path: tmdbDetails.poster_path,
          backdrop_path: tmdbDetails.backdrop_path,
          release_date: tmdbDetails.release_date,
          rating: tmdbDetails.rating,
          genres: tmdbDetails.genres,
          seasons: tmdbDetails.seasons,
          episodes: tmdbDetails.episodes,
          cast_members: tmdbDetails.cast_members,
        };

        await addMedia.mutateAsync(input);
        added++;
      } catch (error) {
        console.error(`Failed to add episode S${queueItem.season}E${queueItem.episode}:`, error);
      }
    }

    toast.success(`Added ${added}/${readyItems.length} episodes to library`);
    if (added > 0) {
      onOpenChange(false);
    }
    setIsAdding(false);
  };

  // Add via Real-Debrid
  const handleAddViaDebrid = async () => {
    if (!rdLink.trim() || !item || !tmdbDetails) {
      toast.error("Please select or enter a stream link");
      return;
    }

    setIsUnrestricting(true);
    setRdProgress(0);
    setRdStatus("Processing link...");

    try {
      let streamUrl = rdLink;

      // Check if it's already a direct RD link
      if (isDirectRdLink(rdLink)) {
        streamUrl = rdLink;
      } else if (isMagnetLink(rdLink)) {
        setRdStatus("Adding magnet to Real-Debrid...");
        const torrent = await addMagnetAndWait(rdLink, (p) => {
          setRdProgress(p);
          setRdStatus(`Downloading: ${p}%`);
        });

        if (torrent.links && torrent.links.length > 0) {
          setRdStatus("Getting download link...");
          const unrestricted = await unrestrictLink(torrent.links[0]);
          streamUrl = unrestricted.download;
        } else {
          throw new Error("No download links available from torrent");
        }
      } else {
        // Regular link - try to unrestrict
        setRdStatus("Unrestricting link...");
        try {
          const unrestricted = await unrestrictLink(rdLink);
          streamUrl = unrestricted.download;
        } catch (unrestrictError: any) {
          const errorMessage = unrestrictError?.message || '';
          if (errorMessage.includes('hoster_unsupported') || errorMessage.includes('400')) {
            const magnetLink = extractMagnetFromTorrentioUrl(rdLink);
            if (magnetLink) {
              setRdStatus("Fallback: Adding magnet...");
              const torrent = await addMagnetAndWait(magnetLink, (p) => {
                setRdProgress(p);
                setRdStatus(`Downloading: ${p}%`);
              });

              if (torrent.links && torrent.links.length > 0) {
                const unrestricted = await unrestrictLink(torrent.links[0]);
                streamUrl = unrestricted.download;
              } else {
                throw new Error("No download links available from torrent");
              }
            } else {
              throw new Error("Link not supported and no magnet hash found");
            }
          } else {
            throw unrestrictError;
          }
        }
      }

      setRdStatus("Adding to library...");

      const title = item.title || item.name || "Unknown";
      const finalTitle = tmdbDetails.media_type === "tv" && selectedSeason && selectedEpisode
        ? `${title} - S${String(selectedSeason).padStart(2, '0')}E${String(selectedEpisode).padStart(2, '0')}`
        : title;

      const input: CreateMediaInput = {
        title: finalTitle,
        media_type: tmdbDetails.media_type,
        source_type: "url",
        source_url: streamUrl,
        category_id: selectedCategory || undefined,
        overview: tmdbDetails.overview,
        tmdb_id: tmdbDetails.tmdb_id,
        poster_path: tmdbDetails.poster_path,
        backdrop_path: tmdbDetails.backdrop_path,
        release_date: tmdbDetails.release_date,
        rating: tmdbDetails.rating,
        genres: tmdbDetails.genres,
        runtime: tmdbDetails.runtime,
        seasons: tmdbDetails.seasons,
        episodes: tmdbDetails.episodes,
        cast_members: tmdbDetails.cast_members,
      };

      await addMedia.mutateAsync(input);
      toast.success("Media added via Real-Debrid!");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Real-Debrid error:", error);
      toast.error(error.message || "Failed to process with Real-Debrid");
      setRdStatus(null);
    }
    setIsUnrestricting(false);
  };

  // Add via URL
  const handleAddViaUrl = async () => {
    if (!sourceUrl.trim() || !item || !tmdbDetails) {
      toast.error("Please provide a video source URL");
      return;
    }

    setIsAdding(true);
    try {
      const title = item.title || item.name || "Unknown";
      const input: CreateMediaInput = {
        title,
        media_type: tmdbDetails.media_type,
        source_type: "url",
        source_url: sourceUrl,
        category_id: selectedCategory || undefined,
        overview: tmdbDetails.overview,
        tmdb_id: tmdbDetails.tmdb_id,
        poster_path: tmdbDetails.poster_path,
        backdrop_path: tmdbDetails.backdrop_path,
        release_date: tmdbDetails.release_date,
        rating: tmdbDetails.rating,
        genres: tmdbDetails.genres,
        runtime: tmdbDetails.runtime,
        seasons: tmdbDetails.seasons,
        episodes: tmdbDetails.episodes,
        cast_members: tmdbDetails.cast_members,
      };

      await addMedia.mutateAsync(input);
      toast.success("Added to library!");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to add to library");
    }
    setIsAdding(false);
  };

  if (!item) return null;

  const title = item.title || item.name || "Unknown";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl">Add to Library</DialogTitle>
        </DialogHeader>

        <div className="h-[500px]">
          <ScrollAreaWithArrows scrollStep={150}>
            {/* Media Info Header */}
            <div className="flex gap-4 p-4 bg-secondary/30 rounded-lg mb-4 mx-1">
              {item.poster_path ? (
                <img
                  src={getImageUrl(item.poster_path, "w200")!}
                  alt={title}
                  className="w-20 rounded"
                />
              ) : (
                <div className="w-20 h-28 bg-secondary rounded flex items-center justify-center">
                  {item.media_type === "movie" ? <Film className="w-8 h-8 text-muted-foreground" /> : <Tv className="w-8 h-8 text-muted-foreground" />}
                </div>
              )}
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{title}</h3>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${item.media_type === "movie" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"}`}>
                    {item.media_type}
                  </span>
                  {(item.release_date || item.first_air_date) && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {(item.release_date || item.first_air_date)?.split("-")[0]}
                    </span>
                  )}
                  {item.vote_average > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                      {item.vote_average.toFixed(1)}
                    </span>
                  )}
                </div>
                {item.overview && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                    {item.overview}
                  </p>
                )}
              </div>
            </div>

            {/* Loading state */}
            {isLoadingDetails && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading details...</span>
              </div>
            )}

            {!isLoadingDetails && (
              <>
                {/* Real-Debrid Service Warning Banner */}
                {rdServiceStatus === "service_unavailable" && (
                  <Alert variant="destructive" className="mb-4 mx-1">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                      <span>Real-Debrid servers are experiencing issues.</span>
                      <Button variant="outline" size="sm" onClick={refreshRdStatus} className="ml-2 h-7">
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Category Selection */}
                <div className="space-y-2 mb-4 mx-1">
                  <Label>Category (Optional)</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Tabs defaultValue="debrid" className="w-full px-1 pb-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="debrid" className="gap-2">
                      <Zap className="w-4 h-4" />
                      Stream Search
                    </TabsTrigger>
                    <TabsTrigger value="url" className="gap-2">
                      <LinkIcon className="w-4 h-4" />
                      Direct URL
                    </TabsTrigger>
                  </TabsList>

                  {/* Stream Search Tab */}
                  <TabsContent value="debrid" className="space-y-4 mt-4">
                    {/* TV Show Episode Selection */}
                    {item.media_type === "tv" && tmdbDetails && (
                      <div className="space-y-4 p-4 bg-secondary/20 rounded-lg">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-medium">Episode Selection</Label>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="batch-mode"
                              checked={isBatchMode}
                              onCheckedChange={(checked) => setIsBatchMode(checked as boolean)}
                            />
                            <Label htmlFor="batch-mode" className="text-sm cursor-pointer">Batch Mode</Label>
                          </div>
                        </div>

                        <div className="flex gap-4">
                          <div className="flex-1 space-y-2">
                            <Label>Season</Label>
                            <Select
                              value={String(selectedSeason)}
                              onValueChange={(v) => setSelectedSeason(Number(v))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: tmdbDetails.seasons || 1 }, (_, i) => (
                                  <SelectItem key={i + 1} value={String(i + 1)}>
                                    Season {i + 1}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {!isBatchMode && (
                            <div className="flex-1 space-y-2">
                              <Label>Episode</Label>
                              <Select
                                value={String(selectedEpisode)}
                                onValueChange={(v) => setSelectedEpisode(Number(v))}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 30 }, (_, i) => (
                                    <SelectItem key={i + 1} value={String(i + 1)}>
                                      Episode {i + 1}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>

                        {/* Batch Episode Grid */}
                        {isBatchMode && (
                          <div className="space-y-2">
                            <Label>Select Episodes</Label>
                            <div className="grid grid-cols-10 gap-1">
                              {Array.from({ length: 30 }, (_, i) => {
                                const ep = i + 1;
                                const isQueued = batchQueue.some(q => q.season === selectedSeason && q.episode === ep);
                                const queueItem = batchQueue.find(q => q.season === selectedSeason && q.episode === ep);
                                return (
                                  <Button
                                    key={ep}
                                    variant={isQueued ? "default" : "outline"}
                                    size="sm"
                                    className={`h-8 w-8 p-0 ${
                                      queueItem?.status === "ready" ? "bg-green-600 hover:bg-green-700" :
                                      queueItem?.status === "error" ? "bg-red-600 hover:bg-red-700" :
                                      queueItem?.status === "searching" ? "bg-yellow-600 hover:bg-yellow-700" : ""
                                    }`}
                                    onClick={() => toggleBatchEpisode(selectedSeason, ep)}
                                    disabled={isBatchSearching}
                                  >
                                    {ep}
                                  </Button>
                                );
                              })}
                            </div>
                            {batchQueue.length > 0 && (
                              <div className="flex gap-2 mt-2">
                                <Button
                                  onClick={handleBatchSearch}
                                  disabled={isBatchSearching || batchQueue.length === 0}
                                  className="flex-1"
                                >
                                  {isBatchSearching ? (
                                    <>
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                      Searching...
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="w-4 h-4 mr-2" />
                                      Search {batchQueue.length} Episodes
                                    </>
                                  )}
                                </Button>
                                {batchQueue.some(q => q.status === "ready") && (
                                  <Button
                                    onClick={handleBatchAdd}
                                    disabled={isAdding}
                                    variant="secondary"
                                  >
                                    {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4 mr-2" />}
                                    Add Ready
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Search Streams Button (non-batch mode) */}
                    {!isBatchMode && (
                      <Button
                        onClick={handleTorrentioSearch}
                        disabled={isSearchingTorrentio || isLoadingDetails}
                        className="w-full"
                      >
                        {isSearchingTorrentio ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Searching streams...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Search Available Streams
                          </>
                        )}
                      </Button>
                    )}

                    {/* Torrentio Results */}
                    {showTorrentioDropdown && torrentioResults.length > 0 && (
                      <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-2">
                        {torrentioResults.map((stream, idx) => {
                          const info = parseStreamInfo(stream);
                          return (
                            <button
                              key={idx}
                              onClick={() => handleSelectTorrentioStream(stream)}
                              className={`w-full text-left p-3 rounded-lg transition-colors ${
                                rdLink === stream.url
                                  ? "bg-primary/20 border border-primary"
                                  : "bg-secondary/50 hover:bg-secondary"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {info.quality && (
                                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                        info.quality.includes("4K") || info.quality.includes("2160") ? "bg-purple-600" :
                                        info.quality.includes("1080") ? "bg-blue-600" :
                                        info.quality.includes("720") ? "bg-green-600" : "bg-gray-600"
                                      }`}>
                                        {info.quality}
                                      </span>
                                    )}
                                    {info.size && (
                                      <span className="text-xs text-muted-foreground">
                                        {info.size}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1 truncate">
                                    {stream.title || stream.name}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Manual Link Input */}
                    {!isBatchMode && (
                      <div className="space-y-2">
                        <Label>Or enter a link manually</Label>
                        <Input
                          placeholder="Paste magnet, torrent, or video link..."
                          value={rdLink}
                          onChange={(e) => setRdLink(e.target.value)}
                        />
                      </div>
                    )}

                    {/* Progress */}
                    {rdStatus && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {rdStatus}
                        </div>
                        {rdProgress > 0 && <Progress value={rdProgress} />}
                      </div>
                    )}

                    {/* Add Button */}
                    {!isBatchMode && (
                      <Button
                        onClick={handleAddViaDebrid}
                        disabled={!rdLink.trim() || isUnrestricting}
                        className="w-full"
                      >
                        {isUnrestricting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 mr-2" />
                            Add via Real-Debrid
                          </>
                        )}
                      </Button>
                    )}
                  </TabsContent>

                  {/* Direct URL Tab */}
                  <TabsContent value="url" className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Video Source URL</Label>
                      <Input
                        placeholder="https://example.com/video.mp4"
                        value={sourceUrl}
                        onChange={(e) => setSourceUrl(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter the URL where this media can be streamed from
                      </p>
                    </div>

                    <Button
                      onClick={handleAddViaUrl}
                      disabled={!sourceUrl.trim() || isAdding}
                      className="w-full"
                    >
                      {isAdding ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <LinkIcon className="w-4 h-4 mr-2" />
                          Add to Library
                        </>
                      )}
                    </Button>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </ScrollAreaWithArrows>
        </div>
      </DialogContent>
    </Dialog>
  );
}
