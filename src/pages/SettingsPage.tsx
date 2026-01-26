import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTVMode, SCALE_PRESETS, ScalePreset, InputMode } from "@/hooks/useTVMode";
import { usePlaybackSettings } from "@/hooks/usePlaybackSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Settings, User, Database, LogOut, Zap, RefreshCw, Loader2, CheckCircle, XCircle, Clock, Download, Tv, Monitor, Maximize2, RotateCcw, Info, Film, Wifi, WifiOff, Gauge, Key, Eye, EyeOff, Globe, Mouse, Gamepad2, Trash2, Shield, Server, Cloud, Box, Play } from "lucide-react";
import { getTorBoxUser, listDownloads, TorBoxUser, TorBoxTorrent } from "@/lib/torbox";
// Debug logs functionality removed with video player cleanup
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";
import { TorBoxHealthCheck } from "@/components/settings/TorBoxHealthCheck";
import { TorBoxPairingDialog } from "@/components/settings/TorBoxPairingDialog";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { isTVMode, setTVMode, uiScale, setUIScale, currentPreset, inputMode, setInputMode } = useTVMode();
  const { settings: playbackSettings, updateSetting: updatePlaybackSetting, measureConnectionSpeed } = usePlaybackSettings();
  const { checkForUpdates, forceRefresh, isChecking, lastChecked } = useServiceWorkerUpdate();
  const [tbUser, setTbUser] = useState<TorBoxUser | null>(null);
  const [tbDownloads, setTbDownloads] = useState<TorBoxTorrent[]>([]);
  const [isLoadingTb, setIsLoadingTb] = useState(false);
  const [tbError, setTbError] = useState<string | null>(null);
  const [isTestingSpeed, setIsTestingSpeed] = useState(false);
  const [torrentioAddonUrl, setTorrentioAddonUrl] = useState(() => 
    localStorage.getItem("torrentioAddonUrl") || ""
  );
  // Debug logs removed with video player cleanup
  const [showPairingDialog, setShowPairingDialog] = useState(false);

  const fetchTorBoxData = async (retryCount = 0) => {
    const maxRetries = 2;
    setIsLoadingTb(true);
    setTbError(null);
    try {
      const [userData, downloads] = await Promise.all([
        getTorBoxUser(),
        listDownloads(),
      ]);
      setTbUser(userData);
      setTbDownloads(downloads.slice(0, 10));
    } catch (error: any) {
      console.error("Failed to fetch TorBox data:", error);
      const errorMsg = error.message || "";
      
      const isTransient = errorMsg.includes("502") || errorMsg.includes("504") || 
                          errorMsg.includes("tls") || errorMsg.includes("non-2xx") ||
                          errorMsg.includes("failed to fetch") || errorMsg.includes("network");
      
      if (isTransient && retryCount < maxRetries) {
        console.log(`Retrying TorBox fetch (attempt ${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        setIsLoadingTb(false);
        return fetchTorBoxData(retryCount + 1);
      }
      
      if (isTransient) {
        setTbError("Connection issue with TorBox. Please try again.");
      } else if (errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("unauthorized")) {
        setTbError("Invalid API key. Please check your TorBox API key.");
      } else if (errorMsg.includes("503") || errorMsg.includes("overloaded")) {
        setTbError("TorBox servers are busy. Please wait and try again.");
      } else {
        setTbError(errorMsg || "Failed to connect to TorBox");
      }
    }
    setIsLoadingTb(false);
  };

  useEffect(() => {
    fetchTorBoxData();
  }, []);

  const isSubscribed = tbUser?.is_subscribed;
  const premiumExpires = tbUser?.premium_expires_at ? new Date(tbUser.premium_expires_at) : null;
  const isPremiumActive = isSubscribed && premiumExpires && premiumExpires > new Date();

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleTVModeChange = (enabled: boolean) => {
    setTVMode(enabled);
    toast.success(enabled ? "TV mode enabled" : "TV mode disabled");
  };

  const handleScaleChange = (preset: ScalePreset) => {
    setUIScale(SCALE_PRESETS[preset].value);
    toast.success(`UI scale set to ${SCALE_PRESETS[preset].label} (${SCALE_PRESETS[preset].value}%)`);
  };

  const handleCheckForUpdates = async () => {
    toast.info("Checking for updates...");
    
    const result = await checkForUpdates();
    
    if (result.hasUpdate) {
      toast.success(result.message);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      toast.success(result.message);
    }
  };

  const handleForceRefresh = async () => {
    toast.info("Clearing cache and reloading...");
    await forceRefresh();
  };

  return (
    <div className={cn("p-6 space-y-6", isTVMode ? "max-w-4xl" : "max-w-2xl")}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={cn(
          "bg-muted rounded-lg flex items-center justify-center",
          isTVMode ? "w-14 h-14" : "w-10 h-10"
        )}>
          <Settings className={cn("text-muted-foreground", isTVMode ? "w-7 h-7" : "w-5 h-5")} />
        </div>
        <div>
          <h1 className={cn("font-bold", isTVMode ? "text-4xl" : "text-2xl")}>Settings</h1>
          <p className={cn("text-muted-foreground", isTVMode ? "text-lg" : "text-sm")}>
            Manage your account and preferences
          </p>
        </div>
      </div>

      {/* TV Mode */}
      <Card>
        <CardHeader>
          <CardTitle className={cn("flex items-center gap-2", isTVMode && "text-xl")}>
            <Tv className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
            TV Mode
          </CardTitle>
          <CardDescription className={isTVMode ? "text-base" : ""}>
            Optimize the interface for TV viewing with a remote control
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="tv-mode" className={cn("font-medium", isTVMode && "text-sm")}>
                Enable TV Mode
              </Label>
              <p className={cn("text-muted-foreground", isTVMode ? "text-sm" : "text-sm")}>
                Larger text, buttons, and better focus states for remote navigation
              </p>
            </div>
            <Switch
              id="tv-mode"
              checked={isTVMode}
              onCheckedChange={handleTVModeChange}
            />
          </div>
          
          <div className={cn(
            "flex items-center gap-4 p-4 rounded-lg",
            isTVMode ? "bg-primary/10 border border-primary/20" : "bg-secondary/30"
          )}>
            {isTVMode ? (
              <>
                <Tv className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium text-lg">TV Mode Active</p>
                  <p className="text-muted-foreground">
                    Interface is optimized for TV viewing. Use arrow keys to navigate.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Monitor className="w-6 h-6 text-muted-foreground" />
                <div>
                  <p className="font-medium">Desktop Mode</p>
                  <p className="text-sm text-muted-foreground">
                    Standard interface for mouse and keyboard
                  </p>
                </div>
              </>
            )}
          </div>

          <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
            Tip: You can also enable TV mode by adding <code className="bg-secondary px-1.5 py-0.5 rounded">?tv=1</code> to the URL.
          </p>
        </CardContent>
      </Card>

      {/* Input Mode */}
      <Card>
        <CardHeader>
          <CardTitle className={cn("flex items-center gap-2", isTVMode && "text-xl")}>
            {inputMode === "dpad" ? (
              <Gamepad2 className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
            ) : (
              <Mouse className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
            )}
            Input Mode
          </CardTitle>
          <CardDescription className={isTVMode ? "text-base" : ""}>
            Choose how you navigate the interface
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button
              variant={inputMode === "mouse" ? "default" : "outline"}
              className={cn(
                "flex-1 flex items-center justify-center gap-2",
                inputMode === "mouse" && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                isTVMode && "h-14 text-lg"
              )}
              onClick={() => {
                setInputMode("mouse");
                toast.success("Switched to Mouse mode");
              }}
            >
              <Mouse className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
              Mouse
            </Button>
            <Button
              variant={inputMode === "dpad" ? "default" : "outline"}
              className={cn(
                "flex-1 flex items-center justify-center gap-2",
                inputMode === "dpad" && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                isTVMode && "h-14 text-lg"
              )}
              onClick={() => {
                setInputMode("dpad");
                toast.success("Switched to D-pad mode");
              }}
            >
              <Gamepad2 className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
              D-pad / Remote
            </Button>
          </div>

          <div className={cn(
            "flex items-start gap-3 p-4 rounded-lg",
            inputMode === "dpad" ? "bg-primary/10 border border-primary/20" : "bg-secondary/30"
          )}>
            {inputMode === "dpad" ? (
              <>
                <Gamepad2 className={cn("text-primary flex-shrink-0", isTVMode ? "w-6 h-6" : "w-5 h-5")} />
                <div>
                  <p className={cn("font-medium", isTVMode && "text-lg")}>D-pad Mode Active</p>
                  <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                    Use arrow keys or TV remote to navigate. Press Enter/OK to select.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Mouse className={cn("text-muted-foreground flex-shrink-0", isTVMode ? "w-6 h-6" : "w-5 h-5")} />
                <div>
                  <p className={cn("font-medium", isTVMode && "text-lg")}>Mouse Mode Active</p>
                  <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                    Click and scroll to navigate. Best for desktop and touch devices.
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Video Playback */}
      <Card>
        <CardHeader>
          <CardTitle className={cn("flex items-center gap-2", isTVMode && "text-xl")}>
            <Film className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
            Video Playback
          </CardTitle>
          <CardDescription className={isTVMode ? "text-base" : ""}>
          Configure video playback and buffering settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Player Type Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className={cn("font-medium", isTVMode && "text-lg")}>
                Video Player
              </Label>
              <Badge 
                variant="secondary"
                className={cn(
                  "text-xs",
                  playbackSettings.playerType === 'simple-hls' && "bg-primary/20 text-primary border-primary/30"
                )}
              >
                {playbackSettings.playerType === 'simple-hls' ? 'Simple HLS' : 'Minimal'}
              </Badge>
            </div>
            <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
              Choose which video player to use. Select before streaming.
            </p>
            <div className="flex gap-2">
              <Button
                variant={playbackSettings.playerType === 'simple-hls' ? "default" : "outline"}
                size={isTVMode ? "lg" : "default"}
                className={cn(
                  "flex-1 gap-2",
                  playbackSettings.playerType === 'simple-hls' && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                )}
                onClick={() => updatePlaybackSetting('playerType', 'simple-hls')}
              >
                <Play className={cn(isTVMode ? "w-5 h-5" : "w-4 h-4")} />
                Simple HLS
              </Button>
              <Button
                variant={playbackSettings.playerType === 'minimal' ? "default" : "outline"}
                size={isTVMode ? "lg" : "default"}
                className={cn(
                  "flex-1 gap-2",
                  playbackSettings.playerType === 'minimal' && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                )}
                onClick={() => updatePlaybackSetting('playerType', 'minimal')}
              >
                <Film className={cn(isTVMode ? "w-5 h-5" : "w-4 h-4")} />
                Minimal
              </Button>
            </div>
            <div className={cn(
              "p-3 rounded-lg",
              playbackSettings.playerType === 'simple-hls' ? "bg-primary/10 border border-primary/20" : "bg-secondary/30"
            )}>
              {playbackSettings.playerType === 'simple-hls' ? (
                <div className="flex items-start gap-2">
                  <Play className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className={cn("font-medium", isTVMode && "text-base")}>Simple HLS Player</p>
                    <p className={cn("text-muted-foreground", isTVMode ? "text-sm" : "text-xs")}>
                      Shows poster with play button. Click to go fullscreen and autoplay. Uses HLS.js for streaming.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <Film className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className={cn("font-medium", isTVMode && "text-base")}>Minimal Player</p>
                    <p className={cn("text-muted-foreground", isTVMode ? "text-sm" : "text-xs")}>
                      Basic HTML5 video with native browser controls. Most compatible, autoplays immediately.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Only Show Cached Streams Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="cached-only" className={cn("font-medium", isTVMode && "text-lg")}>
                  Only show cached streams
                </Label>
                <Badge 
                  variant={playbackSettings.onlyShowCachedStreams ? "default" : "secondary"}
                  className={cn(
                    "text-xs",
                    playbackSettings.onlyShowCachedStreams && "bg-green-500/20 text-green-500 border-green-500/30"
                  )}
                >
                  {playbackSettings.onlyShowCachedStreams ? "Enabled" : "Off"}
                </Badge>
              </div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                {playbackSettings.onlyShowCachedStreams 
                  ? "Only streams already cached on TorBox are shown for instant playback" 
                  : "All available streams are shown, including uncached ones"}
              </p>
            </div>
            <Switch
              id="cached-only"
              checked={playbackSettings.onlyShowCachedStreams}
              onCheckedChange={(checked) => updatePlaybackSetting('onlyShowCachedStreams', checked)}
              className={isTVMode ? "scale-125" : ""}
            />
          </div>

          {/* 30fps or Best Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="fps-mode" className={cn("font-medium", isTVMode && "text-lg")}>
                  30fps or Best
                </Label>
                <Badge 
                  variant={playbackSettings.limitFps30 ? "secondary" : "default"}
                  className={cn(
                    "text-xs",
                    !playbackSettings.limitFps30 && "bg-green-500/20 text-green-500 border-green-500/30"
                  )}
                >
                  {playbackSettings.limitFps30 ? "Optimized" : "High Performance"}
                </Badge>
              </div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                {playbackSettings.limitFps30 
                  ? "Limits to 30fps transcoded streams for smoother playback on slower devices" 
                  : "Uses highest available quality including 60fps when available"}
              </p>
            </div>
            <Switch
              id="fps-mode"
              checked={!playbackSettings.limitFps30}
              onCheckedChange={(checked) => updatePlaybackSetting('limitFps30', !checked)}
              className={isTVMode ? "scale-125" : ""}
            />
          </div>

          {/* CORS Proxy Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="cors-proxy" className={cn("font-medium", isTVMode && "text-lg")}>
                  Use CORS Proxy
                </Label>
                <Badge 
                  variant={playbackSettings.useCorsProxy ? "default" : "secondary"}
                  className={cn(
                    "text-xs",
                    playbackSettings.useCorsProxy && "bg-blue-500/20 text-blue-500 border-blue-500/30"
                  )}
                >
                  {playbackSettings.useCorsProxy ? "Enabled" : "Off"}
                </Badge>
              </div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                {playbackSettings.useCorsProxy 
                  ? "Routes streams through a proxy to bypass CORS restrictions" 
                  : "Streams directly from source (faster but may fail on some sources)"}
              </p>
            </div>
            <Switch
              id="cors-proxy"
              checked={playbackSettings.useCorsProxy}
              onCheckedChange={(checked) => updatePlaybackSetting('useCorsProxy', checked)}
              className={isTVMode ? "scale-125" : ""}
            />
          </div>

          {/* Proxy Mode Selector */}
          {playbackSettings.useCorsProxy && (
            <div className="space-y-3 pl-4 border-l-2 border-primary/30">
              <div className="flex items-center gap-2">
                <Label className={cn("font-medium", isTVMode && "text-lg")}>
                  Proxy Source
                </Label>
                <Badge 
                  variant="secondary"
                  className={cn(
                    "text-xs",
                    playbackSettings.proxyMode === 'backend' && "bg-green-500/20 text-green-500 border-green-500/30"
                  )}
                >
                  {playbackSettings.proxyMode === 'backend' ? 'Backend' : 'Public'}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={playbackSettings.proxyMode === 'public' ? "default" : "outline"}
                  size={isTVMode ? "lg" : "sm"}
                  className={cn(
                    "flex-1 gap-2",
                    playbackSettings.proxyMode === 'public' && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                  )}
                  onClick={() => {
                    updatePlaybackSetting('proxyMode', 'public');
                    toast.success("Switched to public proxy (corsproxy.io)");
                  }}
                >
                  <Globe className="w-4 h-4" />
                  Public
                </Button>
                <Button
                  variant={playbackSettings.proxyMode === 'backend' ? "default" : "outline"}
                  size={isTVMode ? "lg" : "sm"}
                  className={cn(
                    "flex-1 gap-2",
                    playbackSettings.proxyMode === 'backend' && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                  )}
                  onClick={() => {
                    updatePlaybackSetting('proxyMode', 'backend');
                    toast.success("Switched to backend proxy (more reliable)");
                  }}
                >
                  <Server className="w-4 h-4" />
                  Backend
                </Button>
              </div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                {playbackSettings.proxyMode === 'backend' 
                  ? "Uses our secure backend proxy. More reliable but requires authentication." 
                  : "Uses public corsproxy.io. Works without login but may be less reliable."}
              </p>

              {/* Smart Proxy Toggle */}
              <div className="flex items-center justify-between pt-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="smart-proxy" className={cn("font-medium", isTVMode && "text-base")}>
                      Smart Detection
                    </Label>
                    <Badge 
                      variant={playbackSettings.useSmartProxy ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {playbackSettings.useSmartProxy ? "Auto" : "Off"}
                    </Badge>
                  </div>
                  <p className={cn("text-muted-foreground", isTVMode ? "text-sm" : "text-xs")}>
                    Skip proxy for TorBox (has native CORS support)
                  </p>
                </div>
                <Switch
                  id="smart-proxy"
                  checked={playbackSettings.useSmartProxy ?? true}
                  onCheckedChange={(checked) => updatePlaybackSetting('useSmartProxy', checked)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Buffer & Network Settings */}
      <Card>
        <CardHeader>
          <CardTitle className={cn("flex items-center gap-2", isTVMode && "text-xl")}>
            <Gauge className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
            Buffer & Network
          </CardTitle>
          <CardDescription className={isTVMode ? "text-base" : ""}>
            Optimize buffering to prevent video stalling
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connection Speed Display */}
          <div className={cn(
            "flex items-center justify-between p-4 rounded-lg",
            playbackSettings.isSlowConnection ? "bg-yellow-500/10 border border-yellow-500/20" : "bg-secondary/30"
          )}>
            <div className="flex items-center gap-3">
              {playbackSettings.isSlowConnection ? (
                <WifiOff className={cn("text-yellow-500", isTVMode ? "w-6 h-6" : "w-5 h-5")} />
              ) : (
                <Wifi className={cn("text-green-500", isTVMode ? "w-6 h-6" : "w-5 h-5")} />
              )}
              <div>
                <p className={cn("font-medium", isTVMode && "text-lg")}>
                  {playbackSettings.connectionSpeedMbps !== null 
                    ? `${playbackSettings.connectionSpeedMbps.toFixed(1)} Mbps` 
                    : "Speed unknown"}
                </p>
                <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                  {playbackSettings.isSlowConnection 
                    ? "Slow connection - buffering may occur" 
                    : "Connection speed"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size={isTVMode ? "lg" : "sm"}
              onClick={async () => {
                setIsTestingSpeed(true);
                const speed = await measureConnectionSpeed();
                setIsTestingSpeed(false);
                if (speed !== null) {
                  toast.success(`Connection speed: ${speed.toFixed(1)} Mbps`);
                } else {
                  toast.error("Failed to measure connection speed");
                }
              }}
              disabled={isTestingSpeed}
            >
              {isTestingSpeed ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="ml-2">Test</span>
            </Button>
          </div>

          {/* Buffer Ahead Setting */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className={cn("font-medium", isTVMode && "text-lg")}>
                Buffer ahead (seconds)
              </Label>
              <span className={cn("font-mono text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                {playbackSettings.bufferAhead}s
              </span>
            </div>
            <Slider
              value={[playbackSettings.bufferAhead]}
              min={5}
              max={60}
              step={5}
              onValueChange={(value) => updatePlaybackSetting('bufferAhead', value[0])}
              className="w-full"
            />
            <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
              Higher values = less buffering but uses more data. Try 45-60s for slow connections.
            </p>
          </div>

          {/* Auto Quality Downgrade */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-quality" className={cn("font-medium", isTVMode && "text-sm")}>
                Auto quality adjustment
              </Label>
              <p className={cn("text-muted-foreground", isTVMode ? "text-sm" : "text-sm")}>
                Automatically switch to lower quality on slow connections
              </p>
            </div>
            <Switch
              id="auto-quality"
              checked={playbackSettings.autoQualityDowngrade}
              onCheckedChange={(checked) => updatePlaybackSetting('autoQualityDowngrade', checked)}
            />
          </div>

          {/* Tips */}
          <div className={cn(
            "flex items-start gap-2 p-3 rounded-lg bg-secondary/30",
            isTVMode ? "text-base" : "text-sm"
          )}>
            <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Tips to reduce buffering:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Increase buffer ahead time to 45-60 seconds</li>
                <li>Enable auto quality adjustment</li>
                <li>Choose a lower quality stream when available</li>
                <li>Close other apps using your network</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* UI Scale */}
      <Card>
        <CardHeader>
          <CardTitle className={cn("flex items-center gap-2", isTVMode && "text-xl")}>
            <Maximize2 className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
            UI Scale
          </CardTitle>
          <CardDescription className={isTVMode ? "text-base" : ""}>
            Adjust the overall interface size for your viewing distance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quick Presets */}
          <div className="space-y-2">
            <Label className={cn("font-medium", isTVMode && "text-base")}>Quick Presets</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SCALE_PRESETS) as ScalePreset[]).map((preset) => (
                <Button
                  key={preset}
                  variant={currentPreset === preset ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleScaleChange(preset)}
                  className={cn(
                    currentPreset === preset && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                  )}
                >
                  {SCALE_PRESETS[preset].label}
                </Button>
              ))}
            </div>
          </div>

          {/* Fine-tune Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className={cn("font-medium", isTVMode && "text-base")}>
                Fine-tune Scale
              </Label>
              <span className={cn("font-mono font-medium", isTVMode ? "text-base" : "text-sm")}>
                {uiScale}%
              </span>
            </div>
            <Slider
              value={[uiScale]}
              min={80}
              max={120}
              step={5}
              onValueChange={(value) => setUIScale(value[0])}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>80% (Smaller)</span>
              <span>120% (Larger)</span>
            </div>
          </div>

          {/* Reset Button */}
          <div className="flex items-center justify-between pt-2 border-t">
            <p className={cn("text-muted-foreground", isTVMode ? "text-sm" : "text-xs")}>
              Adjust for your TV viewing distance. Sit closer? Use smaller scale.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUIScale(SCALE_PRESETS.normal.value)}
              disabled={uiScale === SCALE_PRESETS.normal.value}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className={cn("flex items-center gap-2", isTVMode && "text-xl")}>
            <User className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
            Account
          </CardTitle>
          <CardDescription className={isTVMode ? "text-base" : ""}>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Email</p>
            <p className={cn("font-medium", isTVMode && "text-lg")}>{user?.email}</p>
          </div>
          <div>
            <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>User ID</p>
            <p className={cn("font-mono", isTVMode ? "text-base" : "text-sm")}>{user?.id}</p>
          </div>
        </CardContent>
      </Card>

      {/* TorBox */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className={cn("flex items-center gap-2", isTVMode && "text-xl")}>
                <Box className={cn("text-blue-500", isTVMode ? "w-6 h-6" : "w-5 h-5")} />
                TorBox
              </CardTitle>
              <CardDescription className={isTVMode ? "text-base" : ""}>Premium debrid service</CardDescription>
            </div>
            <Button 
              variant="outline" 
              size={isTVMode ? "lg" : "sm"} 
              onClick={() => fetchTorBoxData()} 
              disabled={isLoadingTb}
            >
              {isLoadingTb ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {tbError ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-destructive flex-1">
                <XCircle className="w-4 h-4" />
                <span className={cn(isTVMode ? "text-base" : "text-sm")}>{tbError}</span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => fetchTorBoxData()}
              >
                Retry
              </Button>
            </div>
          ) : isLoadingTb && !tbUser ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className={cn(isTVMode ? "text-base" : "text-sm")}>Loading account info...</span>
            </div>
          ) : tbUser ? (
            <>
              {/* Account Status */}
              <div className={cn(
                "flex items-center justify-between bg-secondary/30 rounded-lg",
                isTVMode ? "p-4" : "p-3"
              )}>
                <div className="flex items-center gap-3">
                  <Box className={cn("text-blue-500", isTVMode ? "w-10 h-10" : "w-8 h-8")} />
                  <div>
                    <p className={cn("font-medium", isTVMode && "text-lg")}>{tbUser.email}</p>
                    <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                      Plan: {tbUser.plan === 0 ? "Free" : `Premium (Plan ${tbUser.plan})`}
                    </p>
                  </div>
                </div>
                <Badge variant={isPremiumActive ? "default" : "secondary"} className={cn(isPremiumActive ? "bg-green-500" : "", isTVMode && "text-base px-3 py-1")}>
                  {isPremiumActive ? (
                    <><CheckCircle className="w-3 h-3 mr-1" /> Premium</>
                  ) : (
                    <><XCircle className="w-3 h-3 mr-1" /> Free</>
                  )}
                </Badge>
              </div>

              {/* Premium Expiration */}
              {premiumExpires && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className={cn(isTVMode ? "text-base" : "text-sm")}>
                    {isPremiumActive ? (
                      <>Premium expires {formatDistanceToNow(premiumExpires, { addSuffix: true })} ({format(premiumExpires, "PPP")})</>
                    ) : (
                      <>Premium expired on {format(premiumExpires, "PPP")}</>
                    )}
                  </span>
                </div>
              )}

              {/* Total Downloaded */}
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-muted-foreground" />
                <span className={cn(isTVMode ? "text-base" : "text-sm")}>
                  {formatBytes(tbUser.total_downloaded)} downloaded
                </span>
              </div>

              {/* Recent Downloads */}
              {tbDownloads.length > 0 && (
                <div className="space-y-2">
                  <p className={cn("font-medium flex items-center gap-2", isTVMode ? "text-base" : "text-sm")}>
                    <Download className="w-4 h-4" />
                    Recent Downloads
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {tbDownloads.map((dl) => (
                      <div key={dl.id} className={cn(
                        "flex items-center justify-between bg-secondary/20 rounded",
                        isTVMode ? "p-3 text-base" : "p-2 text-sm"
                      )}>
                        <span className="truncate flex-1 mr-2">{dl.name}</span>
                        <span className="text-muted-foreground flex-shrink-0">
                          {formatBytes(dl.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* API Health Check */}
              <div className="pt-4 border-t border-border/50">
                <TorBoxHealthCheck isTVMode={isTVMode} />
              </div>
            </>
          ) : (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center">
                <Box className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <p className={cn("font-medium", isTVMode ? "text-lg" : "text-base")}>
                  Connect Your TorBox Account
                </p>
                <p className={cn("text-muted-foreground mt-1", isTVMode ? "text-base" : "text-sm")}>
                  Link your TorBox account to enable premium streaming
                </p>
              </div>
              <Button
                onClick={() => setShowPairingDialog(true)}
                className="gap-2"
                size={isTVMode ? "lg" : "default"}
              >
                <Key className="w-4 h-4" />
                Set Up TorBox
              </Button>
              <p className={cn("text-muted-foreground", isTVMode ? "text-sm" : "text-xs")}>
                Don't have an account?{" "}
                <a 
                  href="https://torbox.app" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Sign up at torbox.app
                </a>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Torrentio Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className={cn("flex items-center gap-2", isTVMode && "text-xl")}>
            <Globe className={cn("text-blue-500", isTVMode ? "w-6 h-6" : "w-5 h-5")} />
            Torrentio
          </CardTitle>
          <CardDescription className={isTVMode ? "text-base" : ""}>
            Configure your personalized Torrentio addon endpoint
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
            <p className={cn("text-muted-foreground", isTVMode ? "text-sm" : "text-xs")}>
              Configure your addon at{" "}
              <a 
                href="https://torrentio.strem.fun/configure" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                torrentio.strem.fun/configure
              </a>
              {" "}then paste the manifest URL here. This creates a personalized endpoint that avoids rate limiting.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label className={cn(isTVMode ? "text-base" : "text-sm")}>
              Addon URL
            </Label>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://torrentio.strem.fun/manifest.json"
                value={torrentioAddonUrl}
                onChange={(e) => setTorrentioAddonUrl(e.target.value)}
                className={cn(isTVMode && "text-base h-12")}
              />
              <Button
                variant="outline"
                size={isTVMode ? "lg" : "default"}
                onClick={() => {
                  const url = torrentioAddonUrl.trim();
                  if (url) {
                    if (!url.includes("torrentio.strem.fun")) {
                      toast.error("Invalid URL - must be a torrentio.strem.fun URL");
                      return;
                    }
                    localStorage.setItem("torrentioAddonUrl", url);
                    toast.success("Torrentio addon URL saved");
                  } else {
                    localStorage.removeItem("torrentioAddonUrl");
                    toast.success("Torrentio addon URL removed (using default)");
                  }
                }}
              >
                Save
              </Button>
            </div>
            {torrentioAddonUrl && (
              <p className={cn("text-muted-foreground", isTVMode ? "text-sm" : "text-xs")}>
                ✓ Custom addon configured - stream searches will use your personalized endpoint
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Storage Info */}
      <Card>
        <CardHeader>
          <CardTitle className={cn("flex items-center gap-2", isTVMode && "text-xl")}>
            <Database className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
            Storage
          </CardTitle>
          <CardDescription className={isTVMode ? "text-base" : ""}>Video caching information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={cn("grid gap-4", isTVMode ? "grid-cols-2" : "grid-cols-3")}>
            <div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Max Resolution</p>
              <p className={cn("font-medium", isTVMode && "text-lg")}>4K / 2160p</p>
            </div>
            <div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Frame Rate</p>
              <p className={cn("font-medium", isTVMode && "text-lg")}>60 FPS</p>
            </div>
            <div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Max Bitrate</p>
              <p className={cn("font-medium", isTVMode && "text-lg")}>50 Mbps</p>
            </div>
          </div>
          <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
            Video chunks are cached locally for smoother playback. Cache is
            automatically managed and cleared when full.
          </p>
        </CardContent>
      </Card>

      {/* Update App */}
      <Card>
        <CardHeader>
          <CardTitle className={cn("flex items-center gap-2", isTVMode && "text-xl")}>
            <RotateCcw className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
            Update App
          </CardTitle>
          <CardDescription className={isTVMode ? "text-base" : ""}>
            Check for and install the latest version
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
            Check for app updates or force refresh to clear cached files.
          </p>
          
          {lastChecked && (
            <p className="text-xs text-muted-foreground">
              Last checked: {formatDistanceToNow(lastChecked, { addSuffix: true })}
            </p>
          )}
          
          <div className="flex flex-wrap gap-3">
            <Button 
              size={isTVMode ? "lg" : "default"} 
              onClick={handleCheckForUpdates}
              disabled={isChecking}
              className="gap-2"
            >
              {isChecking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Check for Updates
                </>
              )}
            </Button>
            
            <Button 
              variant="outline"
              size={isTVMode ? "lg" : "default"} 
              onClick={handleForceRefresh}
              disabled={isChecking}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear Cache & Reload
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Network Debug Logs removed - video player will be rebuilt from scratch */}

      {/* Sign Out */}
      <Button variant="destructive" className={cn("w-full gap-2", isTVMode && "h-14 text-lg")} onClick={signOut}>
        <LogOut className="w-4 h-4" />
        Sign Out
      </Button>

      {/* TorBox Pairing Dialog */}
      <TorBoxPairingDialog 
        open={showPairingDialog} 
        onOpenChange={setShowPairingDialog}
        isTVMode={isTVMode}
      />
    </div>
  );
}
