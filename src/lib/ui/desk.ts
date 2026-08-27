import { readable } from 'svelte/store';

/** The width at which the rail appears and the app stops being a phone. Matches `lg:` in the markup. */
export const DESK_QUERY = '(min-width: 64rem)';

/**
 * Whether there is room for the desk layout. Watched rather than read once, because a window is
 * resized and a tablet is turned, and a deck that laid itself out for a phone would stay that way.
 *
 * Server side it answers false, so the phone layout is what gets rendered before hydration: it is
 * the one that survives being wrong, since a narrow layout in a wide window merely wastes room
 * while a wide one in a narrow window overflows it.
 */
export const isDesk = readable(false, (set) => {
	if (typeof window === 'undefined' || !window.matchMedia) return;
	const query = window.matchMedia(DESK_QUERY);
	set(query.matches);
	const onChange = (event: MediaQueryListEvent) => set(event.matches);
	query.addEventListener('change', onChange);
	return () => query.removeEventListener('change', onChange);
});
