import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { preloadFFmpeg } from "./lib/ffmpegTranscode";

// Preload FFmpeg in background for faster first transcoding
preloadFFmpeg();

createRoot(document.getElementById("root")!).render(<App />);
