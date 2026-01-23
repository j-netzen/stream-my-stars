# VLC Player Native Integration Setup

This document describes how to set up the native VLC player for your Capacitor Android app.

## Prerequisites

1. Android Studio installed
2. Project exported to GitHub and cloned locally
3. Android platform added via `npx cap add android`

## Setup Steps

### 1. Update `android/app/build.gradle`

Add LibVLC dependency to your `dependencies` block:

```gradle
dependencies {
    // ... existing dependencies ...
    
    // LibVLC for native video playback
    implementation 'org.videolan.android:libvlc-all:3.5.1'
}
```

### 2. Update `android/app/src/main/AndroidManifest.xml`

Add the VLCPlayerActivity and required permissions:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- Add permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    
    <application ...>
        <!-- Existing activities -->
        
        <!-- Add VLC Player Activity -->
        <activity
            android:name="app.lovable.vlc.VLCPlayerActivity"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:screenOrientation="sensorLandscape"
            android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen"
            android:exported="false" />
    </application>
</manifest>
```

### 3. Register the Plugin in MainActivity

Update `android/app/src/main/java/.../MainActivity.java`:

```java
import app.lovable.vlc.VLCPlayerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VLCPlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

### 4. Create Package Directory

Ensure the package directory exists:
```
android/app/src/main/java/app/lovable/vlc/
```

Copy the following files to this directory:
- `VLCPlayerPlugin.java`
- `VLCPlayerActivity.java`

### 5. Build and Run

```bash
npx cap sync android
npx cap run android
```

## Usage in Frontend

```typescript
import { useNativePlayer } from '@/hooks/useNativePlayer';

function MyVideoComponent() {
  const { shouldUseNativePlayer, playWithVLC, getCompatibilityWarning } = useNativePlayer();
  
  const handlePlay = async (url: string) => {
    if (shouldUseNativePlayer(url)) {
      await playWithVLC({ url, title: 'My Video' });
    } else {
      // Use web player
    }
  };
}
```

## Supported Formats

The VLC player supports:
- **Containers**: MKV, AVI, WMV, FLV, TS, M2TS, MOV, MP4, WebM
- **Video Codecs**: H.264, H.265/HEVC, VP8, VP9, MPEG-2, MPEG-4
- **Audio Codecs**: AAC, AC3, E-AC3, DTS, DTS-HD, TrueHD, FLAC, Opus, Vorbis

## Troubleshooting

### "Cannot resolve symbol LibVLC"
Ensure you've added the dependency and synced Gradle.

### Black screen with audio
Try cycling the aspect ratio button or check if hardware decoding is disabled for your device.

### Playback stuttering
Increase network caching values in VLCPlayerActivity.java.
