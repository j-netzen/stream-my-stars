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
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarProps {
  onAddMedia?: () => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function Sidebar({
  onAddMedia,
  collapsed,
  onCollapsedChange,
  mobileOpen,
  onMobileOpenChange,
}: SidebarProps) {
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

  const handleNavClick = () => {
    // Close mobile menu on navigation
    if (mobileOpen) {
      onMobileOpenChange(false);
    }
  };

  const NavItem = ({ icon: Icon, label, path }: { icon: any; label: string; path: string }) => {
    const content = (
      <Link
        to={path}
        onClick={handleNavClick}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
          collapsed && !mobileOpen ? "justify-center px-2" : "",
          isActive(path)
            ? "sidebar-active"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        )}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {(!collapsed || mobileOpen) && <span>{label}</span>}
      </Link>
    );

    if (collapsed && !mobileOpen) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }

    return content;
  };

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => onMobileOpenChange(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen bg-card border-r border-border flex flex-col transition-all duration-300",
          // Desktop sizing
          collapsed ? "w-16" : "w-64",
          // Mobile: hidden by default, shown when mobileOpen
          "max-md:-translate-x-full",
          mobileOpen && "max-md:translate-x-0 max-md:w-64"
        )}
      >
        {/* Header */}
        <div className={cn("p-4 border-b border-border flex items-center", collapsed && !mobileOpen ? "justify-center" : "justify-between")}>
          <Link to="/" className="flex items-center gap-3" onClick={handleNavClick}>
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Film className="w-5 h-5 text-primary" />
            </div>
            {(!collapsed || mobileOpen) && (
              <span className="text-xl font-bold gradient-text">Media Hub</span>
            )}
          </Link>
          
          {/* Mobile close button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => onMobileOpenChange(false)}
          >
            <X className="w-5 h-5" />
          </Button>
          
          {/* Desktop collapse toggle */}
          {!mobileOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex h-8 w-8"
              onClick={() => onCollapsedChange(!collapsed)}
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>

        {/* Add Media Button */}
        <div className="p-3">
          {collapsed && !mobileOpen ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onAddMedia}
                  className="w-full bg-primary hover:bg-primary/90"
                  size="icon"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Add Media</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              onClick={onAddMedia}
              className="w-full gap-2 bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              Add Media
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavItem {...item} />
              </li>
            ))}
          </ul>
        </nav>

        {/* Bottom Actions */}
        <div className="p-2 border-t border-border space-y-1">
          <NavItem icon={Settings} label="Settings" path="/settings" />
          
          {collapsed && !mobileOpen ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className="w-full flex items-center justify-center px-2 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign Out</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

// Mobile trigger button component
export function MobileMenuTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden"
      onClick={onClick}
    >
      <Menu className="w-5 h-5" />
    </Button>
  );
}