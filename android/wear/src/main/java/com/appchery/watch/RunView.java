package com.appchery.watch;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/**
 * A run on the wrist.
 *
 * Pages, a swipe or a tap apart: what the programme asks for before the start, then the block being
 * run, the run's own totals, what comes next, and the controls. The block is first once running
 * because that is what a wrist is for mid interval; the controls are last because a run is stopped
 * once and read a hundred times, and a stop button under a thumb mid stride is a run lost.
 *
 * The clock runs here rather than being redrawn from the phone. Frames arrive every second or two,
 * and a display that only moved when one landed read as a clock that stutters. So the seconds are
 * counted locally from the last frame and corrected whenever the next one arrives: the phone stays
 * the authority, and the wrist stops looking broken between its words.
 *
 * Nothing is decided here. The buttons ask the phone, exactly as asking to open an activity does.
 */
public class RunView extends FrameLayout {

    public interface Listener {
        /** go, pause, resume or stop. The phone owns the run and answers with the next frame. */
        void onRunCommand(String action);

        /** Whether to hold the screen awake for the rest of the run, and remember the answer. */
        void onKeepAwake(boolean on);

        /** Whether the run stays on the screen dimmed when the watch would otherwise sleep. */
        void onAmbient(boolean on);
    }

    // src/app.css, the dark palette, so the wrist is the same app as the phone.
    private static final int INK = 0xFFEFE8DC;
    private static final int MUTED = 0xFFA2988A;
    private static final int BRAND = 0xFFD99B47;
    private static final int BRAND_INK = 0xFF231A0E;
    private static final int GOOD = 0xFF5FB07F;
    /** Work is green, as it is on the phone: the colour of the block, not of a warning. */
    private static final int WORK = 0xFF5FB07F;
    private static final int OVER = 0xFFE8453C;
    private static final int LINE = 0xFF3A332A;
    private static final int SURFACE = 0xFF201C16;
    /** --c-run-heart of src/app.css, dark: the heart is the same red on the wrist as on the phone. */
    private static final int HEART = 0xFFC04A55;
    private static final int HEART_TINT = 0xFF2B191B;

    private static final int PAGE_PACE = 0;
    private static final int PAGE_BLOCK = 1;
    private static final int PAGE_RUN = 2;
    private static final int PAGE_NEXT = 3;
    private static final int PAGE_HEART = 4;

    /** How many samples either graph keeps. At a frame every second or two, this is a few minutes. */
    private static final int HISTORY = 120;

    /** The figure a page is read for. Bigger on the pages that have given up their pair for a graph. */
    private static final float HEADLINE = 40f;
    private static final float HEADLINE_BIG = 46f;
    /**
     * How much of each side belongs to the system. Wear dismisses an app on a swipe that starts at
     * an edge, so anything beginning there is left well alone; what is left is the middle, and in
     * the middle a sideways drag either way is the controls. Either way, because which of the two
     * the system takes is the watch's business and not something to guess at from here.
     */
    private static final float EDGE_SHARE = 0.2f;

    /** How much of the screen a drag has to cover before letting go turns the page rather than undoing it. */
    private static final float TURN_SHARE = 0.18f;
    /** Beyond this the phone is not correcting a clock, it is telling it about something that happened. */
    private static final long SNAP_MS = 2500;
    /** How much of a small disagreement is walked off per redraw, which is once a second. */
    private static final long SLEW_MS = 120;
    /** How long a finish stays armed before it forgets it was asked, so a stray tap cannot end a run. */
    private static final long ARMED_MS = 4000;
    /**
     * How long the wrist waits for a frame before it stops believing the figures it is showing.
     * Frames come every second or two, so three times the slowest of those is a silence rather than
     * a gap. The clock goes on running, because the clock is the one thing this can work out for
     * itself; the distance and the pace cannot be, so they say they are old rather than looking new.
     */
    private static final long STALE_MS = 8000;

    private final float density;
    private final Listener listener;
    private final Vibrator vibrator;
    private final Ring ring;
    private final GestureDetector gestures;

    /** The page showing, and the one a drag is bringing in behind it. */
    private final Panel front;
    private final Panel back;
    private LinearLayout infoDots;

    private final LinearLayout controls;
    private final TextView hold;
    private final TextView finish;
    private final TextView awake;
    private final TextView alwaysOn;
    private final TextView ambientNote;
    private final TextView wayBack;

    private final LinearLayout ready;
    private final TextView readyPlan;
    private final TextView readyPace;

    private Link.Run run;
    /** When the last frame was taken in, on a clock that does not move when the wall clock does. */
    private long stamp;
    /**
     * The run's clock, in milliseconds, kept here.
     *
     * The phone sends whole seconds, so every frame carries up to half a second of rounding, and
     * anchoring the clock to each one made a second last 1.4s and the next 0.6s. What arrives is
     * treated as a correction rather than as the time: a small difference is walked off a few
     * milliseconds at a time and only a real jump, a pause or a block jumped to, is taken whole.
     */
    private long runMsAtAnchor = 0;
    private long anchorRealtime = 0;
    private long leftMsAtAnchor = -1;
    private long leftAnchorRunMs = 0;
    /** The last figures put on screen, so a correction can never take one back or skip past one. */
    private int shown = -1;
    private int shownLeft = -1;
    private int page = PAGE_BLOCK;
    /** The controls are a place rather than a page: gone to and come back from by the same gesture. */
    private boolean onControls = false;
    private long armedAt = 0;
    private boolean keepAwake = false;
    private boolean ambientWanted = false;
    /** Whether the watch itself has an ambient screen to give, which is a setting of its own. */
    private boolean ambientAvailable = true;
    /** In ambient the watch is asleep with the screen up: dimmed, and redrawn rarely. */
    private boolean ambient = false;
    private final int slop;
    private float downX;
    private float downY;
    private boolean dragging = false;
    /** Which of the two a drag turned out to be: sideways to the controls, or up and down the pages. */
    private boolean across = false;
    /** Minutes a kilometre unless this run has been told otherwise, and told afresh on every run. */
    private boolean asSpeed = false;
    /**
     * The last few minutes of the pace and of the heart, kept here because nothing else keeps them:
     * the phone sends the run as it stands, never as it has been, and asking it for a history would
     * be a message the size of the run on a link the size of a sentence.
     */
    private final int[] paces = new int[HISTORY];
    private final int[] paceAtSeconds = new int[HISTORY];
    private final int[] paceAtMetres = new int[HISTORY];
    private int paceCount = 0;
    /** The block the pace graph belongs to, so it starts afresh when the runner does. */
    private int paceCue = -1;
    private final int[] hearts = new int[HISTORY];
    private final int[] heartAtSeconds = new int[HISTORY];
    private final int[] heartAtMetres = new int[HISTORY];
    private int heartCount = 0;
    /** What the line under a graph counts in. Tapped to swap, as the pace figures are. */
    private boolean graphAsDistance = false;
    private int heart = 0;
    private boolean heartAvailable = false;
    /** The page a drag is bringing in, and how far across the controls are being pulled. */
    private int coming = -1;
    private float acrossTo = 0f;
    private float dragY = 0f;
    /** Set for as long as a page is animating into place, which is not a drag but is not still either. */
    private boolean settling = false;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            draw();
            // Redrawn as the second turns rather than on a fixed beat, so the digits change at an
            // even pace whatever the phone's frames do.
            // Just after the turn of the second rather than exactly on it: landing a millisecond
            // early draws the second that is ending and then waits a whole second to correct it.
            long into = Math.floorMod(runMs(), 1000L);
            postDelayed(this, Math.max(60L, 1000L - into + 30L));
        }
    };

    public RunView(Context context, Listener listener) {
        super(context);
        this.listener = listener;
        density = context.getResources().getDisplayMetrics().density;
        slop = ViewConfiguration.get(context).getScaledTouchSlop();
        vibrator = context.getSystemService(Vibrator.class);
        setBackgroundColor(Color.BLACK);
        // Without this the group is never offered the gesture: a ViewGroup that is not clickable
        // sees ACTION_DOWN, declines it, and is sent nothing else, so no fling ever arrives.
        setClickable(true);

        ring = new Ring(context);
        addView(ring, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

        front = new Panel(context);
        back = new Panel(context);
        addView(front.column);
        addView(back.column);
        back.column.setVisibility(GONE);

        /*
         * Down the right hand edge rather than under the figures: dots in a row say the pages lie
         * side by side, which is the one thing they must not say here. Standing up they say which
         * way the crown turns, and they take none of the height the figures need.
         */
        infoDots = dots(context);
        infoDots.setOrientation(LinearLayout.VERTICAL);
        LayoutParams dotsPlace = new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
        dotsPlace.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
        dotsPlace.rightMargin = Math.round(context.getResources().getDisplayMetrics().widthPixels * 0.045f);
        addView(infoDots, dotsPlace);

        // The controls, on a page of their own: a run is stopped once and read a hundred times.
        controls = column(context);
        TextView controlsTitle = new TextView(context);
        controlsTitle.setGravity(Gravity.CENTER);
        controlsTitle.setTextColor(MUTED);
        controlsTitle.setTextSize(11f);
        controlsTitle.setText("Controls");
        controls.addView(controlsTitle, wide());

        /*
         * Two to a line, and smaller than a page of one would allow. A round screen is widest across
         * its middle, so four buttons stacked put the first and the last where the glass curves away
         * from them; side by side they all sit in the band that is actually square.
         */
        hold = button(context, "Pause", BRAND, BRAND_INK);
        hold.setOnClickListener(view -> {
            buzz();
            ask("p".equals(status()) ? "resume" : "pause");
        });
        finish = button(context, "Finish", SURFACE, OVER);
        finish.setOnClickListener(view -> {
            buzz();
            // Asked twice: a run ended by a sleeve brushing the glass is a run that cannot be undone.
            if (SystemClock.elapsedRealtime() - armedAt < ARMED_MS) {
                armedAt = 0;
                ask("stop");
            } else {
                armedAt = SystemClock.elapsedRealtime();
            }
            draw();
        });
        controls.addView(row(context, hold, finish), rowSize(px(9)));

        awake = button(context, "Screen off", SURFACE, MUTED);
        awake.setOnClickListener(view -> {
            buzz();
            keepAwake = !keepAwake;
            if (listener != null) listener.onKeepAwake(keepAwake);
            draw();
        });
        // Dimmed and left up rather than lit or dark, which is the only middle a watch has.
        alwaysOn = button(context, "Always off", SURFACE, MUTED);
        alwaysOn.setOnClickListener(view -> {
            buzz();
            ambientWanted = !ambientWanted;
            if (listener != null) listener.onAmbient(ambientWanted);
            draw();
        });
        controls.addView(row(context, awake, alwaysOn), rowSize(px(6)));

        /*
         * Asking for ambient is not the same as being given it: with the watch's own always-on
         * screen switched off there is no ambient at all, and the request is dropped in silence.
         * Said here rather than left as a toggle that does nothing.
         */
        ambientNote = new TextView(context);
        ambientNote.setGravity(Gravity.CENTER);
        ambientNote.setTextColor(OVER);
        ambientNote.setTextSize(9f);
        ambientNote.setMaxLines(2);
        ambientNote.setText("Turn on the watch's always-on screen in Settings");
        ambientNote.setVisibility(GONE);
        LinearLayout.LayoutParams noteSize = wide();
        noteSize.topMargin = px(4);
        controls.addView(ambientNote, noteSize);

        /*
         * Said rather than left to be found. The way back is the same swipe again, because the other
         * way is how Wear leaves an app: a runner looking for the numbers again would find themselves
         * out of the app altogether, mid run, with the wrong half of a guess.
         */
        wayBack = new TextView(context);
        wayBack.setGravity(Gravity.CENTER);
        wayBack.setTextColor(MUTED);
        wayBack.setTextSize(10f);
        wayBack.setMaxLines(1);
        // The same way round as getting here: the other way is how the watch leaves the app.
        wayBack.setText("swipe on ⟶ or turn the crown");
        controls.addView(wayBack, dotsSize());
        controls.setVisibility(GONE);
        addView(controls);

        // Before the start: what the programme asks for, and the one button that begins it.
        ready = column(context);
        TextView readyTitle = new TextView(context);
        readyTitle.setGravity(Gravity.CENTER);
        readyTitle.setTextColor(BRAND);
        readyTitle.setTextSize(12f);
        readyTitle.setTypeface(Typeface.DEFAULT_BOLD);
        readyTitle.setText("Ready");
        ready.addView(readyTitle, wide());

        readyPlan = new TextView(context);
        readyPlan.setGravity(Gravity.CENTER);
        readyPlan.setTextColor(INK);
        readyPlan.setTextSize(20f);
        readyPlan.setTypeface(Typeface.DEFAULT_BOLD);
        readyPlan.setMaxLines(1);
        LinearLayout.LayoutParams planSize = wide();
        planSize.topMargin = px(6);
        ready.addView(readyPlan, planSize);

        readyPace = new TextView(context);
        readyPace.setGravity(Gravity.CENTER);
        readyPace.setTextColor(MUTED);
        readyPace.setTextSize(12f);
        readyPace.setMaxLines(1);
        ready.addView(readyPace, wide());

        TextView start = button(context, "Start", BRAND, BRAND_INK);
        start.setTextSize(15f);
        start.setPadding(px(18), px(10), px(18), px(11));
        start.setOnClickListener(view -> {
            buzz();
            ask("go");
        });
        LinearLayout.LayoutParams startSize = wide();
        startSize.topMargin = px(12);
        ready.addView(start, startSize);
        ready.setVisibility(GONE);
        addView(ready);

        // Tapped through and flicked through, because both are what a wrist is tried with first.
        gestures = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onSingleTapUp(MotionEvent event) {
                // Never on a page with buttons: there, a tap is meant for the button under it.
                if (hasButtons()) return false;
                turn(1);
                return true;
            }

            @Override
            public boolean onFling(MotionEvent from, MotionEvent to, float vx, float vy) {
                // Only where the drag never started: a flick fast enough to be a fling is usually
                // also far enough to have been one, and both acting on it would turn two pages.
                if (dragging) return false;
                if (Math.abs(vy) >= Math.abs(vx)) {
                    turn(vy < 0 ? 1 : -1);
                    return true;
                }
                if (inTheMiddle(from.getX())) {
                    toggleControls();
                    return true;
                }
                return false;
            }
        });
    }

    /** One mark of a graph's scale, written in the same white as the figures down its left edge. */
    private TextView scaleMark(Context context, int gravity) {
        TextView mark = new TextView(context);
        mark.setGravity(gravity);
        mark.setTextColor(INK);
        mark.setTextSize(9f);
        mark.setTypeface(Typeface.DEFAULT_BOLD);
        mark.setMaxLines(1);
        return mark;
    }

    /** One figure with its label under it, which is the shape both halves of the pair take. */
    private LinearLayout cell(Context context, TextView value, TextView label) {
        LinearLayout box = new LinearLayout(context);
        box.setOrientation(LinearLayout.VERTICAL);
        value.setGravity(Gravity.CENTER);
        value.setTextColor(INK);
        value.setTextSize(34f);
        value.setTypeface(Typeface.DEFAULT_BOLD);
        value.setMaxLines(1);
        label.setGravity(Gravity.CENTER);
        label.setTextColor(MUTED);
        label.setTextSize(10f);
        label.setMaxLines(1);
        box.addView(value, wide());
        box.addView(label, wide());
        return box;
    }

    private LinearLayout.LayoutParams half() {
        return new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
    }

    private LinearLayout column(Context context) {
        LinearLayout built = new LinearLayout(context);
        built.setOrientation(LinearLayout.VERTICAL);
        built.setGravity(Gravity.CENTER);
        /*
         * A round screen in a square window: text near an edge is behind the bezel, which is what
         * cut the bottom line off before. The inscribed square is 0.707 of the diameter, so an inset
         * of an eighth each way keeps every line inside the glass with room to spare.
         */
        int width = context.getResources().getDisplayMetrics().widthPixels;
        // Wide inset at the sides, where the circle takes the room, and a narrow one top and bottom,
        // where an eighth of the height was more than the content had to spare: the last line and the
        // dots fell off the bottom of the column and were clipped, which is the band that cut them.
        built.setPadding(Math.round(width * 0.13f), Math.round(width * 0.055f),
                Math.round(width * 0.13f), Math.round(width * 0.055f));
        return built;
    }

    /** Two buttons abreast, each taking half of whatever the row is given. */
    private LinearLayout row(Context context, View left, View right) {
        LinearLayout line = new LinearLayout(context);
        line.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams half = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        half.setMargins(px(2), 0, px(2), 0);
        line.addView(left, half);
        line.addView(right, new LinearLayout.LayoutParams(half));
        return line;
    }

    private LinearLayout.LayoutParams rowSize(int top) {
        LinearLayout.LayoutParams size = wide();
        size.topMargin = top;
        return size;
    }

    private TextView button(Context context, String label, int fill, int ink) {
        TextView key = new TextView(context);
        key.setGravity(Gravity.CENTER);
        key.setText(label);
        key.setTextSize(13f);
        key.setTypeface(Typeface.DEFAULT_BOLD);
        key.setTextColor(ink);
        key.setMaxLines(1);
        key.setPadding(px(4), px(8), px(4), px(9));
        key.setClickable(true);
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(fill);
        pill.setCornerRadius(px(24));
        if (fill == SURFACE) pill.setStroke(Math.round(1.5f * density), LINE);
        key.setBackground(pill);
        return key;
    }

    private LinearLayout dots(Context context) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        // One per page this run could have: pace, block, run, next, heart. Spares are hidden.
        for (int i = 0; i < 5; i++) {
            View dot = new View(context);
            LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(px(5), px(5));
            size.setMargins(px(3), px(3), px(3), px(3));
            row.addView(dot, size);
        }
        return row;
    }

    private LinearLayout.LayoutParams wide() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams dotsSize() {
        LinearLayout.LayoutParams size = wide();
        size.topMargin = px(7);
        return size;
    }

    private String status() {
        return run == null ? "i" : run.status;
    }

    private boolean live() {
        return "r".equals(status()) || "p".equals(status());
    }

    private boolean hasButtons() {
        return !live() || onControls;
    }

    private void ask(String action) {
        if (listener != null) listener.onRunCommand(action);
    }

    private void buzz() {
        if (vibrator != null) vibrator.vibrate(VibrationEffect.createOneShot(14, VibrationEffect.DEFAULT_AMPLITUDE));
    }

    /** The pages this run actually has, in the order the crown and the finger move through them. */
    private List<Integer> pages() {
        List<Integer> open = new ArrayList<>();
        if (!live()) return open;
        // The pace leads: it is the one page that answers a question rather than reporting a figure.
        open.add(PAGE_PACE);
        if (run != null && run.hasBlock) open.add(PAGE_BLOCK);
        open.add(PAGE_RUN);
        if (run != null && !run.nextKind.isEmpty()) open.add(PAGE_NEXT);
        // Only where there is something to draw: a page of two dashes is a page not worth turning to.
        if (heartAvailable || heart > 0) open.add(PAGE_HEART);
        return open;
    }

    /** The beat off this watch's own sensor, which is the only figure here the phone did not send. */
    public void setHeart(int bpm) {
        heart = bpm;
        if (live() && bpm > 0) {
            heartCount = keep(hearts, heartAtSeconds, heartAtMetres, heartCount, bpm,
                    seconds(), run == null ? 0 : run.metres);
        }
        draw();
    }

    /** Whether this watch has a sensor it is allowed to use, which decides if the page exists at all. */
    public void setHeartAvailable(boolean can) {
        heartAvailable = can;
        draw();
    }

    /**
     * A sample onto the end of a history, the oldest falling off the front once it is full.
     *
     * Where the run was when it was taken goes with it, because a line with no ground under it says
     * how the pace moved and not over what: three minutes and three hundred metres of it are two
     * different runs.
     */
    private static int keep(int[] values, int[] secs, int[] mets, int count, int value, int at, int metres) {
        if (count >= HISTORY) {
            System.arraycopy(values, 1, values, 0, HISTORY - 1);
            System.arraycopy(secs, 1, secs, 0, HISTORY - 1);
            System.arraycopy(mets, 1, mets, 0, HISTORY - 1);
            values[HISTORY - 1] = value;
            secs[HISTORY - 1] = at;
            mets[HISTORY - 1] = metres;
            return HISTORY;
        }
        values[count] = value;
        secs[count] = at;
        mets[count] = metres;
        return count + 1;
    }

    /**
     * The ground a graph is drawn over, written under it: how far back it starts, the middle of it,
     * and the right hand end, which is always now.
     *
     * Counted back from now rather than given as the run's own clock, because what is being asked is
     * how long ago something happened, and a figure that has to be subtracted from another one first
     * is a figure nobody reads mid run.
     */
    private void drawScale(Panel p, int[] secs, int[] mets, int count) {
        if (count < 2 || run == null) {
            p.scaleFrom.setText("");
            p.scaleMid.setText("");
            p.scaleTo.setText("");
            return;
        }
        int back = graphAsDistance
                ? Math.max(0, run.metres - mets[0])
                : Math.max(0, seconds() - secs[0]);
        p.scaleFrom.setText(ago(back));
        p.scaleMid.setText(ago(back / 2));
        p.scaleTo.setText("now");
    }

    /** How far back a point of the scale is, in whichever of the two the runner last asked for. */
    private String ago(int back) {
        // Short enough for three of them abreast on a round screen: the metres lose their unit at
        // the kilometre and the minutes lose their hours, because neither graph is ever that long.
        if (graphAsDistance) return "-" + (back < 1000 ? back + "m" : String.format(
                java.util.Locale.UK, "%.1fk", back / 1000f));
        return "-" + clock(back);
    }

    /** Into the controls and back out, by the one gesture that is neither the crown nor the way out. */
    private void toggleControls() {
        if (!live()) return;
        // Through the same animation a drag ends in, from a standing start. Always the same way
        // round, out to the left and in from the right, because both directions are the same
        // gesture: an animation that ran backwards would be showing a swipe nobody can make.
        dragAcross(-1f);
        acrossTo = -Math.max(1, getWidth());
        releaseAcross();
    }

    /** The crown turns the pages too, which is the gesture this watch has and a phone has not. */
    /** What the watch remembered from the last run, so the toggles open where they were left. */
    public void setKeepAwake(boolean on) {
        keepAwake = on;
        draw();
    }

    public void setAmbientWanted(boolean on) {
        ambientWanted = on;
        draw();
    }

    /** What the watch's own setting says, which is the difference between asking and being given. */
    public void setAmbientAvailable(boolean can) {
        ambientAvailable = can;
        draw();
    }

    /**
     * Into ambient and out of it. The screen stays up and the watch goes to sleep under it, so the
     * second by second redraw stops: what is drawn is what is still true a minute later, and the
     * activity wakes it every so often rather than this view waking itself.
     */
    public void setAmbient(boolean on) {
        ambient = on;
        removeCallbacks(tick);
        if (!on && getVisibility() == VISIBLE && isAttachedToWindow()) post(tick);
        else draw();
    }

    /** One redraw, asked for from outside because in ambient nothing here is allowed to ask. */
    public void ambientTick() {
        draw();
    }

    public void turn(int by) {
        if (onControls) {
            toggleControls();
            return;
        }
        int next = neighbour(by);
        if (next < 0 || next == page) return;
        settleTo(next, by, 0f);
    }

    /**
     * The page a move of one step lands on, or -1 where there is only the one.
     *
     * It comes round: off the bottom is back to the top. There are five of these at most and they
     * are turned with a wet thumb mid run, so the way to a page two behind is never a decision about
     * which direction is shorter.
     */
    private int neighbour(int by) {
        List<Integer> open = pages();
        if (open.size() < 2) return -1;
        int at = Math.max(0, open.indexOf(page));
        return open.get(((at + by) % open.size() + open.size()) % open.size());
    }

    /**
     * The page follows the finger.
     *
     * A drag lifts the page it is pushing and brings the next one up behind it from the edge it is
     * coming from, so the gesture shows what it is about to do while it is still being made. Pulled
     * back the other way, the pages go back where they were and nothing has happened: what a drag
     * does is decided when it ends, not when it starts, which is what makes it safe to try.
     *
     * The same behaviour as the shade Wear pulls down over everything else, because the runner has
     * already learned that one on this watch.
     */
    private void drag(float dy) {
        int by = dy < 0 ? 1 : -1;
        int next = neighbour(by);
        float height = getHeight();
        if (next < 0) {
            // One page and nowhere to go, so it gives a little and comes straight back: a screen
            // that does not move at all reads as one that has stopped listening.
            dragY = dy * 0.18f;
            coming = -1;
            front.column.setTranslationY(dragY);
            back.column.setVisibility(GONE);
            return;
        }
        dragY = Math.max(-height, Math.min(height, dy));
        if (coming != next) {
            coming = next;
            drawPage(back, coming, seconds());
        }
        back.column.setVisibility(VISIBLE);
        front.column.setTranslationY(dragY);
        // Coming in from the edge the drag is heading towards, one screen behind the page leaving.
        back.column.setTranslationY(dragY + (by > 0 ? height : -height));
        float share = Math.min(1f, Math.abs(dragY) / height);
        front.column.setAlpha(1f - share * 0.7f);
        back.column.setAlpha(0.3f + share * 0.7f);
        infoDots.setVisibility(GONE);
    }

    /** A drag let go of: far enough is a page turned, and anything less is a page put back. */
    private void releaseDrag() {
        float height = Math.max(1, getHeight());
        boolean far = Math.abs(dragY) > height * TURN_SHARE;
        int by = dragY < 0 ? 1 : -1;
        if (far && coming >= 0) settleTo(coming, by, dragY);
        else settleBack();
        dragY = 0f;
    }

    /** Everything back where it was, which is what a drag that changed its mind has to leave behind. */
    private void settleBack() {
        coming = -1;
        settling = true;
        front.column.animate().cancel();
        front.column.animate().translationY(0f).alpha(1f).setDuration(140).start();
        back.column.animate().cancel();
        back.column.animate().translationY(0f).alpha(0f).setDuration(140)
                .withEndAction(() -> {
                    settling = false;
                    back.column.setVisibility(GONE);
                    back.column.setAlpha(1f);
                    draw();
                }).start();
    }

    /**
     * The page carried the rest of the way, from wherever the finger left it. Leaving the controls
     * forgets that a finish was asked for, which is what a change of mind is.
     */
    private void settleTo(int next, int by, float from) {
        float height = Math.max(1, getHeight());
        armedAt = 0;
        settling = true;
        if (coming != next) {
            coming = next;
            drawPage(back, next, seconds());
        }
        back.column.setVisibility(VISIBLE);
        // Started from where the finger was, so a turn asked for by the crown still travels the
        // whole way and one dragged most of the way only finishes what is left.
        front.column.setTranslationY(from);
        back.column.setTranslationY(from + (by > 0 ? height : -height));
        front.column.animate().cancel();
        front.column.animate().translationY(by > 0 ? -height : height).alpha(0f).setDuration(160).start();
        back.column.animate().cancel();
        back.column.animate().translationY(0f).alpha(1f).setDuration(160).withEndAction(() -> {
            page = next;
            coming = -1;
            settling = false;
            // Both put back where they belong before the next draw: a panel left dimmed and shifted
            // would come back invisible the next time it was shown.
            front.column.setTranslationY(0f);
            front.column.setAlpha(1f);
            back.column.setTranslationY(0f);
            back.column.setAlpha(1f);
            back.column.setVisibility(GONE);
            draw();
        }).start();
    }

    /**
     * The controls follow the finger too, sideways, and by the same rule: shown as they arrive, put
     * back where they were if the drag changes its mind.
     *
     * Always the same way round. The controls lie to the right of the figures and are reached by the
     * swipe the watch leaves to the app, and the way back is that same swipe again rather than its
     * mirror, because the mirror of it is how Wear closes an app.
     */
    private void dragAcross(float dx) {
        float width = Math.max(1, getWidth());
        acrossTo = Math.max(-width, Math.min(width, dx));
        float share = Math.min(1f, Math.abs(acrossTo) / width);
        View here = onControls ? controls : front.column;
        View there = onControls ? front.column : controls;
        here.setTranslationX(acrossTo);
        here.setAlpha(1f - share * 0.7f);
        there.setVisibility(VISIBLE);
        there.setTranslationX(acrossTo + (acrossTo < 0 ? width : -width));
        there.setAlpha(0.3f + share * 0.7f);
        infoDots.setVisibility(GONE);
    }

    private void releaseAcross() {
        float width = Math.max(1, getWidth());
        boolean far = Math.abs(acrossTo) > width * TURN_SHARE;
        View here = onControls ? controls : front.column;
        View there = onControls ? front.column : controls;
        float end = far ? (acrossTo < 0 ? -width : width) : 0f;
        here.animate().cancel();
        here.animate().translationX(end).alpha(far ? 0f : 1f).setDuration(150).start();
        there.animate().cancel();
        settling = true;
        there.animate().translationX(far ? 0f : end + (acrossTo < 0 ? width : -width))
                .alpha(far ? 1f : 0f).setDuration(150).withEndAction(() -> {
                    settling = false;
                    if (far) onControls = !onControls;
                    armedAt = 0;
                    acrossTo = 0f;
                    for (View one : new View[]{front.column, back.column, controls, ready}) {
                        one.setTranslationX(0f);
                        one.setTranslationY(0f);
                        one.setAlpha(1f);
                    }
                    draw();
                }).start();
        acrossTo = 0f;
    }

    /** Away from both edges, which is where the system's own gestures begin. */
    private boolean inTheMiddle(float x) {
        return x > getWidth() * EDGE_SHARE && x < getWidth() * (1f - EDGE_SHARE);
    }


    /** What the phone last said, and the moment it said it: the clock is counted from here. */
    public void show(Link.Run next) {
        boolean first = run == null || !live();
        // Every run starts in the unit its programme was written in, whatever the last one was read in.
        if (first) asSpeed = false;
        boolean jumped = first || run == null || !run.status.equals(next.status) || run.cue != next.cue;
        run = next;
        /*
         * The pace as it arrives. Kept for the block while there is one, because the pace is being
         * held for the block and a graph that ran on through a recovery would say the runner had
         * fallen apart. With no programme there is nothing to start afresh at, so it is the run's.
         */
        if (first || (next.hasBlock && next.cue != paceCue)) {
            paceCount = 0;
            paceCue = next.cue;
        }
        if ("r".equals(next.status) && next.pace > 0) {
            paceCount = keep(paces, paceAtSeconds, paceAtMetres, paceCount, next.pace,
                    next.seconds, next.metres);
        }
        if (!heartAvailable && heart > 0) heartAvailable = true;
        correct(next, jumped);
        stamp = SystemClock.elapsedRealtime();
        List<Integer> open = pages();
        if (first && !open.isEmpty()) {
            // The block, or the run's own totals where there is no programme: what a run opens on is
            // where it is being run from, and the pace page is one turn above it rather than in the way.
            page = open.get(Math.min(1, open.size() - 1));
            onControls = false;
        }
        if (!open.isEmpty() && !open.contains(page)) page = open.get(0);
        draw();
    }

    @Override
    protected void onVisibilityChanged(View changed, int visibility) {
        super.onVisibilityChanged(changed, visibility);
        removeCallbacks(tick);
        if (visibility == VISIBLE && isAttachedToWindow() && !ambient) post(tick);
    }

    @Override
    protected void onDetachedFromWindow() {
        removeCallbacks(tick);
        super.onDetachedFromWindow();
    }

    /**
     * A drag moves the page under the finger from the moment it is plainly a drag.
     *
     * Up and down rather than across, because a swipe to the right is how Wear leaves an app and a
     * swipe to the left is the gesture nobody can finish on a round screen; and because the crown
     * turns the same way, so the dial and the finger agree about which way the pages go.
     *
     * Taken here at the touch slop rather than in `onTouchEvent`: a finger landing on the pace or on
     * a button is that child's touch for good, so the only place left to swipe was the gaps between
     * them. A child still gets every tap.
     */
    @Override
    public boolean onInterceptTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = event.getX();
                downY = event.getY();
                dragging = false;
                across = false;
                break;
            case MotionEvent.ACTION_MOVE:
                if (began(event)) return true;
                break;
            default:
        }
        return false;
    }

    /** Whether this touch has become a drag yet, and which of the two directions it went. */
    private boolean began(MotionEvent event) {
        if (dragging) return true;
        float dx = event.getX() - downX;
        float dy = event.getY() - downY;
        if (Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx)) {
            dragging = true;
            across = false;
            return true;
        }
        if (Math.abs(dx) > slop && Math.abs(dx) > Math.abs(dy) && inTheMiddle(downX)) {
            dragging = true;
            across = true;
            return true;
        }
        return false;
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = event.getX();
                downY = event.getY();
                dragging = false;
                across = false;
                break;
            case MotionEvent.ACTION_MOVE:
                if (!began(event)) break;
                // The controls are only ever reached sideways, and the pages only ever up and down.
                if (across) dragAcross(event.getX() - downX);
                else if (!onControls) drag(event.getY() - downY);
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (dragging) {
                    if (across) releaseAcross();
                    else if (!onControls) releaseDrag();
                    dragging = false;
                    across = false;
                    return true;
                }
                break;
            default:
        }
        return gestures.onTouchEvent(event) || super.onTouchEvent(event);
    }

    /** Whether a page is on its way anywhere, by a finger or by the animation that finishes one. */
    private boolean moving() {
        return dragging || settling;
    }

    /** Whether the phone has stopped saying anything, which is not the same as the run stopping. */
    private boolean stale() {
        return live() && SystemClock.elapsedRealtime() - stamp > STALE_MS;
    }

    /** The run's clock in milliseconds, which is the only clock on this screen that moves by itself. */
    private long runMs() {
        if (run == null) return 0;
        if (!"r".equals(run.status)) return runMsAtAnchor;
        return runMsAtAnchor + (SystemClock.elapsedRealtime() - anchorRealtime);
    }

    private int seconds() {
        int now = (int) (runMs() / 1000L);
        if (run != null && "r".equals(run.status)) {
            // Never backwards: a correction of a tenth either way lands on the wrong side of a
            // boundary often enough, and a clock that shows 22 again after 23 reads as broken.
            if (now < shown) now = shown;
            // And never two at once, unless it is plainly a gap rather than a correction: a redraw
            // a little late shows the second it missed first, one an hour late catches up at once.
            if (shown >= 0 && now > shown + 1 && now <= shown + 3) now = shown + 1;
        }
        shown = now;
        return now;
    }

    /** What is left of a timed block, counted down against the same clock rather than its own. */
    private int leftSeconds() {
        if (run == null || leftMsAtAnchor < 0) {
            shownLeft = -1;
            return -1;
        }
        int now = (int) Math.max(0, (leftMsAtAnchor - (runMs() - leftAnchorRunMs)) / 1000L);
        if (shownLeft >= 0 && "r".equals(run.status)) {
            // A countdown only counts down, and only by one: the same rule as the clock, the other way.
            if (now > shownLeft) now = shownLeft;
            if (now < shownLeft - 1 && now >= shownLeft - 3) now = shownLeft - 1;
        }
        shownLeft = now;
        return now;
    }

    /**
     * A frame's figures against the clock already running. Anything worth a fraction of a second is
     * eased into; anything larger is the run having moved, and is taken as it is.
     */
    private void correct(Link.Run next, boolean restarted) {
        long reported = next.seconds * 1000L;
        boolean held = !"r".equals(next.status);
        if (restarted || held || Math.abs(reported - runMs()) > SNAP_MS) {
            runMsAtAnchor = reported;
            anchorRealtime = SystemClock.elapsedRealtime();
            shown = -1;
        } else {
            long drift = reported - runMs();
            runMsAtAnchor += Math.max(-SLEW_MS, Math.min(SLEW_MS, drift));
        }

        long left = next.leftSeconds < 0 ? -1 : next.leftSeconds * 1000L;
        if (left < 0) {
            leftMsAtAnchor = -1;
        } else if (restarted || leftMsAtAnchor < 0 || Math.abs(left - leftSeconds() * 1000L) > SNAP_MS) {
            leftMsAtAnchor = left;
            leftAnchorRunMs = runMs();
            shownLeft = -1;
        } else {
            long drift = left - (leftMsAtAnchor - (runMs() - leftAnchorRunMs));
            leftMsAtAnchor += Math.max(-SLEW_MS, Math.min(SLEW_MS, drift));
        }
    }

    private void draw() {
        if (run == null) return;
        boolean paused = "p".equals(run.status);

        // Both are up while one is being dragged over the other, which is the whole of the gesture.
        front.column.setVisibility(live() && (!onControls || acrossTo != 0) ? VISIBLE : GONE);
        infoDots.setVisibility(live() && !onControls && !ambient && !moving() ? VISIBLE : GONE);
        controls.setVisibility(live() && (onControls || acrossTo != 0) ? VISIBLE : GONE);
        ready.setVisibility(live() ? GONE : VISIBLE);
        // Left alone while a page is on its way in: a frame arrives every second or two, and one
        // landing mid animation would take the panel it is arriving in off the screen.
        if (!moving()) back.column.setVisibility(GONE);

        if (!live()) {
            drawReady();
            ring.set(0f, LINE);
            return;
        }

        if (onControls) drawControls(paused);
        else drawPage(front, page, seconds());
        if (moving() && coming >= 0 && !onControls) drawPage(back, coming, seconds());

        ring.set(ambient || onControls ? 0f : progress(), paused ? MUTED : accent(run.kind));
    }

    private void drawControls(boolean paused) {
        hold.setText(paused ? "Resume" : "Pause");
        finish.setText(SystemClock.elapsedRealtime() - armedAt < ARMED_MS ? "Confirm?" : "Finish");
        awake.setText(keepAwake ? "Screen on" : "Screen off");
        awake.setTextColor(keepAwake ? BRAND : MUTED);
        alwaysOn.setText(ambientWanted ? "Always on" : "Always off");
        alwaysOn.setTextColor(ambientWanted ? (ambientAvailable ? BRAND : OVER) : MUTED);
        ambientNote.setVisibility(ambientWanted && !ambientAvailable ? VISIBLE : GONE);
    }

    /** One page into one panel, whichever of the two panels is being asked for. */
    private void drawPage(Panel p, int which, int elapsed) {
        boolean paused = "p".equals(run.status);
        p.asGraph(which == PAGE_PACE || which == PAGE_HEART);
        if (which == PAGE_NEXT) drawNextPage(p, elapsed);
        else if (which == PAGE_PACE) drawPacePage(p, elapsed);
        else if (which == PAGE_HEART) drawHeartPage(p, elapsed);
        else if (which == PAGE_BLOCK && run.hasBlock) drawBlockPage(p, elapsed);
        else drawRunPage(p, elapsed);

        if (ambient) {
            // Black and white and nothing moving: an OLED lights only what is drawn, and a watch in
            // ambient is a watch asleep. The colours and the furniture come back on the way out.
            p.chip.setBackground(null);
            p.chip.setTextColor(MUTED);
            p.figure.setTextColor(INK);
            p.second.setTextColor(INK);
            infoDots.setVisibility(GONE);
            p.footer.setTextColor(MUTED);
            // Nothing that moves and nothing drawn for the sake of it: the watch is asleep under it.
            p.spark.setVisibility(GONE);
            p.sparkScale.setVisibility(GONE);
        }
        p.headline.setTextColor(paused || ambient ? (ambient ? INK : MUTED) : INK);
        if (stale()) {
            // The figures are the phone's and the phone has gone quiet: said, rather than shown as new.
            p.figure.setTextColor(MUTED);
            p.second.setTextColor(MUTED);
            p.footer.setText("phone is quiet");
        }
        drawDots();
    }

    /**
     * Am I going too fast or too slow, which is the one question a pace answers and the one a figure
     * on its own cannot. The line under it is the last few minutes and the rule across it is what the
     * block asks for: over the rule is slow and under it is quick, and that is readable at a jog.
     *
     * The graph is the block's while there is a programme, because that is what the pace is being
     * held for, and the whole run's when there is not.
     */
    private void drawPacePage(Panel p, int elapsed) {
        p.chip.setVisibility(VISIBLE);
        p.chip.setText(run.hasBlock ? blockLine() : "pace");
        p.chip.setTextColor(run.hasBlock ? accent(run.kind) : MUTED);
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(run.hasBlock ? tint(run.kind) : SURFACE);
        pill.setCornerRadius(px(20));
        p.chip.setBackground(pill);

        p.headline.setText(say(run.pace));
        p.headline.setTextSize(HEADLINE_BIG);
        p.headline.setTextColor(paceInk());
        p.caption.setText("now · " + unit());

        // Neither figure of the pair says anything the headline and the graph do not, and the room
        // they take is the room the line needs: the target is drawn across it rather than beside it.
        p.asGraph(true);
        p.spark.set(paces, paceCount, run.targetPace, true,
                accent(run.hasBlock ? run.kind : "work"), this::say);
        p.alignScale();
        drawScale(p, paceAtSeconds, paceAtMetres, paceCount);
        p.footer.setText(run.targetPace > 0
                ? "target " + say(run.targetPace) + "   " + distance(run.metres)
                : clock(elapsed) + "   " + distance(run.metres));
    }

    /** The one figure of a run measured here rather than on the phone, and where it has been. */
    private void drawHeartPage(Panel p, int elapsed) {
        p.chip.setVisibility(VISIBLE);
        p.chip.setText("heart");
        p.chip.setTextColor(HEART);
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(HEART_TINT);
        pill.setCornerRadius(px(20));
        p.chip.setBackground(pill);

        p.headline.setTextSize(HEADLINE_BIG);
        p.headline.setText(heart > 0 ? String.valueOf(heart) : "--");
        p.headline.setTextColor(INK);
        // Said rather than left blank: a sensor still looking for a pulse is not a sensor that failed.
        p.caption.setText(heart > 0 ? "bpm" : (heartAvailable ? "looking for a pulse" : "no sensor"));

        p.asGraph(true);
        p.spark.set(hearts, heartCount, 0, false, HEART, String::valueOf);
        p.alignScale();
        drawScale(p, heartAtSeconds, heartAtMetres, heartCount);
        p.footer.setText(clock(elapsed) + "   " + distance(run.metres));
    }

    private void drawReady() {
        String plan = "";
        if (run.plannedMetres > 0) plan = distance(run.plannedMetres);
        if (run.plannedSeconds > 0) plan = plan.isEmpty() ? clock(run.plannedSeconds) : plan + "   " + clock(run.plannedSeconds);
        readyPlan.setText(plan.isEmpty() ? "Free run" : plan);
        readyPace.setText(run.plannedPace > 0 ? say(run.plannedPace) + " " + unit() : "no pace planned");
    }

    private void drawBlockPage(Panel p, int elapsed) {
        p.chip.setVisibility(VISIBLE);
        p.chip.setText(blockLine());
        p.chip.setTextColor(accent(run.kind));
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(tint(run.kind));
        pill.setCornerRadius(px(20));
        p.chip.setBackground(pill);

        int left = leftSeconds();
        if (run.leftMetres >= 0) {
            String togo = distance(run.leftMetres);
            p.headline.setText(togo);
            // A kilometre and its three decimals is eight characters, which does not fit across a
            // round screen at the size four of them do.
            p.headline.setTextSize(togo.length() > 5 ? 30f : HEADLINE);
            p.caption.setText("to go");
        } else if (left >= 0) {
            p.headline.setText(clock(left));
            p.headline.setTextSize(HEADLINE);
            p.caption.setText("to go");
        } else {
            p.headline.setText(clock(elapsed));
            p.caption.setText("in this block");
            p.headline.setTextSize(HEADLINE);
        }

        p.figure.setText(say(run.pace));
        p.figure.setTextColor(paceInk());
        p.figureNote.setText("now · " + unit());
        // The target beside it and the same size: it is the figure the other one is judged against.
        p.second.setVisibility(VISIBLE);
        if (run.targetPace > 0) {
            p.second.setText(say(run.targetPace));
            p.second.setTextColor(accent(run.kind));
            p.secondNote.setText("target");
        } else {
            // No target to judge it against, so the run's own distance is the more useful second p.figure.
            p.second.setText(distance(run.metres));
            p.second.setTextColor(INK);
            p.secondNote.setText("distance");
        }
        p.footer.setText(clock(elapsed) + "   " + distance(run.metres));
    }

    private void drawRunPage(Panel p, int elapsed) {
        p.chip.setVisibility(GONE);
        p.headline.setText(clock(elapsed));
        p.headline.setTextSize(HEADLINE);
        p.caption.setText("p".equals(run.status) ? "paused" : "running");
        p.figure.setText(distance(run.metres));
        p.figure.setTextColor(INK);
        p.figureNote.setText("distance");
        p.second.setVisibility(VISIBLE);
        p.second.setText(say(run.averagePace));
        p.second.setTextColor(INK);
        p.secondNote.setText("average · " + unit());
        p.footer.setText(run.hasBlock ? blockLine() : "");
    }

    private void drawNextPage(Panel p, int elapsed) {
        p.chip.setVisibility(VISIBLE);
        p.chip.setText("next");
        p.chip.setTextColor(MUTED);
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(SURFACE);
        pill.setCornerRadius(px(20));
        p.chip.setBackground(pill);

        p.headline.setText(name(run.nextKind));
        p.headline.setTextSize(26f);
        p.caption.setText("comes next");
        p.figure.setText(run.nextPace > 0 ? say(run.nextPace) : "no target");
        p.figure.setTextColor(accent(run.nextKind));
        p.figureNote.setText(run.nextPace > 0 ? "target · " + unit() : "");
        p.second.setVisibility(GONE);
        p.footer.setText(clock(elapsed) + "   " + distance(run.metres));
    }

    private void drawDots() {
        List<Integer> open = pages();
        int at = Math.max(0, open.indexOf(page));
        for (int i = 0; i < infoDots.getChildCount(); i++) {
            View dot = infoDots.getChildAt(i);
            dot.setVisibility(i < open.size() ? VISIBLE : GONE);
            GradientDrawable shape = new GradientDrawable();
            shape.setShape(GradientDrawable.OVAL);
            shape.setColor(i == at ? INK : LINE);
            dot.setBackground(shape);
        }
    }

    /** How much of the block is done, for the ring. Nothing to show where the block is open ended. */
    private float progress() {
        if (run == null || !run.hasBlock) return 0f;
        if (run.goalMetres > 0 && run.leftMetres >= 0) {
            return Math.min(1f, (run.goalMetres - run.leftMetres) / (float) run.goalMetres);
        }
        int left = leftSeconds();
        if (run.goalSeconds > 0 && left >= 0) {
            return Math.min(1f, (run.goalSeconds - left) / (float) run.goalSeconds);
        }
        return 0f;
    }

    private int paceInk() {
        if ("p".equals(run.status)) return MUTED;
        if (run.targetPace <= 0 || run.pace <= 0) return INK;
        // Ten seconds either way of the target is holding it: a pace is never held to the second.
        return run.pace <= run.targetPace + 10 ? GOOD : OVER;
    }

    private String blockLine() {
        String name = run.label.isEmpty() ? name(run.kind) : run.label;
        if (run.repeatOf > 1) return name + " " + run.repeat + "/" + run.repeatOf;
        if (run.blockCount > 1) return name + " " + run.blockIndex + "/" + run.blockCount;
        return name;
    }

    /** The four kinds, in the phone's words. The wire carries the kind, never the sentence. */
    private static String name(String kind) {
        switch (kind) {
            case "warmup":
                return "Warm up";
            case "recovery":
                return "Recovery";
            case "cooldown":
                return "Cool down";
            default:
                return "Work";
        }
    }

    /** The soft steps of src/app.css, so a block is the same colour on the wrist as on the phone. */
    private static int tint(String kind) {
        switch (kind) {
            case "warmup":
                return 0xFF2E2519;
            case "recovery":
                return 0xFF192630;
            case "cooldown":
                return 0xFF241F1A;
            default:
                return 0xFF1B2B21;
        }
    }

    private static int accent(String kind) {
        switch (kind) {
            case "warmup":
                return 0xFFD99B47;
            case "recovery":
                return 0xFF4F9AC9;
            case "cooldown":
                return 0xFFA2988A;
            default:
                return WORK;
        }
    }

    /**
     * A speed in whichever unit the figure is showing. Minutes a kilometre is what a programme is
     * written in, so it is what a run starts in; kilometres an hour is one tap on the figure away.
     */
    private String say(int secondsPerKm) {
        if (secondsPerKm <= 0) return "–:--";
        if (!asSpeed) return clock(secondsPerKm);
        return String.format(java.util.Locale.UK, "%.1f", 3600f / secondsPerKm);
    }

    private String unit() {
        return asSpeed ? "km/h" : "min/km";
    }

    /** Minutes and seconds, and hours only once there are any, as src/lib/domain/running.ts writes it. */
    private static String clock(int seconds) {
        int whole = Math.max(0, seconds);
        int hours = whole / 3600;
        int minutes = (whole % 3600) / 60;
        int rest = whole % 60;
        if (hours > 0) return hours + ":" + two(minutes) + ":" + two(rest);
        return minutes + ":" + two(rest);
    }

    private static String two(int value) {
        return value < 10 ? "0" + value : String.valueOf(value);
    }

    /**
     * A distance as src/lib/domain/running.ts writes one: metres under a kilometre, and kilometres
     * to the metre above it. Three decimals rather than two because most of what a wrist is shown is
     * a part of a run rather than a run, and ten metres is a few strides.
     */
    private static String distance(int metres) {
        if (metres < 1000) return metres + "m";
        return String.format(java.util.Locale.UK, "%.3f km", metres / 1000f);
    }

    private int px(int dp) {
        return Math.round(dp * density);
    }


    /**
     * One page's worth of furniture: the chip, the figures and the line under them.
     *
     * There are two of these rather than one. A drag has to show the page it is bringing in as it
     * arrives, which means both pages have to be on the screen at once, and a single column filled
     * from whichever page is showing cannot be in two states at the same time.
     */
    private final class Panel {
        final LinearLayout column;
        final TextView chip;
        final TextView headline;
        final TextView caption;
        final TextView figure;
        final TextView figureNote;
        final TextView second;
        final TextView secondNote;
        final LinearLayout pair;
        final Spark spark;
        final LinearLayout sparkScale;
        final TextView scaleFrom;
        final TextView scaleMid;
        final TextView scaleTo;
        final TextView footer;

        Panel(Context context) {
            column = column(context);
            chip = new TextView(context);
            chip.setGravity(Gravity.CENTER);
            chip.setTextSize(12f);
            chip.setTypeface(Typeface.DEFAULT_BOLD);
            chip.setMaxLines(1);
            chip.setPadding(px(11), px(5), px(11), px(6));
            LinearLayout.LayoutParams chipSize = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            chipSize.gravity = Gravity.CENTER_HORIZONTAL;
            column.addView(chip, chipSize);

            headline = new TextView(context);
            headline.setGravity(Gravity.CENTER);
            headline.setTextColor(INK);
            headline.setTextSize(40f);
            headline.setTypeface(Typeface.DEFAULT_BOLD);
            headline.setIncludeFontPadding(false);
            headline.setMaxLines(1);
            LinearLayout.LayoutParams headlineSize = wide();
            headlineSize.topMargin = px(4);
            column.addView(headline, headlineSize);

            caption = new TextView(context);
            caption.setGravity(Gravity.CENTER);
            caption.setTextColor(MUTED);
            caption.setTextSize(10f);
            caption.setMaxLines(1);
            column.addView(caption, wide());

            // Two figures side by side, because a pace means nothing without the one it is aimed at.
            pair = new LinearLayout(context);
            pair.setOrientation(LinearLayout.HORIZONTAL);

            figure = new TextView(context);
            figureNote = new TextView(context);
            second = new TextView(context);
            secondNote = new TextView(context);
            pair.addView(cell(context, figure, figureNote), half());
            pair.addView(cell(context, second, secondNote), half());

            // Either figure swaps the unit: whichever one is under the thumb is the one being read.
            for (TextView value : new TextView[]{figure, second}) {
                value.setClickable(true);
                value.setOnClickListener(view -> {
                    buzz();
                    asSpeed = !asSpeed;
                    draw();
                });
            }

            LinearLayout.LayoutParams pairSize = wide();
            pairSize.topMargin = px(10);
            column.addView(pair, pairSize);

            // The shape of the last few minutes, on the two pages that are asked a question rather
            // than read for a figure: am I holding the pace, and is the heart settling or climbing.
            spark = new Spark(context);
            // A fifth of the glass rather than a fixed height: the figures above it are in sp and
            // do not shrink with the watch, so a graph that did not would push the line under it off
            // the bottom of a smaller screen.
            int tall = Math.round(context.getResources().getDisplayMetrics().heightPixels * 0.2f);
            LinearLayout.LayoutParams sparkSize =
                    new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, tall);
            sparkSize.topMargin = px(4);
            spark.setVisibility(GONE);
            column.addView(spark, sparkSize);

            /*
             * The ground under the line, in three marks rather than one sentence: where the line
             * starts, the middle of it and now. A graph that only says how long it is leaves the
             * runner counting squares to place the dip they are looking at.
             *
             * Counted back from now rather than given as the run's own clock: what is being asked
             * is how long ago something happened, and a figure that has to be subtracted from
             * another one first is a figure nobody reads mid run.
             */
            sparkScale = new LinearLayout(context);
            sparkScale.setOrientation(LinearLayout.HORIZONTAL);
            scaleFrom = scaleMark(context, Gravity.START);
            scaleMid = scaleMark(context, Gravity.CENTER);
            scaleTo = scaleMark(context, Gravity.END);
            sparkScale.addView(scaleFrom, half());
            sparkScale.addView(scaleMid, half());
            sparkScale.addView(scaleTo, half());
            sparkScale.setVisibility(GONE);
            sparkScale.setClickable(true);
            sparkScale.setOnClickListener(view -> {
                buzz();
                graphAsDistance = !graphAsDistance;
                draw();
            });
            spark.setClickable(true);
            spark.setOnClickListener(view -> {
                buzz();
                graphAsDistance = !graphAsDistance;
                draw();
            });
            LinearLayout.LayoutParams scaleSize = wide();
            scaleSize.topMargin = px(1);
            column.addView(sparkScale, scaleSize);

            footer = new TextView(context);
            footer.setGravity(Gravity.CENTER);
            footer.setTextColor(MUTED);
            footer.setTextSize(11f);
            footer.setMaxLines(1);
            LinearLayout.LayoutParams footerSize = wide();
            footerSize.topMargin = px(6);
            column.addView(footer, footerSize);
        }

        /**
         * A page with a graph on it, or one without.
         *
         * The graph wants the middle of the glass, which is the widest part of a round screen and
         * the only band a line is worth drawing across. So the figures above it close up and the
         * grey line under it drops away towards the bottom edge, where there is room nothing else
         * was using.
         */
        /**
         * The scale lined up with the line rather than with the box. The figures down the left of
         * the graph hold that much of its width, and a scale that started before them would be
         * under nothing. Called after the series is set, because that is when its widest figure,
         * and so how far in the line begins, is known.
         */
        void alignScale() {
            sparkScale.setPadding(spark.inset(), 0, 0, 0);
        }

        void asGraph(boolean on) {
            spark.setVisibility(on ? VISIBLE : GONE);
            sparkScale.setVisibility(on ? VISIBLE : GONE);
            pair.setVisibility(on ? GONE : VISIBLE);
            ((LinearLayout.LayoutParams) headline.getLayoutParams()).topMargin = px(on ? 0 : 4);
            ((LinearLayout.LayoutParams) footer.getLayoutParams()).topMargin = px(on ? 12 : 6);
            column.requestLayout();
        }
    }


    /**
     * A few minutes of one figure, drawn as a line.
     *
     * No axes and no numbers: the figures are above it and what this adds is the shape, which is the
     * whole of what a runner mid interval wants to know. Is it flat, is it drifting, did the hill
     * end. A target, where there is one, is a line across it: above the line is too slow and below
     * it is too fast, and which side of a line something is on can be read at a glance and a jog.
     */
    private static final class Spark extends View {

        /** How a value of this series is written, which only the page showing it knows. */
        interface Label {
            String of(int value);
        }

        private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint rule = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint aimed = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private final float density;
        private int[] values = new int[0];
        private int count = 0;
        private int target = 0;
        /** Pace is upside down: a smaller number is a faster runner, so it belongs higher up. */
        private boolean inverted = false;
        /** The two rules and what they are worth, worked out when the series is set rather than drawn. */
        private int low = 0;
        private int high = 0;
        private float min = 0f;
        private float span = 0f;
        private String lowSaid = "";
        private String highSaid = "";
        /** Where the line starts, which is past the widest figure down the left of it. */
        private float inset = 0f;

        Spark(Context context) {
            super(context);
            density = context.getResources().getDisplayMetrics().density;
            line.setStyle(Paint.Style.STROKE);
            line.setStrokeWidth(2.4f * density);
            line.setStrokeCap(Paint.Cap.ROUND);
            line.setStrokeJoin(Paint.Join.ROUND);
            line.setColor(INK);
            // Dotted rather than solid: a grid has to be behind the line, not competing with it.
            rule.setStyle(Paint.Style.STROKE);
            rule.setStrokeWidth(1f * density);
            rule.setColor(LINE);
            rule.setPathEffect(new DashPathEffect(new float[]{2f * density, 3f * density}, 0));
            // The target in green, which is the colour work already wears: the line to be on.
            aimed.setStyle(Paint.Style.STROKE);
            aimed.setStrokeWidth(1.4f * density);
            aimed.setColor(GOOD);
            ink.setColor(INK);
            ink.setTextSize(9f * density);
            ink.setTypeface(Typeface.DEFAULT_BOLD);
        }

        /** The series, the line it is judged against, which way up it goes, and how to write a value. */
        void set(int[] next, int howMany, int aim, boolean upsideDown, int colour, Label how) {
            values = next;
            count = howMany;
            target = aim;
            inverted = upsideDown;
            line.setColor(colour);

            low = Integer.MAX_VALUE;
            high = Integer.MIN_VALUE;
            for (int i = 0; i < count; i++) {
                low = Math.min(low, values[i]);
                high = Math.max(high, values[i]);
            }
            // The target belongs inside the picture, or a line drawn off the top says nothing.
            if (target > 0 && count > 0) {
                low = Math.min(low, target);
                high = Math.max(high, target);
            }
            if (count < 2) {
                inset = 0f;
                span = 0f;
                invalidate();
                return;
            }
            float pad = Math.max(1f, (high - low) * 0.15f);
            min = low - pad;
            span = (high + pad) - min;
            lowSaid = how.of(low);
            highSaid = high == low ? "" : how.of(high);
            // The figures own the left of the box and the line starts after them, because a line
            // drawn through digits is neither a line nor a figure.
            inset = Math.max(ink.measureText(lowSaid), ink.measureText(highSaid)) + 4f * density;
            invalidate();
        }

        /** How far in the line begins, so a scale drawn under it starts where the line does. */
        int inset() {
            return Math.round(inset);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            if (count < 2 || span <= 0) return;
            float width = getWidth();
            float height = getHeight();

            /*
             * The two ends of what the line actually covered, each with its figure against it. Two
             * rather than an even scale: what a runner wants off a graph this size is how far the
             * worst of it went, and a grid of round numbers can miss both ends of a narrow range.
             */
            drawRule(canvas, low, lowSaid, width, height);
            if (!highSaid.isEmpty()) drawRule(canvas, high, highSaid, width, height);
            if (target > 0) {
                float y = place(target, height);
                canvas.drawLine(inset, y, width, y, aimed);
            }

            path.reset();
            for (int i = 0; i < count; i++) {
                float x = inset + (i / (float) (count - 1)) * (width - inset);
                float y = place(values[i], height);
                if (i == 0) path.moveTo(x, y);
                else path.lineTo(x, y);
            }
            canvas.drawPath(path, line);
        }

        /** One horizontal line across the graph, with what it is worth written at the left of it. */
        private void drawRule(Canvas canvas, int value, String said, float width, float height) {
            float y = place(value, height);
            path.reset();
            path.moveTo(inset, y);
            path.lineTo(width, y);
            canvas.drawPath(path, rule);
            // Nudged off the line so the digits sit beside it rather than on it, and kept on screen
            // at both ends: a figure at the very top of the box would be drawn half outside it.
            float baseline = Math.min(height, Math.max(ink.getTextSize() * 0.8f, y + ink.getTextSize() * 0.36f));
            canvas.drawText(said, 0, baseline, ink);
        }

        private float place(float value, float height) {
            float share = (value - min) / span;
            return inverted ? share * height : height - share * height;
        }
    }

    /**
     * The block's progress, drawn as an arc around the glass. A round screen has a ring of space
     * nothing else can use, and a bar across the middle would take room from the figures.
     */
    private static final class Ring extends View {
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint done = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF bounds = new RectF();
        private float share = 0f;

        Ring(Context context) {
            super(context);
            float density = context.getResources().getDisplayMetrics().density;
            float width = 5f * density;
            track.setStyle(Paint.Style.STROKE);
            track.setStrokeWidth(width);
            track.setColor(LINE);
            done.setStyle(Paint.Style.STROKE);
            done.setStrokeWidth(width);
            done.setStrokeCap(Paint.Cap.ROUND);
            done.setColor(BRAND);
        }

        void set(float next, int colour) {
            share = Math.max(0f, Math.min(1f, next));
            done.setColor(colour);
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float inset = done.getStrokeWidth();
            bounds.set(inset, inset, getWidth() - inset, getHeight() - inset);
            canvas.drawArc(bounds, 0, 360, false, track);
            // From the top, clockwise, because that is where every dial anybody owns starts.
            if (share > 0) canvas.drawArc(bounds, -90, share * 360f, false, done);
        }
    }
}
