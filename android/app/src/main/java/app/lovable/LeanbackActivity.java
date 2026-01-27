package app.lovable;

import android.content.Intent;
import android.os.Bundle;

import androidx.annotation.Nullable;
import androidx.fragment.app.FragmentActivity;

/**
 * Leanback launcher activity for Android TV.
 * This activity is the entry point when launching from the Android TV home screen.
 * It immediately redirects to the main Capacitor activity.
 */
public class LeanbackActivity extends FragmentActivity {
    
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Launch the main Capacitor activity
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        
        // Finish this activity so back button doesn't return here
        finish();
    }
}
