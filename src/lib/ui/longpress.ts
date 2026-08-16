// The press that means "this one, and others like it", shared by every list worked on as a selection.

const HOLD_MS = 450;
/** Past this the finger is scrolling the list, not holding a row in it. */
const SLOP = 10;

export function longpress(node: HTMLElement, onhold: () => void) {
	let current = onhold;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let from: { x: number; y: number } | null = null;
	/** Set while the hold has fired, so the click that follows the release opens nothing. */
	let held = false;

	const cancel = () => {
		if (timer) clearTimeout(timer);
		timer = null;
		from = null;
	};

	const onDown = (event: PointerEvent) => {
		if (event.button !== 0) return;
		from = { x: event.clientX, y: event.clientY };
		held = false;
		timer = setTimeout(() => {
			held = true;
			current();
		}, HOLD_MS);
	};

	const onMove = (event: PointerEvent) => {
		if (!from) return;
		if (Math.abs(event.clientX - from.x) > SLOP || Math.abs(event.clientY - from.y) > SLOP) cancel();
	};

	const onClick = (event: MouseEvent) => {
		if (!held) return;
		held = false;
		// The row is already selected, so letting the link through would open what was just picked.
		event.preventDefault();
		event.stopPropagation();
	};

	const onMenu = (event: Event) => {
		event.preventDefault();
		cancel();
		current();
	};

	// iOS answers a held link with its own preview card, which would come up over the selection.
	node.style.setProperty('-webkit-touch-callout', 'none');

	node.addEventListener('pointerdown', onDown);
	node.addEventListener('pointermove', onMove);
	node.addEventListener('pointerup', cancel);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('pointerleave', cancel);
	node.addEventListener('click', onClick, true);
	node.addEventListener('contextmenu', onMenu);

	return {
		update(next: () => void) {
			current = next;
		},
		destroy() {
			cancel();
			node.removeEventListener('pointerdown', onDown);
			node.removeEventListener('pointermove', onMove);
			node.removeEventListener('pointerup', cancel);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('pointerleave', cancel);
			node.removeEventListener('click', onClick, true);
			node.removeEventListener('contextmenu', onMenu);
		}
	};
}
