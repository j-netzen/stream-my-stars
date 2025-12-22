import { useState, useEffect, createContext, useContext, ReactNode } from "react";

// TV detection: large screens (typically 1920+ wide) without touch support
// or when explicitly enabled via URL param ?tv=1
function detectTVMode(): boolean {
  if (typeof window === "undefined") return false;
  
  // Check URL param for manual TV mode
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("tv") === "1") return true;
  if (urlParams.get("tv") === "0") return false;
  
  // Check localStorage for persisted preference
  const stored = localStorage.getItem("tv-mode");
  if (stored === "true") return true;
  if (stored === "false") return false;
  
  // Auto-detect: large screen without fine pointer (likely TV or game console)
  const isLargeScreen = window.innerWidth >= 1280;
  const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const noFinePointer = !window.matchMedia("(pointer: fine)").matches;
  
  return isLargeScreen && (hasCoarsePointer || noFinePointer);
}

interface TVModeContextType {
  isTVMode: boolean;
  setTVMode: (enabled: boolean) => void;
  toggleTVMode: () => void;
}

const TVModeContext = createContext<TVModeContextType | undefined>(undefined);

export function TVModeProvider({ children }: { children: ReactNode }) {
  const [isTVMode, setIsTVMode] = useState(false);

  useEffect(() => {
    setIsTVMode(detectTVMode());
  }, []);

  useEffect(() => {
    // Apply TV mode class to document
    if (isTVMode) {
      document.documentElement.classList.add("tv-mode");
    } else {
      document.documentElement.classList.remove("tv-mode");
    }
  }, [isTVMode]);

  const setTVMode = (enabled: boolean) => {
    localStorage.setItem("tv-mode", String(enabled));
    setIsTVMode(enabled);
  };

  const toggleTVMode = () => {
    setTVMode(!isTVMode);
  };

  return (
    <TVModeContext.Provider value={{ isTVMode, setTVMode, toggleTVMode }}>
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
