package com.appchery.watch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;

/**
 * Keeps the app alive while it is not on screen. The link itself belongs to the activity, but a
 * process Android has stopped is a process it may kill, and killing it takes the GATT server with
 * it: the phone then believes it is connected to something that is no longer there, and the archer
 * has to pick the watch out of a chooser again in the middle of a round.
 *
 * It does nothing but exist. Advertising and the server carry on in the process it holds open.
 */
public class LinkService extends Service {

    private static final String CHANNEL = "link";
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
        if (manager != null && manager.getNotificationChannel(CHANNEL) == null) {
            // Low importance: it is a statement that the app is up, not something to be told about.
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Phone link",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = new Notification.Builder(this, CHANNEL)
                .setContentTitle("Scoring with Appchery")
                .setContentText("Linked to your phone")
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setOngoing(true)
                .build();
        startForeground(NOTIFICATION, notification);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        // Nothing binds to it: the activity starts and stops it, and talks to the link directly.
        return null;
    }
}
