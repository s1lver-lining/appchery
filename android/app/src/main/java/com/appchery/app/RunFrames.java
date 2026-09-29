package com.appchery.app;

import android.content.Context;
import android.location.Location;
import android.os.SystemClock;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * The run on the wrist while the page is asleep.
 *
 * A run is spent with the phone in a pocket, and Android freezes a backgrounded webview: the page
 * that works the run out stops working anything out, and the watch was left showing figures minutes
 * old. So the plan is handed down here at every change, and this keeps the wrist fed from the same
 * fixes the service is already awake for.
 *
 * Nothing here runs on a timer. A frame goes out on the back of a location the service was woken
 * for anyway, at most one every few seconds: a run is an hour long, and an hour of a timer of its
 * own is an hour of battery bought for nothing.
 *
 * The page stays the authority. Everything worked out here is handed back when the page wakes, and
 * whatever it makes of the track it stored wins. See doc/llm-memory/running.md.
 */
final class RunFrames {

    /** The gates of src/lib/domain/run/track.ts, which is where they are explained and tested. */
    private static final double ACCURACY_M = 25;
    private static final double MIN_STEP_M = 3;
    private static final double ACCURACY_SHARE = 0.5;
    private static final double MAX_SPEED_MS = 8;
    private static final double STILL_MS = 0.7;
    private static final double MOVING_MS = 1.2;
    private static final double PACE_WINDOW_S = 30;
    private static final double PACE_WINDOW_MIN_M = 25;

    /** How long the page has to have been silent before this speaks for it. */
    private static final long QUIET_MS = 4000;
    /** And how often it speaks once it is speaking: the wrist runs its own clock between frames. */
    private static final long FRAME_MS = 3000;

    private static final Object LOCK = new Object();

    private static final class Step {
        String kind = "work";
        String label = "";
        /** t time, d distance, o open ended. */
        String goal = "o";
        int value;
        int pace;
        int repeat;
        int repeatOf;
    }

    /** One beat off the wrist, with when it was taken: the page puts each one on the fix it belongs to. */
    private static final class Beat {
        long at;
        int bpm;
    }

    private static final class Result {
        int index;
        int metres;
        int seconds;
    }

    private static List<Step> steps = new ArrayList<>();
    private static final List<Result> results = new ArrayList<>();
    /**
     * Four hours of a beat every four seconds, the watch's cadence. A run is spent with the phone
     * asleep and the page takes these only when it wakes, so the buffer has to outlast the run.
     */
    private static final int BEATS_MOST = 3600;
    private static final List<Beat> beats = new ArrayList<>();

    private static boolean live = false;
    /** A run described on the wrist and waiting for its start, which a button there may give it. */
    private static boolean armed = false;
    /**
     * Bumped by every change made here rather than by the page, and handed back with the state. A
     * plan from a page that has not adopted the latest one describes a run that no longer exists,
     * and taking it would undo a pause or a finish made from the wrist. See doc/llm-memory/watch-protocol.md.
     */
    private static long rev = 0;
    /** When the run was started from the wrist, on this phone's clock, for the page to date it by. */
    private static long startedWall = 0;
    /** When the run last changed, on this phone's clock: a press is never dated before it. */
    private static long lastChangeWall = 0;
    /** Laps taken on the wrist, as the run's clock and distance at each, until the page adopts them. */
    private static final List<double[]> laps = new ArrayList<>();
    /** The activity being run, so a page starting afresh can find the run this still holds. */
    private static String activityId = null;
    /**
     * The presses already taken, by the watch's own stamp: a control is re-sent until it is acked,
     * so the same press arriving twice must be one press. A set rather than the latest, so a watch
     * whose clock is corrected backwards still has its next press taken.
     */
    private static final java.util.LinkedHashSet<Long> taken = new java.util.LinkedHashSet<>();
    private static final int TAKEN_MOST = 64;
    /** The runner's maximum, from the page, or zero where none is set. */
    private static int maxHeart = 0;
    /** The last beat heard, kept apart from the queue the page drains, to colour the next frame. */
    private static int lastBpm = 0;
    private static long lastBpmAt = 0;
    /** How old a beat may be and still be the runner's heart rate, as BEAT_STALE_MS in live.svelte.ts. */
    private static final long BEAT_STALE_MS = 20_000;
    /** The zone floors of src/lib/domain/run/zones.ts. */
    private static final double[] ZONE_FLOOR = {0.5, 0.6, 0.7, 0.8, 0.9};
    private static String status = "i";
    private static int cue = 0;
    private static int stepIndex = -1;
    private static double anchorSeconds = 0;
    private static double anchorMetres = 0;
    private static long anchorStamp = 0;
    private static double stepFromSeconds = 0;
    /** When the programme ran out, or negative while one is still running. */
    private static double freeFromSeconds = -1;
    private static double stepFromMetres = 0;
    private static int plannedSeconds = -1;
    private static int plannedMetres = -1;
    private static int plannedPace = 0;

    /** What this has measured since the anchor, by the same rules the page measures by. */
    private static double metresSince = 0;
    private static Location last = null;
    private static final ArrayList<double[]> recent = new ArrayList<>();
    private static long lastFrameAt = 0;
    /** Something to start and stop the service with, since a button on the wrist may do both. */
    private static Context app = null;

    private RunFrames() {}

    static void remember(Context context) {
        app = context.getApplicationContext();
    }

    /** What {@link #control} made of a button on the wrist. */
    enum Taken {
        /** Acted on, or already acted on, or meaningless for the run as it stands: answered either way. */
        DONE,
        /** No run is described here to act on, so it is left for whoever does know of one. */
        NO_RUN
    }

    /** A run control, as the watch names them. */
    static boolean isControl(String type) {
        return "rg".equals(type) || "rh".equals(type) || "ru".equals(type) || "re".equals(type)
                || "rl".equals(type);
    }

    /**
     * A run button on the wrist, taken here whatever the page is doing.
     *
     * The native side owns the link and is alive for as long as the app is, so every control lands
     * here and is acted on at once. The page used to act when it was awake and this only when it had
     * been silent for seconds, and a control that fell between the two waited for the phone to be
     * picked up: a finish pressed at the end of a run was applied minutes later, when the screen came
     * on. Now the page adopts what was done here, through {@link #state()}, and a plan it sends from
     * before it adopted is refused, see {@link #rev}. See doc/llm-memory/watch-protocol.md.
     *
     * `stamp` is the watch's own stamp for the press, or 0 from a watch too old to give one, and
     * identifies it: the watch sends a control again until it is acked. `pressedAt` is the same
     * moment on this phone's clock, or 0 where it is not known. A press that waited out the link
     * going down is dated where it was made, but never before the run last changed nor after now.
     */
    static Taken control(String type, long stamp, long pressedAt) {
        byte[] frame;
        synchronized (LOCK) {
            if (!live && !armed) return Taken.NO_RUN;
            if (stamp > 0 && taken.contains(stamp)) return Taken.DONE;
            long now = System.currentTimeMillis();
            long at = pressedAt <= 0 ? now : Math.min(now, Math.max(pressedAt, lastChangeWall));
            // The press on the clock the anchors are kept on, which is the one the run is timed by.
            long pressed = SystemClock.elapsedRealtime() - (now - at);

            Applied applied = apply(type, at, pressed);
            // Not taken, so not remembered: the watch sends it again and it is taken then.
            if (applied == Applied.NOT_NOW) return Taken.NO_RUN;
            if (stamp > 0) {
                taken.add(stamp);
                while (taken.size() > TAKEN_MOST) taken.remove(taken.iterator().next());
            }
            if (applied == Applied.NOTHING) return Taken.DONE;
            rev++;
            lastChangeWall = at;
            lastFrameAt = SystemClock.elapsedRealtime();
            frame = compose();
        }
        if (frame != null) Wrist.get().write(frame);
        // An awake page adopts at once rather than on its next thaw; a frozen one finds it then.
        Wrist.get().runChanged();
        return Taken.DONE;
    }

    /** What one control did to the run. */
    private enum Applied {
        /** The run changed. */
        CHANGED,
        /** Meaningless for the run as it stands, a pause of a paused run: answered and forgotten. */
        NOTHING,
        /** Right, but not possible at this moment: left for the watch to send again. */
        NOT_NOW
    }

    /** One control applied to the run, dated by `at` (wall) and `pressed` (elapsed). Under LOCK. */
    private static Applied apply(String type, long at, long pressed) {
        switch (type) {
            case "rg":
                // Already going: a start pressed twice is one start.
                if (!armed) return Applied.NOTHING;
                if (app == null) return Applied.NOT_NOW;
                try {
                    // The fixes of whatever came before are not part of this run.
                    TraceService.reset();
                    TraceService.begin(app);
                } catch (RuntimeException refused) {
                    /*
                     * Android starts no service from the background unless the app is running one
                     * already, which is what the ready hold is for, see plan. Without it the start
                     * waits: the watch keeps the press and sends it again with the next frame the
                     * phone sends, which it does once it is picked up.
                     */
                    return Applied.NOT_NOW;
                }
                armed = false;
                live = true;
                status = "r";
                anchorSeconds = 0;
                anchorMetres = 0;
                metresSince = 0;
                anchorStamp = pressed;
                startedWall = at;
                // The first block, as starting on the phone does: a run starts at its beginning.
                if (stepIndex < 0 && !steps.isEmpty() && freeFromSeconds < 0) stepIndex = 0;
                stepFromSeconds = 0;
                stepFromMetres = 0;
                last = null;
                recent.clear();
                results.clear();
                laps.clear();
                return Applied.CHANGED;
            case "rh":
                if (!live || !"r".equals(status)) return Applied.NOTHING;
                // The clock stops where it was pressed: an anchor with no time running from it.
                anchorSeconds = clockAt(pressed);
                anchorMetres = metres();
                metresSince = 0;
                anchorStamp = pressed;
                status = "p";
                if (app != null) TraceService.hold(app);
                return Applied.CHANGED;
            case "ru":
                if (!live || !"p".equals(status)) return Applied.NOTHING;
                anchorStamp = pressed;
                status = "r";
                last = null;
                recent.clear();
                if (app != null) TraceService.begin(app);
                return Applied.CHANGED;
            case "re":
                if (!live) return Applied.NOTHING;
                anchorSeconds = clockAt(pressed);
                anchorMetres = metres();
                metresSince = 0;
                status = "d";
                live = false;
                keepFinish();
                /*
                 * Held rather than ended. The service is the one thing keeping this process alive,
                 * and until the page takes the run, it and the fixes it gathered exist only here:
                 * ended, Android was free to kill the app and the run went with it. The page ends
                 * the service once it has stored the run, see TraceService.done.
                 */
                if (app != null) TraceService.done(app);
                return Applied.CHANGED;
            case "rl":
                if (!live) return Applied.NOTHING;
                laps.add(new double[]{clockAt(pressed), metres()});
                return Applied.CHANGED;
            default:
                return Applied.NOTHING;
        }
    }

    /**
     * The service up and waiting, for a run on its start screen with a watch to start it from.
     *
     * Android starts no service from the background, and the wrist's Start is pressed with the phone
     * in a pocket: started only then, the service was refused, and the start waited for the phone to
     * be picked up. So it is started now, while the page describing the run is on screen, held with
     * no GPS until the start (TraceService.READY). Only with a watch linked, the one case it is for,
     * and only with location granted, without which the service cannot run at all. The page's own
     * start takes it over, and leaving the run unstarted ends it. Under LOCK.
     */
    private static void holdReady() {
        if (app == null || TraceService.isRunning() || !Wrist.get().isReady()) return;
        if (androidx.core.content.ContextCompat.checkSelfPermission(app,
                android.Manifest.permission.ACCESS_FINE_LOCATION)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        try {
            TraceService.ready(app);
        } catch (RuntimeException refused) {
            // Not allowed at this moment after all: a start from the wrist waits for the phone.
        }
    }

    private static final String PREFS = "runframes";

    /** A finish from the wrist, written down, see {@link #restore}. Under LOCK. */
    private static void keepFinish() {
        if (app == null || activityId == null) return;
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("id", activityId)
                .putFloat("s", (float) anchorSeconds)
                .putLong("rev", rev + 1)
                .apply();
    }

    /**
     * A finish from the wrist that outlived the process it was made in. The service is held for it
     * so the process stays, but a process can still be killed, by a force stop for one: then this is
     * all that is left of the finish, and the page adopts it as the run's end rather than taking the
     * run for one still going and starting the GPS again. Under LOCK.
     */
    private static void restore() {
        if (app == null || live || armed || !"i".equals(status)) return;
        android.content.SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String id = prefs.getString("id", null);
        if (id == null) return;
        status = "d";
        anchorSeconds = prefs.getFloat("s", 0);
        activityId = id;
        rev = Math.max(rev, prefs.getLong("rev", 0));
    }

    /** The run's clock at a moment on the anchors' clock, never before the last anchor. */
    private static double clockAt(long when) {
        if (!"r".equals(status)) return anchorSeconds;
        return anchorSeconds + Math.max(0, when - anchorStamp) / 1000.0;
    }

    /**
     * A beat the watch reported, kept with when it arrived until the page drains it.
     *
     * Every beat, whatever the page is doing: the page takes them from here on each of its ticks, and
     * in one go when it thaws. Handed to the page directly, a beat reaching a frozen page waited for
     * the thaw and was dated then, so it matched no fix and a run lost its heart rate from the moment
     * the phone went into the pocket. One way in, so no beat is ever counted twice either.
     */
    static void heard(int bpm) {
        if (bpm < 25 || bpm > 250) return;
        synchronized (LOCK) {
            if (!live && !armed) return;
            lastBpm = bpm;
            lastBpmAt = SystemClock.elapsedRealtime();
            Beat beat = new Beat();
            beat.at = System.currentTimeMillis();
            beat.bpm = bpm;
            beats.add(beat);
            while (beats.size() > BEATS_MOST) beats.remove(0);
        }
    }

    /** The beats nobody has taken yet, oldest first, and gone from here once handed over. */
    static JSONArray drainBeats() {
        synchronized (LOCK) {
            JSONArray out = new JSONArray();
            try {
                for (Beat beat : beats) out.put(new JSONObject().put("b", beat.bpm).put("at", beat.at));
            } catch (JSONException impossible) {
                // Two numbers into an empty object.
            }
            beats.clear();
            return out;
        }
    }

    /**
     * The page describing the run: where its clock and its distance are, and what is left to run.
     *
     * Refused when it was made before the page adopted the latest change made here: it would put a
     * run paused or finished from the wrist back to running. The page adopts, and its next plan
     * carries the revision it adopted.
     */
    static void plan(JSONObject plan) {
        synchronized (LOCK) {
            long adopted = plan.optLong("rv", -1);
            if (adopted >= 0 && adopted < rev) return;
            String next = plan.optString("st", "i");
            // A change the page made itself, which a press waiting on the link must not be dated before.
            if (!next.equals(status)) lastChangeWall = System.currentTimeMillis();
            status = next;
            live = "r".equals(status) || "p".equals(status);
            armed = "i".equals(status);
            activityId = plan.optString("id", null);
            if (armed) holdReady();
            // Taken by the page along with the revision it just adopted, or it would not be planning.
            laps.clear();
            cue = plan.optInt("c", 0);
            anchorSeconds = plan.optDouble("s", 0);
            anchorMetres = plan.optDouble("d", 0);
            anchorStamp = SystemClock.elapsedRealtime();
            stepIndex = plan.optInt("i", -1);
            stepFromSeconds = plan.optDouble("fs", 0);
            // A plan naming no step is a run whose programme has run out, and its clock started then.
            freeFromSeconds = plan.optInt("i", -1) < 0 && plan.optBoolean("fx", false) ? plan.optDouble("fs", 0) : -1;
            stepFromMetres = plan.optDouble("fd", 0);
            plannedSeconds = plan.optInt("ps", -1);
            plannedMetres = plan.optInt("pd", -1);
            plannedPace = plan.optInt("pp", 0);
            maxHeart = plan.optInt("hm", 0);
            metresSince = 0;
            last = null;
            recent.clear();
            results.clear();
            // The beats are not cleared here: they are samples nobody has collected yet, and a plan
            // arrives on every frame. They go when the page takes them, or when the run does.
            steps = new ArrayList<>();
            JSONArray given = plan.optJSONArray("steps");
            for (int i = 0; given != null && i < given.length(); i++) {
                JSONObject one = given.optJSONObject(i);
                if (one == null) continue;
                Step step = new Step();
                step.kind = one.optString("k", "work");
                step.label = one.optString("l", "");
                step.goal = one.optString("g", "o");
                step.value = one.optInt("v", 0);
                step.pace = one.optInt("p", 0);
                step.repeat = one.optInt("r", 1);
                step.repeatOf = one.optInt("ro", 1);
                steps.add(step);
            }
        }
    }

    /**
     * Nothing to speak for any more. The status goes back to idle with the rest of it: left saying
     * `d`, a claim made before the next run's first plan would tell that run it had been finished
     * from the wrist, and the page would believe it and stop a run that had just started.
     */
    static void clear() {
        synchronized (LOCK) {
            // Stored by the page now, so nothing of the finish needs to outlive this process any more.
            if (app != null) app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
            live = false;
            armed = false;
            startedWall = 0;
            activityId = null;
            laps.clear();
            // Not the revision nor the presses taken: both only ever count up, across runs too.
            status = "i";
            stepIndex = -1;
            freeFromSeconds = -1;
            cue = 0;
            steps = new ArrayList<>();
            results.clear();
            beats.clear();
            lastBpm = 0;
            last = null;
            recent.clear();
        }
    }

    /**
     * What this worked out while the page was away, for the page to adopt. Its own track is still
     * the record: what it cannot rebuild from that is which block it reached and when it changed.
     */
    static JSONObject state() {
        synchronized (LOCK) {
            restore();
            JSONObject out = new JSONObject();
            try {
                out.put("live", live);
                // The revision the page is adopting, which its next plan carries so it is not refused.
                out.put("rev", rev);
                out.put("id", activityId == null ? JSONObject.NULL : activityId);
                // When the wrist started it, where it did: the page dates the run by this.
                if (startedWall > 0) out.put("sw", startedWall);
                // What the run is now, which the page cannot work out from a track it never saw stop.
                out.put("st", status);
                JSONArray lapped = new JSONArray();
                for (double[] lap : laps) {
                    lapped.put(new JSONObject().put("s", lap[0]).put("d", lap[1]));
                }
                out.put("laps", lapped);
                out.put("s", (int) Math.round(seconds()));
                out.put("i", stepIndex);
                out.put("c", cue);
                // Whether the programme ran out while nobody was listening, which the page adopts.
                out.put("free", freeFromSeconds >= 0);
                out.put("fs", stepFromSeconds);
                out.put("fd", stepFromMetres);
                JSONArray done = new JSONArray();
                for (Result result : results) {
                    JSONObject one = new JSONObject();
                    one.put("i", result.index);
                    one.put("d", result.metres);
                    one.put("s", result.seconds);
                    done.put(one);
                }
                out.put("done", done);
                // Drained rather than read: a sample handed over twice is a sample averaged twice.
                JSONArray heard = new JSONArray();
                for (Beat beat : beats) {
                    JSONObject one = new JSONObject();
                    one.put("b", beat.bpm);
                    one.put("at", beat.at);
                    heard.put(one);
                }
                beats.clear();
                out.put("hr", heard);
            } catch (JSONException impossible) {
                // Numbers and an array into an empty object.
            }
            return out;
        }
    }

    /**
     * Where the run is, without taking anything: for a page starting afresh to learn whether a run
     * finished from the wrist is waiting here to be stored. {@link #state()} drains, this does not.
     */
    static JSONObject status() {
        synchronized (LOCK) {
            restore();
            JSONObject out = new JSONObject();
            try {
                out.put("st", status);
                out.put("live", live);
                out.put("rev", rev);
                out.put("id", activityId == null ? JSONObject.NULL : activityId);
            } catch (JSONException impossible) {
                // Plain values into an empty object.
            }
            return out;
        }
    }

    /** The run as it stands, for a watch that has just come back and knows nothing of it. */
    static byte[] current() {
        synchronized (LOCK) {
            return live ? compose() : null;
        }
    }

    static boolean isLive() {
        synchronized (LOCK) {
            return live;
        }
    }

    /**
     * One fix, judged by the same rules as the page and then used for the wrist. Called from the
     * service's location callback, which is the only thing here that ever wakes the processor.
     */
    static void onFix(Location fix) {
        byte[] frame = null;
        synchronized (LOCK) {
            if (!live) return;
            if (!"r".equals(status)) return;
            // A paused run has no fixes to work from, so its clock is whatever it was stopped at.
            take(fix);
            long now = SystemClock.elapsedRealtime();
            if (now - Wrist.lastPageWrite() < QUIET_MS) return;
            if (now - lastFrameAt < FRAME_MS) return;
            lastFrameAt = now;
            advance();
            frame = compose();
        }
        if (frame != null) Wrist.get().write(frame);
    }

    private static void take(Location fix) {
        double accuracy = fix.hasAccuracy() ? fix.getAccuracy() : 0;
        if (accuracy > ACCURACY_M) return;
        if (last == null) {
            last = fix;
            recent.clear();
            recent.add(new double[]{seconds(), metresSince});
            return;
        }
        double gap = (fix.getTime() - last.getTime()) / 1000.0;
        if (gap <= 0) return;
        double step = last.distanceTo(fix);
        double speed = fix.hasSpeed() ? fix.getSpeed() : -1;
        if (speed >= 0 && speed < STILL_MS) return;
        boolean believed = speed >= MOVING_MS;
        if (!believed && step < Math.max(MIN_STEP_M, accuracy * ACCURACY_SHARE)) return;
        if (step / gap > MAX_SPEED_MS) return;

        metresSince += step;
        last = fix;
        double at = seconds();
        recent.add(new double[]{at, metresSince});
        while (recent.size() > 2 && recent.get(1)[0] < at - PACE_WINDOW_S) recent.remove(0);
    }

    /** The run's clock, continued from where the page left it. */
    private static double seconds() {
        /*
         * Held where it stopped, paused or finished alike. A paused run's frame is sent again on
         * reconnecting, long after; and a finished one's clock is what the page adopts as the run's
         * length, whenever it next wakes. Left running after a finish, the run grew by however long
         * the phone stayed in the pocket.
         */
        if ("p".equals(status) || "d".equals(status)) return anchorSeconds;
        return anchorSeconds + (SystemClock.elapsedRealtime() - anchorStamp) / 1000.0;
    }

    private static double metres() {
        return anchorMetres + metresSince;
    }

    /** A block ends when what it asked for is done, whoever is watching. */
    private static void advance() {
        if (stepIndex < 0 || stepIndex >= steps.size()) return;
        for (int guard = 0; guard < steps.size(); guard++) {
            Step step = steps.get(stepIndex);
            double doneSeconds = seconds() - stepFromSeconds;
            double doneMetres = metres() - stepFromMetres;
            boolean over = ("t".equals(step.goal) && doneSeconds >= step.value)
                    || ("d".equals(step.goal) && doneMetres >= step.value);
            if (!over) return;

            Result result = new Result();
            result.index = stepIndex;
            result.metres = (int) Math.round(doneMetres);
            result.seconds = (int) Math.round(doneSeconds);
            results.add(result);

            if (stepIndex + 1 >= steps.size()) {
                // The programme is done and the run is not: the clock carries on with nothing to
                // hold, from here, until somebody stops it. The page is told through claim().
                stepIndex = -1;
                freeFromSeconds = seconds();
                cue++;
                return;
            }
            stepIndex++;
            stepFromSeconds = seconds();
            stepFromMetres = metres();
            // What makes the wrist buzz: the watch feels a block change rather than reading one.
            cue++;
        }
    }

    /**
     * Cut down to one write if it comes to more, in the same order and for the same reason as
     * fitRun in src/lib/watch/protocol.ts: a full frame is within a few bytes of the budget, and
     * what is given up is what comes next rather than the block being run.
     */
    private static final String[] GIVE_UP = {"ngs", "ngm", "ntp", "nk", "pp", "pd", "ps", "b"};

    private static byte[] fit(JSONObject message) {
        byte[] bytes = message.toString().getBytes(StandardCharsets.UTF_8);
        for (String key : GIVE_UP) {
            if (bytes.length <= MAX_MESSAGE_BYTES) break;
            message.remove(key);
            bytes = message.toString().getBytes(StandardCharsets.UTF_8);
        }
        return bytes;
    }

    /** The same budget as src/lib/watch/protocol.ts, which is the size one write can promise. */
    private static final int MAX_MESSAGE_BYTES = 180;

    private static int pace() {
        if (recent.isEmpty()) return 0;
        double[] first = recent.get(0);
        double run = metresSince - first[1];
        double span = seconds() - first[0];
        if (run < PACE_WINDOW_MIN_M || span <= 0) return 0;
        return (int) Math.round(span / (run / 1000.0));
    }

    private static int averagePace() {
        double metres = metres();
        double span = seconds();
        if (metres <= 0 || span <= 0) return 0;
        return (int) Math.round(span / (metres / 1000.0));
    }

    /** The zone of the last beat and how far through it, as zoneOf and zoneWithin work them out. */
    private static void putZone(JSONObject message) throws JSONException {
        if (maxHeart <= 0 || lastBpm <= 0) return;
        if (SystemClock.elapsedRealtime() - lastBpmAt > BEAT_STALE_MS) return;
        double share = lastBpm / (double) maxHeart;
        for (int zone = 5; zone >= 1; zone--) {
            double floor = ZONE_FLOOR[zone - 1];
            if (share < floor) continue;
            double top = zone == 5 ? 1.0 : ZONE_FLOOR[zone];
            double within = Math.min(1, Math.max(0, (share - floor) / (top - floor)));
            message.put("hz", zone);
            message.put("hi", (int) Math.round(within * 100));
            return;
        }
        // Below the first zone: said as nought, which is not the same as no maximum.
        message.put("hz", 0);
    }

    /** The same frame src/lib/watch/link.ts sends, because the watch knows only one shape of one. */
    private static byte[] compose() {
        try {
            JSONObject message = new JSONObject();
            message.put("v", 2);
            message.put("t", "run");
            message.put("st", status);
            message.put("s", (int) Math.round(seconds()));
            message.put("d", (int) Math.round(metres()));
            message.put("p", pace());
            message.put("a", averagePace());
            message.put("c", cue);

            if (freeFromSeconds >= 0) {
                message.put("fr", (int) Math.round(Math.max(0, seconds() - freeFromSeconds)));
            }
            putZone(message);
            if (stepIndex >= 0 && stepIndex < steps.size()) {
                Step step = steps.get(stepIndex);
                message.put("k", step.kind);
                if (!step.label.isEmpty()) message.put("b", step.label);
                // One position or the other, as link.ts sends it: the round inside a repeat, or the
                // place in the programme outside one. Both together do not fit a small payload.
                if (step.repeatOf > 1) {
                    message.put("r", step.repeat);
                    message.put("ro", step.repeatOf);
                } else {
                    message.put("i", stepIndex + 1);
                    message.put("n", steps.size());
                }
                if (step.pace > 0) message.put("tp", step.pace);
                if ("t".equals(step.goal)) {
                    message.put("gs", step.value);
                    message.put("ls", Math.max(0, (int) Math.round(step.value - (seconds() - stepFromSeconds))));
                } else if ("d".equals(step.goal)) {
                    message.put("gm", step.value);
                    message.put("lm", Math.max(0, (int) Math.round(step.value - (metres() - stepFromMetres))));
                }
                if (stepIndex + 1 < steps.size()) {
                    Step next = steps.get(stepIndex + 1);
                    message.put("nk", next.kind);
                    if (next.pace > 0) message.put("ntp", next.pace);
                    if ("t".equals(next.goal)) message.put("ngs", next.value);
                    else if ("d".equals(next.goal)) message.put("ngm", next.value);
                }
            }
            if ("i".equals(status)) {
                if (plannedSeconds >= 0) message.put("ps", plannedSeconds);
                if (plannedMetres >= 0) message.put("pd", plannedMetres);
                if (plannedPace > 0) message.put("pp", plannedPace);
            }
            return fit(message);
        } catch (JSONException impossible) {
            return null;
        }
    }
}
