declare global {
	namespace App {
		interface PageState {
			/** Marks the spare history entry the shell parks over a page while a dialog is open. */
			spare?: boolean;
		}
	}
}

export {};
