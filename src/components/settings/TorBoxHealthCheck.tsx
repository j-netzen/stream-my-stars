import { useState, useCallback } from "react";
import { Activity, CheckCircle, XCircle, Loader2, RefreshCw, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unavailable" | "unknown";
  latency: number | null;
  message: string;
  lastChecked: Date;
}

interface TorBoxHealthCheckProps {
  isTVMode?: boolean;
}

export function TorBoxHealthCheck({ isTVMode = false }: TorBoxHealthCheckProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<HealthCheckResult | null>(null);

  const classifyError = (errorMsg: string): { type: string; userMessage: string } => {
    const msg = errorMsg.toLowerCase();
    
    if (msg.includes("502") || msg.includes("504") || msg.includes("tls") || 
        msg.includes("handshake") || msg.includes("eof") || msg.includes("connection") ||
        msg.includes("non-2xx") || msg.includes("failed to fetch") || msg.includes("network")) {
      return { 
        type: "transient", 
        userMessage: "Connection issue - try again in a moment" 
      };
    }
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("invalid api")) {
      return { 
        type: "auth", 
        userMessage: "Invalid API key - check your settings" 
      };
    }
    if (msg.includes("503") || msg.includes("overloaded") || msg.includes("service")) {
      return { 
        type: "service", 
        userMessage: "TorBox servers are busy" 
      };
    }
    if (msg.includes("api_key") || msg.includes("missing") || msg.includes("not configured")) {
      return { 
        type: "config", 
        userMessage: "API key not configured" 
      };
    }
    return { 
      type: "unknown", 
      userMessage: errorMsg.substring(0, 50) 
    };
  };

  const runHealthCheck = useCallback(async () => {
    setIsChecking(true);
    const startTime = performance.now();

    try {
      const { data, error } = await supabase.functions.invoke("torbox", {
        body: { action: "user" },
      });

      const latency = Math.round(performance.now() - startTime);

      if (error) {
        const errorMsg = error.message || "";
        const { type, userMessage } = classifyError(errorMsg);
        
        setResult({
          status: type === "transient" ? "unavailable" : "degraded",
          latency: null,
          message: userMessage,
          lastChecked: new Date(),
        });
        return;
      }

      if (data?.error) {
        const { userMessage } = classifyError(String(data.error));
        setResult({
          status: "degraded",
          latency,
          message: userMessage,
          lastChecked: new Date(),
        });
        return;
      }

      const status: HealthCheckResult["status"] = latency < 2000 ? "healthy" : "degraded";
      
      setResult({
        status,
        latency,
        message: status === "healthy" 
          ? `API responsive (${latency}ms)` 
          : `High latency detected (${latency}ms)`,
        lastChecked: new Date(),
      });
    } catch (err) {
      const { userMessage } = classifyError(String(err));
      setResult({
        status: "unavailable",
        latency: null,
        message: userMessage,
        lastChecked: new Date(),
      });
    } finally {
      setIsChecking(false);
    }
  }, []);

  const getStatusColor = (status: HealthCheckResult["status"]) => {
    switch (status) {
      case "healthy":
        return "bg-green-500/20 text-green-500 border-green-500/30";
      case "degraded":
        return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
      case "unavailable":
        return "bg-red-500/20 text-red-500 border-red-500/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusIcon = (status: HealthCheckResult["status"]) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "degraded":
        return <Activity className="w-4 h-4 text-yellow-500" />;
      case "unavailable":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Wifi className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className={cn("text-muted-foreground", isTVMode ? "w-5 h-5" : "w-4 h-4")} />
          <span className={cn("font-medium", isTVMode && "text-lg")}>API Health Check</span>
        </div>
        <Button
          variant="outline"
          size={isTVMode ? "default" : "sm"}
          onClick={runHealthCheck}
          disabled={isChecking}
        >
          {isChecking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span className="ml-2">{isChecking ? "Checking..." : "Check"}</span>
        </Button>
      </div>

      {result && (
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg border",
          getStatusColor(result.status)
        )}>
          <div className="flex items-center gap-3">
            {getStatusIcon(result.status)}
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn("text-xs", getStatusColor(result.status))}>
                  {result.status.toUpperCase()}
                </Badge>
                {result.latency !== null && (
                  <span className={cn("font-mono", isTVMode ? "text-sm" : "text-xs")}>
                    {result.latency}ms
                  </span>
                )}
              </div>
              <p className={cn("text-muted-foreground mt-1", isTVMode ? "text-sm" : "text-xs")}>
                {result.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {!result && (
        <p className={cn("text-muted-foreground", isTVMode ? "text-sm" : "text-xs")}>
          Run a health check to test TorBox API connectivity and latency.
        </p>
      )}
    </div>
  );
}
