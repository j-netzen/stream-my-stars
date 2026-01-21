import { useState, useEffect, createContext, useContext, ReactNode } from "react";

// Scale presets
export const SCALE_PRESETS = {
  small: { label: "Small", value: 80 },
  normal: { label: "Normal", value: 95 },
  large: { label: "Large", value: 110 },
} as const;

export type ScalePreset = keyof typeof SCALE_PRESETS;

// Input mode: mouse (default) or dpad (TV remote / gamepad)
export type InputMode = "mouse" | "dpad";

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

function getStoredScale(): number {
  if (typeof window === "undefined") return SCALE_PRESETS.normal.value;
  const stored = localStorage.getItem("ui-scale");
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed) && parsed >= 50 && parsed <= 150) return parsed;
  }
  return SCALE_PRESETS.normal.value;
}

function getStoredInputMode(): InputMode {
  if (typeof window === "undefined") return "mouse";
  const stored = localStorage.getItem("input-mode");
  if (stored === "dpad") return "dpad";
  return "mouse";
}

interface TVModeContextType {
  isTVMode: boolean;
  setTVMode: (enabled: boolean) => void;
  toggleTVMode: () => void;
  uiScale: number;
  setUIScale: (scale: number) => void;
  currentPreset: ScalePreset | null;
  inputMode: InputMode;
  setInputMode: (mode: InputMode) => void;
}

const TVModeContext = createContext<TVModeContextType | undefined>(undefined);

export function TVModeProvider({ children }: { children: ReactNode }) {
  const [isTVMode, setIsTVMode] = useState(false);
  const [uiScale, setUIScaleState] = useState<number>(SCALE_PRESETS.normal.value);
  const [inputMode, setInputModeState] = useState<InputMode>("mouse");

  useEffect(() => {
    setIsTVMode(detectTVMode());
    setUIScaleState(getStoredScale());
    setInputModeState(getStoredInputMode());
  }, []);

  useEffect(() => {
    // Apply TV mode class to document
    if (isTVMode) {
      document.documentElement.classList.add("tv-mode");
    } else {
      document.documentElement.classList.remove("tv-mode");
    }
  }, [isTVMode]);

  useEffect(() => {
    // Apply UI scale to document
    document.documentElement.style.setProperty("--ui-scale", String(uiScale / 100));
    document.documentElement.style.fontSize = `${uiScale}%`;
  }, [uiScale]);

  useEffect(() => {
    // Apply input mode class to document for CSS targeting
    if (inputMode === "dpad") {
      document.documentElement.classList.add("dpad-mode");
      document.documentElement.classList.remove("mouse-mode");
    } else {
      document.documentElement.classList.add("mouse-mode");
      document.documentElement.classList.remove("dpad-mode");
    }
  }, [inputMode]);

  const setTVMode = (enabled: boolean) => {
    localStorage.setItem("tv-mode", String(enabled));
    setIsTVMode(enabled);
  };

  const toggleTVMode = () => {
    setTVMode(!isTVMode);
  };

  const setUIScale = (scale: number) => {
    localStorage.setItem("ui-scale", String(scale));
    setUIScaleState(scale);
  };

  const setInputMode = (mode: InputMode) => {
    localStorage.setItem("input-mode", mode);
    setInputModeState(mode);
  };

  // Determine current preset
  const currentPreset = (Object.keys(SCALE_PRESETS) as ScalePreset[]).find(
    (key) => SCALE_PRESETS[key].value === uiScale
  ) || null;

  return (
    <TVModeContext.Provider value={{ 
      isTVMode, 
      setTVMode, 
      toggleTVMode, 
      uiScale, 
      setUIScale, 
      currentPreset,
      inputMode,
      setInputMode,
    }}>
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
