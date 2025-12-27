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
import { Settings, User, Database, LogOut, Zap, RefreshCw, Loader2, CheckCircle, XCircle, Clock, Download, Tv, Monitor, Maximize2, RotateCcw, Info, Film, Wifi, WifiOff, Gauge } from "lucide-react";
import { getRealDebridUser, listDownloads, RealDebridUser, RealDebridUnrestrictedLink } from "@/lib/realDebrid";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { checkBrowserSupport } from "@/lib/ffmpegTranscode";

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
  
  // Auto-transcode MKV setting
  const [autoTranscodeMkv, setAutoTranscodeMkv] = useState(() => {
    return localStorage.getItem('auto-transcode-mkv') === 'true';
  });
  const ffmpegSupport = checkBrowserSupport();

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

  const handleAutoTranscodeChange = (enabled: boolean) => {
    setAutoTranscodeMkv(enabled);
    localStorage.setItem('auto-transcode-mkv', enabled ? 'true' : 'false');
    toast.success(enabled ? "Auto-convert MKV enabled" : "Auto-convert MKV disabled");
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
          {/* Auto-play */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-play" className={cn("font-medium", isTVMode && "text-lg")}>
                Auto-play videos
              </Label>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                Automatically start playing when a video is opened
              </p>
            </div>
            <Switch
              id="auto-play"
              checked={playbackSettings.autoPlay}
              onCheckedChange={(checked) => updatePlaybackSetting('autoPlay', checked)}
              className={isTVMode ? "scale-125" : ""}
            />
          </div>

          {/* Auto-fullscreen */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-fullscreen" className={cn("font-medium", isTVMode && "text-lg")}>
                Auto-fullscreen
              </Label>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                Automatically enter fullscreen when video starts playing
              </p>
            </div>
            <Switch
              id="auto-fullscreen"
              checked={playbackSettings.autoFullscreen}
              onCheckedChange={(checked) => updatePlaybackSetting('autoFullscreen', checked)}
              className={isTVMode ? "scale-125" : ""}
            />
          </div>

          {/* Auto-transcode MKV */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-transcode" className={cn("font-medium", isTVMode && "text-lg")}>
                Auto-convert MKV files
              </Label>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                Automatically convert MKV files to MP4 for browser playback
              </p>
            </div>
            <Switch
              id="auto-transcode"
              checked={autoTranscodeMkv}
              onCheckedChange={handleAutoTranscodeChange}
              disabled={!ffmpegSupport.supported}
              className={isTVMode ? "scale-125" : ""}
            />
          </div>
          
          {!ffmpegSupport.supported && (
            <div className={cn(
              "flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive",
              isTVMode ? "text-base" : "text-sm"
            )}>
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span>{ffmpegSupport.reason || "Your browser doesn't support MKV conversion"}</span>
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

          {/* Preload on Hover */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="preload-hover" className={cn("font-medium", isTVMode && "text-lg")}>
                Preload on hover
              </Label>
              <p className={cn("text-muted-foreground", isTVMode ? "text-base" : "text-sm")}>
                Start loading video when hovering on a title (faster playback start)
              </p>
            </div>
            <Switch
              id="preload-hover"
              checked={playbackSettings.preloadOnHover}
              onCheckedChange={(checked) => updatePlaybackSetting('preloadOnHover', checked)}
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
