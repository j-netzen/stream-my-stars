import { useCallback, useEffect, useState } from "react";
import { getTorBoxUser } from "@/lib/torbox";
import {
  getTorBoxState,
  setTorBoxState,
  subscribeTorBoxState,
  type TorBoxStatus,
  type TorBoxState,
} from "@/lib/torboxStatusStore";

export type { TorBoxStatus };
export type { TorBoxState };

export function useTorBoxStatus() {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    return subscribeTorBoxState(() => forceUpdate({}));
  }, []);

  const checkStatus = useCallback(async () => {
    setTorBoxState({ status: "loading", error: null });

    try {
      const userData = await getTorBoxUser();
      const isSubscribed = userData.is_subscribed;

      setTorBoxState({
        status: isSubscribed ? "connected" : "disconnected",
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

      setTorBoxState({
        status: isServiceUnavailable ? "service_unavailable" : "error",
        user: null,
        error: errorMessage,
        lastChecked: new Date(),
        failureCount: getTorBoxState().failureCount + 1,
      });
    }
  }, []);

  useEffect(() => {
    const current = getTorBoxState();
    const timeSinceLastCheck = current.lastChecked
      ? Date.now() - current.lastChecked.getTime()
      : Infinity;

    if (timeSinceLastCheck > 60_000) {
      checkStatus();
    }

    const interval = setInterval(checkStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const current = getTorBoxState();

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
