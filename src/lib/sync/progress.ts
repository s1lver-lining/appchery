import { writable } from 'svelte/store';

// How far the running exchange or server action has got. Kept apart so a page can show it without loading sync.

export interface SyncProgress {
	step: 'push' | 'pull' | 'reown' | 'empty';
	done: number;
	total: number;
	/** Rows brought down so far: the server never says how many are coming, only the tables are known. */
	received?: number;
}

export const syncProgress = writable<SyncProgress | null>(null);
