import { writable } from 'svelte/store';

/**
 * The strip that follows a deletion. It replaces asking first: a dialog makes every delete cost two
 * taps whether or not it was a mistake, and this one costs one tap and stays wrong for six seconds.
 * Only the last deletion is offered back, because a queue of them is a thing to manage rather than a
 * way out.
 */
export interface Undoable {
	message: string;
	label: string;
	undo: () => Promise<void> | void;
}

const HOLD_MS = 6000;

export const undoable = writable<Undoable | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

export function offerUndo(entry: Undoable) {
	if (timer) clearTimeout(timer);
	undoable.set(entry);
	timer = setTimeout(() => undoable.set(null), HOLD_MS);
}

export function dismissUndo() {
	if (timer) clearTimeout(timer);
	timer = null;
	undoable.set(null);
}
