package com.appchery.watch;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
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

    private static final int PAGE_BLOCK = 0;
    private static final int PAGE_RUN = 1;
    private static final int PAGE_NEXT = 2;
    /**
     * How much of each side belongs to the system. Wear dismisses an app on a swipe that starts at
     * an edge, so anything beginning there is left well alone; what is left is the middle, and in
     * the middle a sideways drag either way is the controls. Either way, because which of the two
     * the system takes is the watch's business and not something to guess at from here.
     */
    private static final float EDGE_SHARE = 0.2f;

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

    private final LinearLayout info;
    private final TextView chip;
    private final TextView headline;
    private final TextView caption;
    private final TextView figure;
    private final TextView figureNote;
    private final TextView second;
    private final TextView secondNote;
    private final LinearLayout pair;
    private final TextView footer;
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
    /** Minutes a kilometre unless this run has been told otherwise, and told afresh on every run. */
    private boolean asSpeed = false;

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

        info = column(context);
        chip = new TextView(context);
        chip.setGravity(Gravity.CENTER);
        chip.setTextSize(11f);
        chip.setTypeface(Typeface.DEFAULT_BOLD);
        chip.setMaxLines(1);
        chip.setPadding(px(9), px(3), px(9), px(4));
        LinearLayout.LayoutParams chipSize = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        chipSize.gravity = Gravity.CENTER_HORIZONTAL;
        info.addView(chip, chipSize);

        headline = new TextView(context);
        headline.setGravity(Gravity.CENTER);
        headline.setTextColor(INK);
        headline.setTextSize(40f);
        headline.setTypeface(Typeface.DEFAULT_BOLD);
        headline.setIncludeFontPadding(false);
        headline.setMaxLines(1);
        LinearLayout.LayoutParams headlineSize = wide();
        headlineSize.topMargin = px(4);
        info.addView(headline, headlineSize);

        caption = new TextView(context);
        caption.setGravity(Gravity.CENTER);
        caption.setTextColor(MUTED);
        caption.setTextSize(10f);
        caption.setMaxLines(1);
        info.addView(caption, wide());

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
        info.addView(pair, pairSize);

        footer = new TextView(context);
        footer.setGravity(Gravity.CENTER);
        footer.setTextColor(MUTED);
        footer.setTextSize(11f);
        footer.setMaxLines(1);
        LinearLayout.LayoutParams footerSize = wide();
        footerSize.topMargin = px(6);
        info.addView(footer, footerSize);


        addView(info);

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
        for (int i = 0; i < 4; i++) {
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
        if (run != null && run.hasBlock) open.add(PAGE_BLOCK);
        open.add(PAGE_RUN);
        if (run != null && !run.nextKind.isEmpty()) open.add(PAGE_NEXT);
        return open;
    }

    /** Into the controls and back out, by the one gesture that is neither the crown nor the way out. */
    private void toggleControls() {
        if (!live()) return;
        onControls = !onControls;
        armedAt = 0;
        slideAcross();
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
        List<Integer> open = pages();
        if (open.isEmpty()) return;
        int at = Math.max(0, open.indexOf(page));
        int next = open.get(((at + by) % open.size() + open.size()) % open.size());
        if (next == page) return;
        page = next;
        // Leaving the controls forgets that a finish was asked for, which is what a change of mind is.
        armedAt = 0;
        slide(by);
    }

    /**
     * The page slides out the way it was pushed and the next one comes in behind it. Short enough
     * that it never delays the figures: what it buys is knowing which way the pages lie, which a
     * screen that simply swaps its contents cannot say.
     */
    private void slide(int by) {
        View leaving = visiblePage();
        float travel = getHeight() * 0.22f * by;
        if (leaving != null) {
            leaving.animate().cancel();
            leaving.animate().translationY(-travel).alpha(0f).setDuration(110).withEndAction(() -> {
                // Every page put back where it belongs first: one left dimmed and shifted would come
                // back invisible the next time it was shown.
                for (View one : new View[]{info, controls, ready}) {
                    one.setTranslationX(0f);
                    one.setTranslationY(0f);
                    one.setAlpha(1f);
                }
                draw();
                View arriving = visiblePage();
                if (arriving == null) return;
                arriving.setTranslationY(travel);
                arriving.setAlpha(0f);
                arriving.animate().cancel();
                arriving.animate().translationY(0f).alpha(1f).setDuration(170).start();
            }).start();
            return;
        }
        draw();
    }

    /**
     * The one gesture that is neither the crown nor the way out, animated so it reads as a place.
     *
     * Always the same way: out to the left, in from the right. The controls lie to the right of the
     * figures and are reached by the swipe the watch leaves to the app, and the way back is that
     * same swipe again rather than its mirror, because the mirror of it is how Wear closes an app.
     * An animation that ran backwards would be showing a gesture nobody can make.
     */
    private void slideAcross() {
        View leaving = visiblePage();
        float travel = getWidth() * -0.25f;
        if (leaving == null) {
            draw();
            return;
        }
        leaving.animate().cancel();
        leaving.animate().translationX(travel).alpha(0f).setDuration(110).withEndAction(() -> {
            for (View one : new View[]{info, controls, ready}) {
                one.setTranslationX(0f);
                one.setTranslationY(0f);
                one.setAlpha(1f);
            }
            draw();
            View arriving = visiblePage();
            if (arriving == null) return;
            arriving.setTranslationX(-travel);
            arriving.setAlpha(0f);
            arriving.animate().cancel();
            arriving.animate().translationX(0f).alpha(1f).setDuration(170).start();
        }).start();
    }

    /** Away from both edges, which is where the system's own gestures begin. */
    private boolean inTheMiddle(float x) {
        return x > getWidth() * EDGE_SHARE && x < getWidth() * (1f - EDGE_SHARE);
    }

    private View visiblePage() {
        if (info.getVisibility() == VISIBLE) return info;
        if (controls.getVisibility() == VISIBLE) return controls;
        if (ready.getVisibility() == VISIBLE) return ready;
        return null;
    }

    /** What the phone last said, and the moment it said it: the clock is counted from here. */
    public void show(Link.Run next) {
        boolean first = run == null || !live();
        // Every run starts in the unit its programme was written in, whatever the last one was read in.
        if (first) asSpeed = false;
        boolean jumped = first || run == null || !run.status.equals(next.status) || run.cue != next.cue;
        run = next;
        correct(next, jumped);
        stamp = SystemClock.elapsedRealtime();
        List<Integer> open = pages();
        if (first && !open.isEmpty()) {
            page = open.get(0);
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
     * A drag becomes a page turn as soon as it is plainly up or down, wherever it started.
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
                break;
            case MotionEvent.ACTION_MOVE:
                float dx = event.getX() - downX;
                float dy = event.getY() - downY;
                if (Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx)) {
                    dragging = true;
                    return true;
                }
                if (Math.abs(dx) > slop && Math.abs(dx) > Math.abs(dy) && inTheMiddle(downX)) {
                    dragging = true;
                    return true;
                }
                break;
            default:
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
                break;
            case MotionEvent.ACTION_MOVE:
                if (!dragging) {
                    float movedY = event.getY() - downY;
                    float movedX = event.getX() - downX;
                    dragging = (Math.abs(movedY) > slop && Math.abs(movedY) > Math.abs(movedX))
                            || (Math.abs(movedX) > slop && Math.abs(movedX) > Math.abs(movedY) && inTheMiddle(downX));
                }
                break;
            case MotionEvent.ACTION_UP:
                if (dragging) {
                    float upY = event.getY() - downY;
                    float upX = event.getX() - downX;
                    // A turn on release rather than on a fling: a slow drag is a swipe too, and a
                    // flick fast enough to satisfy a fling detector is not what a cold hand makes.
                    if (Math.abs(upY) > slop && Math.abs(upY) >= Math.abs(upX)) turn(upY < 0 ? 1 : -1);
                    else if (Math.abs(upX) > slop) toggleControls();
                    dragging = false;
                    return true;
                }
                break;
            default:
        }
        return gestures.onTouchEvent(event) || super.onTouchEvent(event);
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
        int elapsed = seconds();

        info.setVisibility(live() && !onControls ? VISIBLE : GONE);
        infoDots.setVisibility(live() && !onControls && !ambient ? VISIBLE : GONE);
        controls.setVisibility(live() && onControls ? VISIBLE : GONE);
        ready.setVisibility(live() ? GONE : VISIBLE);

        if (!live()) {
            drawReady();
            ring.set(0f, LINE);
            return;
        }

        if (onControls) {
            hold.setText(paused ? "Resume" : "Pause");
            finish.setText(SystemClock.elapsedRealtime() - armedAt < ARMED_MS ? "Confirm?" : "Finish");
            awake.setText(keepAwake ? "Screen on" : "Screen off");
            awake.setTextColor(keepAwake ? BRAND : MUTED);
            alwaysOn.setText(ambientWanted ? "Always on" : "Always off");
            alwaysOn.setTextColor(ambientWanted ? (ambientAvailable ? BRAND : OVER) : MUTED);
            ambientNote.setVisibility(ambientWanted && !ambientAvailable ? VISIBLE : GONE);
        } else if (page == PAGE_NEXT) {
            drawNextPage(elapsed);
        } else if (page == PAGE_BLOCK && run.hasBlock) {
            drawBlockPage(elapsed);
        } else {
            drawRunPage(elapsed);
        }

        if (ambient) {
            // Black and white and nothing moving: an OLED lights only what is drawn, and a watch in
            // ambient is a watch asleep. The colours and the furniture come back on the way out.
            chip.setBackground(null);
            chip.setTextColor(MUTED);
            figure.setTextColor(INK);
            second.setTextColor(INK);
            infoDots.setVisibility(GONE);
            footer.setTextColor(MUTED);
        }
        headline.setTextColor(paused || ambient ? (ambient ? INK : MUTED) : INK);
        if (stale()) {
            // The figures are the phone's and the phone has gone quiet: said, rather than shown as new.
            figure.setTextColor(MUTED);
            second.setTextColor(MUTED);
            footer.setText("phone is quiet");
        }
        drawDots();
        ring.set(ambient ? 0f : progress(), paused ? MUTED : accent(run.kind));
    }

    private void drawReady() {
        String plan = "";
        if (run.plannedMetres > 0) plan = distance(run.plannedMetres);
        if (run.plannedSeconds > 0) plan = plan.isEmpty() ? clock(run.plannedSeconds) : plan + "   " + clock(run.plannedSeconds);
        readyPlan.setText(plan.isEmpty() ? "Free run" : plan);
        readyPace.setText(run.plannedPace > 0 ? say(run.plannedPace) + " " + unit() : "no pace planned");
    }

    private void drawBlockPage(int elapsed) {
        chip.setVisibility(VISIBLE);
        chip.setText(blockLine());
        chip.setTextColor(accent(run.kind));
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(tint(run.kind));
        pill.setCornerRadius(px(20));
        chip.setBackground(pill);

        int left = leftSeconds();
        if (run.leftMetres >= 0) {
            headline.setText(String.valueOf(run.leftMetres));
            caption.setText("metres to go");
        } else if (left >= 0) {
            headline.setText(clock(left));
            caption.setText("to go");
        } else {
            headline.setText(clock(elapsed));
            caption.setText("in this block");
        }
        headline.setTextSize(40f);

        figure.setText(say(run.pace));
        figure.setTextColor(paceInk());
        figureNote.setText("now · " + unit());
        // The target beside it and the same size: it is the figure the other one is judged against.
        second.setVisibility(VISIBLE);
        if (run.targetPace > 0) {
            second.setText(say(run.targetPace));
            second.setTextColor(accent(run.kind));
            secondNote.setText("target");
        } else {
            // No target to judge it against, so the run's own distance is the more useful second figure.
            second.setText(distance(run.metres));
            second.setTextColor(INK);
            secondNote.setText("distance");
        }
        footer.setText(clock(elapsed) + "   " + distance(run.metres));
    }

    private void drawRunPage(int elapsed) {
        chip.setVisibility(GONE);
        headline.setText(clock(elapsed));
        headline.setTextSize(40f);
        caption.setText("p".equals(run.status) ? "paused" : "running");
        figure.setText(distance(run.metres));
        figure.setTextColor(INK);
        figureNote.setText("distance");
        second.setVisibility(VISIBLE);
        second.setText(say(run.averagePace));
        second.setTextColor(INK);
        secondNote.setText("average · " + unit());
        footer.setText(run.hasBlock ? blockLine() : "");
    }

    private void drawNextPage(int elapsed) {
        chip.setVisibility(VISIBLE);
        chip.setText("next");
        chip.setTextColor(MUTED);
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(SURFACE);
        pill.setCornerRadius(px(20));
        chip.setBackground(pill);

        headline.setText(name(run.nextKind));
        headline.setTextSize(26f);
        caption.setText("comes next");
        figure.setText(run.nextPace > 0 ? say(run.nextPace) : "no target");
        figure.setTextColor(accent(run.nextKind));
        figureNote.setText(run.nextPace > 0 ? "target · " + unit() : "");
        second.setVisibility(GONE);
        footer.setText(clock(elapsed) + "   " + distance(run.metres));
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

    private static String distance(int metres) {
        return String.format(java.util.Locale.UK, "%.2f km", metres / 1000f);
    }

    private int px(int dp) {
        return Math.round(dp * density);
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
