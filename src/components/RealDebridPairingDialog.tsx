import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Check, ExternalLink, XCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  requestDeviceCode,
  pollDeviceCredentials,
  exchangeForTokens,
  storeTokens,
  PendingAuthorizationError,
  ExpiredCodeError,
  UsedCodeError,
  type PairingState,
  type PairingStatus,
} from "@/lib/realDebridOAuth";

interface RealDebridPairingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  isTVMode?: boolean;
}

export function RealDebridPairingDialog({
  open,
  onOpenChange,
  onSuccess,
  isTVMode = false,
}: RealDebridPairingDialogProps) {
  const [state, setState] = useState<PairingState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const deviceCodeRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPairing = useCallback(async () => {
    setState({ status: "requesting_code" });
    stopPolling();

    try {
      const codeResponse = await requestDeviceCode();
      
      deviceCodeRef.current = codeResponse.device_code;
      
      setState({
        status: "awaiting_authorization",
        userCode: codeResponse.user_code,
        verificationUrl: codeResponse.verification_url,
        deviceCode: codeResponse.device_code,
        interval: codeResponse.interval,
      });

      // Start polling
      const pollInterval = (codeResponse.interval || 5) * 1000;
      
      pollingRef.current = setInterval(async () => {
        if (!deviceCodeRef.current) return;

        try {
          const credentials = await pollDeviceCredentials(deviceCodeRef.current);
          
          // Success! Stop polling and exchange for tokens
          stopPolling();
          setState((prev) => ({ ...prev, status: "exchanging_tokens" }));

          const tokens = await exchangeForTokens(
            credentials.client_id,
            credentials.client_secret,
            deviceCodeRef.current!
          );

          storeTokens(tokens, credentials.client_id, credentials.client_secret);
          
          setState({ status: "success" });
          toast.success("Real-Debrid connected successfully!");
          
          // Delay before closing to show success state
          setTimeout(() => {
            onSuccess();
            onOpenChange(false);
          }, 1500);
        } catch (error) {
          if (error instanceof PendingAuthorizationError) {
            // Still waiting for user - continue polling
            return;
          }

          stopPolling();

          if (error instanceof ExpiredCodeError) {
            setState({ status: "expired", error: "The pairing code has expired. Please try again." });
          } else if (error instanceof UsedCodeError) {
            setState({ status: "error", error: "This code has already been used. Please try again." });
          } else {
            setState({
              status: "error",
              error: error instanceof Error ? error.message : "An unexpected error occurred",
            });
          }
        }
      }, pollInterval);
    } catch (error) {
      setState({
        status: "error",
        error: error instanceof Error ? error.message : "Failed to start pairing",
      });
    }
  }, [stopPolling, onSuccess, onOpenChange]);

  // Start pairing when dialog opens
  useEffect(() => {
    if (open && state.status === "idle") {
      startPairing();
    }
    
    return () => {
      stopPolling();
    };
  }, [open, state.status, startPairing, stopPolling]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      stopPolling();
      deviceCodeRef.current = null;
      setState({ status: "idle" });
    }
  }, [open, stopPolling]);

  const handleCopyCode = async () => {
    if (state.userCode) {
      await navigator.clipboard.writeText(state.userCode);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCancel = () => {
    stopPolling();
    setState({ status: "cancelled" });
    onOpenChange(false);
  };

  const handleRetry = () => {
    setState({ status: "idle" });
    startPairing();
  };

  const renderContent = () => {
    switch (state.status) {
      case "idle":
      case "requesting_code":
        return (
          <div className="flex flex-col items-center py-8">
            <Loader2 className={cn("animate-spin text-primary", isTVMode ? "w-12 h-12" : "w-8 h-8")} />
            <p className={cn("mt-4 text-muted-foreground", isTVMode && "text-lg")}>
              Requesting pairing code...
            </p>
          </div>
        );

      case "awaiting_authorization":
        return (
          <div className="flex flex-col items-center space-y-6 py-4">
            {/* User Code Display */}
            <div className="text-center space-y-2">
              <p className={cn("text-muted-foreground", isTVMode ? "text-lg" : "text-sm")}>
                Enter this code on Real-Debrid:
              </p>
              <div 
                className={cn(
                  "font-mono font-bold tracking-[0.3em] bg-secondary/50 px-6 py-4 rounded-lg border-2 border-primary/30 cursor-pointer hover:border-primary/50 transition-colors",
                  isTVMode ? "text-4xl" : "text-3xl"
                )}
                onClick={handleCopyCode}
                title="Click to copy"
              >
                {state.userCode}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyCode}
                className="gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy code
                  </>
                )}
              </Button>
            </div>

            {/* Instructions */}
            <div className="text-center space-y-3">
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                Go to:
              </p>
              <a
                href="https://real-debrid.com/device"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center gap-2 font-medium text-primary hover:underline",
                  isTVMode ? "text-xl" : "text-lg"
                )}
              >
                real-debrid.com/device
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* Loading indicator */}
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className={cn(isTVMode ? "text-base" : "text-sm")}>
                Waiting for authorization...
              </span>
            </div>

            {/* Cancel Button */}
            <Button
              variant="outline"
              onClick={handleCancel}
              size={isTVMode ? "lg" : "default"}
            >
              Cancel
            </Button>
          </div>
        );

      case "exchanging_tokens":
        return (
          <div className="flex flex-col items-center py-8">
            <Loader2 className={cn("animate-spin text-primary", isTVMode ? "w-12 h-12" : "w-8 h-8")} />
            <p className={cn("mt-4 text-muted-foreground", isTVMode && "text-lg")}>
              Completing authorization...
            </p>
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center py-8 space-y-4">
            <div className={cn(
              "rounded-full bg-green-500/20 p-4",
              isTVMode && "p-6"
            )}>
              <Check className={cn("text-green-500", isTVMode ? "w-12 h-12" : "w-8 h-8")} />
            </div>
            <div className="text-center">
              <p className={cn("font-semibold text-green-500", isTVMode ? "text-xl" : "text-lg")}>
                Connected Successfully!
              </p>
              <p className={cn("text-muted-foreground mt-1", isTVMode && "text-base")}>
                Real-Debrid is now linked to your account.
              </p>
            </div>
          </div>
        );

      case "expired":
      case "error":
        return (
          <div className="flex flex-col items-center py-8 space-y-4">
            <div className={cn(
              "rounded-full bg-destructive/20 p-4",
              isTVMode && "p-6"
            )}>
              <XCircle className={cn("text-destructive", isTVMode ? "w-12 h-12" : "w-8 h-8")} />
            </div>
            <div className="text-center">
              <p className={cn("font-semibold text-destructive", isTVMode ? "text-xl" : "text-lg")}>
                {state.status === "expired" ? "Code Expired" : "Pairing Failed"}
              </p>
              <p className={cn("text-muted-foreground mt-1 max-w-sm", isTVMode && "text-base")}>
                {state.error}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                size={isTVMode ? "lg" : "default"}
              >
                Close
              </Button>
              <Button
                onClick={handleRetry}
                size={isTVMode ? "lg" : "default"}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md", isTVMode && "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2", isTVMode && "text-2xl")}>
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
              Real-Debrid
            </Badge>
            Device Authorization
          </DialogTitle>
          <DialogDescription className={cn(isTVMode && "text-base")}>
            Link your Real-Debrid account using the device pairing flow.
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
