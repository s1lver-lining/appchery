declare global {
	namespace App {
		interface PageState {
			/** Marks the spare history entry the shell parks over a page while a dialog is open. */
			spare?: boolean;
		}
	}

	/** File handling, which no TypeScript lib declares yet: the manifest claims .xlsx exports. */
	interface LaunchParams {
		files?: FileSystemFileHandle[];
	}

	interface LaunchQueue {
		setConsumer(consumer: (params: LaunchParams) => void): void;
	}
}

export {};
