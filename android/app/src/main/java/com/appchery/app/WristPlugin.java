package com.appchery.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/**
 * The page's handle on the link to the watch, and its way of handing the run down to the service.
 *
 * The connection itself lives in {@link Wrist} rather than here, because a plugin is only ever
 * called by a page and a page stops being called the moment the screen goes off. What this adds is
 * the two directions of traffic while the page is awake, and the plan {@link RunFrames} needs to
 * keep the wrist fed while it is not.
 */
@CapacitorPlugin(name = "Wrist")
public class WristPlugin extends Plugin {

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        if (address == null || address.isEmpty()) {
            call.reject("failed");
            return;
        }
        Wrist.get().connect(getContext(), address, new Wrist.Listener() {
            @Override
            public void onReady(boolean ok, String reason) {
                if (ok) {
                    // Once per watch: Android starts the app when it comes near, see Companion.
                    Companion.ensure(getActivity(), address);
                    JSObject result = new JSObject();
                    result.put("connected", true);
                    call.resolve(result);
                } else {
                    call.reject(reason == null ? "failed" : reason);
                }
            }

            @Override
            public void onBytes(byte[] bytes) {
                JSObject event = new JSObject();
                // As text: everything on this link is JSON, and base64 would be a decode at both ends.
                event.put("text", new String(bytes, StandardCharsets.UTF_8));
                notifyListeners("bytes", event);
            }

            @Override
            public void onLost() {
                notifyListeners("lost", new JSObject());
            }

            @Override
            public void onRestarted() {
                notifyListeners("restarted", new JSObject());
            }

            @Override
            public void onRunChanged() {
                notifyListeners("run", new JSObject());
            }
        });
    }

    /**
     * The link let go, and only the link. The run is not the link's: this used to clear it too, and a
     * page thawing into a link it judged stale "recovered" it mid run, wiping the run from under the
     * watch, whose buttons and heart rate then went nowhere until the phone was picked up. The run
     * is cleared by {@link #forget}, when the page says it is over.
     */
    @PluginMethod
    public void disconnect(PluginCall call) {
        Wrist.get().disconnect();
        call.resolve();
    }

    /** The beats the wrist reported since the page last asked, see RunFrames.heard. */
    @PluginMethod
    public void beats(PluginCall call) {
        JSObject result = new JSObject();
        result.put("items", RunFrames.drainBeats());
        call.resolve(result);
    }

    /** Where the run is, without taking anything, for a page starting afresh, see RunFrames.status. */
    @PluginMethod
    public void runStatus(PluginCall call) {
        RunFrames.remember(getContext());
        try {
            call.resolve(JSObject.fromJSONObject(RunFrames.status()));
        } catch (org.json.JSONException impossible) {
            call.resolve();
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        String text = call.getString("text");
        if (text == null) {
            call.reject("nothing to send");
            return;
        }
        Wrist.get().pageWrote();
        Wrist.get().remember(text.getBytes(StandardCharsets.UTF_8));
        Wrist.get().write(text.getBytes(StandardCharsets.UTF_8));
        call.resolve();
    }

    /**
     * The run as the page has it. Handed down on every change, so the service can carry on from
     * exactly where the page was when Android stopped calling it.
     */
    @PluginMethod
    public void plan(PluginCall call) {
        // Something to start the service with, for a run armed with a watch to start it from.
        RunFrames.remember(getContext());
        JSObject given = call.getData();
        RunFrames.plan(given);
        call.resolve();
    }

    /** The run is over, or the page has left it: nothing to speak for any more. */
    @PluginMethod
    public void forget(PluginCall call) {
        RunFrames.forget(call.getString("id"));
        call.resolve();
    }

    /** Recorded motion received while the page could not take it, for the page to store. */
    @PluginMethod
    public void motion(PluginCall call) {
        JSObject result = new JSObject();
        result.put("items", WristMotion.waiting(getContext()));
        call.resolve(result);
    }

    /**
     * Durable assertions received while the page could not take them, for the page to apply again.
     * No matching forget: an entry is cleared by {@link Wrist#remember} when the page acks it, which
     * is the page saying it truly landed. See WristInbox.
     */
    @PluginMethod
    public void inbox(PluginCall call) {
        JSObject result = new JSObject();
        result.put("items", WristInbox.waiting(getContext()));
        call.resolve(result);
    }

    /** Stored by the page, so the files it came from can go. */
    @PluginMethod
    public void forgetMotion(PluginCall call) {
        try {
            org.json.JSONArray keys = call.getArray("keys");
            for (int i = 0; i < keys.length(); i++) WristMotion.forget(getContext(), keys.getLong(i));
        } catch (Exception e) {
            call.reject("bad keys");
            return;
        }
        call.resolve();
    }

    /**
     * What the service did while the page was away. The page adopts the block it reached and the
     * blocks it finished; everything else it works out again from the track it stored.
     */
    @PluginMethod
    public void claim(PluginCall call) {
        // A fresh process may not have one yet, and a finish kept from a killed one is read with it.
        RunFrames.remember(getContext());
        JSONObject state = RunFrames.state();
        try {
            call.resolve(JSObject.fromJSONObject(state));
        } catch (org.json.JSONException impossible) {
            // Built here out of numbers and an array a moment ago.
            call.resolve();
        }
    }
}
