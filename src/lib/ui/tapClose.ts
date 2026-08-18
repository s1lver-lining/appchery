/**
 * Closes an overlay on a tap of its scrim, and only on a tap that began there.
 *
 * An overlay can open under a finger already down: a long press, or the tab bar, which moves on the
 * press rather than on the release. On touch the click ending that press is aimed at whatever is on
 * top by then, which is the scrim that was not there when the finger landed. Taking it would shut a
 * question nobody has read yet.
 */
export function tapClose(node: HTMLElement, close: () => void) {
	let began = false;
	let act = close;
	const down = () => (began = true);
	const up = () => {
		if (!began) return;
		began = false;
		act();
	};
	node.addEventListener('pointerdown', down);
	node.addEventListener('click', up);
	return {
		update: (next: () => void) => (act = next),
		destroy: () => {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('click', up);
		}
	};
}
