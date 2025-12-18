import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Home,
  Film,
  Tv,
  Video,
  FolderOpen,
  ListVideo,
  Search,
  Plus,
  LogOut,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  onAddMedia?: () => void;
}

export function Sidebar({ onAddMedia }: SidebarProps) {
  const location = useLocation();
  const { signOut } = useAuth();

  const navItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Film, label: "Movies", path: "/movies" },
    { icon: Tv, label: "TV Shows", path: "/tv-shows" },
    { icon: Video, label: "Home Movies", path: "/home-movies" },
    { icon: FolderOpen, label: "Categories", path: "/categories" },
    { icon: ListVideo, label: "Playlists", path: "/playlists" },
    { icon: Search, label: "Discover", path: "/discover" },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Film className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xl font-bold gradient-text">Media Hub</span>
        </Link>
      </div>

      {/* Add Media Button */}
      <div className="p-4">
        <Button
          onClick={onAddMedia}
          className="w-full gap-2 bg-primary hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Add Media
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                  isActive(item.path)
                    ? "sidebar-active"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-border space-y-1">
        <Link
          to="/settings"
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
            isActive("/settings")
              ? "sidebar-active"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          )}
        >
          <Settings className="w-5 h-5" />
          Settings
        </Link>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
