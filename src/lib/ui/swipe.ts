/**
 * The horizontal drag shared by everything that slides: the page pager and the tab decks inside a
 * page. Listeners are bound by hand because a horizontal drag has to preempt the vertical scroll,
 * and Svelte registers touch handlers as passive, where preventDefault does nothing.
 */

export interface SwipeOptions {
	onMove: (dx: number) => void;
	/** `flicked` is a short fast gesture, which commits even when it never travelled far. */
	onEnd: (dx: number, flicked: boolean) => void;
	/** Answered at touch start, so a track already animating can turn the next gesture away. */
	enabled?: () => boolean;
}

/** Below this the gesture has no direction yet, and reading one from it would fight the scroll. */
const AXIS_LOCK = 8;
/** Across has to beat down by this much, otherwise a slanted scroll would count as a swipe. */
export const AXIS_BIAS = 1.4;
const FLICK_MS = 300;
const FLICK_MIN = 50;

export function swipe(node: HTMLElement, options: SwipeOptions) {
	let current = options;
	let start: { x: number; y: number } | null = null;
	let axis: 'x' | 'y' | null = null;
	let last = { x: 0, at: 0 };

	const onStart = (event: TouchEvent) => {
		// Something inside that drags, such as a target face, opts out so a shot is never read as a
		// swipe. The track itself may carry the mark, which is how it takes the gesture from the page.
		const inert = (event.target as Element | null)?.closest('[data-noswipe]');
		if ((inert && inert !== node) || event.touches.length !== 1 || current.enabled?.() === false) {
			start = null;
			return;
		}
		const touch = event.touches[0];
		start = { x: touch.clientX, y: touch.clientY };
		last = { x: touch.clientX, at: Date.now() };
		axis = null;
	};

	const onMove = (event: TouchEvent) => {
		if (!start) return;
		const touch = event.touches[0];
		const dx = touch.clientX - start.x;
		const dy = touch.clientY - start.y;
		if (!axis) {
			if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
			axis = Math.abs(dx) > Math.abs(dy) * AXIS_BIAS ? 'x' : 'y';
		}
		if (axis !== 'x') return;
		event.preventDefault();
		current.onMove(dx);
		last = { x: touch.clientX, at: Date.now() };
	};

	const onEnd = (event: TouchEvent) => {
		const began = start;
		start = null;
		if (!began || axis !== 'x') return;
		const dx = (event.changedTouches[0]?.clientX ?? last.x) - began.x;
		const flicked = Date.now() - last.at < FLICK_MS && Math.abs(last.x - began.x) > FLICK_MIN;
		current.onEnd(dx, flicked);
	};

	node.addEventListener('touchstart', onStart, { passive: true });
	node.addEventListener('touchmove', onMove, { passive: false });
	node.addEventListener('touchend', onEnd);
	node.addEventListener('touchcancel', onEnd);

	return {
		update(next: SwipeOptions) {
			current = next;
		},
		destroy() {
			node.removeEventListener('touchstart', onStart);
			node.removeEventListener('touchmove', onMove);
			node.removeEventListener('touchend', onEnd);
			node.removeEventListener('touchcancel', onEnd);
		}
	};
}

export const SNAP_MS = 280;
/** Past a quarter of the track the gesture has committed, which is where a flick lands anyway. */
export const COMMIT_RATIO = 0.25;
export const SNAP_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
