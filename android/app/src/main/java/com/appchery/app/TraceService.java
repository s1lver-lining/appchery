package com.appchery.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

import java.util.ArrayList;
import java.util.List;

/**
 * Where the phone is, for as long as a run lasts.
 *
 * A service rather than a watcher in the page, because a run is spent with the phone in a pocket and
 * the screen off. Android stops handing locations to a process it has backgrounded, and a webview
 * whose timers it has frozen cannot ask for any either, so tracking from the page alone loses the
 * middle of every run. A foreground service is the one thing the platform promises to keep running,
 * and its notification is what the runner taps to get back to the numbers.
 *
 * <p>It works out nothing. Fixes are buffered here with a sequence number and drained by the page
 * whenever it is awake, so a page frozen for twenty minutes catches up in one call rather than
 * missing twenty minutes of running. See doc/llm-memory/running.md.
 */
public class TraceService extends Service implements LocationListener {

    private static final String CHANNEL = "run";
    private static final int NOTIFICATION = 7;
    /**
     * Twelve hours of fixes at one a second. Three hours was shorter than a marathon run with the page
     * asleep, and the start of it went. See doc/llm-memory/running.md.
     */
    private static final int BUFFER = 43_200;

    /** One fix, held until the page has taken it. */
    static final class Fix {
        long seq;
        long at;
        double lat;
        double lon;
        Double accuracy;
        Double altitude;
        Double speed;
    }

    private static final Object LOCK = new Object();
    private static final ArrayList<Fix> BUFFERED = new ArrayList<>();
    private static long lastSeq = 0;
    private static boolean running = false;

    static boolean isRunning() {
        synchronized (LOCK) {
            return running;
        }
    }

    /** Everything the page has not seen, oldest first. */
    static List<Fix> drain(long since) {
        synchronized (LOCK) {
            ArrayList<Fix> out = new ArrayList<>();
            for (Fix fix : BUFFERED) if (fix.seq > since) out.add(fix);
            return out;
        }
    }

    /** A new run starts from an empty buffer: the fixes of the last one are not part of this one. */
    static void reset() {
        synchronized (LOCK) {
            BUFFERED.clear();
        }
    }

    /**
     * What the service is up for: listening to the fixes of a run going, or staying alive with
     * nothing to listen to, for a run paused or a run finished that the page has not stored yet.
     */
    static final String EXTRA_MODE = "mode";
    static final String LISTEN = "listen";
    static final String HOLD = "hold";
    static final String DONE = "done";
    /**
     * A run on its start screen with a watch to start it from. Android starts no service from the
     * background, and the wrist's Start is pressed with the phone in a pocket, so the service is up
     * and waiting, with no GPS, from while the page was on screen. See RunFrames.plan.
     */
    static final String READY = "ready";

    /** Where the mode is kept, so a service Android restarts comes back as it was. */
    private static final String PREFS = "trace";

    static void begin(Context context) {
        start(context, LISTEN);
    }

    /**
     * A run paused. The service stays up with nothing to listen to, because stopping it is the app
     * losing the one thing that keeps its process alive: a paused run used to be a killed app, and
     * a killed app cannot be told to carry on, by the wrist or by anybody.
     */
    static void hold(Context context) {
        start(context, HOLD);
    }

    /**
     * A run finished from the wrist, which the page has not stored yet. Held for the same reason as
     * a pause: until the page takes it, the run and the fixes gathered for it exist only in this
     * process, and a stopped service is a process Android may kill. The notification says so, and
     * tapping it opens the app, which stores the run and ends the service.
     */
    static void done(Context context) {
        start(context, DONE);
    }

    /** Waiting for a start from the wrist, see READY. */
    static void ready(Context context) {
        start(context, READY);
    }

    static void end(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(EXTRA_MODE).apply();
        context.stopService(new Intent(context, TraceService.class));
    }

    private static void start(Context context, String mode) {
        context.startForegroundService(new Intent(context, TraceService.class).putExtra(EXTRA_MODE, mode));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        RunFrames.remember(this);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null && manager.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel channel =
                    new NotificationChannel(CHANNEL, "Run tracking", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            channel.enableVibration(false);
            channel.setSound(null, null);
            manager.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        android.content.SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        /*
         * A restart by Android comes with no intent at all, and used to be taken as listening: a run
         * paused, or finished from the wrist, whose process was killed came back with the GPS on.
         * So the mode is written down each time and read back when there is nothing to say it.
         */
        String mode = intent != null ? intent.getStringExtra(EXTRA_MODE) : null;
        if (mode == null) mode = prefs.getString(EXTRA_MODE, LISTEN);
        // Ready for a run in a process that has since died: the run it was ready for is not here.
        if (intent == null && READY.equals(mode)) {
            prefs.edit().remove(EXTRA_MODE).apply();
            stopSelf();
            return START_NOT_STICKY;
        }
        prefs.edit().putString(EXTRA_MODE, mode).apply();
        boolean listen = LISTEN.equals(mode);
        try {
            startForeground(NOTIFICATION, notification(mode));
        } catch (RuntimeException refused) {
            // Location not granted, or not allowed at this moment: no service, rather than no app.
            stopSelf();
            return START_NOT_STICKY;
        }
        LocationManager locations = getSystemService(LocationManager.class);
        synchronized (LOCK) {
            running = true;
        }
        if (!listen) {
            // Held: the fixes stop, the process does not, and the run can be started again or stored.
            if (locations != null) locations.removeUpdates(this);
            return START_STICKY;
        }
        try {
            // A second and no minimum distance: the judging of what counts as movement is the app's,
            // and a filter here would hide a runner standing at a crossing from the pace on screen.
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this);
        } catch (SecurityException denied) {
            stopSelf();
            return START_NOT_STICKY;
        } catch (IllegalArgumentException noProvider) {
            stopSelf();
            return START_NOT_STICKY;
        }
        // Restarted if Android kills it, because a run that stops recording silently is worse than none.
        return START_STICKY;
    }

    private Notification notification(String mode) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap =
                PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        int title = R.string.run_tracking_title;
        int text = R.string.run_paused_text;
        if (DONE.equals(mode)) {
            title = R.string.run_finished_title;
            text = R.string.run_finished_text;
        } else if (READY.equals(mode)) {
            title = R.string.run_ready_title;
            text = R.string.run_ready_text;
        } else if (LISTEN.equals(mode)) {
            text = R.string.run_tracking_text;
        }
        return new NotificationCompat.Builder(this, CHANNEL)
                .setContentTitle(getString(title))
                .setContentText(getString(text))
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setSilent(true)
                .setContentIntent(tap)
                .build();
    }

    @Override
    public void onLocationChanged(Location location) {
        Fix fix = new Fix();
        synchronized (LOCK) {
            fix.seq = ++lastSeq;
            fix.at = location.getTime();
            fix.lat = location.getLatitude();
            fix.lon = location.getLongitude();
            fix.accuracy = location.hasAccuracy() ? (double) location.getAccuracy() : null;
            fix.altitude = location.hasAltitude() ? location.getAltitude() : null;
            fix.speed = location.hasSpeed() ? (double) location.getSpeed() : null;
            BUFFERED.add(fix);
            // The oldest go first: a page that has been away that long has lost them either way.
            while (BUFFERED.size() > BUFFER) BUFFERED.remove(0);
        }
        // The wrist, fed from the fix this service was woken for rather than from a timer of its own.
        RunFrames.onFix(location);
    }

    @Override
    public void onProviderDisabled(String provider) {}

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onDestroy() {
        LocationManager locations = getSystemService(LocationManager.class);
        if (locations != null) locations.removeUpdates(this);
        synchronized (LOCK) {
            running = false;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
