// A choice remembered only as long as the app stays open, such as which round of a bracket is shown.

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
