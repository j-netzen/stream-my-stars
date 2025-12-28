import { useCallback, useEffect, useState } from "react";
import { getRealDebridUser } from "@/lib/realDebrid";
import {
  getRealDebridState,
  setRealDebridState,
  subscribeRealDebridState,
  type RealDebridStatus,
  type RealDebridState,
} from "@/lib/realDebridStatusStore";

export type { RealDebridStatus };
export type { RealDebridState };

export function useRealDebridStatus() {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    return subscribeRealDebridState(() => forceUpdate({}));
  }, []);

  const checkStatus = useCallback(async () => {
    setRealDebridState({ status: "loading", error: null });

    try {
      const userData = await getRealDebridUser();
      const isPremium = userData.premium > 0;

      setRealDebridState({
        status: isPremium ? "connected" : "disconnected",
        user: userData,
        error: null,
        lastChecked: new Date(),
        failureCount: 0,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Connection failed";
      const isServiceUnavailable =
        errorMessage.includes("overloaded") ||
        errorMessage.includes("503") ||
        errorMessage.includes("service_unavailable");

      setRealDebridState({
        status: isServiceUnavailable ? "service_unavailable" : "error",
        user: null,
        error: errorMessage,
        lastChecked: new Date(),
        failureCount: getRealDebridState().failureCount + 1,
      });
    }
  }, []);

  useEffect(() => {
    const current = getRealDebridState();
    const timeSinceLastCheck = current.lastChecked
      ? Date.now() - current.lastChecked.getTime()
      : Infinity;

    if (timeSinceLastCheck > 60_000) {
      checkStatus();
    }

    const interval = setInterval(checkStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const current = getRealDebridState();

  return {
    status: current.status,
    user: current.user,
    error: current.error,
    failureCount: current.failureCount,
    lastChecked: current.lastChecked,
    refresh: checkStatus,
    isServiceAvailable: current.status !== "service_unavailable" && current.status !== "error",
  };
}
