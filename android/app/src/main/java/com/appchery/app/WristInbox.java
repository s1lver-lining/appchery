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
 * store it, this keeps the small assertions the same way, newest per subject: one file per key, so a
 * correction replaces what it corrects rather than queueing behind it. The page re-injects each on
 * waking, through the same handling a live message takes, and the entry is forgotten when the page
 * sends the ack it already sends on applying, watched for in {@link Wrist#remember}.
 *
 * Each entry belongs to what the watch was showing when it was made, its scope: the round, by
 * activity, for an end, and the session, by its label, for the training count. An end says only which
 * stage and which end, so without its scope an end kept from one round was applied to whichever round
 * the phone opened next, onto the wrong card. The page applies only the entries of what it has open.
 * See doc/llm-memory/watch-protocol.md.
 */
final class WristInbox {

    private static final String TAG = "AppcheryWristInbox";
    /** Where an entry's scope rides with it, stripped by the page's decoder as an unknown field. */
    static final String SCOPE = "_scope";
    /** A scope too old to be anybody's any more: the session or the round has long been left. */
    private static final long STALE_MS = 7L * 24 * 3600_000;

    /** The message types the watch asserts and the phone must not lose to a frozen page. */
    static boolean durable(String type) {
        return "end".equals(type) || "arrows".equals(type);
    }

    private WristInbox() {
    }

    /** The key one message is kept under within its scope, or null for one that is not durable. */
    static String keyOf(String type, String scope, int stageIndex, int endNo) {
        if ("arrows".equals(type)) return "arrows:" + scope;
        if ("end".equals(type)) return "end:" + scope + ":" + stageIndex + ":" + endNo;
        return null;
    }

    /** Kept, keyed within its scope, replacing whatever was there for the same subject. */
    static synchronized void take(Context context, String type, byte[] bytes, String scope) {
        if (context == null) return;
        try {
            JSONObject message = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            String key = keyOf(type, scope == null ? "" : scope, message.optInt("s"), message.optInt("n"));
            if (key == null) return;
            if (scope != null) message.put(SCOPE, scope);
            try (FileOutputStream out = new FileOutputStream(new File(dir(context), file(key)))) {
                out.write(message.toString().getBytes(StandardCharsets.UTF_8));
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
        long now = System.currentTimeMillis();
        for (File file : files) {
            // Nobody will open that round or session again to take it: kept for ever, it is only clutter.
            if (now - file.lastModified() > STALE_MS) {
                file.delete();
                continue;
            }
            try {
                JSONObject kept = new JSONObject(new String(
                        java.nio.file.Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
                out.put(kept);
                // Kept by a build before scopes, under a name no ack will ever match: offered once. The
                // watch still holds its own copy until acked, so one the page cannot place comes again.
                if (!kept.has(SCOPE)) file.delete();
            } catch (Exception e) {
                Log.w(TAG, "dropping unreadable " + file.getName(), e);
                file.delete();
            }
        }
        return out;
    }

    /**
     * Forgotten because the page has applied it, which is what its ack means, but only the copy the
     * ack covers. An ack names the assertion's time: acking the first of two quick corrections must
     * not take the second with it, which is still waiting to be applied. Cleared by the ack rather
     * than by the drain, since an entry the page could not place yet is left to be tried again.
     */
    static synchronized void clear(Context context, String key, long upTo) {
        if (context == null || key == null) return;
        File file = new File(dir(context), file(key));
        if (!file.exists()) return;
        try {
            JSONObject kept = new JSONObject(new String(
                    java.nio.file.Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
            if (kept.optLong("at", 0) > upTo) return;
        } catch (Exception unreadable) {
            // Unreadable is as good as gone.
        }
        file.delete();
    }

    private static String file(String key) {
        // Only letters, digits and a few safe marks: a session's label is text the archer never sees here.
        StringBuilder out = new StringBuilder();
        for (char c : key.toCharArray()) out.append(Character.isLetterOrDigit(c) || c == '-' ? c : '_');
        // Two labels that differ only in punctuation must not share a file.
        return out + "_" + Integer.toHexString(key.hashCode()) + ".json";
    }

    private static File dir(Context context) {
        File dir = new File(context.getFilesDir(), "wrist-inbox");
        dir.mkdirs();
        return dir;
    }
}
