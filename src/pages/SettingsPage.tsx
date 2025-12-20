import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, User, Database, LogOut, Zap, RefreshCw, Loader2, CheckCircle, XCircle, Clock, Download } from "lucide-react";
import { getRealDebridUser, listDownloads, RealDebridUser, RealDebridUnrestrictedLink } from "@/lib/realDebrid";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [rdUser, setRdUser] = useState<RealDebridUser | null>(null);
  const [rdDownloads, setRdDownloads] = useState<RealDebridUnrestrictedLink[]>([]);
  const [isLoadingRd, setIsLoadingRd] = useState(false);
  const [rdError, setRdError] = useState<string | null>(null);

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

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-500/20 rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-gray-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account and preferences
          </p>
        </div>
      </div>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Account
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">{user?.email}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">User ID</p>
            <p className="font-mono text-sm">{user?.id}</p>
          </div>
        </CardContent>
      </Card>

      {/* Real-Debrid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-green-500" />
                Real-Debrid
              </CardTitle>
              <CardDescription>Premium link unrestriction service</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchRealDebridData} disabled={isLoadingRd}>
              {isLoadingRd ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {rdError ? (
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="w-4 h-4" />
              <span className="text-sm">{rdError}</span>
            </div>
          ) : isLoadingRd && !rdUser ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading account info...</span>
            </div>
          ) : rdUser ? (
            <>
              {/* Account Status */}
              <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  {rdUser.avatar && (
                    <img src={rdUser.avatar} alt="Avatar" className="w-10 h-10 rounded-full" />
                  )}
                  <div>
                    <p className="font-medium">{rdUser.username}</p>
                    <p className="text-sm text-muted-foreground">{rdUser.email}</p>
                  </div>
                </div>
                <Badge variant={isPremium ? "default" : "secondary"} className={isPremium ? "bg-green-500" : ""}>
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
                  <span className="text-sm">
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
                <span className="text-sm">{rdUser.points} fidelity points</span>
              </div>

              {/* Recent Downloads */}
              {rdDownloads.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Recent Downloads
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {rdDownloads.map((dl) => (
                      <div key={dl.id} className="flex items-center justify-between p-2 bg-secondary/20 rounded text-sm">
                        <span className="truncate flex-1 mr-2">{dl.filename}</span>
                        <span className="text-muted-foreground whitespace-nowrap">{formatBytes(dl.filesize)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Real-Debrid API key not configured or invalid.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Storage Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Storage
          </CardTitle>
          <CardDescription>Video caching information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Max Resolution</p>
              <p className="font-medium">4K / 2160p</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Frame Rate</p>
              <p className="font-medium">60 FPS</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Max Bitrate</p>
              <p className="font-medium">50 Mbps</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <p className="text-sm text-muted-foreground">Cache Limit</p>
              <p className="font-medium">128 MB</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Preload Mode</p>
              <p className="font-medium">Auto (Full Buffer)</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <p className="text-sm text-muted-foreground">Hardware Acceleration</p>
              <p className="font-medium text-green-500">Enabled (GPU)</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Rendering</p>
              <p className="font-medium">GPU Compositing</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <p className="text-sm text-muted-foreground">Audio Sync</p>
              <p className="font-medium text-green-500">Low Latency</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pitch Preservation</p>
              <p className="font-medium text-green-500">Enabled</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <p className="text-sm text-muted-foreground">Audio Buffer</p>
              <p className="font-medium">Optimized (50ms)</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sync Tolerance</p>
              <p className="font-medium">±25ms</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Video chunks are cached locally for smoother playback. Cache is
            automatically managed and cleared when full.
          </p>
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <LogOut className="w-5 h-5" />
            Sign Out
          </CardTitle>
          <CardDescription>Sign out of your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={signOut}>
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
