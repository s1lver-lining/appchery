package com.appchery.app;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * The durable state the watch asserts to the phone, received here rather than in the page. The page
 * is frozen whenever the screen is off, which is most of a training or scoring session, and anything
 * the watch said to it then was lost: an end scored on the wrist, or the running training count.
 *
 * The sibling of {@link WristMotion}. Where that keeps a recorded end as a file until the page can
 * store it, this keeps the small assertions the same way, newest per subject: one file per key, the
 * key being the end it corrects (`end:<stage>:<end>`) or the single `arrows`, so a correction
 * replaces what it corrects rather than queueing behind it. The page re-injects each on waking,
 * through the same handling a live message takes, and the entry is forgotten the moment the page
 * sends the ack it already sends on applying, watched for in {@link Wrist#remember}. See
 * doc/llm-memory/watch-link.md.
 */
final class WristInbox {

    private static final String TAG = "AppcheryWristInbox";

    /** The message types the watch asserts and the phone must not lose to a frozen page. */
    static boolean durable(String type) {
        return "end".equals(type) || "arrows".equals(type);
    }

    private WristInbox() {
    }

    /**
     * The key one message is kept under, so a later assertion about the same subject replaces the
     * earlier one instead of piling up behind it. Null where the message is not a durable one.
     */
    static String keyOf(String type, JSONObject message) {
        if ("arrows".equals(type)) return "arrows";
        if ("end".equals(type)) return "end:" + message.optInt("s") + ":" + message.optInt("n");
        return null;
    }

    /** Kept, keyed, replacing whatever was there for the same subject. */
    static synchronized void take(Context context, String type, byte[] bytes) {
        if (context == null) return;
        try {
            JSONObject message = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            String key = keyOf(type, message);
            if (key == null) return;
            File file = new File(dir(context), file(key));
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            Log.i(TAG, "kept " + key);
        } catch (Exception e) {
            Log.w(TAG, "could not take an inbox message", e);
        }
    }

    /** Everything the page has not yet applied, oldest first. */
    static synchronized JSONArray waiting(Context context) {
        JSONArray out = new JSONArray();
        File[] files = dir(context).listFiles((d, name) -> name.endsWith(".json"));
        if (files == null) return out;
        // Oldest first, so an end and a later correction of it are applied in the order they were made.
        Arrays.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
        for (File file : files) {
            try {
                out.put(new JSONObject(new String(
                        java.nio.file.Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)));
            } catch (Exception e) {
                Log.w(TAG, "dropping unreadable " + file.getName(), e);
                file.delete();
            }
        }
        return out;
    }

    /**
     * Forgotten because the page has applied it, which is what the ack it sent means. Cleared by the
     * ack rather than by the drain: an entry the page could not place yet (no round open) is left to
     * be tried again, and only the ack says it truly landed.
     */
    static synchronized void clear(Context context, String key) {
        if (context == null || key == null) return;
        new File(dir(context), file(key)).delete();
    }

    private static String file(String key) {
        // ':' is not a filename anywhere this runs, and the key is ours, so a plain swap is enough.
        return key.replace(':', '_') + ".json";
    }

    private static File dir(Context context) {
        File dir = new File(context.getFilesDir(), "wrist-inbox");
        dir.mkdirs();
        return dir;
    }
}
