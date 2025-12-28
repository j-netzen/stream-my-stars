import type { RealDebridUser } from "@/lib/realDebrid";

export type RealDebridStatus =
  | "connected"
  | "disconnected"
  | "loading"
  | "error"
  | "service_unavailable";

export interface RealDebridState {
  status: RealDebridStatus;
  user: RealDebridUser | null;
  error: string | null;
  lastChecked: Date | null;
  failureCount: number;
}

let state: RealDebridState = {
  status: "loading",
  user: null,
  error: null,
  lastChecked: null,
  failureCount: 0,
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function getRealDebridState(): RealDebridState {
  return state;
}

export function subscribeRealDebridState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setRealDebridState(patch: Partial<RealDebridState>) {
  state = { ...state, ...patch };
  notify();
}

export function setRealDebridServiceUnavailable(message: string) {
  // Avoid overwriting a fresh successful status update with an old error
  state = {
    ...state,
    status: "service_unavailable",
    error: message,
    failureCount: state.failureCount + 1,
    lastChecked: new Date(),
  };
  notify();
}

export function clearRealDebridServiceUnavailable() {
  if (state.status !== "service_unavailable") return;
  state = {
    ...state,
    status: state.user ? "connected" : "disconnected",
    error: null,
    failureCount: 0,
  };
  notify();
}
