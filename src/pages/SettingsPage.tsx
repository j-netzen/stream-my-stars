import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTVMode, SCALE_PRESETS, ScalePreset } from "@/hooks/useTVMode";
import { usePlaybackSettings } from "@/hooks/usePlaybackSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Settings, User, Database, LogOut, Zap, RefreshCw, Loader2, CheckCircle, XCircle, Clock, Download, Tv, Monitor, Maximize2, RotateCcw, Info, Film, Wifi, WifiOff, Gauge, Key, Eye, EyeOff, Link2, Globe } from "lucide-react";
import { getRealDebridUser, listDownloads, RealDebridUser, RealDebridUnrestrictedLink } from "@/lib/realDebrid";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { RealDebridPairingDialog } from "@/components/RealDebridPairingDialog";
import { hasOAuthTokens, clearStoredTokens } from "@/lib/realDebridOAuth";


export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { isTVMode, setTVMode, uiScale, setUIScale, currentPreset } = useTVMode();
  const { settings: playbackSettings, updateSetting: updatePlaybackSetting, measureConnectionSpeed } = usePlaybackSettings();
  const [rdUser, setRdUser] = useState<RealDebridUser | null>(null);
  const [rdDownloads, setRdDownloads] = useState<RealDebridUnrestrictedLink[]>([]);
  const [isLoadingRd, setIsLoadingRd] = useState(false);
  const [rdError, setRdError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isTestingSpeed, setIsTestingSpeed] = useState(false);
  const [clientRdApiKey, setClientRdApiKey] = useState(() => 
    localStorage.getItem("realDebridApiKey") || ""
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPairingDialog, setShowPairingDialog] = useState(false);
  const [isOAuthConnected, setIsOAuthConnected] = useState(() => hasOAuthTokens());
  const [torrentioAddonUrl, setTorrentioAddonUrl] = useState(() => 
    localStorage.getItem("torrentioAddonUrl") || ""
  );

  const fetchRealDebridData = async () => {
    setIsLoadingRd(true);
    setRdError(null);
    try {
      const [userData, downloads] = await Promise.all([
        getRealDebridUser(),
        listDownloads(),
      ]);
      setRdUser(userData);
      setRdDownloads(downloads.slice(0, 10)); // Show last 10 downloads
    } catch (error: any) {
      console.error("Failed to fetch Real-Debrid data:", error);
      setRdError(error.message || "Failed to connect to Real-Debrid");
    }
    setIsLoadingRd(false);
  };

  useEffect(() => {
    fetchRealDebridData();
  }, []);

  const isPremium = rdUser?.premium && new Date(rdUser.expiration) > new Date();

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


  const handleUpdateApp = async () => {
    setIsUpdating(true);
    toast.info("Checking for updates...");
    
    try {
      // Clear caches if available
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      
      // Short delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast.success("Reloading app with latest version...");
      
      // Force reload from server, bypassing cache
      window.location.reload();
    } catch (error) {
      console.error("Update failed:", error);
      toast.error("Update failed. Please try again.");
      setIsUpdating(false);
    }
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
              <Label htmlFor="tv-mode" className={cn("font-medium", isTVMode && "text-lg")}>
                Enable TV Mode
              </Label>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                Larger text, buttons, and better focus states for remote navigation
              </p>
            </div>
            <Switch
              id="tv-mode"
              checked={isTVMode}
              onCheckedChange={handleTVModeChange}
              className={isTVMode ? "scale-125" : ""}
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
                  ? "Capped at 30fps to reduce CPU usage on slower devices" 
                  : "Allows up to 60fps for smoother playback when available"}
              </p>
            </div>
            <Switch
              id="fps-mode"
              checked={!playbackSettings.limitFps30}
              onCheckedChange={(checked) => updatePlaybackSetting('limitFps30', !checked)}
              className={isTVMode ? "scale-125" : ""}
            />
          </div>
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
              <Label htmlFor="auto-quality" className={cn("font-medium", isTVMode && "text-lg")}>
                Auto quality adjustment
              </Label>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                Automatically switch to lower quality on slow connections
              </p>
            </div>
            <Switch
              id="auto-quality"
              checked={playbackSettings.autoQualityDowngrade}
              onCheckedChange={(checked) => updatePlaybackSetting('autoQualityDowngrade', checked)}
              className={isTVMode ? "scale-125" : ""}
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
            Adjust the overall interface size
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {(Object.keys(SCALE_PRESETS) as ScalePreset[]).map((preset) => (
              <Button
                key={preset}
                variant={currentPreset === preset ? "default" : "outline"}
                size={isTVMode ? "lg" : "default"}
                onClick={() => handleScaleChange(preset)}
                className={cn(
                  "min-w-[100px]",
                  currentPreset === preset && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}
              >
                {SCALE_PRESETS[preset].label} ({SCALE_PRESETS[preset].value}%)
              </Button>
            ))}
          </div>
          <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
            Current scale: <span className="font-medium text-foreground">{uiScale}%</span>
          </p>
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

      {/* Real-Debrid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className={cn("flex items-center gap-2", isTVMode && "text-xl")}>
                <Zap className={cn("text-green-500", isTVMode ? "w-6 h-6" : "w-5 h-5")} />
                Real-Debrid
              </CardTitle>
              <CardDescription className={isTVMode ? "text-base" : ""}>Premium link unrestriction service</CardDescription>
            </div>
            <Button 
              variant="outline" 
              size={isTVMode ? "lg" : "sm"} 
              onClick={fetchRealDebridData} 
              disabled={isLoadingRd}
            >
              {isLoadingRd ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {rdError ? (
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="w-4 h-4" />
              <span className={cn(isTVMode ? "text-base" : "text-sm")}>{rdError}</span>
            </div>
          ) : isLoadingRd && !rdUser ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className={cn(isTVMode ? "text-base" : "text-sm")}>Loading account info...</span>
            </div>
          ) : rdUser ? (
            <>
              {/* Account Status */}
              <div className={cn(
                "flex items-center justify-between bg-secondary/30 rounded-lg",
                isTVMode ? "p-4" : "p-3"
              )}>
                <div className="flex items-center gap-3">
                  {rdUser.avatar && (
                    <img 
                      src={rdUser.avatar} 
                      alt="Avatar" 
                      className={cn("rounded-full", isTVMode ? "w-14 h-14" : "w-10 h-10")} 
                    />
                  )}
                  <div>
                    <p className={cn("font-medium", isTVMode && "text-lg")}>{rdUser.username}</p>
                    <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>{rdUser.email}</p>
                  </div>
                </div>
                <Badge variant={isPremium ? "default" : "secondary"} className={cn(isPremium ? "bg-green-500" : "", isTVMode && "text-base px-3 py-1")}>
                  {isPremium ? (
                    <><CheckCircle className="w-3 h-3 mr-1" /> Premium</>
                  ) : (
                    <><XCircle className="w-3 h-3 mr-1" /> Free</>
                  )}
                </Badge>
              </div>

              {/* Premium Expiration */}
              {rdUser.expiration && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className={cn(isTVMode ? "text-base" : "text-sm")}>
                    {isPremium ? (
                      <>Premium expires {formatDistanceToNow(new Date(rdUser.expiration), { addSuffix: true })} ({format(new Date(rdUser.expiration), "PPP")})</>
                    ) : (
                      <>Premium expired on {format(new Date(rdUser.expiration), "PPP")}</>
                    )}
                  </span>
                </div>
              )}

              {/* Points */}
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span className={cn(isTVMode ? "text-base" : "text-sm")}>{rdUser.points} fidelity points</span>
              </div>

              {/* Recent Downloads */}
              {rdDownloads.length > 0 && (
                <div className="space-y-2">
                  <p className={cn("font-medium flex items-center gap-2", isTVMode ? "text-base" : "text-sm")}>
                    <Download className="w-4 h-4" />
                    Recent Downloads
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {rdDownloads.map((dl) => (
                      <div key={dl.id} className={cn(
                        "flex items-center justify-between bg-secondary/20 rounded",
                        isTVMode ? "p-3 text-base" : "p-2 text-sm"
                      )}>
                        <span className="truncate flex-1 mr-2">{dl.filename}</span>
                        <span className="text-muted-foreground whitespace-nowrap">{formatBytes(dl.filesize)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
              Real-Debrid API key not configured or invalid.
            </p>
          )}

          {/* OAuth Device Pairing */}
          <div className="pt-4 border-t border-border/50 space-y-3">
            <div className="flex items-start gap-2">
              <Link2 className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
              <div className="space-y-1 flex-1">
                <Label className={cn(isTVMode ? "text-base" : "text-sm")}>
                  Device Authorization
                </Label>
                <p className={cn("text-muted-foreground", isTVMode ? "text-sm" : "text-xs")}>
                  Link your Real-Debrid account using the TV-style device pairing flow. No API key needed.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isOAuthConnected ? (
                <>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Device Linked
                  </Badge>
                  <Button
                    variant="outline"
                    size={isTVMode ? "lg" : "sm"}
                    onClick={() => {
                      clearStoredTokens();
                      setIsOAuthConnected(false);
                      setClientRdApiKey("");
                      toast.success("Device unlinked");
                      fetchRealDebridData();
                    }}
                    className="text-destructive hover:text-destructive"
                  >
                    Unlink Device
                  </Button>
                </>
              ) : (
                <Button
                  variant="default"
                  size={isTVMode ? "lg" : "default"}
                  onClick={() => setShowPairingDialog(true)}
                  className="gap-2"
                >
                  <Link2 className="w-4 h-4" />
                  Link Device
                </Button>
              )}
            </div>
          </div>

          {/* Client-side API Key for fallback */}
          <div className="pt-4 border-t border-border/50 space-y-3">
            <div className="flex items-start gap-2">
              <Key className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
              <div className="space-y-1 flex-1">
                <Label className={cn(isTVMode ? "text-base" : "text-sm")}>
                  Manual API Key (Alternative)
                </Label>
                <p className={cn("text-muted-foreground", isTVMode ? "text-sm" : "text-xs")}>
                  Or enter your API key manually from{" "}
                  <a 
                    href="https://real-debrid.com/apitoken" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    real-debrid.com/apitoken
                  </a>
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showApiKey ? "text" : "password"}
                  placeholder="Enter Real-Debrid API key..."
                  value={clientRdApiKey}
                  onChange={(e) => setClientRdApiKey(e.target.value)}
                  className={cn("pr-10", isTVMode && "text-base h-12")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <Button
                variant="outline"
                size={isTVMode ? "lg" : "default"}
                onClick={() => {
                  if (clientRdApiKey.trim()) {
                    localStorage.setItem("realDebridApiKey", clientRdApiKey.trim());
                    toast.success("API key saved");
                  } else {
                    localStorage.removeItem("realDebridApiKey");
                    toast.success("API key removed");
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
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
              {" "}with your Real-Debrid key, then paste the manifest URL here. This creates a personalized endpoint that avoids rate limiting.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label className={cn(isTVMode ? "text-base" : "text-sm")}>
              Addon URL
            </Label>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://torrentio.strem.fun/realdebrid=YOUR_KEY/manifest.json"
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
                    // Validate URL format
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

      {/* Real-Debrid Pairing Dialog */}
      <RealDebridPairingDialog
        open={showPairingDialog}
        onOpenChange={setShowPairingDialog}
        onSuccess={() => {
          setIsOAuthConnected(true);
          setClientRdApiKey(localStorage.getItem("realDebridApiKey") || "");
          fetchRealDebridData();
        }}
        isTVMode={isTVMode}
      />

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
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Cache Limit</p>
              <p className={cn("font-medium", isTVMode && "text-lg")}>128 MB</p>
            </div>
            <div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Preload Mode</p>
              <p className={cn("font-medium", isTVMode && "text-lg")}>Auto (Full Buffer)</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Hardware Acceleration</p>
              <p className={cn("font-medium text-green-500", isTVMode && "text-lg")}>Enabled (GPU)</p>
            </div>
            <div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Rendering</p>
              <p className={cn("font-medium", isTVMode && "text-lg")}>GPU Compositing</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Audio Sync</p>
              <p className={cn("font-medium text-green-500", isTVMode && "text-lg")}>Low Latency</p>
            </div>
            <div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Pitch Preservation</p>
              <p className={cn("font-medium text-green-500", isTVMode && "text-lg")}>Enabled</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Audio Buffer</p>
              <p className={cn("font-medium", isTVMode && "text-lg")}>Optimized (50ms)</p>
            </div>
            <div>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Sync Tolerance</p>
              <p className={cn("font-medium", isTVMode && "text-lg")}>±25ms</p>
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
            Reload the app to get the latest features and bug fixes. Your data will be preserved.
          </p>
          <Button 
            size={isTVMode ? "tv" : "default"} 
            onClick={handleUpdateApp}
            disabled={isUpdating}
            className="gap-2"
          >
            {isUpdating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                Check for Updates
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* App Version */}
      <Card>
        <CardHeader>
          <CardTitle className={cn("flex items-center gap-2", isTVMode && "text-xl")}>
            <Info className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
            App Version
          </CardTitle>
          <CardDescription className={isTVMode ? "text-base" : ""}>
            Current build information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Version</span>
            <Badge variant="secondary" className={isTVMode ? "text-base px-3 py-1" : ""}>
              {import.meta.env.VITE_APP_VERSION || "1.0.0"}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Build Date</span>
            <span className={cn("text-foreground font-medium", isTVMode ? "text-base" : "text-sm")}>
              {import.meta.env.VITE_BUILD_DATE || new Date().toLocaleDateString()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>Environment</span>
            <Badge variant={import.meta.env.MODE === "production" ? "default" : "outline"} className={isTVMode ? "text-base px-3 py-1" : ""}>
              {import.meta.env.MODE}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Card>
        <CardHeader>
          <CardTitle className={cn("flex items-center gap-2 text-destructive", isTVMode && "text-xl")}>
            <LogOut className={cn(isTVMode ? "w-6 h-6" : "w-5 h-5")} />
            Sign Out
          </CardTitle>
          <CardDescription className={isTVMode ? "text-base" : ""}>Sign out of your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size={isTVMode ? "tv" : "default"} onClick={signOut}>
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
