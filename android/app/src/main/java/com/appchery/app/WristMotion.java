package com.appchery.app;

import android.content.Context;
import android.util.Base64;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/**
 * Recorded motion from the watch, received here rather than in the page. The page is frozen whenever
 * the screen is off, which is most of a training session, and every chunk sent to it then was lost.
 * Each segment is kept as a file and acknowledged; the page moves the files into the database when
 * it next runs. See doc/llm-memory/wrist-motion.md.
 */
final class WristMotion {

    private static final String TAG = "AppcheryWristMotion";

    private static final class Assembly {
        final JSONObject header;
        final byte[] data;
        final boolean[] seen;
        int got = 0;

        Assembly(JSONObject header, int size) {
            this.header = header;
            data = new byte[size];
            // Chunks are never smaller than this, so one flag per step marks an offset as taken.
            seen = new boolean[size / 16 + 1];
        }
    }

    private static final Map<Long, Assembly> assembling = new HashMap<>();

    private WristMotion() {
    }

    /** True when the message was one of these, and so is not for the page. */
    static synchronized boolean take(Context context, String type, byte[] bytes) {
        if (!"mh".equals(type) && !"mc".equals(type)) return false;
        if (context == null) return true;
        try {
            JSONObject message = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            long key = message.getLong("k");
            if ("mh".equals(type)) {
                int size = message.getInt("b");
                if (size <= 0 || size > 16 * 1024 * 1024) return true;
                // The watch sends one segment at a time, so a new header means whatever was held is dead.
                assembling.clear();
                assembling.put(key, new Assembly(message, size));
                return true;
            }
            Assembly held = assembling.get(key);
            if (held == null) return true;
            int offset = message.getInt("o");
            byte[] part = Base64.decode(message.getString("d"), Base64.DEFAULT);
            if (offset < 0 || offset + part.length > held.data.length || held.seen[offset / 16]) return true;
            held.seen[offset / 16] = true;
            System.arraycopy(part, 0, held.data, offset, part.length);
            held.got += part.length;
            if (held.got < held.data.length) return true;
            assembling.remove(key);
            keep(context, key, held);
        } catch (Exception e) {
            Log.w(TAG, "could not take a motion message", e);
        }
        return true;
    }

    private static void keep(Context context, long key, Assembly held) throws Exception {
        File dir = dir(context);
        File bin = new File(dir, key + ".bin");
        try (FileOutputStream out = new FileOutputStream(bin)) {
            out.write(held.data);
        }
        // The description last, so a listing never sees a segment half written.
        JSONObject meta = new JSONObject(held.header.toString());
        meta.put("received", System.currentTimeMillis());
        try (FileOutputStream out = new FileOutputStream(new File(dir, key + ".json"))) {
            out.write(meta.toString().getBytes(StandardCharsets.UTF_8));
        }
        Log.i(TAG, "kept " + key + ", " + held.data.length + "B");
        JSONObject ack = new JSONObject();
        ack.put("v", 2);
        ack.put("t", "mk");
        ack.put("k", key);
        Wrist.get().write(ack.toString().getBytes(StandardCharsets.UTF_8));
    }

    /** Everything kept and not yet moved into the database, oldest first. */
    static synchronized JSONArray waiting(Context context) {
        JSONArray out = new JSONArray();
        File[] metas = dir(context).listFiles((d, name) -> name.endsWith(".json"));
        if (metas == null) return out;
        Arrays.sort(metas, (a, b) -> a.getName().compareTo(b.getName()));
        for (File metaFile : metas) {
            File bin = new File(metaFile.getParentFile(), metaFile.getName().replace(".json", ".bin"));
            try {
                JSONObject meta = new JSONObject(new String(
                        java.nio.file.Files.readAllBytes(metaFile.toPath()), StandardCharsets.UTF_8));
                meta.put("data", Base64.encodeToString(
                        java.nio.file.Files.readAllBytes(bin.toPath()), Base64.NO_WRAP));
                out.put(meta);
            } catch (Exception e) {
                Log.w(TAG, "dropping unreadable " + metaFile.getName(), e);
                metaFile.delete();
                bin.delete();
            }
        }
        return out;
    }

    /** Moved into the database, so the files can go. */
    static synchronized void forget(Context context, long key) {
        File dir = dir(context);
        new File(dir, key + ".json").delete();
        new File(dir, key + ".bin").delete();
    }

    private static File dir(Context context) {
        File dir = new File(context.getFilesDir(), "wrist-motion");
        dir.mkdirs();
        return dir;
    }
}
