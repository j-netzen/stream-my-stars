import { useRef, useCallback, useEffect } from 'react';
import { getImageUrl, getMovieDetails, getTVDetails } from '@/lib/tmdb';
import { getImdbIdFromTmdb, searchTorrentio, TorrentioStream } from '@/lib/torrentio';

interface PrefetchedData {
  metadata?: any;
  posterUrl?: string;
  backdropUrl?: string;
  streams?: TorrentioStream[];
  imdbId?: string;
  timestamp: number;
}

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

// Prefetch cache using Map for O(1) lookups
const prefetchCache = new Map<string, PrefetchedData>();

// Pending prefetch requests to avoid duplicates
const pendingRequests = new Set<string>();

// Low-priority image prefetch using Intersection Observer pattern
const imagePreloadQueue: string[] = [];
let isProcessingImages = false;

function processImageQueue() {
  if (isProcessingImages || imagePreloadQueue.length === 0) return;
  
  isProcessingImages = true;
  const url = imagePreloadQueue.shift();
  
  if (url) {
    const img = new Image();
    img.onload = img.onerror = () => {
      isProcessingImages = false;
      // Process next with a small delay to not block main thread
      setTimeout(processImageQueue, 50);
    };
    img.src = url;
  } else {
    isProcessingImages = false;
  }
}

export function usePredictivePrefetch() {
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prefetchedRef = useRef<Set<string>>(new Set());

  // Clean up stale cache entries periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [key, data] of prefetchCache.entries()) {
        if (now - data.timestamp > CACHE_TTL) {
          prefetchCache.delete(key);
        }
      }
    }, 60000); // Check every minute

    return () => clearInterval(cleanup);
  }, []);

  // Prefetch media metadata and streams in parallel
  const prefetchMetadata = useCallback(async (tmdbId: number, mediaType: 'movie' | 'tv') => {
    const cacheKey = `${mediaType}-${tmdbId}`;
    
    // Skip if already cached and fresh
    const cached = prefetchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached;
    }

    // Skip if already fetching
    if (pendingRequests.has(cacheKey)) return;
    
    pendingRequests.add(cacheKey);

    try {
      // Fetch metadata and streams in parallel for faster loading
      const [metadata, imdbId] = await Promise.all([
        mediaType === 'movie' 
          ? getMovieDetails(tmdbId)
          : getTVDetails(tmdbId),
        getImdbIdFromTmdb(tmdbId, mediaType).catch(() => null)
      ]);

      const data: PrefetchedData = {
        metadata,
        posterUrl: getImageUrl(metadata.poster_path, 'w500') || undefined,
        backdropUrl: getImageUrl(metadata.backdrop_path, 'w780') || undefined,
        imdbId: imdbId || undefined,
        timestamp: Date.now(),
      };

      prefetchCache.set(cacheKey, data);
      
      // Queue image prefetch
      if (data.posterUrl) imagePreloadQueue.push(data.posterUrl);
      if (data.backdropUrl) imagePreloadQueue.push(data.backdropUrl);
      processImageQueue();

      // NOTE: Stream prefetching disabled to reduce unnecessary API calls
      // Streams are fetched on-demand when user opens stream selection dialog
      // This prevents potential rate-limiting and reduces network overhead

      return data;
    } catch (error) {
      console.warn('Prefetch failed:', error);
      return null;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  }, []);

  // Prefetch streams for a media item
  const prefetchStreams = useCallback(async (
    tmdbId: number, 
    mediaType: 'movie' | 'tv', 
    imdbId?: string,
    season?: number,
    episode?: number
  ) => {
    const streamCacheKey = `streams-${mediaType}-${tmdbId}-${season || 0}-${episode || 0}`;
    
    // Skip if already cached or fetching
    if (prefetchCache.has(streamCacheKey) || pendingRequests.has(streamCacheKey)) {
      return;
    }

    pendingRequests.add(streamCacheKey);

    try {
      // Get IMDB ID if not provided
      let finalImdbId = imdbId;
      if (!finalImdbId) {
        const cached = prefetchCache.get(`${mediaType}-${tmdbId}`);
        finalImdbId = cached?.imdbId;
        if (!finalImdbId) {
          finalImdbId = await getImdbIdFromTmdb(tmdbId, mediaType) || undefined;
        }
      }

      if (!finalImdbId) return;

      // Fetch streams
      const type = mediaType === 'movie' ? 'movie' : 'series';
      const streams = await searchTorrentio(
        finalImdbId,
        type,
        type === 'series' ? season : undefined,
        type === 'series' ? episode : undefined
      );

      // Cache the streams
      const streamData: PrefetchedData = {
        streams,
        imdbId: finalImdbId,
        timestamp: Date.now(),
      };

      prefetchCache.set(streamCacheKey, streamData);
      console.log(`[Prefetch] Cached ${streams.length} streams for ${mediaType}-${tmdbId}`);
    } catch (error) {
      console.warn('Stream prefetch failed:', error);
    } finally {
      pendingRequests.delete(streamCacheKey);
    }
  }, []);

  // Prefetch images for a media item
  const prefetchImages = useCallback((posterPath?: string | null, backdropPath?: string | null) => {
    if (posterPath) {
      const posterUrl = getImageUrl(posterPath, 'w500');
      if (posterUrl && !imagePreloadQueue.includes(posterUrl)) {
        imagePreloadQueue.push(posterUrl);
      }
    }
    if (backdropPath) {
      const backdropUrl = getImageUrl(backdropPath, 'w780');
      if (backdropUrl && !imagePreloadQueue.includes(backdropUrl)) {
        imagePreloadQueue.push(backdropUrl);
      }
    }
    processImageQueue();
  }, []);

  // Handle hover intent (with delay to avoid unnecessary fetches)
  const handleHoverIntent = useCallback((
    tmdbId: number | undefined | null,
    mediaType: 'movie' | 'tv',
    posterPath?: string | null,
    backdropPath?: string | null
  ) => {
    // Clear any pending hover timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Start prefetching images immediately (low cost)
    prefetchImages(posterPath, backdropPath);

    // Delay metadata fetch slightly to confirm hover intent
    hoverTimeoutRef.current = setTimeout(() => {
      if (tmdbId) {
        prefetchMetadata(tmdbId, mediaType);
      }
    }, 150); // 150ms delay for hover confirmation
  }, [prefetchImages, prefetchMetadata]);

  // Cancel prefetch on hover end
  const handleHoverEnd = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  // Prefetch nearby items (e.g., when scrolling near them)
  const prefetchNearbyItems = useCallback((items: Array<{
    tmdb_id?: number | null;
    media_type?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    id: string;
  }>) => {
    // Only prefetch first 3-5 items to not overload
    const itemsToPrefetch = items.slice(0, 5);
    
    itemsToPrefetch.forEach((item, index) => {
      // Stagger prefetches to avoid overwhelming network
      setTimeout(() => {
        if (!prefetchedRef.current.has(item.id)) {
          prefetchedRef.current.add(item.id);
          prefetchImages(item.poster_path, item.backdrop_path);
          
          // Only prefetch metadata for first 2 items
          if (index < 2 && item.tmdb_id && item.media_type) {
            prefetchMetadata(item.tmdb_id, item.media_type as 'movie' | 'tv');
          }
        }
      }, index * 100);
    });
  }, [prefetchImages, prefetchMetadata]);

  // Get cached data
  const getCachedData = useCallback((tmdbId: number, mediaType: 'movie' | 'tv'): PrefetchedData | null => {
    const cacheKey = `${mediaType}-${tmdbId}`;
    const cached = prefetchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached;
    }
    return null;
  }, []);

  // Get cached streams
  const getCachedStreams = useCallback((
    tmdbId: number, 
    mediaType: 'movie' | 'tv',
    season?: number,
    episode?: number
  ): TorrentioStream[] | null => {
    const streamCacheKey = `streams-${mediaType}-${tmdbId}-${season || 0}-${episode || 0}`;
    const cached = prefetchCache.get(streamCacheKey);
    if (cached && cached.streams && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.streams;
    }
    return null;
  }, []);

  return {
    handleHoverIntent,
    handleHoverEnd,
    prefetchNearbyItems,
    prefetchMetadata,
    prefetchImages,
    prefetchStreams,
    getCachedData,
    getCachedStreams,
  };
}

export default usePredictivePrefetch;
