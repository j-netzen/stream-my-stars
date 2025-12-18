import { useState } from "react";
import { useMedia } from "@/hooks/useMedia";
import { MediaCard } from "@/components/media/MediaCard";
import { Input } from "@/components/ui/input";
import { Search, Video } from "lucide-react";

export default function HomeMoviesPage() {
  const { media, deleteMedia } = useMedia();
  const [search, setSearch] = useState("");

  const homeMovies = media.filter(
    (m) => m.media_type === "custom"
  );

  const filtered = homeMovies.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Video className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">Home Movies</h1>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search home movies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((item) => (
            <MediaCard 
              key={item.id} 
              media={item} 
              onDelete={(m) => deleteMedia.mutate(m.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Video className="w-16 h-16 text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No home movies yet</h2>
          <p className="text-muted-foreground">
            Add your personal videos using the "Add Media" button and select "Custom" type.
          </p>
        </div>
      )}
    </div>
  );
}
