import { dimStatusBar, overrideStatusBar } from '$lib/theme';

/**
 * Put on the sheet of black a dialog lays over the page. The status bar is above that sheet and not
 * under it, so it has to be darkened by hand or the phone keeps a bright strip over a dimmed app.
 * The alpha is the one the element's own class paints with, so the two never disagree.
 */
export function scrim(_node: HTMLElement, alpha = 0.4) {
	let undo = dimStatusBar(alpha);
	return {
		update(next: number = 0.4) {
			undo();
			undo = dimStatusBar(next);
		},
		destroy() {
			undo();
		}
	};
}

/**
 * Put on a pane that covers the whole screen with a colour of its own. Without it the bar keeps
 * wearing the band of the page underneath, which the pane has just covered up.
 */
export function ownsStatusBar(_node: HTMLElement, colour = '--c-bg') {
	let undo = overrideStatusBar(colour);
	return {
		update(next: string = '--c-bg') {
			undo();
			undo = overrideStatusBar(next);
		},
		destroy() {
			undo();
		}
	};
}
