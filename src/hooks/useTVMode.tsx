import { useState, useEffect, createContext, useContext, ReactNode } from "react";

const TV_MODE_STORAGE_KEY = "tv-mode";
const TV_SCALE_STORAGE_KEY = "tv-mode-scale";
const DEFAULT_TV_SCALE = 0.95;

// TV detection: large screens (typically 1920+ wide) without touch support
// or when explicitly enabled via URL param ?tv=1
function detectTVMode(): boolean {
  if (typeof window === "undefined") return false;
  
  // Check URL param for manual TV mode
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("tv") === "1") return true;
  if (urlParams.get("tv") === "0") return false;
  
  // Check localStorage for persisted preference
  const stored = localStorage.getItem(TV_MODE_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  
  // Auto-detect: large screen without fine pointer (likely TV or game console)
  const isLargeScreen = window.innerWidth >= 1280;
  const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const noFinePointer = !window.matchMedia("(pointer: fine)").matches;
  
  return isLargeScreen && (hasCoarsePointer || noFinePointer);
}

function getStoredScale(): number {
  if (typeof window === "undefined") return DEFAULT_TV_SCALE;
  const stored = localStorage.getItem(TV_SCALE_STORAGE_KEY);
  if (stored) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed) && parsed >= 0.7 && parsed <= 1.2) {
      return parsed;
    }
  }
  return DEFAULT_TV_SCALE;
}

interface TVModeContextType {
  isTVMode: boolean;
  setTVMode: (enabled: boolean) => void;
  toggleTVMode: () => void;
  tvScale: number;
  setTVScale: (scale: number) => void;
}

const TVModeContext = createContext<TVModeContextType | undefined>(undefined);

export function TVModeProvider({ children }: { children: ReactNode }) {
  const [isTVMode, setIsTVMode] = useState(false);
  const [tvScale, setTvScaleState] = useState(DEFAULT_TV_SCALE);

  useEffect(() => {
    setIsTVMode(detectTVMode());
    setTvScaleState(getStoredScale());
  }, []);

  useEffect(() => {
    // Apply TV mode class to document
    if (isTVMode) {
      document.documentElement.classList.add("tv-mode");
      document.documentElement.style.setProperty("--tv-scale", String(tvScale));
    } else {
      document.documentElement.classList.remove("tv-mode");
      document.documentElement.style.removeProperty("--tv-scale");
    }
  }, [isTVMode, tvScale]);

  const setTVMode = (enabled: boolean) => {
    localStorage.setItem(TV_MODE_STORAGE_KEY, String(enabled));
    setIsTVMode(enabled);
  };

  const setTVScale = (scale: number) => {
    const clampedScale = Math.max(0.7, Math.min(1.2, scale));
    localStorage.setItem(TV_SCALE_STORAGE_KEY, String(clampedScale));
    setTvScaleState(clampedScale);
  };

  const toggleTVMode = () => {
    setTVMode(!isTVMode);
  };

  return (
    <TVModeContext.Provider value={{ isTVMode, setTVMode, toggleTVMode, tvScale, setTVScale }}>
      {children}
    </TVModeContext.Provider>
  );
}

export function useTVMode() {
  const context = useContext(TVModeContext);
  if (context === undefined) {
    throw new Error("useTVMode must be used within a TVModeProvider");
  }
  return context;
}
