package app.lovable.vlc;

import android.content.Intent;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor Plugin for native VLC video playback
 * Supports non-standard codecs (MKV, AVI, DTS, etc.) via LibVLC
 */
@CapacitorPlugin(name = "VLCPlayer")
public class VLCPlayerPlugin extends Plugin {
    private static final String TAG = "VLCPlayerPlugin";
    private static final int REQUEST_CODE_VLC = 1001;
    
    private PluginCall savedCall;

    @PluginMethod
    public void playVideo(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "Video");
        String aspectRatio = call.getString("aspectRatio", "fit");
        Integer startPosition = call.getInt("startPosition", 0);

        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        Log.d(TAG, "Starting VLC playback: " + url.substring(0, Math.min(80, url.length())));
        
        // Save call for result callback
        savedCall = call;

        Intent intent = new Intent(getContext(), VLCPlayerActivity.class);
        intent.putExtra(VLCPlayerActivity.EXTRA_URL, url);
        intent.putExtra(VLCPlayerActivity.EXTRA_TITLE, title);
        intent.putExtra(VLCPlayerActivity.EXTRA_ASPECT_RATIO, aspectRatio);
        intent.putExtra(VLCPlayerActivity.EXTRA_START_POSITION, startPosition);
        
        startActivityForResult(call, intent, REQUEST_CODE_VLC);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", true);
        call.resolve(result);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_CODE_VLC && savedCall != null) {
            JSObject result = new JSObject();
            
            if (data != null) {
                result.put("completed", data.getBooleanExtra(VLCPlayerActivity.RESULT_COMPLETED, false));
                result.put("position", data.getLongExtra(VLCPlayerActivity.RESULT_POSITION, 0));
                result.put("duration", data.getLongExtra(VLCPlayerActivity.RESULT_DURATION, 0));
            } else {
                result.put("completed", false);
                result.put("position", 0);
                result.put("duration", 0);
            }
            
            savedCall.resolve(result);
            savedCall = null;
        }
    }
}
