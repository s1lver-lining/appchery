package com.appchery.watch;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.window.OnBackInvokedDispatcher;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Scoring on the wrist. The watch is an input surface and a mirror: it holds the labels the archer
 * tapped and shows what the phone says, and it never decides what an arrow is worth. Every end is
 * sent whole, so an edit, an undo and an added arrow are the same message.
 */
public class KeypadActivity extends androidx.activity.ComponentActivity
        implements Link.Listener, SessionView.Listener, RunView.Listener {

    // The WA face palette, taken from src/lib/domain/rounds/seed.ts so the wrist matches the phone.
    private static final int GOLD = 0xFFFFCF3F;
    private static final int RED = 0xFFE8453C;
    private static final int BLUE = 0xFF3AA0D8;
    private static final int BLACK = 0xFF23282C;
    private static final int WHITE = 0xFFF4F1EA;
    private static final int MISS = 0xFF888888;
    private static final int NEUTRAL = 0xFF2B2F34;
    private static final int DIM = 0xFF8A9199;

    private static final String BACK = "⌫";
    private static final String TOTAL = "total";

    /** Until a round arrives: a WA face, twelve values descending. */
    private static final List<String> WA = Arrays.asList(
            "X", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "M");

    /**
     * All in pixels, because the constraint is the screen's circle rather than any density: a strip
     * of pills has to start far enough down that the chord is wide enough to hold it, and its top
     * edge is what decides, being the narrowest part. At y=0 the usable width is zero.
     */
    private static final int STRIP_TOP_PX = 38;
    private static final int STRIP_HEIGHT_PX = 34;
    private static final int HEADER_PX = STRIP_TOP_PX + STRIP_HEIGHT_PX + 4;

    private int arrowsPerEnd = 6;
    private int ends = 6;
    private List<String> keys = WA;
    private Map<String, Integer> values = waValues();

    /** One slot per arrow in the round, null where nothing has been shot. */
    private String[] shots = new String[36];
    /** Ends the phone has been told about, which must keep being told even once incomplete. */
    private final Set<Integer> asserted = new HashSet<>();

    private TextView[] endPills;
    private TextView[][] sheetPills;
    private View[] sheetLines;
    private TextView[] sheetEndNumbers;
    private TextView[] sheetSubtotals;
    private TextView[] sheetRunning;
    private TextView totalCell;
    private TextView sheetTotal;
    private TextView sheetStatus;
    private TextView editLabel;
    private ScrollView sheetScroll;
    private View sheetContent;
    /** Set when the sheet should show its newest end, applied once it has a height to measure. */
    private boolean wantSheetBottom = false;
    private View editOverlay;
    private int editing = -1;

    private DrawerRoot root;
    private FrameLayout shell;
    private SessionView sessionView;
    private StatusView statusView;
    private RunView runView;
    /**
     * The screen the phone last named, kept apart from the one on show: a run takes the screen for
     * as long as it lasts and gives it back to whatever the phone was mirroring behind it.
     */
    private String mirrored = "idle";
    /** The block change last felt, so a frame redrawn is not a block changed. */
    /** Asked for on the way into a run, so it answers on its own rather than with the link's. */
    private static final int HEART_PERMISSION = 2;
    private int lastCue = -1;
    private boolean running = false;
    /** The sensor against the skin, on only while a run is: a light held on all day is a flat watch. */
    private Heart heart;
    private boolean keepAwake = false;
    private boolean ambientWanted = false;
    private boolean inAmbient = false;
    private androidx.wear.ambient.AmbientLifecycleObserver ambient;
    private PendingIntent ambientTick;
    private String screen = "idle";
    private Vibrator vibrator;
    private Link link;
    private float rotary = 0;
    private float density;
    private String linkNote = "Starting";
    private int linkKind = Link.WAITING;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        vibrator = getSystemService(Vibrator.class);
        density = getResources().getDisplayMetrics().density;
        buildShell();
        redraw();
        listenForBack();

        registerReceiver(ambientTicker, new IntentFilter(AMBIENT_ACTION), RECEIVER_NOT_EXPORTED);
        if (ambientWanted) attachAmbient();

        link = new Link(this, this);
        String[] needed = {Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT};
        boolean granted = true;
        for (String permission : needed) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) granted = false;
        }
        if (granted) startLink();
        else requestPermissions(needed, 1);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        // The heart rate is asked for on its own and refusing it costs a figure, never the run.
        if (code == HEART_PERMISSION) {
            if (running) heart.start(this);
            runView.setHeartAvailable(heart.available(this));
            return;
        }
        for (int result : results) {
            if (result != PackageManager.PERMISSION_GRANTED) {
                onLinkState(Link.FAULT, "Bluetooth permission refused");
                return;
            }
        }
        startLink();
    }

    /**
     * The link and the service that keeps it: without the service the process is stopped the moment
     * the app leaves the screen, and a stopped process is one Android may kill, which takes the GATT
     * server with it and costs the archer a chooser mid round.
     */
    private void startLink() {
        LinkService.keepAlive(this);
        link.start();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // The sensor goes with the screen that was reading it: a light left on is a flat watch.
        if (heart != null) heart.stop();
        cancelAmbientTick();
        try {
            unregisterReceiver(ambientTicker);
        } catch (IllegalArgumentException never) {
            // Registered in onCreate, so this is the double destroy that cannot happen.
        }
        if (link != null) link.stop();
        LinkService.release(this);
    }

    // -------- the whole screen, rebuilt whenever the round changes shape

    private void buildShell() {
        shell = new FrameLayout(this);
        shell.setBackgroundColor(Color.BLACK);

        statusView = new StatusView(this);
        shell.addView(statusView);

        sessionView = new SessionView(this, this);
        shell.addView(sessionView);

        heart = new Heart(this, bpm -> {
            if (link != null) link.heart(bpm);
            if (runView != null) runView.setHeart(bpm);
        });
        runView = new RunView(this, this);
        keepAwake = getSharedPreferences("watch", MODE_PRIVATE).getBoolean("keep-awake", false);
        ambientWanted = getSharedPreferences("watch", MODE_PRIVATE).getBoolean("ambient", false);
        runView.setKeepAwake(keepAwake);
        runView.setAmbientWanted(ambientWanted);
        runView.setAmbientAvailable(systemAmbient());
        runView.setVisibility(View.GONE);
        shell.addView(runView);

        shell.addView(buildScoring());

        // Focus lives here, so a rotary event always reaches the hierarchy whatever screen is up.
        shell.setFocusableInTouchMode(true);
        setContentView(shell);
        shell.requestFocus();
        showScreen(screen);
    }

    /** Only the scoring view is rebuilt when a round of another shape arrives. */
    private void rebuildScoring() {
        if (root != null) shell.removeView(root);
        shell.addView(buildScoring());
        showScreen(screen);
        redraw();
    }

    private void showScreen(String next) {
        screen = next;
        if (!"run".equals(next)) mirrored = next;
        boolean onRun = "run".equals(next);
        statusView.setVisibility("idle".equals(next) ? View.VISIBLE : View.GONE);
        sessionView.setVisibility("session".equals(next) ? View.VISIBLE : View.GONE);
        if (runView != null) runView.setVisibility(onRun ? View.VISIBLE : View.GONE);
        if (root != null) root.setVisibility("score".equals(next) ? View.VISIBLE : View.GONE);
        statusView.setState(linkKind, linkNote);
        applyKeepAwake(onRun && keepAwake);
    }

    private DrawerRoot buildScoring() {
        root = new DrawerRoot(this);
        root.setBackgroundColor(Color.BLACK);
        root.addView(buildKeypad());
        View sheet = buildSheet();
        root.addView(sheet);
        root.attachDrawer(sheet, sheetScroll);
        root.setOnSettled(() -> {
            buzz(12);
            // Opened on the newest end rather than the first, so the way out is one drag away.
            if (root.isOpen()) {
                wantSheetBottom = true;
                sheetScroll.post(this::applySheetScroll);
            }
        });

        editOverlay = buildEditor();
        editOverlay.setVisibility(View.GONE);
        root.addView(editOverlay);
        root.setRotary(this::onCrown);
        return root;
    }

    private View buildKeypad() {
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.addView(buildEndStrip(), new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, HEADER_PX));

        RoundGrid grid = new RoundGrid(this);
        grid.setCircleTop(HEADER_PX);
        // The score set decides how many keys there are, so the rows are worked out rather than set.
        grid.setRowKeys(RoundGrid.distribute(keys.size() + 2));
        for (String label : cells()) grid.addView(cell(label));
        column.addView(grid, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        return column;
    }

    private List<String> cells() {
        List<String> all = new ArrayList<>(keys);
        all.add(TOTAL);
        all.add(BACK);
        return all;
    }

    /** The end so far, one pill per arrow in the colour of the ring it landed in. */
    private View buildEndStrip() {
        LinearLayout strip = new LinearLayout(this);
        strip.setOrientation(LinearLayout.HORIZONTAL);
        int inset = horizontalInset(STRIP_TOP_PX);
        strip.setPadding(inset, STRIP_TOP_PX, inset, 0);

        endPills = new TextView[arrowsPerEnd];
        for (int i = 0; i < arrowsPerEnd; i++) {
            TextView pill = new TextView(this);
            pill.setGravity(Gravity.CENTER);
            pill.setTextSize(11f);
            pill.setTypeface(Typeface.DEFAULT_BOLD);
            pill.setIncludeFontPadding(false);
            endPills[i] = pill;
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, STRIP_HEIGHT_PX, 1f);
            lp.setMargins(1, 0, 1, 0);
            strip.addView(pill, lp);
        }
        return strip;
    }

    /** How far in a full width row has to start to stay inside the circle at the given height. */
    private int horizontalInset(int topPx) {
        int diameter = getResources().getDisplayMetrics().widthPixels;
        double radius = diameter / 2.0;
        double half = Math.sqrt(Math.max(0, radius * radius - Math.pow(radius - topPx, 2)));
        return (int) Math.round(radius - half);
    }

    private static Map<String, Integer> waValues() {
        Map<String, Integer> map = new HashMap<>();
        map.put("X", 10);
        map.put("M", 0);
        for (int n = 1; n <= 10; n++) map.put(String.valueOf(n), n);
        return map;
    }

    /**
     * The WA face's own colours, by label. A round on another face sends labels this does not know,
     * and those keys stay neutral rather than being given a colour they do not have on paper.
     */
    private static int face(String label) {
        switch (label) {
            case "X":
            case "10":
            case "9":
                return GOLD;
            case "8":
            case "7":
                return RED;
            case "6":
            case "5":
                return BLUE;
            case "4":
            case "3":
                return BLACK;
            case "2":
            case "1":
                return WHITE;
            case "M":
                return Color.TRANSPARENT;
            default:
                return NEUTRAL;
        }
    }

    /** The colour a face prints its ring numbers in, which is the contrast the archer already knows. */
    private static int ink(String label) {
        int background = face(label);
        if (background == GOLD || background == RED || background == BLUE || background == WHITE) {
            return BLACK;
        }
        if (background == BLACK) return WHITE;
        if (background == NEUTRAL) return 0xFFE8E8E8;
        return MISS;
    }

    private TextView cell(String label) {
        TextView key = new TextView(this);
        key.setGravity(Gravity.CENTER);

        if (TOTAL.equals(label)) {
            totalCell = key;
            key.setTextColor(0xFFCCCCCC);
            key.setTextSize(19f);
            return key;
        }

        if (BACK.equals(label)) {
            key.setText(BACK);
            key.setTextSize(19f);
            key.setClickable(true);
            key.setTextColor(0xFFCCCCCC);
            key.setBackground(background(NEUTRAL, Color.TRANSPARENT));
            key.setOnClickListener(v -> undo());
            return key;
        }

        key.setText(label);
        key.setTextSize(label.length() > 2 ? 15f : "M".equals(label) ? 17f : 20f);
        key.setClickable(true);
        key.setTextColor(ink(label));
        key.setBackground(background(face(label), "M".equals(label) ? MISS : Color.TRANSPARENT));
        key.setOnClickListener(v -> record(label));
        // Undo also on a long press, so it is reachable without crossing the keypad.
        key.setOnLongClickListener(v -> {
            undo();
            return true;
        });
        return key;
    }

    private StateListDrawable background(int fill, int outline) {
        float radius = 14 * density;

        GradientDrawable idle = new GradientDrawable();
        idle.setColor(fill);
        idle.setCornerRadius(radius);
        if (outline != Color.TRANSPARENT) idle.setStroke(Math.round(1.5f * density), outline);

        // A white edge reads as pressed on gold, on white and on black alike, which a tint does not.
        GradientDrawable down = new GradientDrawable();
        down.setColor(fill);
        down.setCornerRadius(radius);
        down.setStroke(Math.round(3 * density), Color.WHITE);

        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_pressed}, down);
        states.addState(new int[]{}, idle);
        return states;
    }

    private GradientDrawable pill(int fill, int outline, float radiusPx) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(radiusPx);
        if (outline != Color.TRANSPARENT) drawable.setStroke(Math.round(1.5f * density), outline);
        return drawable;
    }

    // -------- scoresheet

    private View buildSheet() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        // Deep top and bottom padding so the first and last line can be scrolled to the middle band,
        // the only part of a round screen where a full width row is visible.
        content.setPadding(Math.round(10 * density), Math.round(56 * density),
                Math.round(10 * density), Math.round(60 * density));

        TextView title = new TextView(this);
        title.setText("Scoresheet");
        title.setTextColor(DIM);
        title.setTextSize(12f);
        title.setGravity(Gravity.CENTER);
        content.addView(title);

        sheetStatus = new TextView(this);
        sheetStatus.setTextColor(DIM);
        sheetStatus.setTextSize(10f);
        sheetStatus.setGravity(Gravity.CENTER);
        sheetStatus.setPadding(0, 0, 0, Math.round(10 * density));
        content.addView(sheetStatus);

        sheetPills = new TextView[ends][arrowsPerEnd];
        sheetLines = new View[ends];
        sheetEndNumbers = new TextView[ends];
        sheetSubtotals = new TextView[ends];
        sheetRunning = new TextView[ends];
        for (int end = 0; end < ends; end++) content.addView(endLine(end));

        sheetTotal = new TextView(this);
        sheetTotal.setGravity(Gravity.CENTER);
        sheetTotal.setTextColor(GOLD);
        sheetTotal.setTextSize(28f);
        sheetTotal.setTypeface(Typeface.DEFAULT_BOLD);
        sheetTotal.setPadding(0, Math.round(14 * density), 0, 0);
        content.addView(sheetTotal);

        sheetScroll = new ScrollView(this);
        sheetScroll.setBackgroundColor(0xFC000000);
        sheetScroll.setVerticalScrollBarEnabled(false);
        sheetScroll.setFocusable(false);
        sheetScroll.setFocusableInTouchMode(false);
        sheetScroll.addView(content);
        sheetContent = content;
        // Every layout, because the one that matters is whichever first has a height worth measuring.
        sheetScroll.addOnLayoutChangeListener(
                (v, l, t, r, b, ol, ot, or2, ob) -> applySheetScroll());
        return sheetScroll;
    }

    /** One line of pills is an end: no card around it, because the line already reads as one. */
    private View endLine(int end) {
        LinearLayout line = new LinearLayout(this);
        line.setOrientation(LinearLayout.HORIZONTAL);
        line.setGravity(Gravity.CENTER_VERTICAL);

        TextView number = new TextView(this);
        number.setText(String.valueOf(end + 1));
        number.setTextColor(DIM);
        number.setTextSize(10f);
        number.setGravity(Gravity.CENTER);
        sheetEndNumbers[end] = number;
        line.addView(number, new LinearLayout.LayoutParams(Math.round(13 * density),
                ViewGroup.LayoutParams.WRAP_CONTENT));

        for (int arrow = 0; arrow < arrowsPerEnd; arrow++) {
            TextView slot = new TextView(this);
            slot.setGravity(Gravity.CENTER);
            slot.setTextSize(12f);
            slot.setTypeface(Typeface.DEFAULT_BOLD);
            slot.setIncludeFontPadding(false);
            sheetPills[end][arrow] = slot;
            final int index = end * arrowsPerEnd + arrow;
            slot.setOnClickListener(v -> openEditor(index));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0,
                    Math.round(27 * density), 1f);
            lp.setMargins(Math.round(1.5f * density), 0, Math.round(1.5f * density), 0);
            line.addView(slot, lp);
        }

        TextView subtotal = new TextView(this);
        subtotal.setTextColor(0xFFEFEFEF);
        subtotal.setTextSize(11f);
        subtotal.setTypeface(Typeface.DEFAULT_BOLD);
        subtotal.setGravity(Gravity.END);
        sheetSubtotals[end] = subtotal;
        line.addView(subtotal, new LinearLayout.LayoutParams(Math.round(20 * density),
                ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView running = new TextView(this);
        running.setTextColor(DIM);
        running.setTextSize(10f);
        running.setGravity(Gravity.END);
        sheetRunning[end] = running;
        line.addView(running, new LinearLayout.LayoutParams(Math.round(25 * density),
                ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, Math.round(3 * density), 0, Math.round(3 * density));
        line.setLayoutParams(lp);
        sheetLines[end] = line;
        return line;
    }

    // -------- editing one arrow

    /**
     * The same keypad again, for one arrow only: tapping a value replaces that arrow and the sheet
     * comes straight back. Reusing the grid means the keys are where the thumb already learned them.
     */
    private View buildEditor() {
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setBackgroundColor(0xFE000000);

        editLabel = new TextView(this);
        editLabel.setGravity(Gravity.CENTER);
        editLabel.setTextColor(GOLD);
        editLabel.setTextSize(12f);
        editLabel.setPadding(0, STRIP_TOP_PX, 0, 0);
        column.addView(editLabel, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, HEADER_PX));

        RoundGrid grid = new RoundGrid(this);
        grid.setCircleTop(HEADER_PX);
        grid.setRowKeys(RoundGrid.distribute(keys.size() + 2));
        for (String label : cells()) grid.addView(editCell(label));
        column.addView(grid, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        return column;
    }

    private TextView editCell(String label) {
        TextView key = new TextView(this);
        key.setGravity(Gravity.CENTER);

        if (TOTAL.equals(label)) {
            key.setText("replace");
            key.setTextColor(DIM);
            key.setTextSize(10f);
            return key;
        }

        if (BACK.equals(label)) {
            key.setText("✕");
            key.setTextSize(18f);
            key.setClickable(true);
            key.setTextColor(0xFFCCCCCC);
            key.setBackground(background(NEUTRAL, Color.TRANSPARENT));
            key.setOnClickListener(v -> closeEditor());
            return key;
        }

        key.setText(label);
        key.setTextSize(label.length() > 2 ? 15f : "M".equals(label) ? 17f : 20f);
        key.setClickable(true);
        key.setTextColor(ink(label));
        key.setBackground(background(face(label), "M".equals(label) ? MISS : Color.TRANSPARENT));
        key.setOnClickListener(v -> applyEdit(label));
        return key;
    }

    private void openEditor(int index) {
        if (index >= shots.length || shots[index] == null) return;
        editing = index;
        editLabel.setText("end " + (index / arrowsPerEnd + 1)
                + "  arrow " + (index % arrowsPerEnd + 1));
        editOverlay.setVisibility(View.VISIBLE);
        root.setLocked(true);
        buzz(14);
    }

    private void applyEdit(String label) {
        if (editing >= 0 && editing < shots.length && shots[editing] != null) {
            shots[editing] = label;
            buzz(30);
            endChanged(editing / arrowsPerEnd);
            redraw();
        }
        closeEditor();
    }

    private void closeEditor() {
        editing = -1;
        editOverlay.setVisibility(View.GONE);
        root.setLocked(false);
    }

    // -------- input

    private void record(String label) {
        for (int i = 0; i < shots.length; i++) {
            if (shots[i] != null) continue;
            shots[i] = label;
            buzz(18);
            int end = i / arrowsPerEnd;
            // An end closing is worth feeling differently from an arrow landing.
            if ((i + 1) % arrowsPerEnd == 0) buzz(55);
            endChanged(end);
            redraw();
            return;
        }
    }

    private void undo() {
        for (int i = shots.length - 1; i >= 0; i--) {
            if (shots[i] == null) continue;
            shots[i] = null;
            buzz(35);
            endChanged(i / arrowsPerEnd);
            redraw();
            return;
        }
    }

    /**
     * An end goes to the phone once it is full, and from then on every time it changes: a complete
     * end the archer then corrects has to be corrected on the phone too, even while it is short an
     * arrow. An end emptied completely is asserted empty, which is how the phone is told to drop it.
     */
    private void endChanged(int end) {
        String[] labels = labelsOf(end);
        boolean complete = true;
        boolean empty = true;
        for (String label : labels) {
            if (label == null) complete = false;
            else empty = false;
        }

        if (!complete && !asserted.contains(end)) return;
        link.assertEnd(0, end + 1, labels);
        if (empty) asserted.remove(end);
        else asserted.add(end);
    }

    private String[] labelsOf(int end) {
        String[] labels = new String[arrowsPerEnd];
        for (int arrow = 0; arrow < arrowsPerEnd; arrow++) {
            labels[arrow] = shots[end * arrowsPerEnd + arrow];
        }
        return labels;
    }

    private void buzz(int ms) {
        if (vibrator != null) {
            vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        }
    }

    /**
     * Back asks the phone to move, rather than moving only the wrist: the phone owns where the two
     * of them are, so a watch that went back on its own would be showing a different place. The
     * phone sends the watch wherever it lands: out of a round to its session, out of a session to
     * the status screen, which is why neither of those cases appears here.
     *
     * True when this took the gesture. False means there is nothing behind and the app should close,
     * which the caller does, because nothing else will.
     */
    private boolean handleBack() {
        if ("idle".equals(screen) || link == null || !link.connected()) return false;
        if (editOverlay.getVisibility() == View.VISIBLE) {
            closeEditor();
            return true;
        }
        if (root != null && root.isOpen()) {
            root.settle(false);
            return true;
        }
        buzz(14);
        link.requestBack();
        return true;
    }

    /**
     * Android 13 replaced the back key with a gesture the app registers for, and from Android 16 an
     * app targeting it is not told about back any other way: `onBackPressed` is never called and the
     * key event is never dispatched. Without this the watch does not go back at all — it closes, and
     * the phone is never asked to move.
     */
    private void listenForBack() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                () -> {
                    // Registered, so the system no longer closes anything on its own: when there is
                    // nothing behind, leaving is this app's job now.
                    if (!handleBack()) finish();
                });
    }

    /** Wear OS 3, which predates the gesture above and still delivers back as a key press. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (!handleBack()) super.onBackPressed();
    }

    /** The crown again, for the case where focus has gone somewhere this activity does not own. */
    @Override
    public boolean onGenericMotionEvent(MotionEvent e) {
        if (e.getAction() == MotionEvent.ACTION_SCROLL
                && e.isFromSource(android.view.InputDevice.SOURCE_ROTARY_ENCODER)) {
            return onCrown(e);
        }
        return super.onGenericMotionEvent(e);
    }

    private boolean onCrown(MotionEvent e) {
        float delta = e.getAxisValue(MotionEvent.AXIS_SCROLL);
        if ("run".equals(screen)) {
            // A detent a page. Turned away from the runner the pages come up from below, which is
            // the way a list scrolls: the content moves against the finger, not with it.
            rotary += delta;
            if (Math.abs(rotary) > 1.0f) {
                runView.turn(rotary > 0 ? -1 : 1);
                rotary = 0;
            }
            return true;
        }
        if ("session".equals(screen)) {
            sessionView.scrollByCrown(delta);
            return true;
        }
        if (!"score".equals(screen)) return true;
        if (editOverlay.getVisibility() == View.VISIBLE) return true;

        if (!root.isOpen()) {
            rotary += delta;
            if (rotary > 1.0f) {
                rotary = 0;
                root.settle(true);
            }
            return true;
        }
        if (root.atBottom() && delta < 0) {
            rotary += delta;
            if (rotary < -1.0f) {
                rotary = 0;
                root.settle(false);
            }
            return true;
        }
        rotary = 0;
        sheetScroll.scrollBy(0, Math.round(-delta * 70));
        return true;
    }

    // -------- the phone talking back

    @Override
    public void onRound(String activityId, List<String> labels, List<Integer> prices, int roundEnds,
            int roundArrows) {
        boolean sameShape = roundEnds == ends && roundArrows == arrowsPerEnd && labels.equals(keys);
        keys = labels;
        Map<String, Integer> next = new HashMap<>();
        for (int i = 0; i < labels.size(); i++) {
            // What each label is worth, as the phone priced it. Only the total on the wrist depends
            // on this: the record is scored on the phone, from its own score set.
            next.put(labels.get(i), i < prices.size() ? prices.get(i) : 0);
        }
        values = next;

        if (!sameShape) {
            ends = roundEnds;
            arrowsPerEnd = roundArrows;
            shots = new String[ends * arrowsPerEnd];
            asserted.clear();
            rebuildScoring();
        }
        sessionView.setEndSize(arrowsPerEnd);
        redraw();
    }

    @Override
    public void onEnd(int stageIndex, int endNo, String[] labels, long at) {
        int end = endNo - 1;
        if (stageIndex != 0 || end < 0 || end >= ends) return;
        /**
         * The phone only sends an end it believes is the better copy, so it is adopted without
         * arguing. The exception is an end this watch has just changed and not yet had acknowledged:
         * that assertion is newer than anything the phone can have known about, so it stands.
         */
        if (link.pendingFor(stageIndex, endNo)) return;

        boolean any = false;
        for (int arrow = 0; arrow < arrowsPerEnd; arrow++) {
            String label = arrow < labels.length ? labels[arrow] : null;
            shots[end * arrowsPerEnd + arrow] = label;
            if (label != null) any = true;
        }
        /**
         * An end the phone has sent is an end the phone holds, which is what `asserted` means. Without
         * this, editing an arrow in an end that arrived from the phone and is not yet full is never
         * sent anywhere: the change would live on the wrist alone.
         */
        if (any) asserted.add(end);
        else asserted.remove(end);
        redraw();
    }

    @Override
    public void onLinkState(int kind, String note) {
        linkKind = kind;
        linkNote = note;
        statusView.setState(kind, note);
        sessionView.setNote(note);
        redraw();
    }

    @Override
    public void onScreen(String next) {
        // The phone owns where the two of them are, so this is followed rather than negotiated.
        showScreen(next);
    }

    /**
     * A run, sent every second or two while one lasts. The wrist takes the screen for it and gives
     * it back when the run stops, and a block change is felt rather than read: the buzz and the
     * screen waking are the whole point of wearing the thing on an interval session.
     */
    /** A run button on the wrist. The phone owns the run, so this asks and the next frame answers. */
    @Override
    public void onRunCommand(String action) {
        if (link != null) link.command(action);
    }

    /**
     * Holding the screen awake for a whole run costs most of what a watch has, so it is asked for
     * rather than assumed, and remembered: whoever wants it wants it on every run.
     */
    @Override
    public void onKeepAwake(boolean on) {
        keepAwake = on;
        getSharedPreferences("watch", MODE_PRIVATE).edit().putBoolean("keep-awake", on).apply();
        applyKeepAwake("run".equals(screen) && on);
    }

    /**
     * Dimmed and left up rather than lit or dark.
     *
     * Ambient is granted by the observer being attached, so it is attached only when it has been
     * asked for: an app that takes the screen for itself on every watch that opens it is an app
     * nobody opens twice. The redraw while it lasts is the activity's, on an alarm, because a view
     * that wakes itself every second in ambient is a lit screen with the lights off.
     */
    @Override
    public void onAmbient(boolean on) {
        ambientWanted = on;
        getSharedPreferences("watch", MODE_PRIVATE).edit().putBoolean("ambient", on).apply();
        runView.setAmbientAvailable(systemAmbient());
        if (on) attachAmbient();
        else detachAmbient();
    }

    /**
     * Whether the watch has an ambient screen at all. With its always-on screen switched off the
     * display simply goes out on a wrist drop, the system's own dream takes over when it does not,
     * and an app asking for ambient is refused in silence. Read rather than assumed, so the toggle
     * can say why it is doing nothing.
     */
    private boolean systemAmbient() {
        return android.provider.Settings.Global.getInt(getContentResolver(), "ambient_enabled", 0) == 1;
    }

    @Override
    protected void onResume() {
        super.onResume();
        // It is a setting on another screen, so it may have changed while this one was away.
        if (runView != null) runView.setAmbientAvailable(systemAmbient());
    }

    private void attachAmbient() {
        if (ambient != null) return;
        android.util.Log.i("AppcheryWatch", "ambient asked for");
        // Built through the library's own factory: the observer is an interface, and this is the
        // Java name of the Kotlin function that makes one.
        ambient = androidx.wear.ambient.AmbientLifecycleObserverKt.AmbientLifecycleObserver(this,
                new androidx.wear.ambient.AmbientLifecycleObserver.AmbientLifecycleCallback() {
                    @Override
                    public void onEnterAmbient(
                            androidx.wear.ambient.AmbientLifecycleObserver.AmbientDetails details) {
                        android.util.Log.i("AppcheryWatch", "ambient in");
                        inAmbient = true;
                        runView.setAmbient(true);
                        scheduleAmbientTick();
                    }

                    @Override
                    public void onUpdateAmbient() {
                        runView.ambientTick();
                    }

                    @Override
                    public void onExitAmbient() {
                        android.util.Log.i("AppcheryWatch", "ambient out");
                        inAmbient = false;
                        cancelAmbientTick();
                        runView.setAmbient(false);
                    }
                });
        getLifecycle().addObserver(ambient);
    }

    private void detachAmbient() {
        if (ambient == null) return;
        getLifecycle().removeObserver(ambient);
        ambient = null;
        inAmbient = false;
        cancelAmbientTick();
        runView.setAmbient(false);
    }

    /**
     * Twenty seconds, which is the pace a run can be read at from a sleeping watch: the block, what
     * is left of it and the pace it asks for barely move in that time. Inexact on purpose, so the
     * watch can line the wakeup up with whatever else it was going to wake for.
     */
    private static final long AMBIENT_TICK_MS = 20_000;
    private static final String AMBIENT_ACTION = "com.appchery.watch.AMBIENT_TICK";

    private final BroadcastReceiver ambientTicker = new BroadcastReceiver() {
        @Override
        public void onReceive(android.content.Context context, Intent intent) {
            if (!inAmbient) return;
            runView.ambientTick();
            scheduleAmbientTick();
        }
    };

    private void scheduleAmbientTick() {
        if (!inAmbient || !"run".equals(screen)) return;
        AlarmManager alarms = getSystemService(AlarmManager.class);
        if (alarms == null) return;
        if (ambientTick == null) {
            Intent intent = new Intent(AMBIENT_ACTION).setPackage(getPackageName());
            ambientTick = PendingIntent.getBroadcast(this, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }
        alarms.set(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + AMBIENT_TICK_MS, ambientTick);
    }

    private void cancelAmbientTick() {
        AlarmManager alarms = getSystemService(AlarmManager.class);
        if (alarms != null && ambientTick != null) alarms.cancel(ambientTick);
    }

    private void applyKeepAwake(boolean on) {
        if (on) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    public void onRun(Link.Run run) {
        // The run screen is taken for a run about to start as well: that is where its start button is.
        boolean live = !"d".equals(run.status);
        runView.show(run);

        if ("r".equals(run.status) && run.cue != lastCue && lastCue >= 0) wake();
        lastCue = run.cue;

        if (live && !running) {
            running = true;
            // Asked for here rather than on a settings screen nobody visits, as the phone asks for
            // its own on the way into a run. Refused, the run is a run without a heart rate.
            Heart.ask(this, HEART_PERMISSION);
            heart.start(this);
            runView.setHeartAvailable(heart.available(this));
            showScreen("run");
        } else if (!live && running) {
            running = false;
            heart.stop();
            lastCue = -1;
            // Back to whatever the phone was showing behind the run, which it never stopped being.
            showScreen(mirrored);
        }
    }

    /**
     * A new block: two short buzzes and the screen lit. Wear dims and then sleeps a watch nobody is
     * looking at, and the whole value of the cue is that it arrives while the runner is not looking.
     */
    private void wake() {
        if (vibrator != null) {
            vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0, 180, 120, 260}, -1));
        }
        android.os.PowerManager power = getSystemService(android.os.PowerManager.class);
        if (power == null) return;
        @SuppressWarnings("deprecation")
        android.os.PowerManager.WakeLock lock = power.newWakeLock(
                android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                        | android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "appchery:run-cue");
        // Held for six seconds and let go by its own timeout: released here it would go dark at once.
        lock.acquire(6000);
    }

    @Override
    public void onSession(String label, int activityCount, int arrows) {
        // A count of less than nothing means the phone's figure is older than this watch's own.
        if (arrows >= 0) sessionView.setSession(label, arrows);
        else sessionView.setTitle(label);
        // The activities follow one message each, so the list is emptied ready for them.
        sessionView.clearActivities();
    }

    @Override
    public void onActivity(int index, String kind, String label, boolean scorable) {
        sessionView.addActivity(index, kind, label, scorable);
    }

    @Override
    public void onArrows(int total, long at) {
        sessionView.setArrows(total);
    }

    @Override
    public void onOpen(int index) {
        buzz(18);
        link.requestOpen(index);
    }

    @Override
    public void onArrows(int total) {
        buzz(18);
        link.assertArrows(total);
    }

    // -------- rendering

    private int valueOf(String label) {
        Integer value = values.get(label);
        return value == null ? 0 : value;
    }

    private void redraw() {
        int shotCount = 0;
        for (String label : shots) if (label != null) shotCount++;
        int endIndex = Math.min(shotCount / arrowsPerEnd, ends - 1);

        int total = 0;
        for (String label : shots) if (label != null) total += valueOf(label);

        for (int arrow = 0; arrow < arrowsPerEnd; arrow++) {
            paintPill(endPills[arrow], shots[endIndex * arrowsPerEnd + arrow], STRIP_HEIGHT_PX / 2f);
        }
        totalCell.setText(String.valueOf(total));

        int running = 0;
        for (int end = 0; end < ends; end++) {
            int subtotal = 0;
            boolean started = false;
            for (int arrow = 0; arrow < arrowsPerEnd; arrow++) {
                String label = shots[end * arrowsPerEnd + arrow];
                if (label != null) {
                    subtotal += valueOf(label);
                    started = true;
                }
                paintPill(sheetPills[end][arrow], label, 13.5f * density);
                sheetPills[end][arrow].setClickable(label != null);
            }
            running += subtotal;
            sheetSubtotals[end].setText(started ? String.valueOf(subtotal) : "");
            sheetRunning[end].setText(started ? String.valueOf(running) : "");
            // The end being shot is named in gold, which finds the live line without any chrome.
            sheetEndNumbers[end].setTextColor(end == endIndex ? GOLD : DIM);
            // An end not yet reached is not a blank line, it is simply not there yet.
            sheetLines[end].setVisibility(end <= endIndex ? View.VISIBLE : View.GONE);
        }
        sheetTotal.setText(String.valueOf(total));

        int waiting = link == null ? 0 : link.waiting();
        sheetStatus.setText(waiting > 0 ? linkNote + ", " + waiting + " waiting" : linkNote);
        sheetScroll.post(this::applySheetScroll);
    }

    /**
     * A ScrollView left scrolled past its own content shows the empty space below it: a black screen
     * that a tap fixes, because the tap is what forces the re-layout that clamps it.
     *
     * Two things put it there. An end leaving the sheet makes the sheet shorter, and asking for the
     * bottom while the sheet is still being laid out measures its height as nothing, so the scroll
     * lands far past the end and stays there. Both are why this runs on every layout rather than at
     * the moment of the change: a height of nothing is waited out instead of being trusted.
     */
    private void applySheetScroll() {
        int height = sheetScroll.getHeight();
        if (height <= 0 || sheetContent.getHeight() <= 0) return;

        int room = Math.max(0, sheetContent.getHeight() - height);
        if (wantSheetBottom) {
            wantSheetBottom = false;
            sheetScroll.scrollTo(0, room);
            return;
        }
        if (sheetScroll.getScrollY() > room) sheetScroll.scrollTo(0, room);
    }

    /** An arrow not yet shot is an empty outline rather than a gap, so the end keeps its shape. */
    private void paintPill(TextView view, String label, float radiusPx) {
        if (label == null) {
            view.setText("");
            view.setBackground(pill(0xFF101316, 0xFF2A3036, radiusPx));
            return;
        }
        view.setText(label);
        view.setTextColor(ink(label));
        view.setBackground(pill(
                "M".equals(label) ? Color.TRANSPARENT : face(label),
                "M".equals(label) ? MISS : Color.TRANSPARENT, radiusPx));
    }
}
