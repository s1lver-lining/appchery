package com.appchery.probe;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/**
 * The keypad, on the wrist, to be shot with rather than looked at: it records nothing and talks to
 * nothing. What it answers is whether the keys can be hit while wearing a tab.
 */
public class KeypadActivity extends Activity {

    // The WA face palette, taken from src/lib/domain/rounds/seed.ts so the wrist matches the phone.
    private static final int GOLD = 0xFFFFCF3F;
    private static final int RED = 0xFFE8453C;
    private static final int BLUE = 0xFF3AA0D8;
    private static final int BLACK = 0xFF23282C;
    private static final int WHITE = 0xFFF4F1EA;
    private static final int MISS = 0xFF888888;

    private static final int DIM = 0xFF8A9199;

    private static final String BACK = "back";
    private static final String TOTAL = "total";

    // Descending, as the round definition hands it over, then the miss, the running total and undo.
    private static final String[] KEYS = {
            "X", "10", "9",
            "8", "7", "6", "5",
            "4", "3", "2", "1",
            "M", TOTAL, BACK};

    private static final int ARROWS_PER_END = 6;
    private static final int ENDS = 6;

    /**
     * All in pixels, because the constraint is the screen's circle rather than any density: a strip
     * of pills has to start far enough down that the chord is wide enough to hold it, and its top
     * edge is what decides, being the narrowest part. At y=0 the usable width is zero.
     */
    private static final int STRIP_TOP_PX = 38;
    private static final int STRIP_HEIGHT_PX = 34;
    private static final int HEADER_PX = STRIP_TOP_PX + STRIP_HEIGHT_PX + 4;

    private final List<String> shots = new ArrayList<>();
    private final List<Integer> scores = new ArrayList<>();

    private final TextView[] endPills = new TextView[ARROWS_PER_END];
    private final TextView[][] sheetPills = new TextView[ENDS][ARROWS_PER_END];
    private final View[] sheetLines = new View[ENDS];
    private final TextView[] sheetEndNumbers = new TextView[ENDS];
    private final TextView[] sheetSubtotals = new TextView[ENDS];
    private final TextView[] sheetRunning = new TextView[ENDS];

    private TextView totalCell;
    private TextView sheetTotal;
    private ScrollView sheetScroll;
    private View editOverlay;
    private TextView editLabel;
    private int editing = -1;
    private DrawerRoot root;
    private Vibrator vibrator;
    private float rotary = 0;
    private float density;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        vibrator = getSystemService(Vibrator.class);
        density = getResources().getDisplayMetrics().density;

        root = new DrawerRoot(this);
        root.setBackgroundColor(Color.BLACK);
        root.addView(buildKeypad());
        View sheet = buildSheet();
        root.addView(sheet);
        root.attachDrawer(sheet, sheetScroll);
        root.setOnSettled(() -> {
            buzz(12);
            // Opened on the newest end rather than the first, so the way out is one drag away.
            if (root.isOpen()) sheetScroll.post(() -> sheetScroll.scrollTo(0, Integer.MAX_VALUE));
        });

        editOverlay = buildEditor();
        editOverlay.setVisibility(View.GONE);
        root.addView(editOverlay);

        root.setRotary(this::onCrown);
        // A rotary event is delivered to whichever view holds focus, so without this the crown never
        // reaches the hierarchy at all and the dispatch override above never runs.
        root.setFocusableInTouchMode(true);
        setContentView(root);
        root.requestFocus();
        redraw();
    }

    // -------- keypad

    private View buildKeypad() {
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.addView(buildEndStrip(), new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, HEADER_PX));

        RoundGrid grid = new RoundGrid(this);
        grid.setCircleTop(HEADER_PX);
        for (String label : KEYS) grid.addView(cell(label));
        column.addView(grid, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        return column;
    }

    /** The end so far, one pill per arrow in the colour of the ring it landed in. */
    private View buildEndStrip() {
        LinearLayout strip = new LinearLayout(this);
        strip.setOrientation(LinearLayout.HORIZONTAL);

        int inset = horizontalInset(STRIP_TOP_PX);
        strip.setPadding(inset, STRIP_TOP_PX, inset, 0);

        for (int i = 0; i < ARROWS_PER_END; i++) {
            TextView p = new TextView(this);
            p.setGravity(Gravity.CENTER);
            p.setTextSize(11f);
            p.setTypeface(Typeface.DEFAULT_BOLD);
            p.setIncludeFontPadding(false);
            endPills[i] = p;
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, STRIP_HEIGHT_PX, 1f);
            lp.setMargins(1, 0, 1, 0);
            strip.addView(p, lp);
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
            default:
                return Color.TRANSPARENT;
        }
    }

    /** The colour a face prints its ring numbers in, which is the contrast the archer already knows. */
    private static int ink(String label) {
        int bg = face(label);
        if (bg == GOLD || bg == RED || bg == BLUE || bg == WHITE) return BLACK;
        if (bg == BLACK) return WHITE;
        return MISS;
    }

    private TextView cell(String label) {
        TextView k = new TextView(this);
        k.setGravity(Gravity.CENTER);

        if (TOTAL.equals(label)) {
            totalCell = k;
            k.setTextColor(0xFFCCCCCC);
            k.setTextSize(19f);
            return k;
        }

        if (BACK.equals(label)) {
            k.setText("⌫");
            k.setTextSize(19f);
            k.setClickable(true);
            k.setTextColor(0xFFCCCCCC);
            k.setBackground(background(0xFF2B2F34, Color.TRANSPARENT, 14));
            k.setOnClickListener(v -> undo());
            return k;
        }

        k.setText(label);
        k.setTextSize("M".equals(label) ? 17f : 20f);
        k.setClickable(true);
        k.setTextColor(ink(label));
        k.setBackground(background(face(label), "M".equals(label) ? MISS : Color.TRANSPARENT, 14));
        k.setOnClickListener(v -> record(label));
        // Undo also on a long press, so it is reachable without crossing the keypad.
        k.setOnLongClickListener(v -> {
            undo();
            return true;
        });
        return k;
    }

    private StateListDrawable background(int fill, int outline, float radiusDp) {
        float radius = radiusDp * density;

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

    private GradientDrawable pillBackground(int fill, int outline, float radiusPx) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(radiusPx);
        if (outline != Color.TRANSPARENT) d.setStroke(Math.round(1.5f * density), outline);
        return d;
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
        title.setPadding(0, 0, 0, Math.round(10 * density));
        content.addView(title);

        for (int e = 0; e < ENDS; e++) content.addView(endLine(e));

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

        for (int a = 0; a < ARROWS_PER_END; a++) {
            TextView p = new TextView(this);
            p.setGravity(Gravity.CENTER);
            p.setTextSize(12f);
            p.setTypeface(Typeface.DEFAULT_BOLD);
            p.setIncludeFontPadding(false);
            sheetPills[end][a] = p;
            final int index = end * ARROWS_PER_END + a;
            p.setOnClickListener(v -> openEditor(index));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0,
                    Math.round(27 * density), 1f);
            lp.setMargins(Math.round(1.5f * density), 0, Math.round(1.5f * density), 0);
            line.addView(p, lp);
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
        for (String label : KEYS) grid.addView(editCell(label));
        column.addView(grid, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        return column;
    }

    private TextView editCell(String label) {
        TextView k = new TextView(this);
        k.setGravity(Gravity.CENTER);

        if (TOTAL.equals(label)) {
            k.setText("replace");
            k.setTextColor(DIM);
            k.setTextSize(10f);
            return k;
        }

        if (BACK.equals(label)) {
            k.setText("✕");
            k.setTextSize(18f);
            k.setClickable(true);
            k.setTextColor(0xFFCCCCCC);
            k.setBackground(background(0xFF2B2F34, Color.TRANSPARENT, 14));
            k.setOnClickListener(v -> closeEditor());
            return k;
        }

        k.setText(label);
        k.setTextSize("M".equals(label) ? 17f : 20f);
        k.setClickable(true);
        k.setTextColor(ink(label));
        k.setBackground(background(face(label), "M".equals(label) ? MISS : Color.TRANSPARENT, 14));
        k.setOnClickListener(v -> applyEdit(label));
        return k;
    }

    private void openEditor(int index) {
        if (index >= shots.size()) return;
        editing = index;
        editLabel.setText("end " + (index / ARROWS_PER_END + 1)
                + "  arrow " + (index % ARROWS_PER_END + 1));
        editOverlay.setVisibility(View.VISIBLE);
        root.setLocked(true);
        buzz(14);
    }

    private void applyEdit(String label) {
        if (editing >= 0 && editing < shots.size()) {
            shots.set(editing, label);
            scores.set(editing, valueOf(label));
            buzz(30);
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

    private static int valueOf(String label) {
        switch (label) {
            case "X":
                return 10;
            case "M":
                return 0;
            default:
                return Integer.parseInt(label);
        }
    }

    private void record(String label) {
        if (shots.size() >= ARROWS_PER_END * ENDS) return;
        shots.add(label);
        scores.add(valueOf(label));
        buzz(18);
        // An end closing is worth feeling differently from an arrow landing.
        if (shots.size() % ARROWS_PER_END == 0) buzz(55);
        redraw();
    }

    private void undo() {
        if (shots.isEmpty()) return;
        shots.remove(shots.size() - 1);
        scores.remove(scores.size() - 1);
        buzz(35);
        redraw();
    }

    private void buzz(int ms) {
        if (vibrator != null) {
            vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        }
    }

    private boolean onCrown(MotionEvent e) {
        if (editOverlay.getVisibility() == View.VISIBLE) return true;
        float delta = e.getAxisValue(MotionEvent.AXIS_SCROLL);

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

    /** The crown again, for the case where focus has gone somewhere this activity does not own. */
    @Override
    public boolean onGenericMotionEvent(MotionEvent e) {
        if (e.getAction() == MotionEvent.ACTION_SCROLL
                && e.isFromSource(android.view.InputDevice.SOURCE_ROTARY_ENCODER)) {
            return onCrown(e);
        }
        return super.onGenericMotionEvent(e);
    }

    // -------- rendering

    private void redraw() {
        int endIndex = Math.min(shots.size() / ARROWS_PER_END, ENDS - 1);
        int total = 0;
        for (int s : scores) total += s;

        for (int a = 0; a < ARROWS_PER_END; a++) {
            int i = endIndex * ARROWS_PER_END + a;
            paintPill(endPills[a], i < shots.size() ? shots.get(i) : null, STRIP_HEIGHT_PX / 2f);
        }
        totalCell.setText(String.valueOf(total));

        int running = 0;
        for (int e = 0; e < ENDS; e++) {
            int subtotal = 0;
            boolean started = false;
            for (int a = 0; a < ARROWS_PER_END; a++) {
                int i = e * ARROWS_PER_END + a;
                String label = i < shots.size() ? shots.get(i) : null;
                if (label != null) {
                    subtotal += scores.get(i);
                    started = true;
                }
                paintPill(sheetPills[e][a], label, 13.5f * density);
                // Only an arrow that exists can be changed: an empty slot would be an insertion.
                sheetPills[e][a].setClickable(label != null);
            }
            running += subtotal;
            sheetSubtotals[e].setText(started ? String.valueOf(subtotal) : "");
            sheetRunning[e].setText(started ? String.valueOf(running) : "");
            // The end being shot is named in gold, which finds the live line without any chrome.
            sheetEndNumbers[e].setTextColor(e == endIndex ? GOLD : DIM);
            // An end not yet reached is not a blank line, it is simply not there yet.
            sheetLines[e].setVisibility(e <= endIndex ? View.VISIBLE : View.GONE);
        }
        sheetTotal.setText(String.valueOf(total));
    }

    /** An arrow not yet shot is an empty outline rather than a gap, so the end keeps its shape. */
    private void paintPill(TextView pill, String label, float radiusPx) {
        if (label == null) {
            pill.setText("");
            pill.setBackground(pillBackground(0xFF101316, 0xFF2A3036, radiusPx));
            return;
        }
        pill.setText(label);
        pill.setTextColor(ink(label));
        pill.setBackground(pillBackground(
                "M".equals(label) ? Color.TRANSPARENT : face(label),
                "M".equals(label) ? MISS : Color.TRANSPARENT, radiusPx));
    }
}
