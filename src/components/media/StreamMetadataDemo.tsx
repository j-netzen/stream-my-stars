import { StreamMetadata, type StreamMetadataData } from './StreamMetadata';

/**
 * Demo component showcasing the StreamMetadata Web Component
 * with various data configurations
 */
export function StreamMetadataDemo() {
  const liveChannel: StreamMetadataData = {
    title: "ESPN Live Coverage",
    subtitle: "NBA Finals 2024 - Game 7",
    description: "Watch the decisive Game 7 of the NBA Finals live. Don't miss this historic moment as two teams battle for the championship.",
    isLive: true,
    viewers: 1250000,
    genres: ["Sports", "Basketball", "Live"],
    imageUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&h=225&fit=crop",
  };

  const movie: StreamMetadataData = {
    title: "Interstellar",
    subtitle: "Christopher Nolan",
    description: "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
    rating: 8.7,
    year: "2014",
    duration: "2h 49m",
    genres: ["Sci-Fi", "Drama", "Adventure"],
    imageUrl: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=400&h=225&fit=crop",
  };

  const tvShow: StreamMetadataData = {
    title: "Breaking Bad",
    subtitle: "Season 5, Episode 16 - Felina",
    description: "The series finale. Walter White's journey comes to an end as he ties up loose ends and faces the consequences of his actions.",
    rating: 9.9,
    year: "2013",
    duration: "55m",
    genres: ["Drama", "Crime", "Thriller"],
    imageUrl: "https://images.unsplash.com/photo-1574267432553-4b4628081c31?w=400&h=225&fit=crop",
  };

  const minimalData: StreamMetadataData = {
    title: "Documentary Title",
  };

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      <h1 className="text-2xl font-bold text-foreground mb-6">
        Stream Metadata Component Demo
      </h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Live Channel</h2>
        <StreamMetadata data={liveChannel} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Movie</h2>
        <StreamMetadata data={movie} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">TV Show Episode</h2>
        <StreamMetadata data={tvShow} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Minimal Data</h2>
        <StreamMetadata data={minimalData} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Grid Layout</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StreamMetadata data={liveChannel} />
          <StreamMetadata data={movie} />
        </div>
      </section>
    </div>
  );
}
