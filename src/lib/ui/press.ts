/**
 * The pressed look, driven from pointer events rather than left to `:active`.
 *
 * `:active` is the obvious way to write this and it does not survive contact with a phone. A browser
 * withholds it until it knows the touch is not the start of a scroll, and inside this app almost
 * every tappable card sits in the swipe pager, so it also has to rule out a pan first. By the time
 * it has decided, a quick tap is over and the page it opened has drawn: the feedback is asked for
 * and never painted. Worse on iOS, where `:active` needs a touch listener on an ancestor before it
 * will fire on anything at all.
 *
 * So the class is put on at `pointerdown`, which is immediate and unconditional, and taken off again
 * no sooner than `MIN_MS` later, because a tap can be shorter than the eye can catch.
 */
const MIN_MS = 110;

let held: HTMLElement | null = null;
let cooling: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let pressedAt = 0;

/** Ends the wait of whatever is still showing pressed after the finger has already gone. */
function settle() {
	if (timer !== undefined) clearTimeout(timer);
	timer = undefined;
	cooling?.removeAttribute('data-pressed');
	cooling = null;
}

function release() {
	const element = held;
	if (!element) return;
	held = null;

	const shown = performance.now() - pressedAt;
	if (shown >= MIN_MS) {
		element.removeAttribute('data-pressed');
		return;
	}
	// Held on a moment longer, or a tap fast enough to be useful would never be seen.
	settle();
	cooling = element;
	timer = setTimeout(settle, MIN_MS - shown);
}

function down(event: PointerEvent) {
	const target = event.target;
	if (!(target instanceof Element)) return;
	const element = target.closest('.press');
	if (!(element instanceof HTMLElement) || element.matches(':disabled')) return;

	settle();
	held?.removeAttribute('data-pressed');
	held = element;
	pressedAt = performance.now();
	element.setAttribute('data-pressed', '');
}

/**
 * One listener for the whole app rather than one per card, because the cards are counted in the
 * hundreds and every one of them would otherwise carry the same four.
 */
export function watchPresses() {
	if (typeof document === 'undefined') return;

	document.addEventListener('pointerdown', down, { passive: true, capture: true });
	// A press that turned into a scroll, a swipe, or a lifted finger is over either way.
	for (const type of ['pointerup', 'pointercancel'] as const) {
		document.addEventListener(type, release, { passive: true, capture: true });
	}
	document.addEventListener('scroll', release, { passive: true, capture: true });
	// Leaving the app mid press must not leave a card lit up for the return.
	window.addEventListener('blur', release, { passive: true });
}
