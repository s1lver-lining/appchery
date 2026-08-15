/**
 * Hold the page still while a dialog is over it. The app scrolls inside a pane rather than in the
 * document, and that pane is the pager's, which is transformed: a `fixed` dialog inside a
 * transformed ancestor is positioned against that ancestor, so scrolling the page behind carried
 * the dialog up the screen with it.
 *
 * The gesture is refused rather than the pane being frozen with `overflow`, because hiding the
 * overflow of a pane scrolled half way down snaps it back to the top, and the archer would find the
 * page somewhere else when the dialog closed.
 *
 * Put on the element that covers the screen: `<div class="fixed inset-0" use:lockScroll>`.
 */

/** Whether the gesture landed on something inside the dialog that scrolls in its own right. */
function overOwnScroller(root: HTMLElement, target: EventTarget | null): boolean {
	for (let element = target as HTMLElement | null; element && element !== root; ) {
		if (element instanceof HTMLElement) {
			const overflowY = getComputedStyle(element).overflowY;
			const scrolls = overflowY === 'auto' || overflowY === 'scroll';
			if (scrolls && element.scrollHeight > element.clientHeight) return true;
			element = element.parentElement;
		} else return false;
	}
	return false;
}

export function lockScroll(node: HTMLElement) {
	const refuse = (event: WheelEvent | TouchEvent) => {
		// A list inside the dialog is still the dialog: only what would move the page is refused.
		if (overOwnScroller(node, event.target)) return;
		event.preventDefault();
	};

	// Non passive on purpose: a passive listener is not allowed to refuse the scroll it was given.
	node.addEventListener('wheel', refuse, { passive: false });
	node.addEventListener('touchmove', refuse, { passive: false });

	return {
		destroy() {
			node.removeEventListener('wheel', refuse);
			node.removeEventListener('touchmove', refuse);
		}
	};
}
