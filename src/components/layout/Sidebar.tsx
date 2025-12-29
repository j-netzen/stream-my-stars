import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRealDebridStatus } from "@/hooks/useRealDebridStatus";
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
  ChevronUp,
  ChevronDown,
  Menu,
  X,
  Cloud,
  CloudOff,
  Loader2,
  AlertCircle,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTVMode } from "@/hooks/useTVMode";
import spaceBg from "@/assets/space-sidebar-bg.jpg";

interface NavItemData {
  icon: any;
  label: string;
  path: string;
}

const defaultNavItems: NavItemData[] = [
  { icon: Search, label: "Discover", path: "/discover" },
  { icon: Home, label: "Home", path: "/" },
  { icon: Film, label: "Movies", path: "/movies" },
  { icon: Tv, label: "TV Shows", path: "/tv-shows" },
  { icon: Radio, label: "Live TV", path: "/live-tv" },
  { icon: Video, label: "Home Videos", path: "/home-movies" },
  { icon: ListVideo, label: "Playlists", path: "/playlists" },
  { icon: FolderOpen, label: "Categories", path: "/categories" },
];

const STORAGE_KEY = "sidebar-nav-order-v2";

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
  const { status: rdStatus, user: rdUser, refresh: refreshRdStatus } = useRealDebridStatus();
  const { isTVMode } = useTVMode();
  
  // Keyboard navigation for sidebar in TV mode
  const handleSidebarKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isTVMode) return;
    
    const focusableElements = Array.from(
      document.querySelectorAll<HTMLElement>('[data-sidebar="true"] a[href], [data-sidebar="true"] button:not([disabled])')
    ).filter(el => el.offsetParent !== null);
    
    const currentIndex = focusableElements.findIndex(el => el === document.activeElement);
    if (currentIndex === -1) return;
    
    let nextIndex = currentIndex;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        nextIndex = Math.min(currentIndex + 1, focusableElements.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'ArrowRight':
        // Move focus to main content
        e.preventDefault();
        const mainContent = document.querySelector('main');
        const firstFocusable = mainContent?.querySelector<HTMLElement>('[tabindex="0"], button, a[href]');
        if (firstFocusable) {
          firstFocusable.focus();
        }
        return;
    }
    
    if (nextIndex !== currentIndex) {
      focusableElements[nextIndex]?.focus();
    }
  }, [isTVMode]);
  
  // Load saved order from localStorage
  const [navItems, setNavItems] = useState<NavItemData[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const savedOrder = JSON.parse(saved) as string[];
        // Reorder defaultNavItems based on saved paths
        const reordered = savedOrder
          .map(path => defaultNavItems.find(item => item.path === path))
          .filter((item): item is NavItemData => item !== undefined);
        // Add any new items that weren't in saved order
        defaultNavItems.forEach(item => {
          if (!reordered.some(r => r.path === item.path)) {
            reordered.push(item);
          }
        });
        return reordered;
      }
    } catch (e) {
      console.error("Failed to load nav order:", e);
    }
    return defaultNavItems;
  });

  // Save order to localStorage when it changes
  useEffect(() => {
    const order = navItems.map(item => item.path);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }, [navItems]);

  const moveItem = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= navItems.length) return;
    
    const newItems = [...navItems];
    [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];
    setNavItems(newItems);
  };

  const isActive = (path: string) => location.pathname === path;

  const handleNavClick = () => {
    if (mobileOpen) {
      onMobileOpenChange(false);
    }
  };

  const NavItem = ({ icon: Icon, label, path, index }: { icon: any; label: string; path: string; index: number }) => {
    const content = (
      <div className="group relative flex items-center">
        <Link
          to={path}
          onClick={handleNavClick}
          className={cn(
            "flex-1 flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
            collapsed && !mobileOpen ? "justify-center px-2" : "",
            isActive(path)
              ? "sidebar-active"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          )}
        >
          <Icon className="w-5 h-5 flex-shrink-0" />
          {(!collapsed || mobileOpen) && <span>{label}</span>}
        </Link>
        
        {/* Move buttons - only show when not collapsed */}
        {(!collapsed || mobileOpen) && (
          <div className="absolute right-1 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                moveItem(index, "up");
              }}
              disabled={index === 0}
              className={cn(
                "p-0.5 rounded hover:bg-secondary transition-colors",
                index === 0 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
              )}
              title="Move up"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                moveItem(index, "down");
              }}
              disabled={index === navItems.length - 1}
              className={cn(
                "p-0.5 rounded hover:bg-secondary transition-colors",
                index === navItems.length - 1 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
              )}
              title="Move down"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );

    if (collapsed && !mobileOpen) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={path}
              onClick={handleNavClick}
              className={cn(
                "flex items-center justify-center px-2 py-3 rounded-lg text-sm font-medium transition-all",
                isActive(path)
                  ? "sidebar-active"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
            </Link>
          </TooltipTrigger>
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
        data-sidebar="true"
        onKeyDown={handleSidebarKeyDown}
        className={cn(
          "fixed left-0 top-0 z-50 h-screen border-r border-border flex flex-col transition-all duration-300 overflow-hidden",
          // Desktop sizing
          collapsed ? "w-16" : "w-64",
          // Mobile: hidden by default, shown when mobileOpen
          "max-md:-translate-x-full",
          mobileOpen && "max-md:translate-x-0 max-md:w-64"
        )}
      >
        {/* Space Background with Fade */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30 dark:opacity-40"
          style={{ backgroundImage: `url(${spaceBg})` }}
        />
        {/* Gradient overlay for fading effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-card/95 via-card/80 to-card/95" />
        {/* Additional overlay for better text contrast */}
        <div className="absolute inset-0 bg-card/60" />
        {/* Header */}
        <div className={cn("relative z-10 p-4 border-b border-border/50 flex items-center", collapsed && !mobileOpen ? "justify-center" : "justify-between")}>
          <Link to="/" className="flex items-center gap-3" onClick={handleNavClick}>
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0 shadow-star-md">
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
        <div className="relative z-10 p-3">
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
        <ScrollArea className="relative z-10 flex-1 px-2 py-2">
          <nav>
            <ul className="space-y-1">
              {navItems.map((item, index) => (
                <li key={item.path}>
                  <NavItem {...item} index={index} />
                </li>
              ))}
            </ul>
          </nav>
        </ScrollArea>

        {/* Bottom Actions */}
        <div className="relative z-10 p-2 border-t border-border/50 space-y-1">
          {/* Real-Debrid Status Indicator */}
          {collapsed && !mobileOpen ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={refreshRdStatus}
                  disabled={rdStatus === "loading"}
                  className={cn(
                    "flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors hover:bg-secondary/50",
                    rdStatus === "connected" && "text-green-500",
                    rdStatus === "disconnected" && "text-yellow-500",
                    rdStatus === "error" && "text-destructive",
                    rdStatus === "loading" && "text-muted-foreground"
                  )}
                >
                  {rdStatus === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
                  {rdStatus === "connected" && <Cloud className="w-4 h-4" />}
                  {rdStatus === "disconnected" && <CloudOff className="w-4 h-4" />}
                  {rdStatus === "error" && <AlertCircle className="w-4 h-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {rdStatus === "loading" && "Checking Real-Debrid..."}
                {rdStatus === "connected" && `Real-Debrid: ${rdUser?.username || "Connected"} (Click to refresh)`}
                {rdStatus === "disconnected" && "Real-Debrid: No Premium (Click to refresh)"}
                {rdStatus === "error" && "Real-Debrid: Connection Error (Click to retry)"}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={refreshRdStatus}
              disabled={rdStatus === "loading"}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-4 py-2 rounded-lg text-xs font-medium transition-colors",
                rdStatus === "connected" && "text-green-500 bg-green-500/10 hover:bg-green-500/20",
                rdStatus === "disconnected" && "text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20",
                rdStatus === "error" && "text-destructive bg-destructive/10 hover:bg-destructive/20",
                rdStatus === "loading" && "text-muted-foreground bg-secondary/50"
              )}
            >
              <div className="flex items-center gap-3">
                {rdStatus === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
                {rdStatus === "connected" && <Cloud className="w-4 h-4" />}
                {rdStatus === "disconnected" && <CloudOff className="w-4 h-4" />}
                {rdStatus === "error" && <AlertCircle className="w-4 h-4" />}
                <span>
                  {rdStatus === "loading" && "Checking RD..."}
                  {rdStatus === "connected" && `RD: ${rdUser?.username || "Connected"}`}
                  {rdStatus === "disconnected" && "RD: No Premium"}
                  {rdStatus === "error" && "RD: Error"}
                </span>
              </div>
              {rdStatus !== "loading" && (
                <span className="text-[10px] opacity-60">Refresh</span>
              )}
            </button>
          )}
          
          {/* Settings - not reorderable */}
          {collapsed && !mobileOpen ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/settings"
                  onClick={handleNavClick}
                  className={cn(
                    "flex items-center justify-center px-2 py-3 rounded-lg text-sm font-medium transition-all",
                    isActive("/settings")
                      ? "sidebar-active"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  <Settings className="w-5 h-5 flex-shrink-0" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
          ) : (
            <Link
              to="/settings"
              onClick={handleNavClick}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                isActive("/settings")
                  ? "sidebar-active"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <Settings className="w-5 h-5 flex-shrink-0" />
              <span>Settings</span>
            </Link>
          )}
          
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