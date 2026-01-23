package app.lovable.vlc;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.SeekBar;
import android.widget.TextView;

import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.util.VLCVideoLayout;

import java.util.ArrayList;

/**
 * Native Android Activity for VLC video playback
 * Handles LibVLC initialization, playback controls, and resource management
 */
public class VLCPlayerActivity extends Activity implements MediaPlayer.EventListener {
    private static final String TAG = "VLCPlayerActivity";

    // Intent extras
    public static final String EXTRA_URL = "url";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ASPECT_RATIO = "aspectRatio";
    public static final String EXTRA_START_POSITION = "startPosition";
    
    // Result extras
    public static final String RESULT_COMPLETED = "completed";
    public static final String RESULT_POSITION = "position";
    public static final String RESULT_DURATION = "duration";

    private LibVLC libVLC;
    private MediaPlayer mediaPlayer;
    private VLCVideoLayout videoLayout;
    
    // UI Controls
    private View controlsOverlay;
    private ImageButton playPauseButton;
    private ImageButton closeButton;
    private ImageButton aspectButton;
    private SeekBar seekBar;
    private TextView titleText;
    private TextView timeText;
    private TextView durationText;
    
    private boolean controlsVisible = true;
    private boolean isSeekBarTracking = false;
    private boolean playbackCompleted = false;
    private int currentAspectMode = 0;
    
    private static final String[] ASPECT_MODES = {"fit", "fill", "16:9", "4:3"};
    
    private final Runnable hideControlsRunnable = () -> {
        if (mediaPlayer != null && mediaPlayer.isPlaying()) {
            hideControls();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Fullscreen immersive mode
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        );
        
        setContentView(getLayoutResourceId());
        
        initializeViews();
        initializeVLC();
        startPlayback();
    }
    
    private int getLayoutResourceId() {
        return getResources().getIdentifier("activity_vlc_player", "layout", getPackageName());
    }

    private void initializeViews() {
        videoLayout = findViewById(getResourceId("video_layout"));
        controlsOverlay = findViewById(getResourceId("controls_overlay"));
        playPauseButton = findViewById(getResourceId("btn_play_pause"));
        closeButton = findViewById(getResourceId("btn_close"));
        aspectButton = findViewById(getResourceId("btn_aspect"));
        seekBar = findViewById(getResourceId("seek_bar"));
        titleText = findViewById(getResourceId("text_title"));
        timeText = findViewById(getResourceId("text_time"));
        durationText = findViewById(getResourceId("text_duration"));
        
        // Set title
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        if (title != null && titleText != null) {
            titleText.setText(title);
        }
        
        // Touch listener for showing/hiding controls
        videoLayout.setOnClickListener(v -> toggleControls());
        
        // Play/Pause button
        if (playPauseButton != null) {
            playPauseButton.setOnClickListener(v -> togglePlayPause());
        }
        
        // Close button
        if (closeButton != null) {
            closeButton.setOnClickListener(v -> finishWithResult());
        }
        
        // Aspect ratio button
        if (aspectButton != null) {
            aspectButton.setOnClickListener(v -> cycleAspectRatio());
        }
        
        // Seek bar
        if (seekBar != null) {
            seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override
                public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                    if (fromUser && mediaPlayer != null) {
                        updateTimeDisplay(progress);
                    }
                }

                @Override
                public void onStartTrackingTouch(SeekBar seekBar) {
                    isSeekBarTracking = true;
                }

                @Override
                public void onStopTrackingTouch(SeekBar seekBar) {
                    isSeekBarTracking = false;
                    if (mediaPlayer != null) {
                        float position = (float) seekBar.getProgress() / seekBar.getMax();
                        mediaPlayer.setPosition(position);
                    }
                }
            });
        }
    }
    
    private int getResourceId(String name) {
        return getResources().getIdentifier(name, "id", getPackageName());
    }

    private void initializeVLC() {
        ArrayList<String> options = new ArrayList<>();
        options.add("--aout=opensles");
        options.add("--audio-time-stretch");
        options.add("-vvv"); // Verbose logging for debugging
        options.add("--avcodec-skiploopfilter");
        options.add("--avcodec-skip-frame");
        options.add("--avcodec-skip-idct");
        options.add("--network-caching=3000");
        options.add("--file-caching=3000");
        
        try {
            libVLC = new LibVLC(this, options);
            mediaPlayer = new MediaPlayer(libVLC);
            mediaPlayer.setEventListener(this);
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize LibVLC", e);
            finishWithError("Failed to initialize video player");
        }
    }

    private void startPlayback() {
        String url = getIntent().getStringExtra(EXTRA_URL);
        int startPosition = getIntent().getIntExtra(EXTRA_START_POSITION, 0);
        
        if (url == null || url.isEmpty()) {
            finishWithError("No video URL provided");
            return;
        }
        
        Log.d(TAG, "Starting playback: " + url.substring(0, Math.min(80, url.length())));
        
        try {
            mediaPlayer.attachViews(videoLayout, null, false, false);
            
            Media media = new Media(libVLC, Uri.parse(url));
            media.setHWDecoderEnabled(true, false);
            media.addOption(":network-caching=3000");
            
            mediaPlayer.setMedia(media);
            media.release();
            
            mediaPlayer.play();
            
            // Seek to start position if specified
            if (startPosition > 0) {
                mediaPlayer.setTime(startPosition);
            }
            
            // Auto-hide controls after 3 seconds
            scheduleHideControls();
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to start playback", e);
            finishWithError("Failed to play video");
        }
    }

    @Override
    public void onEvent(MediaPlayer.Event event) {
        switch (event.type) {
            case MediaPlayer.Event.Playing:
                runOnUiThread(() -> updatePlayPauseButton(true));
                break;
                
            case MediaPlayer.Event.Paused:
                runOnUiThread(() -> updatePlayPauseButton(false));
                break;
                
            case MediaPlayer.Event.EndReached:
                playbackCompleted = true;
                runOnUiThread(this::finishWithResult);
                break;
                
            case MediaPlayer.Event.EncounteredError:
                Log.e(TAG, "VLC encountered an error");
                runOnUiThread(() -> finishWithError("Playback error occurred"));
                break;
                
            case MediaPlayer.Event.TimeChanged:
                if (!isSeekBarTracking) {
                    runOnUiThread(this::updateSeekBar);
                }
                break;
                
            case MediaPlayer.Event.LengthChanged:
                runOnUiThread(this::updateDuration);
                break;
        }
    }

    private void togglePlayPause() {
        if (mediaPlayer != null) {
            if (mediaPlayer.isPlaying()) {
                mediaPlayer.pause();
            } else {
                mediaPlayer.play();
                scheduleHideControls();
            }
        }
    }

    private void updatePlayPauseButton(boolean isPlaying) {
        if (playPauseButton != null) {
            // Update button icon based on state
            int iconRes = isPlaying 
                ? getResourceId("ic_pause") 
                : getResourceId("ic_play");
            if (iconRes != 0) {
                playPauseButton.setImageResource(iconRes);
            }
        }
    }

    private void updateSeekBar() {
        if (seekBar != null && mediaPlayer != null) {
            float position = mediaPlayer.getPosition();
            seekBar.setProgress((int) (position * seekBar.getMax()));
            updateTimeDisplay((int) (position * seekBar.getMax()));
        }
    }

    private void updateDuration() {
        if (durationText != null && mediaPlayer != null) {
            long duration = mediaPlayer.getLength();
            durationText.setText(formatTime(duration));
        }
    }

    private void updateTimeDisplay(int progress) {
        if (timeText != null && mediaPlayer != null) {
            long duration = mediaPlayer.getLength();
            long time = (long) ((float) progress / 1000 * duration);
            timeText.setText(formatTime(time));
        }
    }

    private String formatTime(long millis) {
        long seconds = millis / 1000;
        long minutes = seconds / 60;
        long hours = minutes / 60;
        
        if (hours > 0) {
            return String.format("%d:%02d:%02d", hours, minutes % 60, seconds % 60);
        } else {
            return String.format("%d:%02d", minutes, seconds % 60);
        }
    }

    private void cycleAspectRatio() {
        currentAspectMode = (currentAspectMode + 1) % ASPECT_MODES.length;
        applyAspectRatio(ASPECT_MODES[currentAspectMode]);
    }

    private void applyAspectRatio(String mode) {
        if (mediaPlayer == null) return;
        
        switch (mode) {
            case "fit":
                mediaPlayer.setVideoScale(MediaPlayer.ScaleType.SURFACE_BEST_FIT);
                break;
            case "fill":
                mediaPlayer.setVideoScale(MediaPlayer.ScaleType.SURFACE_FILL);
                break;
            case "16:9":
                mediaPlayer.setVideoScale(MediaPlayer.ScaleType.SURFACE_16_9);
                break;
            case "4:3":
                mediaPlayer.setVideoScale(MediaPlayer.ScaleType.SURFACE_4_3);
                break;
        }
    }

    private void toggleControls() {
        if (controlsVisible) {
            hideControls();
        } else {
            showControls();
        }
    }

    private void showControls() {
        if (controlsOverlay != null) {
            controlsOverlay.setVisibility(View.VISIBLE);
            controlsVisible = true;
            scheduleHideControls();
        }
    }

    private void hideControls() {
        if (controlsOverlay != null) {
            controlsOverlay.setVisibility(View.GONE);
            controlsVisible = false;
        }
    }

    private void scheduleHideControls() {
        if (controlsOverlay != null) {
            controlsOverlay.removeCallbacks(hideControlsRunnable);
            controlsOverlay.postDelayed(hideControlsRunnable, 3000);
        }
    }

    private void finishWithResult() {
        Intent resultIntent = new Intent();
        resultIntent.putExtra(RESULT_COMPLETED, playbackCompleted);
        
        if (mediaPlayer != null) {
            resultIntent.putExtra(RESULT_POSITION, mediaPlayer.getTime());
            resultIntent.putExtra(RESULT_DURATION, mediaPlayer.getLength());
        }
        
        setResult(RESULT_OK, resultIntent);
        finish();
    }

    private void finishWithError(String message) {
        Log.e(TAG, message);
        Intent resultIntent = new Intent();
        resultIntent.putExtra(RESULT_COMPLETED, false);
        resultIntent.putExtra(RESULT_POSITION, 0L);
        resultIntent.putExtra(RESULT_DURATION, 0L);
        setResult(RESULT_CANCELED, resultIntent);
        finish();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mediaPlayer != null) {
            mediaPlayer.pause();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        releasePlayer();
    }

    /**
     * Properly release MediaPlayer and LibVLC resources to prevent memory leaks
     */
    private void releasePlayer() {
        if (mediaPlayer != null) {
            mediaPlayer.stop();
            mediaPlayer.detachViews();
            mediaPlayer.release();
            mediaPlayer = null;
        }
        
        if (libVLC != null) {
            libVLC.release();
            libVLC = null;
        }
        
        Log.d(TAG, "VLC resources released");
    }

    @Override
    public void onBackPressed() {
        finishWithResult();
    }
}
