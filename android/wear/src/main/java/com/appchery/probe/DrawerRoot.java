package com.appchery.probe;

import android.content.Context;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.FrameLayout;
import android.widget.ScrollView;

/**
 * The scoresheet as a drawer pulled down over the keypad, the way the system's quick settings come
 * down over a watch face. The drag has to be caught before the keys see it, or every pull scores an
 * arrow on the way past.
 */
public class DrawerRoot extends FrameLayout {

    private final int slop;
    private View drawer;
    private ScrollView drawerScroll;
    private Runnable onSettled;
    private Rotary rotary;

    private boolean open = false;
    private boolean dragging = false;
    private boolean locked = false;
    private float downX, downY, startY;

    public DrawerRoot(Context context) {
        super(context);
        slop = ViewConfiguration.get(context).getScaledTouchSlop();
    }

    void attachDrawer(View view, ScrollView scroll) {
        drawer = view;
        drawerScroll = scroll;
    }

    void setOnSettled(Runnable runnable) {
        onSettled = runnable;
    }

    interface Rotary {
        boolean onRotary(MotionEvent e);
    }

    /**
     * The crown is claimed here rather than through a listener, because a rotary event goes to
     * whichever view holds focus: the sheet's ScrollView takes focus the moment it is scrolled and
     * then eats the crown itself, which is how the gesture went missing.
     */
    void setRotary(Rotary handler) {
        rotary = handler;
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        if (rotary != null && e.getAction() == MotionEvent.ACTION_SCROLL
                && e.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)) {
            return rotary.onRotary(e);
        }
        return super.dispatchGenericMotionEvent(e);
    }

    boolean isOpen() {
        return open;
    }

    /** Held still while something sits on top of the sheet, so a drag there cannot move it. */
    void setLocked(boolean value) {
        locked = value;
        if (value) dragging = false;
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        if (drawer != null && !open) drawer.setTranslationY(-h);
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent e) {
        if (drawer == null || locked) return false;

        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = e.getX();
                downY = e.getY();
                dragging = false;
                return false;

            case MotionEvent.ACTION_MOVE:
                float dy = e.getY() - downY;
                if (dragging || Math.abs(dy) <= slop || Math.abs(dy) <= Math.abs(e.getX() - downX)) {
                    return false;
                }
                if (!open && dy > 0) {
                    startY = -getHeight();
                    dragging = true;
                    return true;
                }
                // Closing only from the newest end, which is the bottom: the sheet grows upward, so
                // the way back to the keys is past the arrow just shot rather than past the history.
                if (open && dy < 0 && atBottom()) {
                    startY = 0;
                    dragging = true;
                    return true;
                }
                return false;

            default:
                return false;
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (!dragging) return false;

        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_MOVE:
                float y = Math.max(-getHeight(), Math.min(0, startY + e.getY() - downY));
                drawer.setTranslationY(y);
                return true;

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                dragging = false;
                settle(drawer.getTranslationY() > -getHeight() / 2f);
                return true;

            default:
                return true;
        }
    }

    boolean atBottom() {
        View content = drawerScroll == null ? null : drawerScroll.getChildAt(0);
        if (content == null) return true;
        return drawerScroll.getScrollY() + drawerScroll.getHeight() >= content.getHeight() - 2;
    }

    void settle(boolean shouldOpen) {
        open = shouldOpen;
        drawer.animate().translationY(open ? 0 : -getHeight()).setDuration(180).start();
        if (onSettled != null) onSettled.run();
    }

    void toggle() {
        settle(!open);
    }
}
