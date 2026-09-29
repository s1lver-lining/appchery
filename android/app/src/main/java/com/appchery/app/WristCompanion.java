package com.appchery.app;

import android.companion.AssociationInfo;
import android.companion.CompanionDeviceService;
import android.util.Log;

/**
 * Started by Android when the registered watch comes near, and kept bound while it stays near,
 * which keeps this process alive with it. That is all it is for: the link itself is {@link Wrist}'s,
 * which waits for the watch app to open and then puts the page's last screen on it. See
 * {@link Companion} and doc/llm-memory/watch-link.md.
 */
public class WristCompanion extends CompanionDeviceService {

    @Override
    @SuppressWarnings("deprecation")
    public void onDeviceAppeared(AssociationInfo association) {
        Log.i("AppcheryCompanion", "watch near");
        RunFrames.remember(this);
        Wrist.get().wake(this);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onDeviceAppeared(String address) {
        Wrist.get().wake(this);
    }
}
