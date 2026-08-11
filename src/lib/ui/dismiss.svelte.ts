import { registerBackGuard } from '$lib/nav';

/**
 * Wires the hardware back key to whatever is open on top of the page.
 *
 * A dialog is a place to the archer: pressing back inside one means "close this", never "leave the
 * page it opened from". Guards stack, so the innermost thing on screen answers first.
 *
 * Call it once per dismissable thing, at the top level of a component.
 */
export function closeOnBack(isOpen: () => boolean, close: () => void) {
	$effect(() => {
		if (!isOpen()) return;
		return registerBackGuard(() => {
			close();
			return true;
		});
	});
}
