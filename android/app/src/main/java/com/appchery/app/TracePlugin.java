package com.appchery.app;

import android.Manifest;
import android.location.LocationManager;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.List;

/**
 * The page's handle on {@link TraceService}: start it, stop it, and take the fixes it has gathered.
 *
 * Pulled rather than pushed. Android freezes a backgrounded webview's timers and its event loop with
 * them, so a fix delivered as an event while the phone is in a pocket is a fix delivered to nobody.
 * Draining by sequence number means a page that wakes after twenty minutes asks once and is told
 * everything it missed, which is the same call it makes every two seconds while it is on screen.
 */
@CapacitorPlugin(
        name = "Trace",
        permissions = {
            @Permission(
                    alias = TracePlugin.LOCATION,
                    strings = {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    }),
            @Permission(alias = TracePlugin.NOTIFICATIONS, strings = {"android.permission.POST_NOTIFICATIONS"})
        })
public class TracePlugin extends Plugin {

    static final String LOCATION = "location";
    static final String NOTIFICATIONS = "notifications";

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState(LOCATION) != PermissionState.GRANTED) {
            requestPermissionForAlias(LOCATION, call, "afterLocation");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void afterLocation(PluginCall call) {
        if (getPermissionState(LOCATION) != PermissionState.GRANTED) {
            call.reject("denied");
            return;
        }
        begin(call);
    }

    /**
     * The notification is what a foreground service is allowed to run behind, so it is asked for on
     * the way into a run rather than left to a settings screen nobody visits. Being refused it costs
     * the runner a notification, never the run: the service runs either way.
     */
    private void begin(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState(NOTIFICATIONS) != PermissionState.GRANTED) {
            requestPermissionForAlias(NOTIFICATIONS, call, "afterNotifications");
            return;
        }
        run(call);
    }

    @PermissionCallback
    private void afterNotifications(PluginCall call) {
        run(call);
    }

    private void run(PluginCall call) {
        if (call.getBoolean("fresh", false)) TraceService.reset();
        LocationManager locations = getContext().getSystemService(LocationManager.class);
        boolean gps = locations != null && locations.isProviderEnabled(LocationManager.GPS_PROVIDER);
        if (!gps) {
            // Said plainly, because a run recording nothing looks exactly like a run with no signal.
            call.reject("location-off");
            return;
        }
        TraceService.begin(getContext());
        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    /** A run paused: the fixes stop and the service stays, so the process survives to be resumed. */
    @PluginMethod
    public void hold(PluginCall call) {
        TraceService.hold(getContext());
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        TraceService.end(getContext());
        call.resolve();
    }

    @PluginMethod
    public void drain(PluginCall call) {
        long since = call.getLong("since", 0L);
        JSArray fixes = new JSArray();
        long seq = since;
        for (TraceService.Fix fix : TraceService.drain(since)) {
            JSObject one = new JSObject();
            one.put("seq", fix.seq);
            one.put("at", fix.at);
            one.put("lat", fix.lat);
            one.put("lon", fix.lon);
            one.put("accuracy", fix.accuracy);
            one.put("altitude", fix.altitude);
            one.put("speed", fix.speed);
            fixes.put(one);
            seq = fix.seq;
        }
        JSObject result = new JSObject();
        result.put("fixes", fixes);
        result.put("seq", seq);
        result.put("running", TraceService.isRunning());
        call.resolve(result);
    }
}
