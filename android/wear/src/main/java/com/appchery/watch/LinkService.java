package com.appchery.watch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.wear.ongoing.OngoingActivity;
import androidx.wear.ongoing.Status;

/**
 * Keeps the app alive while it is not on screen. The link itself belongs to the activity, but a
 * process Android has stopped is a process it may kill, and killing it takes the GATT server with
 * it: the phone then believes it is connected to something that is no longer there, and the archer
 * has to pick the watch out of a chooser again in the middle of a round.
 *
 * It does nothing but exist. Advertising and the server carry on in the process it holds open.
 *
 * <p>Shown as an <em>ongoing activity</em> rather than as a plain notification. A foreground service
 * has to show something, and on Wear a newly posted notification buzzes the wrist whatever its
 * channel says — measured on a TicWatch Pro 5 with the channel at minimum importance, sound and
 * vibration off, and the notification service's own dump reporting `isNoisy=false`. The buzz is the
 * stream reacting to something arriving in it, and the app posts afresh on every start, because the
 * activity releases this service when it is destroyed. An ongoing activity is not news arriving: it
 * is a chip on the watch face saying something is running, which is all this ever meant to say.
 */
public class LinkService extends Service {

    /**
     * Versioned, because a channel cannot be changed once it exists: the first one was created at
     * low importance, which still buzzes the wrist on Wear, and an app may not quieten a channel it
     * has already made. A new id is the only way to give an existing install the silent one.
     */
    private static final String CHANNEL = "link-quiet";
    private static final int NOTIFICATION = 1;

    static void keepAlive(Context context) {
        context.startForegroundService(new Intent(context, LinkService.class));
    }

    static void release(Context context) {
        context.stopService(new Intent(context, LinkService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        // The channel this app used to post on. Left behind, it is a second "Phone link" entry in
        // the watch's notification settings that no longer does anything.
        manager.deleteNotificationChannel("link");
        if (manager.getNotificationChannel(CHANNEL) == null) {
            /*
             * Minimum importance, and silent on every axis that can be named. Android raises a
             * foreground service's channel to low whatever is asked for, so this is a floor rather
             * than a guarantee, and the ongoing activity below is what actually keeps it quiet.
             */
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Phone link",
                    NotificationManager.IMPORTANCE_MIN);
            channel.setShowBadge(false);
            channel.enableVibration(false);
            channel.setVibrationPattern(null);
            channel.enableLights(false);
            channel.setSound(null, null);
            manager.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Touching the chip on the watch face comes back here rather than starting a second copy:
        // the activity is the app, and it is already running when this service exists.
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, KeypadActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)
                .setContentTitle("Scoring with Appchery")
                .setContentText("Linked to your phone")
                .setSmallIcon(R.drawable.ic_link_status)
                .setOngoing(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                // It belongs to this watch. Bridged, it would also light up the phone in their pocket.
                .setLocalOnly(true)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setContentIntent(open);

        OngoingActivity ongoing = new OngoingActivity.Builder(this, NOTIFICATION, builder)
                .setStaticIcon(R.drawable.ic_link_status)
                .setTouchIntent(open)
                .setStatus(new Status.Builder().addTemplate("Scoring with Appchery").build())
                .build();
        ongoing.apply(this);

        Notification notification = builder.build();
        startForeground(NOTIFICATION, notification);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        // Nothing binds to it: the activity starts and stops it, and talks to the link directly.
        return null;
    }
}
