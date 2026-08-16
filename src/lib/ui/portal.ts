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
