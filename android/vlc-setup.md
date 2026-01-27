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

Add the Android TV features, VLCPlayerActivity, and required permissions:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- Add permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    
    <!-- Android TV Compatibility -->
    <!-- Touchscreen not required (for TV devices without touch) -->
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
    
    <!-- Leanback (Android TV interface) support -->
    <uses-feature android:name="android.software.leanback" android:required="false" />
    
    <application 
        android:banner="@mipmap/ic_launcher"
        ...>
        
        <!-- Existing MainActivity (keep as-is, just ensure it's NOT the LEANBACK_LAUNCHER) -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:label="@string/app_name"
            android:theme="@style/AppTheme.NoActionBarLaunch">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
        
        <!-- Leanback Launcher Activity for Android TV home screen -->
        <activity
            android:name=".LeanbackActivity"
            android:exported="true"
            android:theme="@style/Theme.Leanback"
            android:screenOrientation="landscape"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
        </activity>
        
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

**Note**: Set `android:required="false"` for leanback if you want the app to work on both phones and TVs. Set to `true` if it's TV-only.

### 3. Use the provided MainActivity

The project includes a pre-configured `MainActivity.java` at:
```
android/app/src/main/java/app/lovable/MainActivity.java
```

This MainActivity:
- Registers the VLC plugin
- Configures WebView for Android TV with `setFocusable(true)` and `setFocusableInTouchMode(true)`
- Requests focus for proper D-pad/air mouse navigation

**Copy this file** to your local Android project after running `npx cap add android`.

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
