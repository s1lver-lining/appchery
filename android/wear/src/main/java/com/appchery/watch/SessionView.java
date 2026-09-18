package com.appchery.watch;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * The session, on the wrist: its training arrows and the activities it holds. The count is kept as a
 * whole figure rather than a running difference, because the phone is told totals and a total
 * delivered twice is the same total.
 */
public class SessionView extends FrameLayout {

    private static final int GOLD = 0xFFFFCF3F;
    private static final int NEUTRAL = 0xFF2B2F34;
    private static final int DIM = 0xFF8A9199;

    public interface Listener {
        /** The archer asking for an activity. The phone decides and both screens follow. */
        void onOpen(int index);

        /** The session's training arrows, as a total. */
        void onArrows(int total);
    }

    private final Listener listener;
    private final float density;
    private final TextView title;
    private final TextView count;
    private final TextView note;
    private final LinearLayout list;
    private final ScrollView scroll;

    private int arrows = 0;
    /** How many arrows one end holds, so the second button matches what is being shot. */
    private int endSize = 6;
    /** What the last few additions were, so undo takes back what was actually added. */
    private final java.util.ArrayDeque<Integer> added = new java.util.ArrayDeque<>();
    private TextView endButton;

    public SessionView(Context context, Listener listener) {
        super(context);
        this.listener = listener;
        density = context.getResources().getDisplayMetrics().density;
        setBackgroundColor(Color.BLACK);

        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        // The circle is narrow at the top and bottom, so the content keeps well clear of both.
        column.setPadding(Math.round(14 * density), Math.round(30 * density),
                Math.round(14 * density), Math.round(34 * density));

        title = new TextView(context);
        title.setGravity(Gravity.CENTER);
        title.setTextColor(DIM);
        title.setTextSize(12f);
        title.setMaxLines(1);
        column.addView(title);

        count = new TextView(context);
        count.setGravity(Gravity.CENTER);
        count.setTextColor(GOLD);
        count.setTextSize(34f);
        count.setTypeface(Typeface.DEFAULT_BOLD);
        column.addView(count);

        TextView arrowsLabel = new TextView(context);
        arrowsLabel.setText("training arrows");
        arrowsLabel.setGravity(Gravity.CENTER);
        arrowsLabel.setTextColor(DIM);
        arrowsLabel.setTextSize(10f);
        column.addView(arrowsLabel);

        column.addView(buildButtons(context));

        note = new TextView(context);
        note.setGravity(Gravity.CENTER);
        note.setTextColor(DIM);
        note.setTextSize(10f);
        note.setPadding(0, Math.round(6 * density), 0, Math.round(4 * density));
        column.addView(note);

        list = new LinearLayout(context);
        list.setOrientation(LinearLayout.VERTICAL);
        column.addView(list, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        scroll = new ScrollView(context);
        scroll.setVerticalScrollBarEnabled(false);
        // Focusable scroll views take the crown for themselves, and then it stops working.
        scroll.setFocusable(false);
        scroll.setFocusableInTouchMode(false);
        scroll.addView(column);
        addView(scroll);
    }

    /** Plus one arrow, plus a whole end, and undo the last thing added. */
    private View buildButtons(Context context) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, Math.round(6 * density), 0, 0);

        row.addView(button(context, "+1", () -> add(1)), weighted());
        endButton = button(context, "+" + endSize, () -> add(endSize));
        row.addView(endButton, weighted());
        row.addView(button(context, "⌫", this::undo), weighted());
        return row;
    }

    private LinearLayout.LayoutParams weighted() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0,
                Math.round(42 * density), 1f);
        lp.setMargins(Math.round(2 * density), 0, Math.round(2 * density), 0);
        return lp;
    }

    private TextView button(Context context, String label, Runnable action) {
        TextView view = new TextView(context);
        view.setText(label);
        view.setGravity(Gravity.CENTER);
        view.setTextSize(15f);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setTextColor(0xFFE8E8E8);
        view.setClickable(true);
        view.setBackground(key(NEUTRAL));
        view.setOnClickListener(v -> action.run());
        return view;
    }

    private StateListDrawable key(int fill) {
        GradientDrawable idle = new GradientDrawable();
        idle.setColor(fill);
        idle.setCornerRadius(12 * density);

        GradientDrawable down = new GradientDrawable();
        down.setColor(fill);
        down.setCornerRadius(12 * density);
        down.setStroke(Math.round(2.5f * density), Color.WHITE);

        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_pressed}, down);
        states.addState(new int[]{}, idle);
        return states;
    }

    private void add(int delta) {
        arrows = Math.max(0, arrows + delta);
        added.push(delta);
        count.setText(String.valueOf(arrows));
        listener.onArrows(arrows);
    }

    private void undo() {
        if (added.isEmpty()) return;
        arrows = Math.max(0, arrows - added.pop());
        count.setText(String.valueOf(arrows));
        listener.onArrows(arrows);
    }

    public void setSession(String label, int arrowsSoFar) {
        title.setText(label);
        setArrows(arrowsSoFar);
    }

    public void setArrows(int total) {
        arrows = Math.max(0, total);
        // What was added locally no longer describes the figure the phone has settled on.
        added.clear();
        count.setText(String.valueOf(arrows));
    }

    public void setNote(String text) {
        note.setText(text);
    }

    public void clearActivities() {
        list.removeAllViews();
    }

    /**
     * One activity. A kind the watch cannot score is shown anyway, so the session reads the same on
     * both screens, but it does not answer a tap.
     */
    public void addActivity(int index, String kind, String label, boolean scorable) {
        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(Math.round(10 * density), Math.round(7 * density),
                Math.round(10 * density), Math.round(7 * density));

        TextView name = new TextView(getContext());
        name.setText(label);
        name.setTextColor(scorable ? 0xFFF0F0F0 : DIM);
        name.setTextSize(12f);
        name.setMaxLines(1);
        row.addView(name);

        TextView kindLabel = new TextView(getContext());
        kindLabel.setText(kind);
        kindLabel.setTextColor(DIM);
        kindLabel.setTextSize(9f);
        row.addView(kindLabel);

        if (scorable) {
            row.setClickable(true);
            row.setBackground(key(0xFF1A1E22));
            row.setOnClickListener(v -> listener.onOpen(index));
        } else {
            GradientDrawable flat = new GradientDrawable();
            flat.setColor(0xFF121517);
            flat.setCornerRadius(12 * density);
            row.setBackground(flat);
        }

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, Math.round(3 * density), 0, Math.round(3 * density));
        list.addView(row, lp);
    }

    public void setEndSize(int arrowsPerEnd) {
        endSize = Math.max(1, arrowsPerEnd);
        if (endButton != null) endButton.setText("+" + endSize);
    }

    /** The crown, scrolling the session rather than the scoresheet. */
    public void scrollByCrown(float delta) {
        scroll.scrollBy(0, Math.round(-delta * 70));
    }
}
