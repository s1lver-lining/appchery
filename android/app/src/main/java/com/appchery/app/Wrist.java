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
import java.util.Iterator;
import java.util.LinkedHashMap;
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

        /** A control from the wrist changed the run here, for the page to adopt, see RunFrames.control. */
        void onRunChanged();
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
    /** How long a write may go unconfirmed. One lost during a rediscovery otherwise held the queue for good. */
    private static final long SENT_TIMEOUT_MS = 1_000;
    private final Runnable sentGuard = () -> {
        synchronized (this) {
            sending = false;
        }
        pump();
    };
    /** Set before a disconnect we asked for, so a link being closed is not reported as one lost. */
    private boolean closing = false;
    private Runnable timeout;
    /** Subscribing again under a link already up, after the watch app restarted beneath it. */
    private boolean resubscribing = false;
    /** Reconnecting by itself mid run, with the page frozen and in no position to ask. */
    private boolean rejoining = false;
    private Context context;

    /** When the page last wrote, so the service can tell a page that is asleep from one that is busy. */
    private static volatile long pageWroteAt = 0;

    static long lastPageWrite() {
        return pageWroteAt;
    }

    void pageWrote() {
        pageWroteAt = android.os.SystemClock.elapsedRealtime();
    }

    /** How long the page has to have been silent before this speaks for it, as in RunFrames. */
    private static final long QUIET_MS = 4000;

    private static boolean pageQuiet() {
        return android.os.SystemClock.elapsedRealtime() - pageWroteAt >= QUIET_MS;
    }

    /**
     * What the page last told the watch, newest per subject: the session and its activities, the
     * screen, the round and its ends. A watch app started with the phone asleep subscribes, says
     * linked, and would stay on its status face until the page woke to describe itself again. This
     * is that description, said on the page's behalf. Keyed so a long session stays a handful of
     * messages rather than a log.
     */
    private final LinkedHashMap<String, byte[]> said = new LinkedHashMap<>();
    private byte[] saidHello;

    /** A message from the page, kept for {@link #replay} before it goes out. */
    synchronized void remember(byte[] bytes) {
        org.json.JSONObject message;
        try {
            message = new org.json.JSONObject(new String(bytes, StandardCharsets.UTF_8));
        } catch (org.json.JSONException notOurs) {
            return;
        }
        String type = message.optString("t", "");
        switch (type) {
            case "hello":
                saidHello = bytes;
                return;
            case "bye":
                said.clear();
                saidHello = null;
                save();
                return;
            case "ack":
                // The page has applied an end the watch scored, so its kept copy can go, see WristInbox.
                // The page acks for the round it has open, which is the one it last described.
                WristInbox.clear(context, WristInbox.keyOf("end", scope("round", "a"),
                        message.optInt("s"), message.optInt("n")), message.optLong("at", 0));
                return;
            case "mk":
                // Answers to something the watch said, which a replay would only confuse.
                return;
            case "arrows":
                // The page's echo of the training total: it has taken the watch's count, so forget it.
                // Still kept for replay, so a watch that restarts is told the total the phone settled on.
                WristInbox.clear(context, WristInbox.keyOf("arrows", scope("session", "l"), 0, 0),
                        message.optLong("at", 0));
                keep(type, bytes);
                return;
            case "session":
                // A new session has its own activities; the old ones' positions mean nothing now.
                forget("activity:");
                keep(type, bytes);
                return;
            case "round":
                forget("end:");
                keep(type, bytes);
                return;
            case "activity":
                keep("activity:" + message.optInt("i"), bytes);
                return;
            case "end":
                keep("end:" + message.optInt("s") + ":" + message.optInt("n"), bytes);
                return;
            case "run":
                /*
                 * Held for a replay but never written down. The page sends one every two seconds for
                 * the whole of a run, and each used to rewrite everything kept here to storage; and a
                 * frame read back in a new process is a run as it was when that process died, which
                 * RunFrames.current, said after it, is the only one to trust about.
                 */
                said.remove(type);
                said.put(type, bytes);
                return;
            default:
                keep(type, bytes);
        }
    }

    /**
     * What the page last described to the watch, by one field: the round's activity (`a`) or the
     * session's label (`l`). An assertion arriving now was made on what the watch was shown, which is
     * this, so it is kept under it, see WristInbox. Empty where nothing was described.
     */
    private synchronized String scope(String subject, String field) {
        byte[] described = said.get(subject);
        if (described == null) return "";
        try {
            return new org.json.JSONObject(new String(described, StandardCharsets.UTF_8)).optString(field, "");
        } catch (org.json.JSONException broken) {
            return "";
        }
    }

    private void keep(String key, byte[] bytes) {
        // Moved to the end, so the replay says things in the order the page last said them.
        said.remove(key);
        said.put(key, bytes);
        save();
    }

    private static final String PREFS = "wrist";

    /**
     * Written down as well as held, because the process that needs it may be a new one: Android
     * stopped the app, and {@link WristCompanion} started it again when the watch came near.
     */
    private void save() {
        if (context == null) return;
        org.json.JSONArray list = new org.json.JSONArray();
        for (java.util.Map.Entry<String, byte[]> one : said.entrySet()) {
            if ("run".equals(one.getKey())) continue;
            list.put(new org.json.JSONArray().put(one.getKey()).put(text(one.getValue())));
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("hello", saidHello == null ? null : text(saidHello))
                .putString("said", list.toString())
                .apply();
    }

    private void restore(Context given) {
        android.content.SharedPreferences prefs = given.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (address == null) address = prefs.getString("address", null);
        if (saidHello != null || !said.isEmpty()) return;
        String hello = prefs.getString("hello", null);
        saidHello = hello == null ? null : hello.getBytes(StandardCharsets.UTF_8);
        try {
            org.json.JSONArray list = new org.json.JSONArray(prefs.getString("said", "[]"));
            for (int i = 0; i < list.length(); i++) {
                org.json.JSONArray one = list.getJSONArray(i);
                // A run frame written down by an older build: a run as it was, not as it is.
                if ("run".equals(one.getString(0))) continue;
                said.put(one.getString(0), one.getString(1).getBytes(StandardCharsets.UTF_8));
            }
        } catch (org.json.JSONException broken) {
            said.clear();
        }
    }

    /**
     * The watch is near, and nobody is holding a link to it: the page is asleep or was never
     * started. Waits for the watch app the same way a run behind a dark screen does, and says the
     * page's last description once it is there.
     */
    synchronized void wake(Context given) {
        if (gatt != null || ready) return;
        context = given.getApplicationContext();
        restore(context);
        if (address == null || !hasSaid()) return;
        closing = false;
        rejoin();
    }

    private void forget(String prefix) {
        Iterator<String> keys = said.keySet().iterator();
        while (keys.hasNext()) if (keys.next().startsWith(prefix)) keys.remove();
    }

    /** Whether there is anything worth reconnecting on the page's behalf for. */
    private synchronized boolean hasSaid() {
        return saidHello != null && !said.isEmpty();
    }

    /**
     * The page's last description, said again for a page that is asleep. The hello goes first with
     * this moment's clock, because the watch takes its offset from it and the page's is stale.
     */
    private void replay() {
        byte[] hello;
        byte[][] rest;
        synchronized (this) {
            hello = saidHello;
            rest = said.values().toArray(new byte[0][]);
        }
        if (hello != null) {
            try {
                org.json.JSONObject fresh = new org.json.JSONObject(new String(hello, StandardCharsets.UTF_8));
                fresh.put("c", System.currentTimeMillis());
                write(fresh.toString().getBytes(StandardCharsets.UTF_8));
            } catch (org.json.JSONException impossible) {
                write(hello);
            }
        }
        for (byte[] one : rest) write(one);
        // The page's run frame is minutes old by now; this one is worked out from the fixes.
        resend();
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
        rejoining = false;
        this.context = context.getApplicationContext();
        this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("address", wanted).apply();

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
        rejoining = false;
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
        if (outbox.size() > OUTBOX_SOFT) shed();
        pump();
    }

    /** Past this, run frames other than the newest go: the next one says the same, and better. */
    private static final int OUTBOX_SOFT = 24;
    /** Past this, anything goes from the front: a watch not taking writes is not taking these either. */
    private static final int OUTBOX_MOST = 256;

    /**
     * Room made in the queue. It used to drop from the front at 24, and a replay is longer than that
     * with a full session on the phone: the hello and the session, said first, were the ones dropped,
     * and the watch was left with activities and ends of a session it was never told about.
     */
    private void shed() {
        byte[] newestFrame = null;
        for (byte[] one : outbox) if ("run".equals(typeOf(one))) newestFrame = one;
        if (newestFrame != null) {
            Iterator<byte[]> each = outbox.iterator();
            while (each.hasNext()) {
                byte[] one = each.next();
                if (one != newestFrame && "run".equals(typeOf(one))) each.remove();
            }
        }
        while (outbox.size() > OUTBOX_MOST) outbox.poll();
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
        main.removeCallbacks(sentGuard);
        main.postDelayed(sentGuard, SENT_TIMEOUT_MS);
    }

    /**
     * The link back, for a run going on behind a dark screen. Auto connect waits for the watch as long
     * as it takes and costs nothing meanwhile, which is what a watch app restarting needs.
     */
    private synchronized void rejoin() {
        if (context == null || address == null) return;
        closeGatt();
        rejoining = true;
        try {
            BluetoothDevice device = context.getSystemService(BluetoothManager.class).getAdapter()
                    .getRemoteDevice(address);
            gatt = device.connectGatt(context, true, callback, BluetoothDevice.TRANSPORT_LE);
        } catch (RuntimeException failed) {
            // Refused or no adapter: the page tries again itself once it wakes.
            rejoining = false;
        }
    }

    /** The run put back on the wrist, which takes a phone that writes to it as linked again. */
    private void resend() {
        byte[] frame = RunFrames.current();
        if (frame != null) write(frame);
    }

    private void finish(boolean ok, String reason) {
        Listener told = listener;
        if (rejoining) {
            // Nobody is waiting on this answer; the page reconnects itself when it wakes.
            rejoining = false;
            return;
        }
        if (resubscribing) {
            // The connect call was answered long ago: a link that cannot subscribe again is a link lost.
            resubscribing = false;
            ready = false;
            if (RunFrames.isLive() || hasSaid()) main.post(this::rejoin);
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
                if (wasReady && (RunFrames.isLive() || hasSaid())) rejoin();
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
            // The watch app between one copy and the next: its service comes back with another change.
            // So is a watch reached while its app is not running: waited for, not given up on.
            if (service == null && (resubscribing || rejoining)) return;
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
            // Whatever was waiting on a write the rediscovery swallowed goes out now.
            main.removeCallbacks(sentGuard);
            synchronized (Wrist.this) {
                sending = false;
            }
            if (rejoining) {
                rejoining = false;
                replay();
                return;
            }
            if (resubscribing) {
                resubscribing = false;
                // An awake page is told and describes itself; an asleep one is spoken for.
                if (pageQuiet()) replay();
                else resend();
                Listener told = listener;
                if (told != null) main.post(told::onRestarted);
                return;
            }
            finish(true, null);
        }

        @Override
        public void onServiceChanged(BluetoothGatt link) {
            if (!ready && rejoining) {
                // The watch app came up under a link made while it was away: now there is a service.
                try {
                    link.discoverServices();
                } catch (SecurityException denied) {
                    rejoining = false;
                }
                return;
            }
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
            main.removeCallbacks(sentGuard);
            synchronized (Wrist.this) {
                sending = false;
            }
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
         * Everything the watch says lands here first, and is handled here whatever the page is
         * doing: frozen, on another screen, or not started. Each message is one of four kinds, and
         * each kind has one way in, see doc/llm-memory/watch-protocol.md.
         */
        String type = typeOf(copy);

        // Telemetry: recorded motion, kept as files until the page stores them, see WristMotion.
        if (WristMotion.take(context, type, copy)) return;

        // Controls: acted on here at once and acked, the page adopting what was done, see RunFrames.
        if (RunFrames.isControl(type) && takeControl(type, copy)) return;

        // Telemetry: a beat, kept with when it came until the page drains it, see RunFrames.heard.
        if ("hr".equals(type)) {
            RunFrames.heard(beatOf(copy));
            return;
        }

        // Assertions: kept until the page acks them, and offered to it now as well, see WristInbox.
        if (WristInbox.durable(type)) {
            String scope = "end".equals(type) ? scope("round", "a") : scope("session", "l");
            WristInbox.take(context, type, copy, scope);
        }

        // The watch's clock, for dating a press that waited out the link going down.
        if ("hello".equals(type)) noteWatchClock(copy);

        // What is the page's to act on: the assertions, navigation, and the hello it answers.
        Listener told = listener;
        if (told == null) return;
        main.post(() -> told.onBytes(copy));
    }

    /** This phone's clock minus the watch's, from the watch's last hello; valid once one is heard. */
    private volatile long watchOffset = 0;
    private volatile boolean watchClockKnown = false;

    private void noteWatchClock(byte[] bytes) {
        try {
            long clock = new org.json.JSONObject(new String(bytes, StandardCharsets.UTF_8)).optLong("c", 0);
            if (clock <= 0) return;
            watchOffset = System.currentTimeMillis() - clock;
            watchClockKnown = true;
        } catch (org.json.JSONException notOurs) {
            // A hello the page will make sense of or not; the clock is only a refinement.
        }
    }

    /**
     * A run control from the watch, acted on by RunFrames and acked, so the watch stops sending it.
     * False only for a press this cannot place and a page might: no run is described here and the
     * watch is too old to say when it was pressed, which is how controls always went before.
     */
    private boolean takeControl(String type, byte[] bytes) {
        long stamp;
        try {
            stamp = new org.json.JSONObject(new String(bytes, StandardCharsets.UTF_8)).optLong("at", 0);
        } catch (org.json.JSONException notOurs) {
            return false;
        }
        long pressedAt = stamp > 0 && watchClockKnown ? stamp + watchOffset : 0;
        RunFrames.Taken result = RunFrames.control(type, stamp, pressedAt);
        if (result == RunFrames.Taken.NO_RUN) {
            // A watch that stamps its presses keeps this one and sends it again once a run is described.
            return stamp > 0;
        }
        if (stamp > 0) ackControl(stamp);
        return true;
    }

    /** Tells the watch a control has been taken, so it forgets the copy it is holding. */
    private void ackControl(long stamp) {
        try {
            org.json.JSONObject ack = new org.json.JSONObject();
            ack.put("v", 2);
            ack.put("t", "ck");
            ack.put("at", stamp);
            write(ack.toString().getBytes(StandardCharsets.UTF_8));
        } catch (org.json.JSONException impossible) {
            // Three plain values into an empty object.
        }
    }

    /** The run changed here rather than on the page: an awake page adopts it at once. */
    void runChanged() {
        Listener told = listener;
        if (told != null) main.post(told::onRunChanged);
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
