package com.appchery.watch;

import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

/**
 * The beat off this wrist.
 *
 * The watch is the only thing in a run that touches the runner, so it is the only thing that can
 * measure a heart. Everything else about a run is worked out on the phone and shown here; this is
 * the one figure that goes the other way.
 *
 * Only ever on while a run is. A photoplethysmograph is a light held against the skin and it costs
 * what a light costs, which is most of a watch's battery over an hour: a sensor left registered
 * between runs would be an app nobody could wear.
 *
 * The sensor reports whenever it feels like reporting, sometimes several times a second and
 * sometimes not for half a minute. What leaves here is at most one reading every few seconds,
 * because the link is small and a graph drawn from a beat a second is the same graph.
 */
final class Heart {

    private static final String TAG = "AppcheryHeart";

    /** How often a beat is passed on. Faster than this says nothing new and costs a write each time. */
    private static final long SEND_MS = 4000;
    /** Below this the sensor is reporting that it cannot find a pulse rather than reporting one. */
    private static final int LOWEST = 25;
    private static final int HIGHEST = 250;
    /**
     * How long the sensor may go quiet before it is assumed gone. A watch that has put the app in
     * the background can cut the sensor off and never give it back, while the registration still
     * looks alive from here: a run on 23/09 lost its heart for the last hour and three quarters that
     * way. Well past the half minute the sensor sometimes takes on its own.
     */
    private static final long QUIET_MS = 30_000;
    private static final long CHECK_MS = 10_000;

    interface Listener {
        void onBeat(int bpm);
    }

    private final SensorManager sensors;
    private final Sensor sensor;
    private final Listener listener;
    private boolean on = false;
    private long lastSent = 0;
    /** The last beat read, so the screen can show one between the sends that go up the link. */
    private int latest = 0;
    /** When the sensor last gave a reading, good or not, which is what says it is still there. */
    private long heardAt = 0;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Context context;
    private final Runnable watchdog = new Runnable() {
        @Override
        public void run() {
            if (!on) return;
            if (SystemClock.elapsedRealtime() - heardAt > QUIET_MS) {
                Log.w(TAG, "the sensor went quiet, asking for it again");
                register();
            }
            main.postDelayed(this, CHECK_MS);
        }
    };

    private final SensorEventListener watching = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent event) {
            if (event.values.length == 0) return;
            heardAt = SystemClock.elapsedRealtime();
            int bpm = Math.round(event.values[0]);
            // A contact lost is reported as a reading of zero, which is not a heart rate.
            if (bpm < LOWEST || bpm > HIGHEST) return;
            latest = bpm;
            long now = SystemClock.elapsedRealtime();
            if (now - lastSent < SEND_MS) return;
            lastSent = now;
            listener.onBeat(bpm);
        }

        @Override
        public void onAccuracyChanged(Sensor which, int accuracy) {
            // Nothing to do: a poor reading is still the only reading there is.
        }
    };

    Heart(Context context, Listener listener) {
        this.listener = listener;
        sensors = context.getSystemService(SensorManager.class);
        sensor = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_HEART_RATE);
    }

    /** Whether this watch has a sensor and has been allowed to use it. */
    boolean available(Context context) {
        return sensor != null
                && context.checkSelfPermission(android.Manifest.permission.BODY_SENSORS)
                        == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Asked for on the way into a run rather than on a settings screen nobody visits, which is where
     * the phone asks for its own permissions too. Refused, the run is a run without a heart rate.
     */
    static void ask(Activity activity, int code) {
        if (activity.checkSelfPermission(android.Manifest.permission.BODY_SENSORS)
                != PackageManager.PERMISSION_GRANTED) {
            activity.requestPermissions(new String[]{android.Manifest.permission.BODY_SENSORS}, code);
        }
    }

    void start(Context context) {
        if (on || !available(context)) return;
        this.context = context;
        on = true;
        register();
        main.postDelayed(watchdog, CHECK_MS);
    }

    /**
     * Asked for again while a run is on, for the app coming back to the screen. Registered once and
     * left, a sensor the watch took away in the background stayed away however often the runner
     * came back to look.
     */
    void revive() {
        if (on) register();
    }

    /** Let go and taken again, since a registration the system dropped still counts as one here. */
    private void register() {
        sensors.unregisterListener(watching);
        if (context == null || !available(context)) return;
        // Counted from here, so a sensor slow to warm up is not asked for again straight away.
        heardAt = SystemClock.elapsedRealtime();
        // The slowest rate the platform offers: a heart is not a thing that changes in milliseconds.
        if (!sensors.registerListener(watching, sensor, SensorManager.SENSOR_DELAY_NORMAL)) {
            Log.w(TAG, "the sensor would not start");
        }
    }

    void stop() {
        if (!on) return;
        main.removeCallbacks(watchdog);
        sensors.unregisterListener(watching);
        on = false;
        latest = 0;
        context = null;
    }

    /** What the wrist last read, for the screen. Zero where nothing has been read yet. */
    int latest() {
        return latest;
    }
}
