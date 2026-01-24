import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Box, ExternalLink, Key, CheckCircle, Loader2, Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TorBoxPairingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isTVMode?: boolean;
}

export function TorBoxPairingDialog({ open, onOpenChange, isTVMode = false }: TorBoxPairingDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showKey, setShowKey] = useState(false);

  const handleCopyInstructions = () => {
    navigator.clipboard.writeText("https://torbox.app/settings");
    toast.success("URL copied to clipboard");
  };

  const handleOpenTorBox = () => {
    window.open("https://torbox.app/settings", "_blank", "noopener,noreferrer");
    setStep(2);
  };

  const handleClose = () => {
    setStep(1);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn("max-w-md", isTVMode && "max-w-lg")}>
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2", isTVMode && "text-2xl")}>
            <Box className="w-6 h-6 text-blue-500" />
            Connect TorBox
          </DialogTitle>
          <DialogDescription className={isTVMode ? "text-base" : ""}>
            Link your TorBox account for premium streaming
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Step Indicators */}
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors",
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {step > s ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
            ))}
          </div>

          {/* Step 1: Get API Key */}
          {step === 1 && (
            <div className="space-y-4">
              <div className={cn(
                "p-4 rounded-lg bg-blue-500/10 border border-blue-500/20"
              )}>
                <h3 className={cn("font-medium mb-2", isTVMode && "text-lg")}>
                  Step 1: Get Your API Key
                </h3>
                <p className={cn("text-muted-foreground mb-4", isTVMode ? "text-base" : "text-sm")}>
                  Visit your TorBox settings page to find or create an API key.
                </p>
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleOpenTorBox}
                    className="flex-1 gap-2"
                    size={isTVMode ? "lg" : "default"}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open TorBox Settings
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyInstructions}
                    className={isTVMode ? "h-12 w-12" : ""}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className={cn(
                "p-3 rounded-lg bg-secondary/30 text-muted-foreground",
                isTVMode ? "text-sm" : "text-xs"
              )}>
                <p className="font-medium text-foreground mb-1">Don't have an account?</p>
                <p>
                  Sign up at{" "}
                  <a
                    href="https://torbox.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    torbox.app
                  </a>
                  {" "}to get started with premium debrid streaming.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Copy API Key */}
          {step === 2 && (
            <div className="space-y-4">
              <div className={cn(
                "p-4 rounded-lg bg-blue-500/10 border border-blue-500/20"
              )}>
                <h3 className={cn("font-medium mb-2", isTVMode && "text-lg")}>
                  Step 2: Copy Your API Key
                </h3>
                <p className={cn("text-muted-foreground mb-4", isTVMode ? "text-base" : "text-sm")}>
                  In TorBox settings, find the <strong>"API Key"</strong> section and copy your key.
                </p>
                
                <div className={cn(
                  "p-3 rounded bg-secondary/50 text-sm font-mono",
                  isTVMode && "text-base p-4"
                )}>
                  <p className="text-muted-foreground">Your API key looks like:</p>
                  <p className="mt-1">
                    {showKey ? "abc123...xyz789" : "••••••••••••••••"}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 h-6"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  size={isTVMode ? "lg" : "default"}
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  className="flex-1 gap-2"
                  size={isTVMode ? "lg" : "default"}
                >
                  I've Copied My Key
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Configure in Cloud */}
          {step === 3 && (
            <div className="space-y-4">
              <div className={cn(
                "p-4 rounded-lg bg-green-500/10 border border-green-500/20"
              )}>
                <h3 className={cn("font-medium mb-2 flex items-center gap-2", isTVMode && "text-lg")}>
                  <Key className="w-4 h-4 text-green-500" />
                  Step 3: Add to Secrets
                </h3>
                <p className={cn("text-muted-foreground mb-4", isTVMode ? "text-base" : "text-sm")}>
                  Add your API key as a secret named <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">TORBOX_API_KEY</code> in your Lovable Cloud settings.
                </p>
                
                <div className={cn(
                  "p-3 rounded bg-secondary/50",
                  isTVMode ? "text-base" : "text-sm"
                )}>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Go to <strong className="text-foreground">Settings → Secrets</strong> in Lovable</li>
                    <li>Add a new secret: <code className="bg-secondary px-1 rounded">TORBOX_API_KEY</code></li>
                    <li>Paste your TorBox API key as the value</li>
                    <li>Save and refresh this page</li>
                  </ol>
                </div>
              </div>

              <Badge 
                variant="outline" 
                className={cn(
                  "w-full justify-center py-2 text-center",
                  isTVMode && "text-base py-3"
                )}
              >
                <Key className="w-3 h-3 mr-1" />
                Secret Name: TORBOX_API_KEY
              </Badge>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  size={isTVMode ? "lg" : "default"}
                >
                  Back
                </Button>
                <Button
                  onClick={() => {
                    handleClose();
                    toast.success("After adding the secret, refresh the page to connect");
                  }}
                  className="flex-1"
                  size={isTVMode ? "lg" : "default"}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
