import { useState, useEffect, createContext, useContext, ReactNode } from "react";

// Detect BrowseHere Android TV browser
function detectBrowseHere(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  
  const ua = navigator.userAgent.toLowerCase();
  
  // BrowseHere browser detection
  const isBrowseHere = ua.includes("browsehere") || ua.includes("browse here");
  
  // Also detect Android TV environment (including ONN boxes)
  const isAndroidTV = ua.includes("android") && (
    ua.includes("tv") || 
    ua.includes("aft") || // Amazon Fire TV
    ua.includes("silk") || // Silk browser on Fire TV
    ua.includes("crkey") || // Chromecast
    ua.includes("onn") || // ONN Android TV boxes
    ua.includes("atv") // Generic Android TV
  );
  
  // Check for leanback (Android TV interface)
  const isLeanback = ua.includes("leanback");
  
  return isBrowseHere || isLeanback || isAndroidTV;
}

// Detect if we should use native video controls
function shouldUseNativeVideoPlayer(): boolean {
  if (typeof window === "undefined") return false;
  
  const ua = navigator.userAgent.toLowerCase();
  
  // BrowseHere and similar TV browsers have their own video players
  const browserWithPlayer = 
    ua.includes("browsehere") ||
    ua.includes("browse here") ||
    ua.includes("puffin") || // Puffin TV
    ua.includes("vewd") || // Vewd (formerly Opera TV)
    ua.includes("puffin");
  
  return browserWithPlayer;
}

interface BrowseHereContextType {
  isBrowseHere: boolean;
  isAndroidTV: boolean;
  useNativePlayer: boolean;
  userAgent: string;
}

const BrowseHereContext = createContext<BrowseHereContextType | undefined>(undefined);

export function BrowseHereProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BrowseHereContextType>({
    isBrowseHere: false,
    isAndroidTV: false,
    useNativePlayer: false,
    userAgent: "",
  });

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isBrowseHere = detectBrowseHere();
    const isAndroidTV = ua.includes("android") && (
      ua.includes("tv") || 
      ua.includes("aft") || 
      ua.includes("leanback") ||
      ua.includes("onn") ||
      ua.includes("atv")
    );
    
    setState({
      isBrowseHere,
      isAndroidTV,
      useNativePlayer: shouldUseNativeVideoPlayer(),
      userAgent: navigator.userAgent,
    });

    // Auto-enable compact Android TV box mode for ONN/Fire TV/etc.
    if (isBrowseHere || isAndroidTV) {
      document.documentElement.classList.add("tv-mode");
      document.documentElement.classList.add("android-tv-box");
      // Use mouse mode for air mouse/pointer on Android TV
      document.documentElement.classList.add("mouse-mode");
      document.documentElement.classList.remove("dpad-mode");
      localStorage.setItem("tv-mode", "true");
      localStorage.setItem("input-mode", "mouse");
    }
  }, []);

  return (
    <BrowseHereContext.Provider value={state}>
      {children}
    </BrowseHereContext.Provider>
  );
}

export function useBrowseHere() {
  const context = useContext(BrowseHereContext);
  if (context === undefined) {
    throw new Error("useBrowseHere must be used within a BrowseHereProvider");
  }
  return context;
}

// Hook to get video player props optimized for TV browsers
export function useTVVideoProps() {
  const { useNativePlayer, isBrowseHere } = useBrowseHere();
  
  return {
    // Use native controls when browser has its own player
    controls: useNativePlayer,
    // Disable custom controls overlay
    hideCustomControls: useNativePlayer,
    // Allow browser to handle fullscreen
    allowBrowserFullscreen: useNativePlayer || isBrowseHere,
    // Preload for faster playback on TV
    preload: "auto" as const,
    // Enable picture-in-picture for supported browsers
    pictureInPicture: !isBrowseHere,
  };
}
