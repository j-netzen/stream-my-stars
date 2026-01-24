import type { TorBoxUser } from "@/lib/torbox";

export type TorBoxStatus =
  | "connected"
  | "disconnected"
  | "loading"
  | "error"
  | "service_unavailable";

export interface TorBoxState {
  status: TorBoxStatus;
  user: TorBoxUser | null;
  error: string | null;
  lastChecked: Date | null;
  failureCount: number;
}

let state: TorBoxState = {
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

export function getTorBoxState(): TorBoxState {
  return state;
}

export function subscribeTorBoxState(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setTorBoxState(patch: Partial<TorBoxState>) {
  state = { ...state, ...patch };
  notify();
}

export function setTorBoxServiceUnavailable(message: string) {
  state = {
    ...state,
    status: "service_unavailable",
    error: message,
    failureCount: state.failureCount + 1,
    lastChecked: new Date(),
  };
  notify();
}

export function clearTorBoxServiceUnavailable() {
  if (state.status !== "service_unavailable") return;
  state = {
    ...state,
    status: state.user ? "connected" : "disconnected",
    error: null,
    failureCount: 0,
  };
  notify();
}
