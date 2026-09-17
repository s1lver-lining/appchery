package com.appchery.probe;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Does the watch's radio accept the peripheral role, and can a browser on the phone reach it both
 * ways. Nothing here is meant to survive: it answers that and is deleted.
 */
public class ProbeActivity extends Activity {

    private static final UUID SERVICE = UUID.fromString("6e7d0001-b5a3-4f2e-9c11-8a2f3b6d4c70");
    private static final UUID SHOT = UUID.fromString("6e7d0002-b5a3-4f2e-9c11-8a2f3b6d4c70");
    private static final UUID TOTAL = UUID.fromString("6e7d0003-b5a3-4f2e-9c11-8a2f3b6d4c70");
    // Web Bluetooth's startNotifications() writes this descriptor, so a server without one is a
    // server the browser cannot subscribe to.
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private TextView log;
    private ScrollView scroll;
    private BluetoothGattServer server;
    private BluetoothGattCharacteristic shot;
    private BluetoothLeAdvertiser advertiser;
    private final Set<BluetoothDevice> subscribers = new LinkedHashSet<>();
    private int ordinal = 0;
    private int refused = 0;
    private final Handler ticker = new Handler(Looper.getMainLooper());
    // Shots on a timer, because the questions left are about a screen that is off and a tab that is
    // backgrounded, and neither can be answered by a finger on the button.
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            sendShot();
            ticker.postDelayed(this, 3000);
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(buildUi());

        String[] needed = {Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT};
        boolean granted = true;
        for (String p : needed) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) granted = false;
        }
        if (granted) start();
        else requestPermissions(needed, 1);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        for (int r : results) {
            if (r != PackageManager.PERMISSION_GRANTED) {
                say("DENIED: bluetooth permission refused, nothing to test");
                return;
            }
        }
        start();
    }

    private View buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(24, 24, 24, 24);

        Button send = new Button(this);
        send.setText("Send shot");
        send.setOnClickListener(v -> sendShot());
        root.addView(send, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        log = new TextView(this);
        log.setTextSize(11f);
        log.setGravity(Gravity.START);
        scroll = new ScrollView(this);
        scroll.addView(log);
        root.addView(scroll, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        return root;
    }

    private void start() {
        BluetoothManager manager = getSystemService(BluetoothManager.class);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null) {
            say("FAIL: no bluetooth adapter");
            return;
        }
        if (!adapter.isEnabled()) {
            say("FAIL: bluetooth is off");
            return;
        }

        // What the adapter claims, kept separate from what advertising actually does: the claim is
        // the vendor's answer and the callback is the radio's.
        say("claims advertising: " + adapter.isMultipleAdvertisementSupported());

        advertiser = adapter.getBluetoothLeAdvertiser();
        if (advertiser == null) {
            say("FAIL: no advertiser, peripheral role unavailable");
            return;
        }

        server = manager.openGattServer(this, serverCallback);
        if (server == null) {
            say("FAIL: could not open gatt server");
            return;
        }

        shot = new BluetoothGattCharacteristic(SHOT, BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                BluetoothGattCharacteristic.PERMISSION_READ);
        shot.addDescriptor(new BluetoothGattDescriptor(CCCD,
                BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE));

        BluetoothGattCharacteristic total = new BluetoothGattCharacteristic(TOTAL,
                BluetoothGattCharacteristic.PROPERTY_WRITE,
                BluetoothGattCharacteristic.PERMISSION_WRITE);

        BluetoothGattService service = new BluetoothGattService(SERVICE,
                BluetoothGattService.SERVICE_TYPE_PRIMARY);
        service.addCharacteristic(shot);
        service.addCharacteristic(total);
        server.addService(service);

        advertise();
    }

    private void advertise() {
        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .build();

        // A 128 bit uuid eats 18 of the 31 advertised bytes, so the name goes in the scan response
        // or the whole packet is rejected as too large.
        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .addServiceUuid(new ParcelUuid(SERVICE))
                .build();
        AdvertiseData response = new AdvertiseData.Builder().setIncludeDeviceName(true).build();

        advertiser.startAdvertising(settings, data, response, advertiseCallback);
    }

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settings) {
            say("OK: advertising, peripheral role works");
        }

        @Override
        public void onStartFailure(int error) {
            say("FAIL: advertising refused, code " + error + " (" + reason(error) + ")");
        }
    };

    private static String reason(int error) {
        switch (error) {
            case AdvertiseCallback.ADVERTISE_FAILED_DATA_TOO_LARGE: return "data too large";
            case AdvertiseCallback.ADVERTISE_FAILED_TOO_MANY_ADVERTISERS: return "too many advertisers";
            case AdvertiseCallback.ADVERTISE_FAILED_ALREADY_STARTED: return "already started";
            case AdvertiseCallback.ADVERTISE_FAILED_INTERNAL_ERROR: return "internal error";
            case AdvertiseCallback.ADVERTISE_FAILED_FEATURE_UNSUPPORTED: return "unsupported, no peripheral role";
            default: return "unknown";
        }
    }

    private final BluetoothGattServerCallback serverCallback = new BluetoothGattServerCallback() {
        @Override
        public void onConnectionStateChange(BluetoothDevice device, int status, int state) {
            if (state == BluetoothProfile.STATE_CONNECTED) say("connected: " + device.getAddress());
            else {
                subscribers.remove(device);
                if (subscribers.isEmpty()) ticker.removeCallbacks(tick);
                say("disconnected: " + device.getAddress() + " after " + ordinal + " shots, "
                        + refused + " refused");
            }
        }

        @Override
        public void onDescriptorWriteRequest(BluetoothDevice device, int requestId,
                BluetoothGattDescriptor descriptor, boolean preparedWrite, boolean responseNeeded,
                int offset, byte[] value) {
            if (CCCD.equals(descriptor.getUuid())) {
                boolean on = value.length > 0 && (value[0] & 0x01) != 0;
                if (on) {
                    subscribers.add(device);
                    ticker.removeCallbacks(tick);
                    ticker.postDelayed(tick, 3000);
                } else {
                    subscribers.remove(device);
                    if (subscribers.isEmpty()) ticker.removeCallbacks(tick);
                }
                say(on ? "subscribed, ticking every 3s" : "unsubscribed");
            }
            if (responseNeeded) server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
        }

        @Override
        public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId,
                BluetoothGattCharacteristic characteristic, boolean preparedWrite,
                boolean responseNeeded, int offset, byte[] value) {
            if (TOTAL.equals(characteristic.getUuid())) {
                say("total in: " + new String(value, StandardCharsets.UTF_8));
            }
            if (responseNeeded) server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
        }
    };

    private void sendShot() {
        if (server == null || shot == null) {
            say("not serving yet");
            return;
        }
        if (subscribers.isEmpty()) {
            say("nobody subscribed");
            return;
        }
        // Stands in for the real payload: ordinal plus a zone label is the shape the app will send.
        String payload = "{\"ordinal\":" + (++ordinal) + ",\"zone\":\"10\"}";
        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        shot.setValue(bytes);
        boolean all = true;
        for (BluetoothDevice device : subscribers) {
            // The stack's own answer on whether it took the notification, which is the only truth
            // available on this side once the phone screen is dark.
            if (!server.notifyCharacteristicChanged(device, shot, false)) all = false;
        }
        if (!all) refused++;
        say("shot out " + ordinal + (all ? " accepted" : " REFUSED") + ": " + payload);
    }

    private void say(String line) {
        // Also to logcat, so the answer can be read over adb instead of off a 1.4 inch screen.
        Log.i("AppcheryProbe", line);
        runOnUiThread(() -> {
            log.append(line + "\n");
            scroll.post(() -> scroll.fullScroll(View.FOCUS_DOWN));
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        ticker.removeCallbacks(tick);
        if (advertiser != null) advertiser.stopAdvertising(advertiseCallback);
        if (server != null) server.close();
    }
}
