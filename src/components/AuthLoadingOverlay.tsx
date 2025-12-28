import { Loader2 } from "lucide-react";

interface AuthLoadingOverlayProps {
  message?: string;
}

export function AuthLoadingOverlay({ message = "Signing in..." }: AuthLoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card/50 border border-border/50 shadow-lg">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-lg font-medium text-foreground">{message}</p>
      </div>
    </div>
  );
}
