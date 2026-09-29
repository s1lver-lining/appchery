package com.appchery.app;

import android.app.Activity;
import android.companion.AssociationInfo;
import android.companion.AssociationRequest;
import android.companion.BluetoothDeviceFilter;
import android.companion.CompanionDeviceManager;
import android.content.Context;
import android.content.IntentSender;
import android.os.Build;
import android.util.Log;

/**
 * The watch registered with Android as this app's companion, so that {@link WristCompanion} is
 * started when it comes near, whether or not the app is running. Without it, a phone app Android
 * has stopped holds no link, and the watch app opened later sits waiting for a phone.
 *
 * Asked once per watch, after the first link to it works: the system shows its own dialog, and a
 * refusal is remembered rather than asked again on every connection. Android 13 and later only,
 * where the association is answered by callback rather than by an activity result.
 */
final class Companion {

    private static final String TAG = "AppcheryCompanion";
    private static final String PREFS = "wrist";

    private Companion() {}

    static void ensure(Activity activity, String address) {
        if (activity == null || address == null || Build.VERSION.SDK_INT < 33) return;
        CompanionDeviceManager manager = activity.getSystemService(CompanionDeviceManager.class);
        if (manager == null) return;

        for (AssociationInfo known : manager.getMyAssociations()) {
            if (known.getDeviceMacAddress() != null
                    && address.equalsIgnoreCase(known.getDeviceMacAddress().toString())) {
                observe(manager, address);
                return;
            }
        }
        android.content.SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (address.equals(prefs.getString("declined", null))) return;

        AssociationRequest request = new AssociationRequest.Builder()
                .addDeviceFilter(new BluetoothDeviceFilter.Builder().setAddress(address).build())
                .setSingleDevice(true)
                .build();
        manager.associate(request, activity.getMainExecutor(), new CompanionDeviceManager.Callback() {
            @Override
            public void onAssociationPending(IntentSender chooser) {
                try {
                    activity.startIntentSender(chooser, null, 0, 0, 0);
                } catch (IntentSender.SendIntentException gone) {
                    Log.w(TAG, "could not show the dialog", gone);
                }
            }

            @Override
            public void onAssociationCreated(AssociationInfo created) {
                Log.i(TAG, "associated " + address);
                observe(manager, address);
            }

            @Override
            public void onFailure(CharSequence error) {
                // Refused, or the watch was not found by the system's own scan. Not asked again.
                Log.i(TAG, "not associated: " + error);
                prefs.edit().putString("declined", address).apply();
            }
        });
    }

    @SuppressWarnings("deprecation")
    private static void observe(CompanionDeviceManager manager, String address) {
        try {
            manager.startObservingDevicePresence(address);
        } catch (RuntimeException refused) {
            Log.w(TAG, "presence not observed", refused);
        }
    }
}
