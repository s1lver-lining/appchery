package com.appchery.watch;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;

/**
 * A keypad laid out to the screen's circle rather than to a square inside it: each row is as wide as
 * the chord at its inner edge, so the middle rows carry more keys than the outer ones.
 */
public class RoundGrid extends ViewGroup {

    /** Twelve WA values plus the total and undo. Replaced when a round with another face arrives. */
    private int[] rowKeys = {3, 4, 4, 3};

    // Without a cap the outer rows hand their slack to two or three keys and they come out absurdly
    // large, which is space better spent on the end so far and on undo.
    private static final int MAX_KEY_DP = 78;

    private final int gap;
    private final int maxKey;
    private int circleTop = 0;

    public RoundGrid(Context context) {
        super(context);
        float density = context.getResources().getDisplayMetrics().density;
        gap = Math.round(3 * density);
        maxKey = Math.round(MAX_KEY_DP * density);
    }

    void setRowKeys(int[] rows) {
        rowKeys = rows;
        requestLayout();
    }

    /**
     * How to break `cells` keys into rows for a round screen: rows of at most four, as even as they
     * divide, with the fullest rows in the middle where the circle is widest. Fourteen comes out as
     * three, four, four, three, which is the layout the WA face was drawn to by hand.
     */
    static int[] distribute(int cells) {
        int rows = Math.max(2, Math.min(4, (int) Math.ceil(cells / 4.0)));
        int[] counts = new int[rows];
        for (int i = 0; i < cells; i++) counts[i % rows]++;

        Integer[] order = new Integer[rows];
        for (int i = 0; i < rows; i++) order[i] = i;
        // Positions nearest the middle first, so they take the fullest rows.
        final double centre = (rows - 1) / 2.0;
        java.util.Arrays.sort(order, (a, b) ->
                Double.compare(Math.abs(a - centre), Math.abs(b - centre)));

        int[] sorted = counts.clone();
        java.util.Arrays.sort(sorted);
        int[] out = new int[rows];
        for (int i = 0; i < rows; i++) out[order[i]] = sorted[rows - 1 - i];
        return out;
    }

    /** How far below the top of the round display this grid starts, so the chords are measured right. */
    void setCircleTop(int px) {
        circleTop = px;
        requestLayout();
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        int w = MeasureSpec.getSize(widthSpec);
        int h = MeasureSpec.getSize(heightSpec);
        setMeasuredDimension(w, h);

        int rows = rowKeys.length;
        int rowH = h / rows;
        int child = 0;
        for (int r = 0; r < rows; r++) {
            int span = cellWidth(w, h, r);
            for (int c = 0; c < rowKeys[r] && child < getChildCount(); c++, child++) {
                getChildAt(child).measure(MeasureSpec.makeMeasureSpec(span, MeasureSpec.EXACTLY),
                        MeasureSpec.makeMeasureSpec(rowH - gap, MeasureSpec.EXACTLY));
            }
        }
    }

    /** The chord at the row edge nearest the centre, shared out between that row's keys. */
    private int cellWidth(int w, int h, int row) {
        int rows = rowKeys.length;
        double radius = w / 2.0;
        // The circle is the display, not this view, so the centre sits above the grid by the header.
        double centreY = radius - circleTop;
        double top = row * (h / (double) rows);
        double bottom = top + h / (double) rows;

        double inner;
        if (top <= centreY && bottom >= centreY) inner = 0;
        else inner = Math.min(Math.abs(top - centreY), Math.abs(bottom - centreY));

        double half = Math.sqrt(Math.max(0, radius * radius - inner * inner));
        int span = (int) ((2 * half - gap * (rowKeys[row] + 1)) / rowKeys[row]);
        return Math.min(span, maxKey);
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r2, int b) {
        int w = getWidth();
        int h = getHeight();
        int rows = rowKeys.length;
        int rowH = h / rows;
        int child = 0;

        for (int r = 0; r < rows; r++) {
            int span = cellWidth(w, h, r);
            int keys = rowKeys[r];
            int rowWidth = keys * span + gap * (keys - 1);
            int x = (w - rowWidth) / 2;
            int y = r * rowH;

            for (int c = 0; c < keys && child < getChildCount(); c++, child++) {
                View v = getChildAt(child);
                v.layout(x, y + gap / 2, x + span, y + rowH - gap / 2);
                x += span + gap;
            }
        }
    }
}
