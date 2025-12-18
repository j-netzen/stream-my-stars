import { ReactNode, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "./Sidebar";
import { AddMediaDialog } from "@/components/media/AddMediaDialog";
import { Loader2 } from "lucide-react";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { user, loading } = useAuth();
  const [isAddMediaOpen, setIsAddMediaOpen] = useState(false);

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
      <Sidebar onAddMedia={() => setIsAddMediaOpen(true)} />
      <main className="ml-64 min-h-screen">
        {children}
      </main>
      <AddMediaDialog open={isAddMediaOpen} onOpenChange={setIsAddMediaOpen} />
    </div>
  );
}
