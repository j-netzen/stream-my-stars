import { useState, useEffect, useCallback } from "react";
import { getRealDebridUser, RealDebridUser } from "@/lib/realDebrid";

export type RealDebridStatus = "connected" | "disconnected" | "loading" | "error" | "service_unavailable";

interface RealDebridState {
  status: RealDebridStatus;
  user: RealDebridUser | null;
  error: string | null;
  lastChecked: Date | null;
  failureCount: number;
}

// Shared state for tracking service availability across components
let sharedState: RealDebridState = {
  status: "loading",
  user: null,
  error: null,
  lastChecked: null,
  failureCount: 0,
};

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(listener => listener());
}

export function reportRealDebridFailure(error: string) {
  // Track 503/service unavailable errors
  if (error.includes("overloaded") || error.includes("503") || error.includes("service_unavailable")) {
    sharedState = {
      ...sharedState,
      status: "service_unavailable",
      error,
      failureCount: sharedState.failureCount + 1,
      lastChecked: new Date(),
    };
    notifyListeners();
  }
}

export function clearRealDebridFailure() {
  if (sharedState.status === "service_unavailable") {
    sharedState = {
      ...sharedState,
      status: sharedState.user ? "connected" : "disconnected",
      error: null,
      failureCount: 0,
    };
    notifyListeners();
  }
}

export function useRealDebridStatus() {
  const [, forceUpdate] = useState({});
  
  useEffect(() => {
    const listener = () => forceUpdate({});
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const checkStatus = useCallback(async () => {
    sharedState = { ...sharedState, status: "loading" };
    notifyListeners();
    
    try {
      const userData = await getRealDebridUser();
      const isPremium = userData.premium > 0;
      sharedState = {
        status: isPremium ? "connected" : "disconnected",
        user: userData,
        error: null,
        lastChecked: new Date(),
        failureCount: 0,
      };
      notifyListeners();
    } catch (err) {
      console.error("Real-Debrid status check failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Connection failed";
      const isServiceUnavailable = errorMessage.includes("overloaded") || errorMessage.includes("503");
      
      sharedState = {
        status: isServiceUnavailable ? "service_unavailable" : "error",
        user: null,
        error: errorMessage,
        lastChecked: new Date(),
        failureCount: sharedState.failureCount + 1,
      };
      notifyListeners();
    }
  }, []);

  useEffect(() => {
    // Only check on mount if we haven't checked recently
    const timeSinceLastCheck = sharedState.lastChecked 
      ? Date.now() - sharedState.lastChecked.getTime() 
      : Infinity;
    
    if (timeSinceLastCheck > 60000) { // 1 minute
      checkStatus();
    }
    
    // Re-check every 5 minutes
    const interval = setInterval(checkStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return { 
    status: sharedState.status, 
    user: sharedState.user, 
    error: sharedState.error,
    failureCount: sharedState.failureCount,
    lastChecked: sharedState.lastChecked,
    refresh: checkStatus,
    isServiceAvailable: sharedState.status !== "service_unavailable" && sharedState.status !== "error",
  };
}
