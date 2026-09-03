import { get } from 'svelte/store';
import { noAnimations } from '$lib/prefs';

/**
 * Pulling a page down to read it again.
 *
 * Bound by hand rather than through Svelte's handlers, for the same reason the horizontal drag is:
 * a pull has to preempt the scroll it starts inside, and Svelte registers touch handlers as passive,
 * where preventDefault does nothing.
 *
 * The gesture only ever starts at the very top of whatever is scrolling. Below that, a finger moving
 * down is somebody scrolling back up the page, and taking that gesture would make the app feel like
 * it was fighting them.
 */

export interface PullOptions {
	onMove: (distance: number) => void;
	onEnd: (distance: number) => void;
	/** Answered at touch start: a page already reading again does not start another pull. */
	enabled?: () => boolean;
}

/** Below this the gesture has no direction yet, and reading one from it would fight the scroll. */
const AXIS_LOCK = 8;
/** Down has to beat across by this much, otherwise a slanted swipe back would count as a pull. */
const AXIS_BIAS = 1.4;
/** How much of the finger's travel the page follows, which is what makes it a long deliberate swipe. */
const DAMPING = 0.55;
/** Where the page stops following properly, so a pull can be long without the page running away. */
const LIMIT = 96;
/** How far past the limit the page still gives, so it never feels like it has hit a wall. */
const OVERRUN = 0.2;

/** What the page has moved for a finger that has travelled `dy`, which is less and less of it. */
function damp(dy: number): number {
	const eased = dy * DAMPING;
	return eased <= LIMIT ? eased : LIMIT + (eased - LIMIT) * OVERRUN;
}

/**
 * What is actually scrolling under the node, which is not the node: every page outside the swipe
 * pager shares one scrolling element, and it is an ancestor of all of them.
 */
function scrollerOf(node: HTMLElement): HTMLElement {
	for (let at: HTMLElement | null = node; at; at = at.parentElement) {
		const overflow = getComputedStyle(at).overflowY;
		if (overflow === 'auto' || overflow === 'scroll') return at;
	}
	return (document.scrollingElement as HTMLElement | null) ?? document.body;
}

export function pull(node: HTMLElement, options: PullOptions) {
	let current = options;
	let start: { x: number; y: number } | null = null;
	let axis: 'x' | 'y' | null = null;
	let distance = 0;

	const onStart = (event: TouchEvent) => {
		const inert = (event.target as Element | null)?.closest('[data-noswipe]');
		// Motion off is a page that never moves under the archer, so the gesture is not offered at all.
		if (inert || event.touches.length !== 1 || current.enabled?.() === false || get(noAnimations)) {
			start = null;
			return;
		}
		// Only from the top. Read now rather than on the first move: by then the scroll has begun.
		if (scrollerOf(node).scrollTop > 0) {
			start = null;
			return;
		}
		start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
		axis = null;
		distance = 0;
	};

	const onMove = (event: TouchEvent) => {
		if (!start) return;
		const touch = event.touches[0];
		const dx = touch.clientX - start.x;
		const dy = touch.clientY - start.y;
		if (!axis) {
			if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
			// Upwards is the page being scrolled, whatever else it looks like.
			axis = dy > 0 && dy > Math.abs(dx) * AXIS_BIAS ? 'y' : 'x';
		}
		if (axis !== 'y') return;

		// Never below nothing: swung back up, the page comes home under the finger rather than sticking.
		distance = Math.max(0, damp(dy));
		event.preventDefault();
		current.onMove(distance);
	};

	const onEnd = (event: TouchEvent) => {
		const began = start;
		start = null;
		if (!began || axis !== 'y') return;
		// A gesture the browser took back is not a gesture the archer finished: the page settles and
		// reads nothing, which is what a cancelled pull looks like everywhere else.
		current.onEnd(event.type === 'touchcancel' ? 0 : distance);
		distance = 0;
	};

	node.addEventListener('touchstart', onStart, { passive: true });
	node.addEventListener('touchmove', onMove, { passive: false });
	node.addEventListener('touchend', onEnd);
	node.addEventListener('touchcancel', onEnd);

	return {
		update(next: PullOptions) {
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

/** Far enough down to mean it. A shorter pull springs back and reads nothing again. */
export const PULL_READY = 64;
/** How long the page takes to settle back, whether it read anything again or not. */
export const PULL_SNAP_MS = 260;
export const PULL_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
