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
    /** An hour of a beat every few seconds, which is longer than any run holds a phone asleep for. */
    private static final int BEATS_MOST = 1200;
    private static final List<Beat> beats = new ArrayList<>();

    private static boolean live = false;
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

    /**
     * A button on the wrist while the page is frozen, which is most of a run.
     *
     * The page is the one that drives a run, so this only acts when the page plainly cannot: it has
     * been silent for seconds, and the watch is asking for something that cannot wait for it to
     * thaw. What is done here is handed back through {@link #state()} when it does.
     */
    static boolean command(String type) {
        byte[] frame;
        synchronized (LOCK) {
            if (!live) return false;
            if (SystemClock.elapsedRealtime() - Wrist.lastPageWrite() < QUIET_MS) return false;

            switch (type) {
                case "rh":
                    if (!"r".equals(status)) return false;
                    // The clock stops where it is: an anchor with no time running from it.
                    anchorSeconds = seconds();
                    anchorMetres = metres();
                    metresSince = 0;
                    anchorStamp = SystemClock.elapsedRealtime();
                    status = "p";
                    if (app != null) TraceService.hold(app);
                    break;
                case "ru":
                    if (!"p".equals(status)) return false;
                    anchorStamp = SystemClock.elapsedRealtime();
                    status = "r";
                    last = null;
                    recent.clear();
                    if (app != null) TraceService.begin(app);
                    break;
                case "re":
                    anchorSeconds = seconds();
                    anchorMetres = metres();
                    metresSince = 0;
                    status = "d";
                    live = false;
                    if (app != null) TraceService.end(app);
                    break;
                default:
                    // Starting a run is the page's alone: nothing is running for this to speak for.
                    return false;
            }
            lastFrameAt = SystemClock.elapsedRealtime();
            frame = compose();
        }
        if (frame != null) Wrist.get().write(frame);
        return true;
    }

    /**
     * A beat the watch reported. Kept only while the page is asleep: awake, the page is told
     * directly and holding a second copy here would have it counted twice when the two are joined.
     */
    static void heard(int bpm) {
        if (bpm < 25 || bpm > 250) return;
        synchronized (LOCK) {
            if (!live) return;
            if (SystemClock.elapsedRealtime() - Wrist.lastPageWrite() < QUIET_MS) return;
            Beat beat = new Beat();
            beat.at = System.currentTimeMillis();
            beat.bpm = bpm;
            beats.add(beat);
            while (beats.size() > BEATS_MOST) beats.remove(0);
        }
    }

    /** The page describing the run: where its clock and its distance are, and what is left to run. */
    static void plan(JSONObject plan) {
        synchronized (LOCK) {
            status = plan.optString("st", "i");
            live = "r".equals(status) || "p".equals(status);
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
            live = false;
            status = "i";
            stepIndex = -1;
            freeFromSeconds = -1;
            cue = 0;
            steps = new ArrayList<>();
            results.clear();
            beats.clear();
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
            JSONObject out = new JSONObject();
            try {
                out.put("live", live);
                // What the run is now, which the page cannot work out from a track it never saw stop.
                out.put("st", status);
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
