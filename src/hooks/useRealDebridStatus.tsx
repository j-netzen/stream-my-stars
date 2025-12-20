import { useState, useEffect } from "react";
import { getRealDebridUser, RealDebridUser } from "@/lib/realDebrid";

export type RealDebridStatus = "connected" | "disconnected" | "loading" | "error";

export function useRealDebridStatus() {
  const [status, setStatus] = useState<RealDebridStatus>("loading");
  const [user, setUser] = useState<RealDebridUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    setStatus("loading");
    setError(null);
    
    try {
      const userData = await getRealDebridUser();
      setUser(userData);
      
      // Check if premium is active
      const isPremium = userData.premium > 0;
      setStatus(isPremium ? "connected" : "disconnected");
    } catch (err) {
      console.error("Real-Debrid status check failed:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
      setStatus("error");
      setUser(null);
    }
  };

  useEffect(() => {
    checkStatus();
    
    // Re-check every 5 minutes
    const interval = setInterval(checkStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { status, user, error, refresh: checkStatus };
}
