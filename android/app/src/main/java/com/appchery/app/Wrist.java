package com.appchery.app;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.UUID;

/**
 * The phone's end of the link to the watch, owned here rather than by a plugin driven from the page.
 *
 * The page cannot be the one holding it. Android freezes a backgrounded webview's timers, so a run
 * with the screen off, which is how a run is actually run, had the wrist showing figures minutes
 * old: the Bluetooth stack was fine and nobody was telling it to write. With the connection here,
 * {@link TraceService} can keep the wrist fed from the fixes it is already waking for, and the page
 * drives the same link when it is awake. One owner, either way. See doc/llm-memory/running.md.
 *
 * A process singleton because there is one watch and one link, and both outlive any page or service.
 */
final class Wrist {

    private static final String TAG = "AppcheryWrist";

    // The same three as src/lib/watch/ble.ts. Changing one means changing both halves.
    private static final UUID SERVICE = UUID.fromString("6e7d0001-b5a3-4f2e-9c11-8a2f3b6d4c70");
    private static final UUID TO_PHONE = UUID.fromString("6e7d0002-b5a3-4f2e-9c11-8a2f3b6d4c70");
    private static final UUID TO_WATCH = UUID.fromString("6e7d0003-b5a3-4f2e-9c11-8a2f3b6d4c70");
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    /** Asked for once on connecting. Refused, the link still works at the default twenty three. */
    private static final int WANTED_MTU = 247;
    /** Long enough for a watch that is awake and near, short enough to be an answer rather than a hang. */
    private static final long CONNECT_TIMEOUT_MS = 12_000;

    interface Listener {
        /** The link is up and both characteristics are working, or it is not and this says why. */
        void onReady(boolean ok, String reason);

        void onBytes(byte[] bytes);

        /** Gone, as opposed to given up: the page decides whether to say so or to try again. */
        void onLost();

        /** The watch app restarted under a link that stayed up, and knows nothing of this phone. */
        void onRestarted();
    }

    private static Wrist instance;

    static synchronized Wrist get() {
        if (instance == null) instance = new Wrist();
        return instance;
    }

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayDeque<byte[]> outbox = new ArrayDeque<>();

    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic toWatch;
    private Listener listener;
    private String address;
    private boolean ready = false;
    private boolean sending = false;
    /** Set before a disconnect we asked for, so a link being closed is not reported as one lost. */
    private boolean closing = false;
    private Runnable timeout;
    /** Subscribing again under a link already up, after the watch app restarted beneath it. */
    private boolean resubscribing = false;

    /** When the page last wrote, so the service can tell a page that is asleep from one that is busy. */
    private static volatile long pageWroteAt = 0;

    static long lastPageWrite() {
        return pageWroteAt;
    }

    void pageWrote() {
        pageWroteAt = android.os.SystemClock.elapsedRealtime();
    }

    boolean isReady() {
        return ready;
    }

    String address() {
        return address;
    }

    synchronized void connect(Context context, String wanted, Listener whoAsked) {
        disconnect();
        listener = whoAsked;
        address = wanted;
        closing = false;
        ready = false;
        resubscribing = false;

        BluetoothManager manager = context.getSystemService(BluetoothManager.class);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            finish(false, "bluetooth-off");
            return;
        }

        BluetoothDevice device;
        try {
            device = adapter.getRemoteDevice(wanted);
        } catch (IllegalArgumentException notAnAddress) {
            finish(false, "failed");
            return;
        }

        try {
            // Never autoConnect: that waits forever in the background, and a watch left at home has
            // to be reported as not found rather than connected to whenever it next appears.
            gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE);
        } catch (SecurityException denied) {
            finish(false, "no-permission");
            return;
        }
        if (gatt == null) {
            finish(false, "failed");
            return;
        }

        timeout = () -> {
            if (!ready) {
                Log.i(TAG, "connect timed out");
                closeGatt();
                finish(false, "not-found");
            }
        };
        main.postDelayed(timeout, CONNECT_TIMEOUT_MS);
    }

    synchronized void disconnect() {
        closing = true;
        ready = false;
        outbox.clear();
        sending = false;
        toWatch = null;
        if (timeout != null) main.removeCallbacks(timeout);
        timeout = null;
        closeGatt();
    }

    private void closeGatt() {
        if (gatt == null) return;
        try {
            gatt.disconnect();
            gatt.close();
        } catch (SecurityException denied) {
            // Nothing left to do about a link we are giving up anyway.
        }
        gatt = null;
    }

    /**
     * One message, queued. Written without a response: a message is asserted whole and asserted
     * again if it never lands, so waiting for a confirmation per write buys a round trip and
     * nothing else. The queue exists because the stack carries one operation at a time.
     */
    synchronized void write(byte[] bytes) {
        if (!ready || gatt == null || toWatch == null) return;
        outbox.add(bytes);
        // Dropped from the front: what is stale here is a frame of a run, and the next one is better.
        while (outbox.size() > 24) outbox.poll();
        pump();
    }

    private synchronized void pump() {
        if (sending || outbox.isEmpty() || gatt == null || toWatch == null) return;
        byte[] bytes = outbox.peek();
        sending = true;
        boolean queued;
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                queued = gatt.writeCharacteristic(toWatch, bytes,
                        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE) == BluetoothGatt.GATT_SUCCESS;
            } else {
                toWatch.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                toWatch.setValue(bytes);
                queued = gatt.writeCharacteristic(toWatch);
            }
        } catch (SecurityException denied) {
            queued = false;
        }
        if (!queued) {
            // The stack is busy rather than gone: tried again rather than dropped.
            sending = false;
            main.postDelayed(this::pump, 25);
            return;
        }
        outbox.poll();
    }

    private void finish(boolean ok, String reason) {
        Listener told = listener;
        if (resubscribing) {
            // The connect call was answered long ago: a link that cannot subscribe again is a link lost.
            resubscribing = false;
            ready = false;
            if (told != null) main.post(told::onLost);
            return;
        }
        if (told != null) main.post(() -> told.onReady(ok, reason));
    }

    private final BluetoothGattCallback callback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt link, int status, int state) {
            if (state == BluetoothProfile.STATE_CONNECTED) {
                try {
                    // The MTU first: a larger one is what lets a round travel in one write, and
                    // asking after discovery restarts the negotiation on some stacks.
                    if (!link.requestMtu(WANTED_MTU)) link.discoverServices();
                } catch (SecurityException denied) {
                    finish(false, "no-permission");
                }
                return;
            }
            if (state == BluetoothProfile.STATE_DISCONNECTED) {
                boolean wasReady = ready;
                ready = false;
                Listener told = listener;
                if (closing || told == null) return;
                if (wasReady) main.post(told::onLost);
                else finish(false, "not-found");
            }
        }

        @Override
        public void onMtuChanged(BluetoothGatt link, int mtu, int status) {
            Log.i(TAG, "mtu " + mtu);
            try {
                link.discoverServices();
            } catch (SecurityException denied) {
                finish(false, "no-permission");
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt link, int status) {
            BluetoothGattService service = link.getService(SERVICE);
            if (service == null) {
                // The address was remembered from a watch that had it, so this is the watch app gone.
                closeGatt();
                finish(false, "no-service");
                return;
            }
            toWatch = service.getCharacteristic(TO_WATCH);
            BluetoothGattCharacteristic toPhone = service.getCharacteristic(TO_PHONE);
            if (toWatch == null || toPhone == null) {
                closeGatt();
                finish(false, "no-service");
                return;
            }
            try {
                link.setCharacteristicNotification(toPhone, true);
                BluetoothGattDescriptor cccd = toPhone.getDescriptor(CCCD);
                if (cccd == null) {
                    closeGatt();
                    finish(false, "no-service");
                    return;
                }
                // The subscription is the descriptor write, not the call above: without it the watch
                // has no subscriber and everything it says is dropped at its end, in silence.
                if (Build.VERSION.SDK_INT >= 33) {
                    link.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                } else {
                    cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    link.writeDescriptor(cccd);
                }
            } catch (SecurityException denied) {
                finish(false, "no-permission");
            }
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt link, BluetoothGattDescriptor descriptor, int status) {
            if (!CCCD.equals(descriptor.getUuid())) return;
            if (timeout != null) main.removeCallbacks(timeout);
            timeout = null;
            if (status != BluetoothGatt.GATT_SUCCESS) {
                closeGatt();
                finish(false, "no-service");
                return;
            }
            ready = true;
            if (resubscribing) {
                resubscribing = false;
                Listener told = listener;
                if (told != null) main.post(told::onRestarted);
                return;
            }
            finish(true, null);
        }

        @Override
        public void onServiceChanged(BluetoothGatt link) {
            if (!ready) return;
            // The stack drops our notification registration with the old service, so it is made again.
            resubscribing = true;
            try {
                if (!link.discoverServices()) finish(false, "failed");
            } catch (SecurityException denied) {
                finish(false, "no-permission");
            }
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt link, BluetoothGattCharacteristic ch, int status) {
            sending = false;
            pump();
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt link, BluetoothGattCharacteristic ch, byte[] value) {
            deliver(ch, value);
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onCharacteristicChanged(BluetoothGatt link, BluetoothGattCharacteristic ch) {
            deliver(ch, ch.getValue());
        }
    };

    private void deliver(BluetoothGattCharacteristic ch, byte[] value) {
        if (!TO_PHONE.equals(ch.getUuid()) || value == null) return;
        byte[] copy = value.clone();
        /*
         * Offered to the run first. A run button pressed while the page is frozen has nowhere else
         * to go: the page is where a run is driven from, and a page Android has stopped calling is
         * not going to drive anything. RunFrames takes it only when the page has plainly gone quiet,
         * and hands back what it did when the page comes round.
         */
        String type = typeOf(copy);
        if (type != null && type.length() == 2 && type.charAt(0) == 'r' && RunFrames.command(type)) return;
        /*
         * A beat is offered to the run and then delivered anyway. It is not a command: nothing acts
         * on it, and the page is where it is written down. Buffered here only while the page is
         * asleep, because a run is spent with the screen off and a graph with an hour missing out of
         * the middle of it is not a graph.
         */
        if ("hr".equals(type)) RunFrames.heard(beatOf(copy));
        Listener told = listener;
        if (told == null) return;
        main.post(() -> told.onBytes(copy));
    }

    /** The beat out of a message already known to be one, or zero where it is not a number. */
    private static int beatOf(byte[] bytes) {
        try {
            return new org.json.JSONObject(new String(bytes, StandardCharsets.UTF_8)).optInt("b", 0);
        } catch (org.json.JSONException notOurs) {
            return 0;
        }
    }

    /** The `t` of a message, without parsing the whole of one on a Bluetooth callback. */
    private static String typeOf(byte[] bytes) {
        try {
            return new org.json.JSONObject(new String(bytes, StandardCharsets.UTF_8)).optString("t", null);
        } catch (org.json.JSONException notOurs) {
            return null;
        }
    }

    /** Only for the log and for a message that has to say something about what was sent. */
    static String text(byte[] bytes) {
        return new String(bytes, StandardCharsets.UTF_8);
    }
}
