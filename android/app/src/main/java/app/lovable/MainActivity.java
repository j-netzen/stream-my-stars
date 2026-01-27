package app.lovable;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import app.lovable.vlc.VLCPlayerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register VLC plugin
        registerPlugin(VLCPlayerPlugin.class);
        super.onCreate(savedInstanceState);
        
        // Configure WebView for Android TV navigation
        configureWebViewForTV();
    }
    
    private void configureWebViewForTV() {
        // Get the WebView from the bridge
        WebView webView = getBridge().getWebView();
        
        if (webView != null) {
            // Enable focus for D-pad and air mouse navigation
            webView.setFocusable(true);
            webView.setFocusableInTouchMode(true);
            
            // Request focus so the WebView receives key events
            webView.requestFocus();
        }
    }
}
