import { useState, useMemo } from "react";
import { useMedia, Media, WatchProviderInfo } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { MediaCard } from "@/components/media/MediaCard";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Tv2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { getWatchProviders, TMDB_IMAGE_BASE } from "@/lib/tmdb";

// Common streaming networks with their TMDB provider IDs
const KNOWN_NETWORKS: { id: number; name: string; logo?: string }[] = [
  { id: 8, name: "Netflix", logo: "/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg" },
  { id: 15, name: "Hulu", logo: "/zxrVdFjIjLqkfnwyghnfywTn3Lh.jpg" },
  { id: 9, name: "Amazon Prime Video", logo: "/emthp39XA2YScoYL1p0sdbAH2WA.jpg" },
  { id: 2, name: "Apple TV+", logo: "/peURlLlr8jggOwK53fJ5wdQl05y.jpg" },
  { id: 337, name: "Disney+", logo: "/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg" },
  { id: 531, name: "Paramount+", logo: "/xbhHHa1YgtpwhC8lb1NQ3ACVcLd.jpg" },
  { id: 387, name: "HBO Max", logo: "/Ajqyt5aNxNGjmF9uOfxArGrdf3X.jpg" },
  { id: 386, name: "Peacock", logo: "/8VCV78prwd9QzZnEm0ReO6bERDa.jpg" },
  { id: 1899, name: "Max", logo: "/6Q3ZYUNA9xN1KN3Xe4b0jS78tYl.jpg" },
  { id: 350, name: "Apple TV", logo: "/2E03IAZsX4ZaUqM7tXlctEPMGWS.jpg" },
  { id: 283, name: "Crunchyroll", logo: "/8Gt1iClBlzTeQs8WQm8rRwbDWIh.jpg" },
  { id: 43, name: "Starz", logo: "/xpbPRAz9L3JoH9MWN9MpiWmqg6J.jpg" },
  { id: 37, name: "Showtime", logo: "/Allse9kbjiP6ExaQrnSpIhkurEi.jpg" },
];

export default function NetworksPage() {
  const queryClient = useQueryClient();
  const { media, deleteMedia, isLoading } = useMedia();
  const { progress } = useWatchProgress();
  const [activeMedia, setActiveMedia] = useState<Media | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<number | null>(null);
  const [isUpdatingProviders, setIsUpdatingProviders] = useState(false);

  // Group media by network/provider
  const { networkGroups, uncategorizedMedia, availableNetworks } = useMemo(() => {
    const groups: Map<number, Media[]> = new Map();
    const uncategorized: Media[] = [];
    const networksSet: Map<number, { name: string; logo: string }> = new Map();

    media.forEach((item) => {
      const providers = item.watch_providers;
      const flatrate = providers?.flatrate;

      if (flatrate && flatrate.length > 0) {
        flatrate.forEach((provider) => {
          if (!groups.has(provider.provider_id)) {
            groups.set(provider.provider_id, []);
          }
          groups.get(provider.provider_id)!.push(item);
          networksSet.set(provider.provider_id, {
            name: provider.provider_name,
            logo: provider.logo_path,
          });
        });
      } else {
        uncategorized.push(item);
      }
    });

    // Merge with known networks to show consistent ordering
    const networks = KNOWN_NETWORKS.filter(n => groups.has(n.id)).map(n => ({
      id: n.id,
      name: networksSet.get(n.id)?.name || n.name,
      logo: networksSet.get(n.id)?.logo || n.logo,
      count: groups.get(n.id)?.length || 0,
    }));

    // Add any other providers not in our known list
    groups.forEach((items, providerId) => {
      if (!KNOWN_NETWORKS.some(n => n.id === providerId)) {
        const providerInfo = networksSet.get(providerId);
        if (providerInfo) {
          networks.push({
            id: providerId,
            name: providerInfo.name,
            logo: providerInfo.logo,
            count: items.length,
          });
        }
      }
    });

    return {
      networkGroups: groups,
      uncategorizedMedia: uncategorized,
      availableNetworks: networks.sort((a, b) => b.count - a.count),
    };
  }, [media]);

  const handleUpdateProviders = async () => {
    setIsUpdatingProviders(true);
    let updated = 0;

    try {
      // Get media items that have tmdb_id but no watch_providers
      const mediaToUpdate = media.filter(
        (m) => m.tmdb_id && !m.watch_providers
      );

      for (const item of mediaToUpdate) {
        try {
          const mediaType = item.media_type === "movie" ? "movie" : "tv";
          const providers = await getWatchProviders(item.tmdb_id!, mediaType);
          
          // Get US providers (or first available country)
          const countryProviders = providers.results?.US || Object.values(providers.results || {})[0];
          
          if (countryProviders) {
            // Use type assertion for Supabase JSON column
            const providerData = JSON.parse(JSON.stringify(countryProviders));
            const { error } = await supabase
              .from("media")
              .update({ watch_providers: providerData })
              .eq("id", item.id);
            
            if (!error) updated++;
          }
        } catch (e) {
          console.error(`Failed to fetch providers for ${item.title}:`, e);
        }
      }

      if (updated > 0) {
        toast.success(`Updated streaming info for ${updated} items`);
        queryClient.invalidateQueries({ queryKey: ["media"] });
      } else {
        toast.info("All media already has streaming info or no TMDB data");
      }
    } catch (error) {
      console.error("Error updating providers:", error);
      toast.error("Failed to update streaming info");
    }

    setIsUpdatingProviders(false);
  };

  const selectedNetworkData = availableNetworks.find((n) => n.id === selectedNetwork);
  const networkMedia = selectedNetwork === -1
    ? uncategorizedMedia
    : selectedNetwork
      ? networkGroups.get(selectedNetwork) || []
      : [];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
            <Tv2 className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Networks</h1>
            <p className="text-sm text-muted-foreground">
              Browse your media by streaming platform
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          className="gap-2"
          onClick={handleUpdateProviders}
          disabled={isUpdatingProviders}
        >
          {isUpdatingProviders ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Update Streaming Info
        </Button>
      </div>

      <div className="flex gap-6">
        {/* Networks List */}
        <div className="w-64 flex-shrink-0 space-y-2">
          {/* Uncategorized filter */}
          {uncategorizedMedia.length > 0 && (
            <Card
              withSpaceBg
              onClick={() => setSelectedNetwork(-1)}
              className={`cursor-pointer p-3 transition-all ${
                selectedNetwork === -1
                  ? "ring-2 ring-amber-500 shadow-star-glow"
                  : "hover:shadow-star-lg"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Tv2 className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="font-medium text-amber-600 dark:text-amber-400">No Streaming Info</p>
                  <p className="text-xs text-muted-foreground">
                    {uncategorizedMedia.length} items
                  </p>
                </div>
              </div>
            </Card>
          )}
          
          {availableNetworks.length === 0 && uncategorizedMedia.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Tv2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No network data yet</p>
              <p className="text-xs mt-1">Add media to see streaming platforms</p>
            </div>
          ) : (
            availableNetworks.map((network) => (
              <Card
                key={network.id}
                withSpaceBg
                onClick={() => setSelectedNetwork(network.id)}
                className={`cursor-pointer p-3 transition-all ${
                  selectedNetwork === network.id
                    ? "ring-2 ring-primary shadow-star-glow"
                    : "hover:shadow-star-lg"
                }`}
              >
                <div className="flex items-center gap-3">
                  {network.logo ? (
                    <img
                      src={`${TMDB_IMAGE_BASE}/w92${network.logo}`}
                      alt={network.name}
                      className="w-8 h-8 rounded-lg object-contain bg-white"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Tv2 className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{network.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {network.count} items
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Network Content */}
        <div className="flex-1">
          {selectedNetwork === -1 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-amber-600 dark:text-amber-400">No Streaming Info</h2>
              <p className="text-sm text-muted-foreground">
                These items don't have streaming platform data. Click "Update Streaming Info" to fetch it from TMDB.
              </p>
              {uncategorizedMedia.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {uncategorizedMedia.map((item) => (
                    <MediaCard
                      key={item.id}
                      media={item}
                      progress={progress.find((p) => p.media_id === item.id)}
                      onPlay={setActiveMedia}
                      onDelete={(m) => deleteMedia.mutate(m.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>All media has streaming info!</p>
                </div>
              )}
            </div>
          ) : selectedNetwork && selectedNetworkData ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {selectedNetworkData.logo && (
                  <img
                    src={`${TMDB_IMAGE_BASE}/w92${selectedNetworkData.logo}`}
                    alt={selectedNetworkData.name}
                    className="w-10 h-10 rounded-lg object-contain bg-white"
                  />
                )}
                <h2 className="text-xl font-semibold">{selectedNetworkData.name}</h2>
              </div>
              {networkMedia.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {networkMedia.map((item) => (
                    <MediaCard
                      key={item.id}
                      media={item}
                      progress={progress.find((p) => p.media_id === item.id)}
                      onPlay={setActiveMedia}
                      onDelete={(m) => deleteMedia.mutate(m.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No media on this network</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <Tv2 className="w-16 h-16 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Select a network</h2>
              <p className="text-muted-foreground">
                Choose a streaming platform from the list to view its content
              </p>
            </div>
          )}
        </div>
      </div>

      {activeMedia && (
        <VideoPlayer media={activeMedia} onClose={() => setActiveMedia(null)} />
      )}
    </div>
  );
}