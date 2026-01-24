import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTorBoxStatus } from "@/hooks/useTorBoxStatus";
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
  Box,
  ServerCrash,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  { icon: FolderOpen, label: "Networks", path: "/networks" },
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
  const { status: tbStatus, user: tbUser, refresh: refreshTbStatus } = useTorBoxStatus();
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
            "flex-1 flex items-center gap-2 rounded-lg text-sm font-medium transition-all",
            // TV Mode: dense touch targets (44-48px height)
            isTVMode 
              ? "px-3 py-2.5 min-h-[44px] text-sm" 
              : "px-4 py-3",
            collapsed && !mobileOpen ? "justify-center px-2" : "",
            isActive(path)
              ? "sidebar-active"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          )}
        >
          <Icon className={cn(
            "flex-shrink-0",
            isTVMode ? "w-5 h-5" : "w-5 h-5"
          )} />
          {(!collapsed || mobileOpen) && <span>{label}</span>}
        </Link>
        
        {/* Move buttons - only show when not collapsed and not in TV mode */}
        {(!collapsed || mobileOpen) && !isTVMode && (
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
                "p-0.5 rounded hover:bg-secondary transition-colors tv-inline-link",
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
                "p-0.5 rounded hover:bg-secondary transition-colors tv-inline-link",
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
                "flex items-center justify-center rounded-lg text-sm font-medium transition-all",
                isTVMode ? "px-2 py-2.5 min-h-[44px]" : "px-2 py-3",
                isActive(path)
                  ? "sidebar-active"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <Icon className={cn(
                "flex-shrink-0",
                isTVMode ? "w-5 h-5" : "w-5 h-5"
              )} />
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
          // Desktop sizing - reduced width in TV mode (~240px vs original ~288px)
          isTVMode 
            ? (collapsed ? "w-14" : "w-60")
            : (collapsed ? "w-16" : "w-64"),
          // Mobile: hidden by default, shown when mobileOpen
          "max-md:-translate-x-full",
          mobileOpen && "max-md:translate-x-0 max-md:w-64",
          isTVMode && mobileOpen && "max-md:w-60"
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
        <div className="relative z-10 p-2">
          {collapsed && !mobileOpen ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onAddMedia}
                  className="w-full bg-primary hover:bg-primary/90"
                  size="sm"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Add Media</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              onClick={onAddMedia}
              className="w-full gap-1.5 bg-primary hover:bg-primary/90"
              size="sm"
            >
              <Plus className="w-3 h-3" />
              Add Media
            </Button>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className={cn(
          "relative z-10 flex-1 px-2 py-2",
          isTVMode && "px-2 py-1.5"
        )}>
          <nav>
            <ul className={cn("space-y-1", isTVMode && "space-y-0.5")}>
              {navItems.map((item, index) => (
                <li key={item.path}>
                  <NavItem {...item} index={index} />
                </li>
              ))}
            </ul>
          </nav>
        </ScrollArea>

        {/* Bottom Actions */}
        <div className={cn(
          "relative z-10 p-2 border-t border-border/50 space-y-1",
          isTVMode && "p-2 space-y-0.5"
        )}>
          {/* TorBox Status Indicator with Badge */}
          {collapsed && !mobileOpen ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={refreshTbStatus}
                  disabled={tbStatus === "loading"}
                  className={cn(
                    "w-full flex items-center justify-center rounded-lg transition-colors hover:bg-secondary/50",
                    isTVMode ? "px-2 py-2.5 min-h-[44px]" : "px-2 py-2"
                  )}
                >
                  <div className="relative">
                    {tbStatus === "loading" && <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />}
                    {tbStatus === "connected" && <Box className="w-5 h-5 text-blue-500" />}
                    {tbStatus === "disconnected" && <CloudOff className="w-5 h-5 text-yellow-500" />}
                    {tbStatus === "error" && <AlertCircle className="w-5 h-5 text-destructive" />}
                    {tbStatus === "service_unavailable" && <ServerCrash className="w-5 h-5 text-orange-500" />}
                    {/* Status dot */}
                    {tbStatus !== "loading" && (
                      <span className={cn(
                        "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-card",
                        tbStatus === "connected" && "bg-green-500",
                        tbStatus === "disconnected" && "bg-yellow-500",
                        tbStatus === "error" && "bg-destructive",
                        tbStatus === "service_unavailable" && "bg-orange-500"
                      )} />
                    )}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px]">
                {tbStatus === "loading" && "Checking TorBox..."}
                {tbStatus === "connected" && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span className="font-medium">TorBox Connected</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{tbUser?.email}</p>
                  </div>
                )}
                {tbStatus === "disconnected" && "TorBox: Not Subscribed"}
                {tbStatus === "error" && "TorBox: Connection Error"}
                {tbStatus === "service_unavailable" && "TorBox: Servers Busy"}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={refreshTbStatus}
              disabled={tbStatus === "loading"}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg font-medium transition-colors",
                isTVMode ? "px-3 py-2 min-h-[40px]" : "px-3 py-2",
                "bg-secondary/30 hover:bg-secondary/50"
              )}
            >
              <div className="relative">
                {tbStatus === "loading" && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
                {tbStatus === "connected" && <Box className="w-4 h-4 text-blue-500" />}
                {tbStatus === "disconnected" && <CloudOff className="w-4 h-4 text-yellow-500" />}
                {tbStatus === "error" && <AlertCircle className="w-4 h-4 text-destructive" />}
                {tbStatus === "service_unavailable" && <ServerCrash className="w-4 h-4 text-orange-500" />}
              </div>
              <div className="flex-1 flex items-center justify-between min-w-0">
                <span className={cn("truncate", isTVMode ? "text-xs" : "text-xs")}>
                  {tbStatus === "loading" && "Checking..."}
                  {tbStatus === "connected" && (tbUser?.email?.split('@')[0] || "Connected")}
                  {tbStatus === "disconnected" && "Not Subscribed"}
                  {tbStatus === "error" && "Error"}
                  {tbStatus === "service_unavailable" && "Servers Busy"}
                </span>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-4 flex-shrink-0",
                    tbStatus === "connected" && "border-green-500/50 text-green-500 bg-green-500/10",
                    tbStatus === "disconnected" && "border-yellow-500/50 text-yellow-500 bg-yellow-500/10",
                    tbStatus === "error" && "border-destructive/50 text-destructive bg-destructive/10",
                    tbStatus === "service_unavailable" && "border-orange-500/50 text-orange-500 bg-orange-500/10",
                    tbStatus === "loading" && "border-muted-foreground/50 text-muted-foreground"
                  )}
                >
                  {tbStatus === "loading" && "..."}
                  {tbStatus === "connected" && "OK"}
                  {tbStatus === "disconnected" && "FREE"}
                  {tbStatus === "error" && "ERR"}
                  {tbStatus === "service_unavailable" && "BUSY"}
                </Badge>
              </div>
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
                    "flex items-center justify-center rounded-lg text-sm font-medium transition-all",
                    isTVMode ? "px-2 py-2.5 min-h-[44px]" : "px-2 py-3",
                    isActive("/settings")
                      ? "sidebar-active"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  <Settings className={cn("flex-shrink-0", isTVMode ? "w-5 h-5" : "w-5 h-5")} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
          ) : (
            <Link
              to="/settings"
              onClick={handleNavClick}
              className={cn(
                "flex items-center gap-2 rounded-lg font-medium transition-all",
                isTVMode ? "px-3 py-2.5 min-h-[44px] text-sm" : "px-4 py-3 text-sm",
                isActive("/settings")
                  ? "sidebar-active"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <Settings className={cn("flex-shrink-0", isTVMode ? "w-5 h-5" : "w-5 h-5")} />
              <span>Settings</span>
            </Link>
          )}
          
          {collapsed && !mobileOpen ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className={cn(
                    "w-full flex items-center justify-center rounded-lg font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all",
                    isTVMode ? "px-2 py-2.5 min-h-[44px] text-sm" : "px-2 py-3 text-sm"
                  )}
                >
                  <LogOut className={cn(isTVMode ? "w-5 h-5" : "w-5 h-5")} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign Out</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={signOut}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all",
                isTVMode ? "px-3 py-2.5 min-h-[44px] text-sm" : "px-4 py-3 text-sm"
              )}
            >
              <LogOut className={cn(isTVMode ? "w-5 h-5" : "w-5 h-5")} />
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