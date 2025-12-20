import { ReactNode, useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar, MobileMenuTrigger } from "./Sidebar";
import { AddMediaDialog } from "@/components/media/AddMediaDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FocusIndicator } from "@/components/FocusIndicator";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalRemoteNavigation } from "@/hooks/useRemoteNavigation";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { user, loading } = useAuth();
  const [isAddMediaOpen, setIsAddMediaOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Enable global arrow key navigation for TV remotes
  useGlobalRemoteNavigation();

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
      
      {/* Top bar with mobile menu trigger and theme toggle */}
      <div className="fixed top-0 right-0 left-0 md:left-auto z-30 flex items-center justify-between md:justify-end px-4 h-14 bg-background/80 backdrop-blur-sm border-b md:border-0">
        <MobileMenuTrigger onClick={() => setMobileMenuOpen(true)} />
        <ThemeToggle />
      </div>
      
      <main
        className={cn(
          "min-h-screen transition-all duration-300",
          // Desktop: offset by sidebar width
          sidebarCollapsed ? "md:ml-16" : "md:ml-64",
          // Mobile: no offset, add top padding for menu button
          "ml-0 pt-16 md:pt-0"
        )}
      >
        {children}
      </main>
      
      <AddMediaDialog open={isAddMediaOpen} onOpenChange={setIsAddMediaOpen} />
      
      {/* Focus indicator for TV remote navigation */}
      <FocusIndicator />
    </div>
  );
}