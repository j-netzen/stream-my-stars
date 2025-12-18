import { useState } from "react";
import { useCategories } from "@/hooks/useCategories";
import { useMedia, Media } from "@/hooks/useMedia";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { MediaCard } from "@/components/media/MediaCard";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FolderOpen, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CategoriesPage() {
  const { categories, isLoading, addCategory, deleteCategory } = useCategories();
  const { media, deleteMedia } = useMedia();
  const { progress } = useWatchProgress();
  const [activeMedia, setActiveMedia] = useState<Media | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error("Please enter a category name");
      return;
    }

    await addCategory.mutateAsync({
      name: newCategoryName,
      description: newCategoryDesc || undefined,
    });

    setNewCategoryName("");
    setNewCategoryDesc("");
    setIsDialogOpen(false);
  };

  const selectedCategoryData = categories.find((c) => c.id === selectedCategory);
  const categoryMedia = selectedCategory
    ? media.filter((m) => m.category_id === selectedCategory)
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
          <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
            <FolderOpen className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Categories</h1>
            <p className="text-sm text-muted-foreground">
              Organize your media into custom categories
            </p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="e.g., 80s Classics"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  placeholder="Enter a description"
                  value={newCategoryDesc}
                  onChange={(e) => setNewCategoryDesc(e.target.value)}
                />
              </div>
              <Button onClick={handleCreateCategory} className="w-full">
                Create Category
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-6">
        {/* Categories List */}
        <div className="w-64 flex-shrink-0 space-y-2">
          {categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No categories yet</p>
            </div>
          ) : (
            categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  selectedCategory === category.id
                    ? "bg-primary/20 border border-primary"
                    : "bg-secondary/50 hover:bg-secondary"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{category.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {media.filter((m) => m.category_id === category.id).length} items
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCategory.mutate(category.id);
                      if (selectedCategory === category.id) {
                        setSelectedCategory(null);
                      }
                    }}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Category Content */}
        <div className="flex-1">
          {selectedCategory && selectedCategoryData ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">{selectedCategoryData.name}</h2>
              {categoryMedia.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {categoryMedia.map((item) => (
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
                  <p>No media in this category</p>
                  <p className="text-sm">Add media and assign it to this category</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <FolderOpen className="w-16 h-16 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Select a category</h2>
              <p className="text-muted-foreground">
                Choose a category from the list to view its content
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
