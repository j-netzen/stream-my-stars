import { ReactNode, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar, MobileMenuTrigger } from "./Sidebar";
import { AddMediaDialog } from "@/components/media/AddMediaDialog";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { user, loading } = useAuth();
  const [isAddMediaOpen, setIsAddMediaOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      
      {/* Mobile menu trigger */}
      <MobileMenuTrigger onClick={() => setMobileMenuOpen(true)} />
      
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
    </div>
  );
}