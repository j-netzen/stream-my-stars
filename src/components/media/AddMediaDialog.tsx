import { useState, useRef, useEffect, useCallback } from "react";
import { useMedia, CreateMediaInput } from "@/hooks/useMedia";
import { useCategories } from "@/hooks/useCategories";
import { useTVMode } from "@/hooks/useTVMode";
import { searchTMDB, getMovieDetails, getTVDetails, TMDBSearchResult, getImageUrl } from "@/lib/tmdb";
import { unrestrictLink, addMagnetAndWait, getTorrentInfo, listTorrents, listDownloads, RealDebridTorrent, RealDebridUnrestrictedLink } from "@/lib/realDebrid";
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
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollAreaWithArrows } from "@/components/ui/scroll-area-with-arrows";
import { Search, Loader2, Film, Tv, Link as LinkIcon, FolderOpen, ListPlus, FileVideo, Zap, RefreshCw, Sparkles, Download, Star, Calendar, Clock, X, Check, ListChecks } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  const { isTVMode } = useTVMode();
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
  const [selectedTmdbForDebrid, setSelectedTmdbForDebrid] = useState<{
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
  } | null>(null);
  
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
      
      // Store TMDB data for when adding media
      const mediaType = result.media_type === "movie" ? "movie" : "tv" as const;
      setSelectedTmdbForDebrid({
        tmdb_id: result.id,
        poster_path: result.poster_path,
        backdrop_path: result.backdrop_path,
        release_date: result.release_date || result.first_air_date,
        rating: result.vote_average,
        genres: details?.genres?.map((g: any) => g.name) || [],
        runtime: details?.runtime,
        seasons: details?.number_of_seasons,
        episodes: details?.number_of_episodes,
        cast_members: details?.credits?.cast?.slice(0, 10) || [],
        media_type: mediaType,
        imdb_id: details?.external_ids?.imdb_id,
      });
      
      // Clear any previous torrentio results when changing selection
      setTorrentioResults([]);
      setShowTorrentioDropdown(false);
      
      toast.success(`Loaded metadata for "${result.title || result.name}"`);
    } catch (error) {
      // Still use basic info if details fail
      setManualTitle(result.title || result.name || "");
      setManualOverview(result.overview || "");
      setManualType(result.media_type === "movie" ? "movie" : result.media_type === "tv" ? "tv" : "custom");
      const mediaType = result.media_type === "movie" ? "movie" : "tv" as const;
      setSelectedTmdbForDebrid({
        tmdb_id: result.id,
        poster_path: result.poster_path,
        backdrop_path: result.backdrop_path,
        release_date: result.release_date || result.first_air_date,
        rating: result.vote_average,
        media_type: mediaType,
      });
    }
  };

  // Search Torrentio for streams
  const handleTorrentioSearch = async () => {
    if (!selectedTmdbForDebrid) {
      toast.error("Please select a title from TMDB first");
      return;
    }

    // For TV shows, require season/episode selection
    if (selectedTmdbForDebrid.media_type === "tv" && (!selectedSeason || !selectedEpisode)) {
      toast.error("Please select a season and episode");
      return;
    }

    setIsSearchingTorrentio(true);
    setShowTorrentioDropdown(false);
    
    try {
      let imdbId = selectedTmdbForDebrid.imdb_id;
      
      // If we don't have IMDB ID, fetch it
      if (!imdbId) {
        imdbId = await getImdbIdFromTmdb(
          selectedTmdbForDebrid.tmdb_id, 
          selectedTmdbForDebrid.media_type
        ) || undefined;
        
        if (!imdbId) {
          toast.error("Could not find IMDB ID for this title");
          setIsSearchingTorrentio(false);
          return;
        }
        
        // Store the IMDB ID for future use
        setSelectedTmdbForDebrid(prev => prev ? { ...prev, imdb_id: imdbId } : null);
      }

      const type = selectedTmdbForDebrid.media_type === "movie" ? "movie" : "series";
      
      // For TV shows, pass season and episode
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

  // Add episode to batch queue
  const addToBatchQueue = (season: number, episode: number) => {
    const exists = batchQueue.some(q => q.season === season && q.episode === episode);
    if (!exists) {
      setBatchQueue(prev => [...prev, { season, episode, status: "pending" }]);
    }
  };

  // Remove episode from batch queue
  const removeFromBatchQueue = (season: number, episode: number) => {
    setBatchQueue(prev => prev.filter(q => !(q.season === season && q.episode === episode)));
  };

  // Toggle episode in batch queue
  const toggleBatchEpisode = (season: number, episode: number) => {
    const exists = batchQueue.some(q => q.season === season && q.episode === episode);
    if (exists) {
      removeFromBatchQueue(season, episode);
    } else {
      addToBatchQueue(season, episode);
    }
  };

  // Search streams for all queued episodes
  const handleBatchSearch = async () => {
    if (!selectedTmdbForDebrid || batchQueue.length === 0) return;
    
    setIsBatchSearching(true);
    
    let imdbId = selectedTmdbForDebrid.imdb_id;
    if (!imdbId) {
      imdbId = await getImdbIdFromTmdb(
        selectedTmdbForDebrid.tmdb_id,
        selectedTmdbForDebrid.media_type
      ) || undefined;
      
      if (!imdbId) {
        toast.error("Could not find IMDB ID");
        setIsBatchSearching(false);
        return;
      }
      setSelectedTmdbForDebrid(prev => prev ? { ...prev, imdb_id: imdbId } : null);
    }

    const updatedQueue = [...batchQueue];
    
    for (let i = 0; i < updatedQueue.length; i++) {
      const item = updatedQueue[i];
      updatedQueue[i] = { ...item, status: "searching" };
      setBatchQueue([...updatedQueue]);
      
      try {
        const streams = await searchTorrentio(imdbId!, "series", item.season, item.episode);
        if (streams.length > 0) {
          updatedQueue[i] = { ...item, stream: streams[0], status: "ready" };
        } else {
          updatedQueue[i] = { ...item, status: "error" };
        }
      } catch {
        updatedQueue[i] = { ...item, status: "error" };
      }
      setBatchQueue([...updatedQueue]);
    }
    
    const readyCount = updatedQueue.filter(q => q.status === "ready").length;
    toast.success(`Found streams for ${readyCount}/${updatedQueue.length} episodes`);
    setIsBatchSearching(false);
  };

  // Add all queued episodes to library
  const handleBatchAdd = async () => {
    const readyItems = batchQueue.filter(q => q.status === "ready" && q.stream);
    if (readyItems.length === 0) {
      toast.error("No episodes ready to add");
      return;
    }

    setIsAdding(true);
    let added = 0;


    for (const item of readyItems) {
      try {
        // Check if it's already a direct RD link (from Torrentio with RD configured)
        let downloadUrl: string;
        const streamUrl = item.stream!.url;
        
        if (isDirectRdLink(streamUrl)) {
          // Already unrestricted, use directly
          downloadUrl = streamUrl;
        } else if (isMagnetLink(streamUrl)) {
          // Magnet link - need to add and wait for download
          const torrent = await addMagnetAndWait(streamUrl, () => {});
          if (torrent.links && torrent.links.length > 0) {
            const unrestricted = await unrestrictLink(torrent.links[0]);
            downloadUrl = unrestricted.download;
          } else {
            throw new Error("No download links available from torrent");
          }
        } else {
          // Regular link - try to unrestrict, fallback to magnet extraction if it fails
          try {
            const unrestricted = await unrestrictLink(streamUrl);
            downloadUrl = unrestricted.download;
          } catch (unrestrictError: any) {
            // Check if it's a hoster_unsupported error and try magnet fallback
            const errorMessage = unrestrictError?.message || '';
            if (errorMessage.includes('hoster_unsupported') || errorMessage.includes('400')) {
              console.log(`Episode S${item.season}E${item.episode}: Unrestrict failed, trying magnet fallback...`);
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
        const episodeTitle = `${manualTitle} - S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`;
        
        const input: CreateMediaInput = {
          title: episodeTitle,
          media_type: "tv",
          source_type: "url",
          source_url: downloadUrl,
          category_id: selectedCategory || undefined,
          overview: manualOverview,
          ...(selectedTmdbForDebrid && {
            tmdb_id: selectedTmdbForDebrid.tmdb_id,
            poster_path: selectedTmdbForDebrid.poster_path,
            backdrop_path: selectedTmdbForDebrid.backdrop_path,
            release_date: selectedTmdbForDebrid.release_date,
            rating: selectedTmdbForDebrid.rating,
            genres: selectedTmdbForDebrid.genres,
            seasons: selectedTmdbForDebrid.seasons,
            episodes: selectedTmdbForDebrid.episodes,
            cast_members: selectedTmdbForDebrid.cast_members,
          }),
        };

        await addMedia.mutateAsync(input);
        added++;
      } catch (error) {
        console.error(`Failed to add episode S${item.season}E${item.episode}:`, error);
      }
    }

    toast.success(`Added ${added}/${readyItems.length} episodes to library`);
    if (added > 0) {
      resetForm();
      onOpenChange(false);
    }
    setIsAdding(false);
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


  // Add media with just TMDB metadata (stream selected at play time)
  const handleAddWithMetadata = async () => {
    if (!manualTitle.trim()) {
      toast.error("Please provide a title");
      return;
    }

    if (!selectedTmdbForDebrid) {
      toast.error("Please search and select a title from TMDB first");
      return;
    }

    setIsAdding(true);

    try {
      const input: CreateMediaInput = {
        title: manualTitle,
        media_type: manualType,
        source_type: "url",
        source_url: null, // No URL - will be selected at play time
        category_id: selectedCategory || undefined,
        overview: manualOverview,
        tmdb_id: selectedTmdbForDebrid.tmdb_id,
        poster_path: selectedTmdbForDebrid.poster_path,
        backdrop_path: selectedTmdbForDebrid.backdrop_path,
        release_date: selectedTmdbForDebrid.release_date,
        rating: selectedTmdbForDebrid.rating,
        genres: selectedTmdbForDebrid.genres,
        runtime: selectedTmdbForDebrid.runtime,
        seasons: selectedTmdbForDebrid.seasons,
        episodes: selectedTmdbForDebrid.episodes,
        cast_members: selectedTmdbForDebrid.cast_members,
      };

      await addMedia.mutateAsync(input);
      toast.success("Added to library! Select a stream when you play.");
      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Add media error:", error);
      toast.error(error.message || "Failed to add media");
    }
    setIsAdding(false);
  };

  // Real-Debrid handler (for manual magnet/URL entry)
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
      if (isMagnetLink(rdLink)) {
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
      } else if (isDirectRdLink(rdLink)) {
        // Already a direct RD link (e.g., from Torrentio with RD), use directly
        setRdStatus("Using direct link...");
        streamUrl = rdLink;
      } else {
        // Regular link - try to unrestrict, fallback to magnet extraction if it fails
        setRdStatus("Unrestricting link...");
        try {
          const unrestricted = await unrestrictLink(rdLink);
          streamUrl = unrestricted.download;
        } catch (unrestrictError: any) {
          // Check if it's a hoster_unsupported error and try magnet fallback
          const errorMessage = unrestrictError?.message || '';
          if (errorMessage.includes('hoster_unsupported') || errorMessage.includes('400')) {
            console.log("Unrestrict failed, attempting magnet extraction fallback...");
            const magnetLink = extractMagnetFromTorrentioUrl(rdLink);
            if (magnetLink) {
              setRdStatus("Falling back to magnet link...");
              const torrent = await addMagnetAndWait(magnetLink, (progress) => {
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
              throw new Error("Link not supported and no magnet hash found");
            }
          } else {
            throw unrestrictError;
          }
        }
      }

      setRdStatus("Adding to library...");

      const input: CreateMediaInput = {
        title: manualTitle,
        media_type: manualType,
        source_type: "url",
        source_url: streamUrl,
        category_id: selectedCategory || undefined,
        overview: manualOverview,
        // Include TMDB metadata if available
        ...(selectedTmdbForDebrid && {
          tmdb_id: selectedTmdbForDebrid.tmdb_id,
          poster_path: selectedTmdbForDebrid.poster_path,
          backdrop_path: selectedTmdbForDebrid.backdrop_path,
          release_date: selectedTmdbForDebrid.release_date,
          rating: selectedTmdbForDebrid.rating,
          genres: selectedTmdbForDebrid.genres,
          runtime: selectedTmdbForDebrid.runtime,
          seasons: selectedTmdbForDebrid.seasons,
          episodes: selectedTmdbForDebrid.episodes,
          cast_members: selectedTmdbForDebrid.cast_members,
        }),
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
    setSelectedTmdbForDebrid(null);
    setTmdbDebridResults([]);
    setShowTmdbDebridDropdown(false);
    setTorrentioResults([]);
    setShowTorrentioDropdown(false);
    setSelectedSeason(1);
    setSelectedEpisode(1);
    setBatchQueue([]);
    setIsBatchMode(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl">Add Media</DialogTitle>
        </DialogHeader>

        <div className={isTVMode ? "h-[500px]" : "h-[450px]"}>
          <ScrollAreaWithArrows scrollStep={150} isTVMode={isTVMode}>
            <Tabs defaultValue="debrid" className="w-full px-1 pb-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="debrid" className="gap-2">
              <Zap className="w-4 h-4" />
              Debrid
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <LinkIcon className="w-4 h-4" />
              URL
            </TabsTrigger>
            <TabsTrigger value="tmdb" className="gap-2">
              <Search className="w-4 h-4" />
              TMDB
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

            {/* TMDB Preview Card */}
            {selectedTmdbForDebrid && (
              <div className="relative flex gap-4 p-4 bg-secondary/30 border border-border rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTmdbForDebrid(null);
                    setManualTitle("");
                    setManualOverview("");
                    setTorrentioResults([]);
                    setBatchQueue([]);
                  }}
                  className="absolute top-2 right-2 p-1 hover:bg-accent rounded transition-colors"
                  title="Clear selection"
                >
                  <X className="w-4 h-4" />
                </button>
                {selectedTmdbForDebrid.poster_path ? (
                  <img
                    src={getImageUrl(selectedTmdbForDebrid.poster_path, "w200") || ""}
                    alt={manualTitle}
                    className="w-20 h-28 object-cover rounded-md shrink-0"
                  />
                ) : (
                  <div className="w-20 h-28 bg-muted rounded-md flex items-center justify-center shrink-0">
                    {selectedTmdbForDebrid.media_type === "movie" ? (
                      <Film className="w-8 h-8 text-muted-foreground" />
                    ) : (
                      <Tv className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg leading-tight truncate">{manualTitle}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {selectedTmdbForDebrid.media_type === "movie" ? (
                        <Film className="w-3 h-3" />
                      ) : (
                        <Tv className="w-3 h-3" />
                      )}
                      {selectedTmdbForDebrid.media_type === "movie" ? "Movie" : "TV Series"}
                    </span>
                    {selectedTmdbForDebrid.release_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {selectedTmdbForDebrid.release_date.slice(0, 4)}
                      </span>
                    )}
                    {selectedTmdbForDebrid.rating && selectedTmdbForDebrid.rating > 0 && (
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-500" />
                        {selectedTmdbForDebrid.rating.toFixed(1)}
                      </span>
                    )}
                    {selectedTmdbForDebrid.runtime && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {selectedTmdbForDebrid.runtime}m
                      </span>
                    )}
                    {selectedTmdbForDebrid.seasons && (
                      <span>{selectedTmdbForDebrid.seasons} season{selectedTmdbForDebrid.seasons > 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {selectedTmdbForDebrid.genres && selectedTmdbForDebrid.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedTmdbForDebrid.genres.slice(0, 3).map((genre) => (
                        <span key={genre} className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
                          {genre}
                        </span>
                      ))}
                    </div>
                  )}
                  {manualOverview && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{manualOverview}</p>
                  )}
                </div>
              </div>
            )}

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

            {/* Season/Episode picker for TV shows */}
            {selectedTmdbForDebrid?.media_type === "tv" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Episode Selection</Label>
                  <Button
                    type="button"
                    variant={isBatchMode ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setIsBatchMode(!isBatchMode);
                      if (!isBatchMode) {
                        setBatchQueue([]);
                      }
                    }}
                    className="h-7 gap-1"
                  >
                    <ListChecks className="w-3 h-3" />
                    <span className="text-xs">{isBatchMode ? "Single Mode" : "Batch Mode"}</span>
                  </Button>
                </div>

                {!isBatchMode ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Season</Label>
                      <Select 
                        value={selectedSeason.toString()} 
                        onValueChange={(v) => {
                          setSelectedSeason(parseInt(v));
                          setSelectedEpisode(1);
                          setTorrentioResults([]);
                          setShowTorrentioDropdown(false);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: selectedTmdbForDebrid.seasons || 1 }, (_, i) => i + 1).map((s) => (
                            <SelectItem key={s} value={s.toString()}>
                              Season {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Episode</Label>
                      <Input
                        type="number"
                        min={1}
                        value={selectedEpisode}
                        onChange={(e) => {
                          setSelectedEpisode(parseInt(e.target.value) || 1);
                          setTorrentioResults([]);
                          setShowTorrentioDropdown(false);
                        }}
                        placeholder="Episode number"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Season</Label>
                      <Select 
                        value={selectedSeason.toString()} 
                        onValueChange={(v) => setSelectedSeason(parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: selectedTmdbForDebrid.seasons || 1 }, (_, i) => i + 1).map((s) => (
                            <SelectItem key={s} value={s.toString()}>
                              Season {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Select Episodes</Label>
                        <span className="text-xs text-muted-foreground">
                          {batchQueue.filter(q => q.season === selectedSeason).length} selected
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-2 p-3 bg-muted/30 rounded-lg max-h-32 overflow-y-auto">
                        {Array.from({ length: 20 }, (_, i) => i + 1).map((ep) => {
                          const isSelected = batchQueue.some(q => q.season === selectedSeason && q.episode === ep);
                          const queueItem = batchQueue.find(q => q.season === selectedSeason && q.episode === ep);
                          return (
                            <button
                              key={ep}
                              type="button"
                              onClick={() => toggleBatchEpisode(selectedSeason, ep)}
                              className={`
                                relative h-9 rounded-md text-sm font-medium transition-colors
                                ${isSelected 
                                  ? "bg-primary text-primary-foreground" 
                                  : "bg-background hover:bg-accent border border-border"
                                }
                              `}
                            >
                              {ep}
                              {queueItem?.status === "ready" && (
                                <Check className="absolute top-0.5 right-0.5 w-3 h-3" />
                              )}
                              {queueItem?.status === "searching" && (
                                <Loader2 className="absolute top-0.5 right-0.5 w-3 h-3 animate-spin" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {batchQueue.length > 0 && (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleBatchSearch}
                          disabled={isBatchSearching}
                          className="flex-1"
                        >
                          {isBatchSearching ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Searching...</>
                          ) : (
                            <><Download className="w-3 h-3 mr-1" /> Find All Streams ({batchQueue.length})</>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={handleBatchAdd}
                          disabled={isAdding || batchQueue.filter(q => q.status === "ready").length === 0}
                          className="flex-1"
                        >
                          {isAdding ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Adding...</>
                          ) : (
                            <><Zap className="w-3 h-3 mr-1" /> Add {batchQueue.filter(q => q.status === "ready").length} Ready</>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Simplified: No stream selection here - done at play time */}
            {!isBatchMode && selectedTmdbForDebrid && (
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                <p className="text-sm text-primary flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Stream will be selected when you click Play
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This saves the metadata to your library. When you play, you'll choose from available streams.
                </p>
              </div>
            )}

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

            <Button
              onClick={handleAddWithMetadata}
              disabled={isAdding || !selectedTmdbForDebrid}
              className="w-full"
            >
              {isAdding ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Adding...</>
              ) : (
                <><Zap className="w-4 h-4 mr-2" /> Add to Library</>
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
          </ScrollAreaWithArrows>
        </div>
      </DialogContent>
    </Dialog>
  );
}
