package com.appchery.watch;

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
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The watch's half of the link: it advertises, serves the two pipes, and speaks the protocol in
 * src/lib/watch/protocol.ts. The phone owns the record and works out every score, so nothing here
 * decides what an arrow is worth.
 *
 * An end is asserted whole and the queue keeps only the newest assertion per end, so being out of
 * range for an hour costs a handful of messages rather than one per tap, and a message arriving
 * twice is harmless.
 */
public class Link {

    private static final String TAG = "AppcheryWatch";
    private static final int VERSION = 2;

    // The same three as src/lib/watch/ble.ts. Changing one means changing both halves.
    private static final UUID SERVICE = UUID.fromString("6e7d0001-b5a3-4f2e-9c11-8a2f3b6d4c70");
    private static final UUID TO_PHONE = UUID.fromString("6e7d0002-b5a3-4f2e-9c11-8a2f3b6d4c70");
    private static final UUID TO_WATCH = UUID.fromString("6e7d0003-b5a3-4f2e-9c11-8a2f3b6d4c70");
    /** Web Bluetooth's startNotifications() writes this, and a server without one is never heard. */
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    /** Default MTU leaves this much for a payload until the phone negotiates something larger. */
    private static final int DEFAULT_PAYLOAD = 20;

    public interface Listener {
        /** What is being shot. Arrives before any end, and again whenever the phone rebinds. */
        void onRound(String activityId, List<String> labels, List<Integer> values, int ends,
                int arrowsPerEnd);

        /** The phone's copy of an end, which wins whenever it is the newer of the two. */
        void onEnd(int stageIndex, int endNo, String[] labels, long at);

        void onLinkState(int kind, String note);

        /** Which screen to show, so the wrist follows wherever the phone has gone. */
        void onScreen(String screen);

        /** The session the phone has open. Its activities follow, one message each. */
        void onSession(String label, int activityCount, int arrows);

        void onActivity(int index, String kind, String label, boolean scorable);

        /** The session's training arrows, entire: the phone's figure wins unless ours is newer. */
        void onArrows(int total, long at);

        /** A run as the phone has it, sent while one is going. Never stored, always entire. */
        void onRun(Run run);
    }

    /**
     * A run as it stands. Everything is worked out on the phone: the watch draws these figures and
     * decides nothing, exactly as it decides nothing about a score.
     */
    public static final class Run {
        /** i idle, r running, p paused, d done. */
        public String status = "i";
        public int seconds;
        public int metres;
        /** Seconds per kilometre, or 0 where there is not enough run yet to divide. */
        public int pace;
        public int averagePace;
        /** Counts up on every block change, which is what the wrist buzzes for. */
        public int cue;
        public boolean hasBlock;
        /** Seconds since the programme ran out and the run carried on. Negative while one is running. */
        public int freeSeconds = -1;
        /** Which zone the beat is in, one to five, or zero where the phone has no maximum for it. */
        public int zone;
        public String kind = "";
        public String label = "";
        public int blockIndex;
        public int blockCount;
        public int repeat;
        public int repeatOf;
        public int targetPace;
        /** What is left of the block, in whichever unit it is run to. Negative where it is neither. */
        public int leftSeconds = -1;
        public int leftMetres = -1;
        /** What the block asks for in total, which is what turns what is left into a proportion. */
        public int goalSeconds = -1;
        public int goalMetres = -1;
        /** The block after this one, empty where the programme ends here. */
        public String nextKind = "";
        public int nextPace;
        /** What it will ask for, in whichever unit it is run to. Negative where it is neither. */
        public int nextGoalSeconds = -1;
        public int nextGoalMetres = -1;
        /** What the programme asks for in total, sent before the start. Negative where it is unsaid. */
        public int plannedSeconds = -1;
        public int plannedMetres = -1;
        public int plannedPace;
    }

    private final Context context;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final String deviceId;

    private BluetoothGattServer server;
    private BluetoothGattCharacteristic toPhone;
    private BluetoothLeAdvertiser advertiser;
    private final Set<BluetoothDevice> subscribers = new LinkedHashSet<>();

    /** Newest assertion per end, waiting to be acknowledged. Superseded ones are simply replaced. */
    private final Map<String, JSONObject> pending = new LinkedHashMap<>();
    private int payload = DEFAULT_PAYLOAD;
    private String activityId;

    /**
     * Notifications waiting for the radio. Android carries one at a time per connection: a second
     * `notifyCharacteristicChanged` issued before `onNotificationSent` arrives is refused, and the
     * message is gone, because the characteristic holds one value and the next `setValue` has
     * already overwritten it. Sending in a loop therefore delivers the first of a burst and drops
     * the rest, which on the wrist looks like taps the phone sometimes ignores.
     */
    private final Deque<byte[]> outbox = new ArrayDeque<>();
    /** A notification is on the air and its `onNotificationSent` has not come back yet. */
    private boolean sending = false;
    /**
     * Given up on, so one lost callback does not wedge the link for good. The radio is quick and
     * this is long: it is a way out, not a timeout anybody should ever reach.
     */
    private static final long SENT_TIMEOUT_MS = 2_000;
    private Runnable sendGuard;

    public Link(Context context, Listener listener) {
        // The application's context, not the activity's: the server outlives the screen.
        this.context = context.getApplicationContext();
        this.listener = listener;
        SharedPreferences prefs = context.getSharedPreferences("appchery.watch", Context.MODE_PRIVATE);
        String stored = prefs.getString("deviceId", null);
        if (stored == null) {
            stored = UUID.randomUUID().toString();
            prefs.edit().putString("deviceId", stored).apply();
        }
        deviceId = stored;
    }

    public boolean connected() {
        return !subscribers.isEmpty();
    }

    public int waiting() {
        return pending.size();
    }

    /** Whether an assertion for that end is still in flight, so a push about it may be stale. */
    public boolean pendingFor(int stageIndex, int endNo) {
        return pending.containsKey(stageIndex + ":" + endNo);
    }

    private static final String ARROWS_KEY = "arrows";

    /** Asks the phone to come back out of wherever it is. It knows what is behind it; this does not. */
    public void requestBack() {
        try {
            JSONObject message = new JSONObject();
            message.put("v", VERSION);
            message.put("t", "back");
            send(message);
        } catch (Exception e) {
            Log.w(TAG, "could not ask to go back", e);
        }
    }

    /** Asks the phone to open an activity. The phone owns where the two of them are. */
    public void requestOpen(int index) {
        try {
            JSONObject message = new JSONObject();
            message.put("v", VERSION);
            message.put("t", "open");
            message.put("i", index);
            send(message);
        } catch (Exception e) {
            Log.w(TAG, "could not ask to open", e);
        }
    }

    /**
     * The session's training arrows as a total rather than as a difference. "Add six" delivered twice
     * gives twelve, and a queue delivering twice is ordinary, so the whole figure travels.
     */
    public void assertArrows(int total) {
        try {
            JSONObject message = new JSONObject();
            message.put("v", VERSION);
            message.put("t", "arrows");
            message.put("n", Math.max(0, total));
            message.put("at", System.currentTimeMillis());
            pending.put(ARROWS_KEY, message);
            flush();
        } catch (Exception e) {
            Log.w(TAG, "could not assert arrows", e);
        }
    }

    /** Opens the server and starts advertising. Bluetooth permissions must already be granted. */
    public void start() {
        BluetoothManager manager = context.getSystemService(BluetoothManager.class);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            say(FAULT, "Bluetooth is off");
            return;
        }
        advertiser = adapter.getBluetoothLeAdvertiser();
        if (advertiser == null) {
            say(FAULT, "This watch cannot be found by a phone");
            return;
        }

        server = manager.openGattServer(context, serverCallback);
        if (server == null) {
            say(FAULT, "Bluetooth will not start");
            return;
        }

        toPhone = new BluetoothGattCharacteristic(TO_PHONE,
                BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                BluetoothGattCharacteristic.PERMISSION_READ);
        toPhone.addDescriptor(new BluetoothGattDescriptor(CCCD,
                BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE));

        BluetoothGattCharacteristic toWatch = new BluetoothGattCharacteristic(TO_WATCH,
                BluetoothGattCharacteristic.PROPERTY_WRITE
                        | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
                BluetoothGattCharacteristic.PERMISSION_WRITE);

        BluetoothGattService service = new BluetoothGattService(SERVICE,
                BluetoothGattService.SERVICE_TYPE_PRIMARY);
        service.addCharacteristic(toPhone);
        service.addCharacteristic(toWatch);
        server.addService(service);

        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .build();
        // A 128 bit uuid takes 18 of the 31 advertised bytes, so the name goes in the scan response
        // or the whole packet is refused as too large.
        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .addServiceUuid(new ParcelUuid(SERVICE))
                .build();
        AdvertiseData response = new AdvertiseData.Builder().setIncludeDeviceName(true).build();
        advertiser.startAdvertising(settings, data, response, advertiseCallback);
    }

    public void stop() {
        if (advertiser != null) advertiser.stopAdvertising(advertiseCallback);
        if (server != null) server.close();
        server = null;
        subscribers.clear();
    }

    /**
     * One end, as the watch believes it. Queued first and sent if there is anybody to send it to, so
     * an end shot out of range goes up at the next connection rather than being lost.
     */
    public void assertEnd(int stageIndex, int endNo, String[] labels) {
        JSONObject message = new JSONObject();
        try {
            JSONArray array = new JSONArray();
            for (String label : labels) {
                if (label == null) array.put(JSONObject.NULL);
                else array.put(label);
            }
            message.put("v", VERSION);
            message.put("t", "end");
            message.put("s", stageIndex);
            message.put("n", endNo);
            message.put("l", array);
            message.put("at", System.currentTimeMillis());
        } catch (Exception e) {
            Log.w(TAG, "could not build an end", e);
            return;
        }

        // Keyed on the end, so a correction replaces the assertion it corrects instead of queueing
        // behind it: what the phone needs is the latest state, never the history of one end.
        pending.put(stageIndex + ":" + endNo, message);
        flush();
    }

    private void flush() {
        if (subscribers.isEmpty() || toPhone == null || server == null) return;
        for (JSONObject message : new ArrayList<>(pending.values())) send(message);
    }

    private void send(JSONObject message) {
        byte[] bytes = message.toString().getBytes(StandardCharsets.UTF_8);
        Log.i(TAG, "out " + message.optString("t") + " " + bytes.length + "B to "
                + subscribers.size() + " subscriber(s)");
        if (bytes.length > payload) {
            // Nothing can be split: a truncated envelope is not a shorter message, it is rubbish.
            Log.w(TAG, "message of " + bytes.length + " will not fit " + payload);
        }
        outbox.add(bytes);
        pump();
    }

    /**
     * One notification at a time, the next going out when the last is confirmed. Everything the
     * watch says goes through here, so a tap and a flush of held ends cannot tread on each other.
     */
    private void pump() {
        if (sending || outbox.isEmpty()) return;
        if (subscribers.isEmpty() || toPhone == null || server == null) {
            /*
             * Nobody to tell, so this is dropped rather than held. Everything durable is in
             * `pending` and is said again by `flush` the moment a phone subscribes; what is left
             * here is a tap, and a tap only means anything at the moment it is made. Held, an
             * activity chosen while the phone was away would open it minutes later, out of nowhere.
             */
            outbox.clear();
            return;
        }

        byte[] bytes = outbox.peek();
        toPhone.setValue(bytes);
        boolean queued = false;
        for (BluetoothDevice device : subscribers) {
            queued |= server.notifyCharacteristicChanged(device, toPhone, false);
        }
        if (!queued) {
            // Refused outright, which is the stack being busy rather than the link being gone.
            main.postDelayed(this::pump, 20);
            return;
        }
        outbox.poll();
        sending = true;
        sendGuard = () -> {
            Log.w(TAG, "no onNotificationSent within " + SENT_TIMEOUT_MS + "ms, carrying on");
            sending = false;
            sendGuard = null;
            pump();
        };
        main.postDelayed(sendGuard, SENT_TIMEOUT_MS);
    }

    /** The phone has gone. Whatever was on the air is not going to be confirmed by anybody. */
    private void abandonSend() {
        if (sendGuard != null) {
            main.removeCallbacks(sendGuard);
            sendGuard = null;
        }
        sending = false;
    }

    /** The radio has taken one message, so the next may go. */
    private void onSent() {
        if (sendGuard != null) {
            main.removeCallbacks(sendGuard);
            sendGuard = null;
        }
        sending = false;
        pump();
    }

    private void hello() {
        try {
            JSONObject message = new JSONObject();
            message.put("v", VERSION);
            message.put("t", "hello");
            message.put("d", deviceId);
            message.put("c", System.currentTimeMillis());
            send(message);
        } catch (Exception e) {
            Log.w(TAG, "could not say hello", e);
        }
    }

    private void receive(byte[] bytes) {
        JSONObject message;
        try {
            message = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        } catch (Exception e) {
            // Half a packet, or a device that is not ours. Nothing to do and nothing to report.
            return;
        }

        int version = message.optInt("v", 0);
        if (version > VERSION) {
            say(FAULT, "Update the watch app");
            return;
        }
        if (version < 1) return;

        String type = message.optString("t", "");
        Log.i(TAG, "in " + type);
        switch (type) {
            case "hello":
                // The phone speaks first on connecting, and the reply carries this watch's clock so
                // the two can tell whose edit came later.
                hello();
                return;
            case "round":
                onRound(message);
                return;
            case "end":
                onEnd(message);
                return;
            case "ack":
                onAck(message);
                return;
            case "screen":
                String screen = message.optString("s", "");
                if (!screen.isEmpty()) main.post(() -> listener.onScreen(screen));
                return;
            case "session":
                onSession(message);
                return;
            case "activity":
                onActivity(message);
                return;
            case "arrows":
                onArrows(message);
                return;
            case "run":
                onRunMessage(message);
                return;
            case "bye":
                say(WAITING, "Phone let go");
                return;
            default:
        }
    }

    /**
     * A run button on the wrist. The phone owns the run, so this asks rather than decides, the same
     * way asking to open an activity does.
     */
    public void command(String action) {
        try {
            JSONObject message = new JSONObject();
            message.put("v", VERSION);
            // A type each rather than a type and an action: a link that never negotiated an MTU can
            // notify twenty bytes, and "rc" with an action in it is twenty five, dropped in silence.
            message.put("t", type(action));
            send(message);
        } catch (Exception e) {
            Log.w(TAG, "could not ask to " + action, e);
        }
    }

    /**
     * The beat off this wrist, on its way to the phone that keeps the record.
     *
     * The only thing about a run that travels upwards, because the sensor is here and the record is
     * there. Sent as it is measured rather than asked for: a sample nobody collected is a gap in a
     * graph that cannot be filled in afterwards.
     */
    public void heart(int bpm) {
        try {
            JSONObject message = new JSONObject();
            message.put("v", VERSION);
            message.put("t", "hr");
            message.put("b", bpm);
            send(message);
        } catch (Exception e) {
            Log.w(TAG, "could not send a beat", e);
        }
    }

    private static String type(String action) {
        switch (action) {
            case "go":
                return "rg";
            case "resume":
                return "ru";
            case "stop":
                return "re";
            default:
                return "rh";
        }
    }

    private void onRunMessage(JSONObject message) {
        Run run = new Run();
        run.status = message.optString("st", "i");
        run.seconds = message.optInt("s", 0);
        run.metres = message.optInt("d", 0);
        run.pace = message.optInt("p", 0);
        run.averagePace = message.optInt("a", 0);
        run.cue = message.optInt("c", 0);
        run.kind = message.optString("k", "");
        run.hasBlock = !run.kind.isEmpty();
        run.freeSeconds = message.has("fr") ? message.optInt("fr", -1) : -1;
        run.zone = message.optInt("hz", 0);
        run.label = message.optString("b", "");
        run.blockIndex = message.optInt("i", 0);
        run.blockCount = message.optInt("n", 0);
        run.repeat = message.optInt("r", 0);
        run.repeatOf = message.optInt("ro", 0);
        run.targetPace = message.optInt("tp", 0);
        run.leftSeconds = message.has("ls") ? message.optInt("ls", -1) : -1;
        run.leftMetres = message.has("lm") ? message.optInt("lm", -1) : -1;
        run.goalSeconds = message.has("gs") ? message.optInt("gs", -1) : -1;
        run.goalMetres = message.has("gm") ? message.optInt("gm", -1) : -1;
        run.nextKind = message.optString("nk", "");
        run.nextPace = message.optInt("ntp", 0);
        run.nextGoalSeconds = message.has("ngs") ? message.optInt("ngs", -1) : -1;
        run.nextGoalMetres = message.has("ngm") ? message.optInt("ngm", -1) : -1;
        run.plannedSeconds = message.has("ps") ? message.optInt("ps", -1) : -1;
        run.plannedMetres = message.has("pd") ? message.optInt("pd", -1) : -1;
        run.plannedPace = message.optInt("pp", 0);
        main.post(() -> listener.onRun(run));
    }

    private void onRound(JSONObject message) {
        String incoming = message.optString("a", "");
        JSONArray zones = message.optJSONArray("z");
        JSONArray stages = message.optJSONArray("s");
        if (incoming.isEmpty() || zones == null || stages == null || stages.length() == 0) return;

        List<String> labels = new ArrayList<>();
        List<Integer> values = new ArrayList<>();
        for (int i = 0; i < zones.length(); i++) {
            JSONArray zone = zones.optJSONArray(i);
            if (zone == null || zone.length() != 2) continue;
            labels.add(zone.optString(0));
            // What each one is worth, which is the phone's to decide and the watch's only to display.
            values.add(zone.optInt(1, 0));
        }

        JSONArray first = stages.optJSONArray(0);
        if (first == null || first.length() != 2 || labels.isEmpty()) return;
        int ends = first.optInt(0);
        int arrowsPerEnd = first.optInt(1);
        if (ends < 1 || arrowsPerEnd < 1) return;

        /**
         * A different activity means the queue belongs to a round nobody is shooting any more.
         * Sending it would write arrows onto the wrong card, so it goes.
         */
        if (activityId != null && !activityId.equals(incoming)) pending.clear();
        activityId = incoming;

        final List<String> finalLabels = labels;
        final List<Integer> finalValues = values;
        main.post(() -> listener.onRound(incoming, finalLabels, finalValues, ends, arrowsPerEnd));
    }

    private void onEnd(JSONObject message) {
        JSONArray array = message.optJSONArray("l");
        if (array == null) return;
        String[] labels = new String[array.length()];
        for (int i = 0; i < array.length(); i++) {
            labels[i] = array.isNull(i) ? null : array.optString(i);
        }
        int stageIndex = message.optInt("s", 0);
        int endNo = message.optInt("n", 0);
        long at = message.optLong("at", 0);
        if (endNo < 1) return;
        main.post(() -> listener.onEnd(stageIndex, endNo, labels, at));
    }

    private void onSession(JSONObject message) {
        String label = message.optString("l", "");
        int count = message.optInt("c", -1);
        int arrows = message.optInt("a", -1);
        if (label.isEmpty() || count < 0 || arrows < 0) return;
        /**
         * A session message describes the session, and the description may have been made before this
         * watch changed the count. Its own figure is the newer one until the phone has answered for
         * it, so the count is withheld rather than allowed to overwrite: sending it back is what made
         * the counter flick to the old number and then to the right one.
         */
        final int shown = pending.containsKey(ARROWS_KEY) ? -1 : arrows;
        main.post(() -> listener.onSession(label, count, shown));
    }

    private void onActivity(JSONObject message) {
        int index = message.optInt("i", -1);
        String kind = message.optString("k", "");
        String label = message.optString("l", "");
        if (index < 0 || kind.isEmpty() || label.isEmpty()) return;
        boolean scorable = message.optInt("s", 0) == 1;
        main.post(() -> listener.onActivity(index, kind, label, scorable));
    }

    private void onArrows(JSONObject message) {
        int total = message.optInt("n", -1);
        long at = message.optLong("at", 0);
        if (total < 0) return;

        JSONObject held = pending.get(ARROWS_KEY);
        // A figure at least as new as the one being held means the phone has ours, or better.
        if (held != null) {
            if (at < held.optLong("at", 0)) return;
            pending.remove(ARROWS_KEY);
        }
        main.post(() -> listener.onArrows(total, at));
    }

    private void onAck(JSONObject message) {
        String key = message.optInt("s", 0) + ":" + message.optInt("n", 0);
        JSONObject held = pending.get(key);
        if (held == null) return;
        // Only forgotten when the phone has at least as new a copy as the one being held: an ack for
        // an older assertion leaves a later correction still waiting.
        if (message.optLong("at", -1) >= held.optLong("at", 0)) pending.remove(key);
    }

    /**
     * What the link is, as something to show rather than a sentence to read. The screen colours the
     * state from this: a watch waiting for a phone in a pocket is ordinary and a watch that cannot
     * advertise at all is not, and the two should not look the same on the wrist.
     */
    public static final int WAITING = 0;
    public static final int LINKED = 1;
    /** Something the archer has to act on: a permission refused, or a radio that will not start. */
    public static final int FAULT = 2;

    private void say(int kind, String note) {
        Log.i(TAG, "state: " + note + (kind == LINKED ? " (linked)" : ""));
        main.post(() -> listener.onLinkState(kind, note));
    }

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settings) {
            say(WAITING, "Waiting for your phone");
        }

        @Override
        public void onStartFailure(int error) {
            say(FAULT, "Bluetooth will not start (" + error + ")");
        }
    };

    private final BluetoothGattServerCallback serverCallback = new BluetoothGattServerCallback() {
        @Override
        public void onConnectionStateChange(BluetoothDevice device, int status, int state) {
            Log.i(TAG, "connection " + device.getAddress() + " state=" + state + " status=" + status);
            if (state != BluetoothProfile.STATE_CONNECTED) {
                subscribers.remove(device);
                payload = DEFAULT_PAYLOAD;
                // Nothing is coming back for a notification whose phone has gone, and a link left
                // believing one is still on the air would never send anything again.
                main.post(Link.this::abandonSend);
                say(WAITING, "Waiting for your phone");
            }
        }

        @Override
        public void onNotificationSent(BluetoothDevice device, int status) {
            // The whole reason `outbox` exists: until this arrives, the next notification would be
            // refused and its message lost.
            main.post(Link.this::onSent);
        }

        @Override
        public void onMtuChanged(BluetoothDevice device, int mtu) {
            Log.i(TAG, "mtu " + mtu);
            // Three bytes of the MTU are the notification's own header.
            payload = Math.max(DEFAULT_PAYLOAD, mtu - 3);
        }

        @Override
        public void onDescriptorWriteRequest(BluetoothDevice device, int requestId,
                BluetoothGattDescriptor descriptor, boolean preparedWrite, boolean responseNeeded,
                int offset, byte[] value) {
            Log.i(TAG, "descriptor write " + descriptor.getUuid() + " len=" + value.length);
            if (CCCD.equals(descriptor.getUuid())) {
                boolean on = value.length > 0 && (value[0] & 0x01) != 0;
                if (on) {
                    subscribers.add(device);
                    say(LINKED, "Linked");
                    // Whatever was shot out of range goes up now, newest state per end only, along
                    // with anything held in the outbox because there was nobody to send it to.
                    main.post(() -> {
                        flush();
                        pump();
                    });
                } else {
                    subscribers.remove(device);
                    say(WAITING, "Waiting for your phone");
                }
            }
            if (responseNeeded) {
                server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
            }
        }

        @Override
        public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId,
                BluetoothGattCharacteristic characteristic, boolean preparedWrite,
                boolean responseNeeded, int offset, byte[] value) {
            Log.i(TAG, "write to " + characteristic.getUuid() + " len=" + value.length);
            if (TO_WATCH.equals(characteristic.getUuid())) receive(value);
            if (responseNeeded) {
                server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
            }
        }
    };
}
