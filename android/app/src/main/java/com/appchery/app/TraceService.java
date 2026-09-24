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
    /** Roughly three hours of fixes at one a second, which is longer than any run this app records. */
    private static final int BUFFER = 12_000;

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

    /** Whether the service is listening or merely staying alive, which is what a pause is. */
    static final String EXTRA_LISTEN = "listen";

    static void begin(Context context) {
        context.startForegroundService(new Intent(context, TraceService.class).putExtra(EXTRA_LISTEN, true));
    }

    /**
     * A run paused. The service stays up with nothing to listen to, because stopping it is the app
     * losing the one thing that keeps its process alive: a paused run used to be a killed app, and
     * a killed app cannot be told to carry on, by the wrist or by anybody.
     */
    static void hold(Context context) {
        context.startForegroundService(new Intent(context, TraceService.class).putExtra(EXTRA_LISTEN, false));
    }

    static void end(Context context) {
        context.stopService(new Intent(context, TraceService.class));
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
        boolean listen = intent == null || intent.getBooleanExtra(EXTRA_LISTEN, true);
        startForeground(NOTIFICATION, notification(listen));
        LocationManager locations = getSystemService(LocationManager.class);
        synchronized (LOCK) {
            running = true;
        }
        if (!listen) {
            // Held: the fixes stop, the process does not, and the run can be started again.
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

    private Notification notification(boolean listen) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap =
                PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
                .setContentTitle(getString(R.string.run_tracking_title))
                .setContentText(getString(listen ? R.string.run_tracking_text : R.string.run_paused_text))
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
