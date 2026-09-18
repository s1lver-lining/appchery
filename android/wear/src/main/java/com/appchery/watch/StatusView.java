package com.appchery.watch;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The screen the watch sits on when the phone has nothing to mirror, which is most of the time the
 * app is open. It is the whole of the app's face for anybody who has not started a round yet, so it
 * says what this is and whether the two halves have found each other, in the phone app's own bronze
 * rather than the target colours, which belong to scores.
 *
 * Built in code like the rest of this module: no androidx, no layout inflation, nothing but the
 * framework, so it stays a small app on a small device.
 */
public class StatusView extends LinearLayout {

    // src/app.css, the dark palette, so the wrist is the same app as the phone at night.
    private static final int INK = 0xFFEFE8DC;
    private static final int MUTED = 0xFFA2988A;
    private static final int BRAND = 0xFFD99B47;
    private static final int SURFACE = 0xFF201C16;
    private static final int LINE = 0xFF3A332A;
    private static final int FAULT = 0xFFE8453C;

    private final float density;
    private final Mark mark;
    private final TextView state;
    private final Dot dot;

    public StatusView(Context context) {
        super(context);
        density = context.getResources().getDisplayMetrics().density;

        setOrientation(VERTICAL);
        setGravity(Gravity.CENTER);
        setBackgroundColor(Color.BLACK);

        mark = new Mark(context);
        LayoutParams markSize = new LayoutParams(px(46), px(46));
        markSize.bottomMargin = px(9);
        addView(mark, markSize);

        TextView name = new TextView(context);
        name.setText("Appchery");
        name.setTextColor(INK);
        name.setTextSize(16f);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        name.setGravity(Gravity.CENTER);
        addView(name);

        /*
         * The state as a chip rather than a line of text: on a round screen a centred sentence wraps
         * into a narrow column and reads as an error whatever it says. A pill holds one line, and
         * the dot in front of it carries the answer before any of the words are read.
         */
        LinearLayout chip = new LinearLayout(context);
        chip.setOrientation(HORIZONTAL);
        chip.setGravity(Gravity.CENTER_VERTICAL);
        chip.setPadding(px(10), px(5), px(11), px(6));
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(SURFACE);
        pill.setStroke(Math.round(1.5f * density), LINE);
        pill.setCornerRadius(px(20));
        chip.setBackground(pill);

        dot = new Dot(context);
        LayoutParams dotSize = new LayoutParams(px(7), px(7));
        dotSize.rightMargin = px(7);
        chip.addView(dot, dotSize);

        state = new TextView(context);
        state.setTextColor(MUTED);
        state.setTextSize(12f);
        state.setMaxLines(1);
        state.setEllipsize(android.text.TextUtils.TruncateAt.END);
        chip.addView(state);

        LayoutParams chipPlace = new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
        chipPlace.topMargin = px(11);
        chipPlace.gravity = Gravity.CENTER_HORIZONTAL;
        // The chip is inside the circle's widest band; a wide one would be cut by the bezel.
        chipPlace.leftMargin = px(16);
        chipPlace.rightMargin = px(16);
        addView(chip, chipPlace);

        setState(Link.WAITING, "Starting");
    }

    /** What the link is, in a colour before it is in words. */
    public void setState(int kind, String note) {
        state.setText(note);
        int colour = kind == Link.LINKED ? BRAND : kind == Link.FAULT ? FAULT : MUTED;
        state.setTextColor(kind == Link.WAITING ? MUTED : INK);
        dot.setColour(colour);
        // The mark lights up with the link: the one thing visible from a glance across the shooting
        // line, without reading anything.
        mark.setLive(kind == Link.LINKED);
    }

    private int px(int dp) {
        return Math.round(dp * density);
    }

    /**
     * The app's mark: the three rings of static/icon-maskable.svg, drawn rather than shipped as a
     * drawable so it can dim when the phone is not there.
     */
    private static class Mark extends View {
        private static final int OUTER = 0xFFEED5A4;
        private static final int MIDDLE = 0xFFE0B567;
        private static final int INNER = 0xFFD0912F;
        private static final int CENTRE = 0xFF8A5320;

        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private boolean live = false;

        Mark(Context context) {
            super(context);
        }

        void setLive(boolean value) {
            if (live == value) return;
            live = value;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float cx = getWidth() / 2f;
            float cy = getHeight() / 2f;
            // The source geometry on its 1024 canvas, as a fraction of the outer ring's outer edge.
            float unit = Math.min(cx, cy) / 400f;
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(64 * unit);
            // Unlinked, the mark is the same rings with the colour taken out of them: present, but
            // plainly not doing anything yet.
            paint.setAlpha(255);
            paint.setColor(live ? OUTER : dim(OUTER));
            canvas.drawCircle(cx, cy, 368 * unit, paint);
            paint.setColor(live ? MIDDLE : dim(MIDDLE));
            canvas.drawCircle(cx, cy, 276 * unit, paint);
            paint.setColor(live ? INNER : dim(INNER));
            canvas.drawCircle(cx, cy, 183 * unit, paint);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(live ? CENTRE : dim(CENTRE));
            canvas.drawCircle(cx, cy, 97 * unit, paint);
        }

        /** Towards the background rather than towards grey, so the rings stay one family of colour. */
        private static int dim(int colour) {
            return Color.rgb(Math.round(Color.red(colour) * 0.38f),
                    Math.round(Color.green(colour) * 0.38f),
                    Math.round(Color.blue(colour) * 0.38f));
        }
    }

    /** The state, as one dot. Round rather than a square with corners rounded to look round. */
    private static class Dot extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        Dot(Context context) {
            super(context);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(MUTED);
        }

        void setColour(int colour) {
            paint.setColor(colour);
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float r = Math.min(getWidth(), getHeight()) / 2f;
            canvas.drawCircle(getWidth() / 2f, getHeight() / 2f, r, paint);
        }
    }
}
