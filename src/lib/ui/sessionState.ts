/**
 * A choice that lasts as long as the app is open and no longer.
 *
 * Which round of a bracket is on screen is that kind of choice: coming back to the same bracket a
 * minute later should land where it was left, and coming back to it next week should land on the
 * round being shot then rather than on a quarter final nobody is looking at any more. Session
 * storage says exactly that, and says it per tab, which is also right for something this small.
 */

export function readSession(key: string): string | null {
	try {
		return window.sessionStorage.getItem(key);
	} catch {
		// A browser refusing storage is a page that opens at its default, never a page that fails.
		return null;
	}
}

export function writeSession(key: string, value: string): void {
	try {
		window.sessionStorage.setItem(key, value);
	} catch {
		// Nothing to be done about it, and nothing worth breaking a page over.
	}
}
