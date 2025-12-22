import { ReactNode, useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar, MobileMenuTrigger } from "./Sidebar";
import { AddMediaDialog } from "@/components/media/AddMediaDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTVMode } from "@/hooks/useTVMode";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { user, loading } = useAuth();
  const { isTVMode } = useTVMode();
  const [isAddMediaOpen, setIsAddMediaOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global keyboard navigation for TV mode
  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isTVMode) return;
    
    // Don't interfere with inputs
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement
    ) {
      return;
    }

    // Escape key to focus sidebar
    if (e.key === "Escape") {
      const sidebar = document.querySelector('[data-sidebar="true"]');
      const firstLink = sidebar?.querySelector('a[href]') as HTMLElement;
      if (firstLink) {
        e.preventDefault();
        firstLink.focus();
      }
      return;
    }

    // ArrowLeft from main content to go to sidebar
    if (e.key === "ArrowLeft") {
      const mainContent = document.querySelector('main');
      const isInMain = mainContent?.contains(activeElement);
      
      if (isInMain) {
        // Check if we're at the leftmost column
        const focusableInMain = Array.from(
          mainContent?.querySelectorAll<HTMLElement>('[tabindex="0"], button:not([disabled]), a[href]') || []
        ).filter(el => el.offsetParent !== null);
        
        const currentIndex = focusableInMain.findIndex(el => el === activeElement);
        
        // Simple heuristic: if current element is near the left edge
        if (activeElement instanceof HTMLElement) {
          const rect = activeElement.getBoundingClientRect();
          const mainRect = mainContent?.getBoundingClientRect();
          if (mainRect && rect.left < mainRect.left + 200) {
            // Close to left edge, move to sidebar
            const sidebar = document.querySelector('[data-sidebar="true"]');
            const sidebarLinks = sidebar?.querySelectorAll<HTMLElement>('a[href]');
            const activeRoute = window.location.pathname;
            
            // Focus the currently active nav item or first link
            let targetLink: HTMLElement | null = null;
            sidebarLinks?.forEach(link => {
              if (link.getAttribute('href') === activeRoute) {
                targetLink = link;
              }
            });
            
            if (targetLink) {
              e.preventDefault();
              targetLink.focus();
            } else if (sidebarLinks && sidebarLinks.length > 0) {
              e.preventDefault();
              sidebarLinks[0].focus();
            }
          }
        }
      }
    }
  }, [isTVMode]);

  useEffect(() => {
    if (!isTVMode) return;
    
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isTVMode, handleGlobalKeyDown]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        onAddMedia={() => setIsAddMediaOpen(true)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onMobileOpenChange={setMobileMenuOpen}
      />
      
      {/* Top bar with mobile menu trigger and theme toggle - respects safe area */}
      <div 
        className="fixed right-0 left-0 md:left-auto z-30 flex items-center justify-between md:justify-end px-4 h-14 bg-background/80 backdrop-blur-sm border-b md:border-0 fixed-safe-top safe-x"
        style={{ top: 'var(--safe-area-inset-top, 0px)' }}
      >
        <MobileMenuTrigger onClick={() => setMobileMenuOpen(true)} />
        <ThemeToggle />
      </div>
      
      <main
        className={cn(
          "min-h-screen transition-all duration-300 safe-bottom",
          // Desktop: offset by sidebar width
          sidebarCollapsed ? "md:ml-16" : "md:ml-64",
          // Mobile: no offset, add top padding for menu button + safe area
          "ml-0 pt-16 md:pt-0"
        )}
        style={{ 
          paddingTop: 'calc(4rem + var(--safe-area-inset-top, 0px))',
        }}
      >
        {children}
      </main>
      
      <AddMediaDialog open={isAddMediaOpen} onOpenChange={setIsAddMediaOpen} />
    </div>
  );
}