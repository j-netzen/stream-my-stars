import { ReactNode, useState, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar, MobileMenuTrigger } from "./Sidebar";
import { AddMediaDialog } from "@/components/media/AddMediaDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTVMode } from "@/hooks/useTVMode";
import { useTVNavigation } from "@/hooks/useTVNavigation";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { user, loading } = useAuth();
  const { isTVMode } = useTVMode();
  const [isAddMediaOpen, setIsAddMediaOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Initialize TV navigation system
  useTVNavigation();

  // Auto-focus first focusable element in main content on mount in TV mode
  useEffect(() => {
    if (!isTVMode || !mainRef.current) return;

    // Delay to ensure content is rendered
    const timer = setTimeout(() => {
      const firstFocusable = mainRef.current?.querySelector<HTMLElement>(
        '[tabindex="0"], button:not([disabled]), a[href]'
      );
      if (firstFocusable && !document.activeElement?.closest('[data-sidebar="true"]')) {
        firstFocusable.focus();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isTVMode]);

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
        ref={mainRef}
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