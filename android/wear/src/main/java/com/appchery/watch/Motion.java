package com.appchery.watch;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;

/**
 * The wrist's gyroscope and accelerometer, recorded one end at a time. See
 * doc/llm-memory/wrist-motion.md for the file format and why the window is what it is.
 *
 * A segment runs from the moment the end being shot changes to the next such moment, so it covers
 * everything between one end being scored and the next. Each is written to a file as soon as it
 * closes, and the file stays until the phone has said it keeps a copy.
 */
final class Motion {

    private static final String TAG = "AppcheryMotion";

    /** Ten milliseconds: enough for a release, and below the 200Hz that needs a permission of its own. */
    private static final int PERIOD_US = 10_000;
    static final int GYRO_SCALE = 1000;
    static final int ACCEL_SCALE = 200;
    /** Shorter than this is an undo and a retap, not an arrow anybody drew. */
    static final long SHORTEST_ROUND_MS = 3_000;
    /** Training arrows are counted one tap at a time, so only a double tap is thrown away. */
    static final long SHORTEST_TRAINING_MS = 3_000;
    /** A segment has to fit a four byte clock in tenths of a millisecond, and an hour is no end. */
    private static final long LONGEST_MS = 60 * 60_000;

    private static final int GYRO = 0;
    private static final int ACCEL = 1;

    /** One segment closed and on disk, waiting for the phone. */
    static final class Segment {
        final File file;
        final JSONObject meta;

        Segment(File file, JSONObject meta) {
            this.file = file;
            this.meta = meta;
        }
    }

    interface Listener {
        /** Called on the main thread once a segment is safely on disk. */
        void onSegment();

        /** Called on the main thread when a shot is released, while counting. */
        void onShot();
    }

    // The shot rule, identical to `findShots` in src/lib/watch/motion.ts: see there for the figures.
    private static final float RELEASE = 25f;
    private static final float STILL = 0.4f;
    private static final long HOLD_FROM_MS = 1500;
    private static final long HOLD_TO_MS = 200;
    private static final long REFRACTORY_MS = 3000;
    /** How long after the release a shot is counted, which is also where its segment ends. */
    private static final long AFTER_SHOT_MS = 700;

    /** Whether shots are being counted. Read on the worker thread. */
    private volatile boolean counting = false;
    /** The last few seconds of the gyroscope, which is what says whether the wrist was holding. */
    private final long[] spinAt = new long[256];
    private final float[] spin = new float[256];
    private int spinNext = 0;
    private long lastShot = Long.MIN_VALUE / 2;
    /** Held so stopping can take back a shot still waiting to be told, which would start it all again. */
    private final Runnable announceShot = this::announceShot;

    private void announceShot() {
        if (recording()) listener.onShot();
    }

    private final Context context;
    private final SensorManager sensors;
    private final Sensor gyro;
    private final Sensor accel;
    private final File dir;
    private final Listener listener;
    private final Handler main;

    private HandlerThread thread;
    private Handler worker;
    private PowerManager.WakeLock wake;

    /** Everything below belongs to the worker thread once recording. */
    private ByteArrayOutputStream buffer;
    /** What is being recorded, so a call naming the same thing again changes nothing. Main thread. */
    private String window;
    /** The description of the segment in progress, and how short it may be. Worker thread. */
    private JSONObject meta;
    private long shortest;
    /** False while only counting: the sensors run, and nothing is written. */
    private boolean keep;
    private long startWall;
    private long startNanos;
    private long lastTenths;
    private final short[][] previous = new short[2][3];

    Motion(Context context, Handler main, Listener listener) {
        this.context = context.getApplicationContext();
        this.main = main;
        this.listener = listener;
        sensors = context.getSystemService(SensorManager.class);
        gyro = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
        accel = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        dir = new File(context.getFilesDir(), "motion");
        dir.mkdirs();
    }

    boolean available() {
        return gyro != null && accel != null;
    }

    boolean recording() {
        return thread != null;
    }

    /**
     * What the archer is shooting now, or null for nothing. A change closes the segment in progress,
     * adding `closing` to its description, and opens one described by `next`: that is the whole of
     * how a recording is matched to an end or to a count of training arrows.
     */
    void at(String name, JSONObject next, long shortestMs, JSONObject closing, boolean keepIt,
            boolean count) {
        counting = count;
        if (!available()) return;
        if (name == null) {
            counting = false;
            stop();
            return;
        }
        if (recording() && name.equals(window)) return;
        window = name;
        if (!recording()) begin();
        // A session longer than the lock's timeout would otherwise lose its sensors when it lapsed.
        else if (wake != null) wake.acquire(LONGEST_MS);
        worker.post(() -> {
            close(closing);
            open(next, shortestMs, keepIt);
        });
    }

    void stop() {
        if (!recording()) return;
        sensors.unregisterListener(listening);
        HandlerThread ending = thread;
        worker.post(() -> {
            close(null);
            ending.quitSafely();
        });
        window = null;
        thread = null;
        worker = null;
        counting = false;
        main.removeCallbacks(announceShot);
        if (wake != null && wake.isHeld()) wake.release();
        wake = null;
    }

    /** Closed segments, oldest first. */
    List<Segment> waiting() {
        List<Segment> out = new ArrayList<>();
        // Listed by description, which is written last, so a segment still being written is not seen.
        File[] metas = dir.listFiles((d, name) -> name.endsWith(".json"));
        if (metas == null) return out;
        Arrays.sort(metas, (a, b) -> a.getName().compareTo(b.getName()));
        for (File metaFile : metas) {
            File file = new File(dir, metaFile.getName().replace(".json", ".bin"));
            try {
                byte[] raw = java.nio.file.Files.readAllBytes(metaFile.toPath());
                if (!file.exists()) throw new IllegalStateException("no data");
                out.add(new Segment(file, new JSONObject(new String(raw, StandardCharsets.UTF_8))));
            } catch (Exception e) {
                file.delete();
                metaFile.delete();
            }
        }
        return out;
    }

    /** The phone keeps it now. */
    void forget(Segment segment) {
        segment.file.delete();
        new File(dir, segment.file.getName().replace(".bin", ".json")).delete();
    }

    private void begin() {
        thread = new HandlerThread("motion");
        thread.start();
        worker = new Handler(thread.getLooper());
        // Sensors stop with the CPU, and the screen is off for most of an end.
        PowerManager power = context.getSystemService(PowerManager.class);
        if (power != null) {
            wake = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "appchery:motion");
            // Not counted, so taking it again on every segment extends it rather than stacking it.
            wake.setReferenceCounted(false);
            wake.acquire(LONGEST_MS);
        }
        sensors.registerListener(listening, gyro, PERIOD_US, worker);
        sensors.registerListener(listening, accel, PERIOD_US, worker);
    }

    private void open(JSONObject next, long shortestMs, boolean keepIt) {
        meta = next;
        shortest = shortestMs;
        keep = keepIt;
        buffer = new ByteArrayOutputStream(64 * 1024);
        startWall = System.currentTimeMillis();
        startNanos = SystemClock.elapsedRealtimeNanos();
        lastTenths = 0;
        for (short[] axes : previous) Arrays.fill(axes, (short) 0);
        buffer.write('A');
        buffer.write('M');
        buffer.write('O');
        buffer.write(1);
        writeShort(GYRO_SCALE);
        writeShort(ACCEL_SCALE);
    }

    private void close(JSONObject closing) {
        if (buffer == null) return;
        long duration = (SystemClock.elapsedRealtimeNanos() - startNanos) / 1_000_000;
        ByteArrayOutputStream done = buffer;
        buffer = null;
        if (!keep || duration < shortest) return;
        try {
            String name = String.format(java.util.Locale.ROOT, "%013d", startWall);
            File bin = new File(dir, name + ".bin");
            try (DeflaterOutputStream out = new DeflaterOutputStream(new FileOutputStream(bin),
                    new Deflater(Deflater.BEST_COMPRESSION))) {
                done.writeTo(out);
            }
            if (closing != null) {
                for (java.util.Iterator<String> keys = closing.keys(); keys.hasNext(); ) {
                    String key = keys.next();
                    meta.put(key, closing.get(key));
                }
            }
            meta.put("st", startWall);
            meta.put("du", duration);
            try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".json"))) {
                out.write(meta.toString().getBytes(StandardCharsets.UTF_8));
            }
            Log.i(TAG, meta + " kept, " + done.size() + "B raw, " + bin.length() + "B packed");
            main.post(listener::onSegment);
        } catch (Exception e) {
            Log.w(TAG, "could not keep " + meta, e);
        }
    }

    private final SensorEventListener listening = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent event) {
            int kind = event.sensor.getType() == Sensor.TYPE_GYROSCOPE ? GYRO : ACCEL;
            if (counting) watchForShot(kind, event);
            if (buffer == null || event.timestamp < startNanos) return;
            int scale = kind == GYRO ? GYRO_SCALE : ACCEL_SCALE;
            long tenths = (event.timestamp - startNanos) / 100_000;
            if (tenths * 100_000 > LONGEST_MS * 1_000_000) {
                // Nobody shoots an end for an hour: the phone was left on an open round.
                close(null);
                return;
            }
            buffer.write(kind);
            long delta = Math.max(0, tenths - lastTenths);
            // Escaped rather than wrapped, so a sensor that stalls cannot fold time back on itself.
            if (delta >= 0xFFFF) {
                writeShort(0xFFFF);
                writeInt((int) tenths);
            } else {
                writeShort((int) delta);
            }
            lastTenths = tenths;
            for (int axis = 0; axis < 3; axis++) {
                short value = quantise(event.values[axis], scale);
                // Deltas between samples are small, which is what the compression feeds on.
                writeShort((short) (value - previous[kind][axis]));
                previous[kind][axis] = value;
            }
        }

        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {
            // A reading of poor accuracy is still the only reading there is.
        }
    };

    private void watchForShot(int kind, SensorEvent event) {
        long ms = event.timestamp / 1_000_000;
        float x = event.values[0];
        float y = event.values[1];
        float z = event.values[2];
        float size = (float) Math.sqrt(x * x + y * y + z * z);
        if (kind == GYRO) {
            spinAt[spinNext] = ms;
            spin[spinNext] = size;
            spinNext = (spinNext + 1) % spin.length;
            return;
        }
        if (size <= RELEASE || ms - lastShot < REFRACTORY_MS) return;
        float sum = 0;
        int count = 0;
        for (int i = 0; i < spin.length; i++) {
            if (spinAt[i] >= ms - HOLD_FROM_MS && spinAt[i] < ms - HOLD_TO_MS) {
                sum += spin[i];
                count++;
            }
        }
        if (count < 10 || sum / count >= STILL) return;
        lastShot = ms;
        Log.i(TAG, "shot, released at " + size + " after a hold of " + (sum / count));
        // Told late, so the follow through stays in this segment and the buzz is not lost in the release.
        main.postDelayed(announceShot, AFTER_SHOT_MS);
    }

    private static short quantise(float value, int scale) {
        long scaled = Math.round(value * scale);
        return (short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, scaled));
    }

    private void writeShort(int value) {
        buffer.write(value & 0xFF);
        buffer.write((value >> 8) & 0xFF);
    }

    private void writeInt(int value) {
        writeShort(value & 0xFFFF);
        writeShort((value >>> 16) & 0xFFFF);
    }
}
