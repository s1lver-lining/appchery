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
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        RunFrames.clear();
        Wrist.get().disconnect();
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        String text = call.getString("text");
        if (text == null) {
            call.reject("nothing to send");
            return;
        }
        Wrist.get().pageWrote();
        Wrist.get().write(text.getBytes(StandardCharsets.UTF_8));
        call.resolve();
    }

    /**
     * The run as the page has it. Handed down on every change, so the service can carry on from
     * exactly where the page was when Android stopped calling it.
     */
    @PluginMethod
    public void plan(PluginCall call) {
        JSObject given = call.getData();
        RunFrames.plan(given);
        call.resolve();
    }

    /** The run is over, or the page has left it: nothing to speak for any more. */
    @PluginMethod
    public void forget(PluginCall call) {
        RunFrames.clear();
        call.resolve();
    }

    /**
     * What the service did while the page was away. The page adopts the block it reached and the
     * blocks it finished; everything else it works out again from the track it stored.
     */
    @PluginMethod
    public void claim(PluginCall call) {
        JSONObject state = RunFrames.state();
        try {
            call.resolve(JSObject.fromJSONObject(state));
        } catch (org.json.JSONException impossible) {
            // Built here out of numbers and an array a moment ago.
            call.resolve();
        }
    }
}
