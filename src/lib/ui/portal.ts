/**
 * Moving an element out to the body.
 *
 * The main pages live inside the pager, and the pager's panes are transformed so they can slide.
 * A transform makes its element the containing block for everything `fixed` inside it, so a dialog
 * that means "cover the screen" ends up covering the pane's own box, anchored to the top of the
 * scrolled content: the archer sees the page dimmed down to where the fold was and bright below it,
 * and the dialog itself sits wherever the scroll happened to leave it.
 *
 * Nothing about a dialog belongs to the page it was opened from, so it is moved to the body, where
 * `fixed` means what it says. Svelte still owns the node and still removes it on destroy.
 */
export function portal(node: HTMLElement) {
	const target = typeof document === 'undefined' ? null : document.body;
	target?.appendChild(node);

	return {
		destroy() {
			node.remove();
		}
	};
}

/**
 * The same move for a bar that belongs to its page after all: shown only while the place it came
 * from is. Tabs and pager panes that are off screen are still rendered, just marked inert, and a
 * bar moved out of one would otherwise float over whichever page is actually showing.
 */
export function portalWhileShown(node: HTMLElement) {
	const anchor = node.parentElement;
	const follow = () => (node.hidden = !!anchor?.closest('[inert]'));
	follow();
	portal(node);
	const watch = new MutationObserver(follow);
	watch.observe(document.body, { attributes: true, attributeFilter: ['inert'], subtree: true });

	return {
		destroy() {
			watch.disconnect();
			node.remove();
		}
	};
}
