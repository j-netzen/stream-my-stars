import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { preloadFFmpeg } from "./lib/ffmpegTranscode";

// Preload FFmpeg in background for faster first transcoding
preloadFFmpeg();

// Restore Android TV Box mode from localStorage on startup
const savedAndroidTVBox = localStorage.getItem("android-tv-box");
if (savedAndroidTVBox === "true") {
  document.documentElement.classList.add("android-tv-box");
}

createRoot(document.getElementById("root")!).render(<App />);
