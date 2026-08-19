import { Capacitor } from '@capacitor/core';

/**
 * Getting a file out of the app and somewhere the archer can reach it.
 *
 * On the web an anchor with a download attribute is all it takes. Inside the Android and iOS shells it
 * does nothing at all: the web view has no download manager behind it, so the file is written into a
 * blob URL that nobody can open and then thrown away. Scoring videos and database backups both went
 * that way, silently, which is the worst kind of failure for something whose whole job is to hand you
 * a file.
 *
 * On a phone the file is written to the app's documents directory and then offered to the share sheet,
 * which is how anything leaves a phone: to Files, to Drive, to a mail, to a cable. Nothing is uploaded
 * anywhere by this app; the share sheet is the archer choosing where it goes.
 */
export async function saveFile(blob: Blob, filename: string, title: string): Promise<void> {
	if (!Capacitor.isNativePlatform()) {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		// Revoked late: revoking immediately cancels the download in some browsers.
		setTimeout(() => URL.revokeObjectURL(url), 10000);
		return;
	}

	// Imported here so the browser build never pulls the native plugins in.
	const { Filesystem, Directory } = await import('@capacitor/filesystem');
	const { Share } = await import('@capacitor/share');

	const { uri } = await Filesystem.writeFile({
		path: filename,
		data: await toBase64(blob),
		directory: Directory.Documents,
		recursive: true
	});

	try {
		await Share.share({ title, url: uri });
	} catch {
		// The archer dismissing the share sheet is not a failure: the file is already on the device.
	}
}

/**
 * Handing a file to another app rather than to storage. The browser share sheet takes files
 * directly where it exists; everywhere else this falls back to saving, which on a phone opens the
 * system share sheet anyway. Nothing is uploaded by this app either way.
 */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<void> {
	const file = new File([blob], filename, { type: blob.type });
	if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file], title });
			return;
		} catch (error) {
			// Dismissing the sheet is not a failure, and there is nothing left to fall back to.
			if (error instanceof DOMException && error.name === 'AbortError') return;
		}
	}
	await saveFile(blob, filename, title);
}

/** Folder inside the phone's documents directory that shared cards are written to. */
export const CARDS_FOLDER = 'Appchery/cards';

/**
 * Putting a file on the device and saying where it went, with no share sheet in the way. Saving and
 * sharing are two different intentions, and a sheet in front of a save is a question nobody asked.
 */
export async function storeFile(blob: Blob, filename: string, folder: string): Promise<string> {
	if (!Capacitor.isNativePlatform()) {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
		return 'the browser download folder';
	}

	const { Filesystem, Directory } = await import('@capacitor/filesystem');
	await Filesystem.writeFile({
		path: `${folder}/${filename}`,
		data: await toBase64(blob),
		directory: Directory.Documents,
		recursive: true
	});
	return `Documents/${folder}`;
}

/** Folder inside the phone's documents directory that scoring videos are kept in. */
export const RECORDINGS_FOLDER = 'Appchery/recordings';

/**
 * Where recordings are written, as a path to show the archer. There is nothing to click here: the
 * files are meant to be fetched later over a cable or through the phone's own file manager, so what
 * is needed is somewhere predictable and a way to say where that is.
 */
export function recordingsPath(): string {
	return Capacitor.isNativePlatform()
		? `Documents/${RECORDINGS_FOLDER}`
		: 'the browser download folder';
}

/**
 * Puts a scoring video where it can be found again, and returns the file name it was stored under.
 *
 * Deliberately not the share sheet. A share sheet interrupts the end that has just been shot, and it
 * is the wrong shape for this anyway: recordings pile up over a session and get collected afterwards,
 * rather than being sent one at a time.
 */
/**
 * Saves how the phone was held, beside the video it belongs to and named after it. Written only when
 * the device actually had the sensors, so nothing empty is left next to a recording.
 */
export async function storeMotion(motion: string, filename: string): Promise<void> {
	const name = `${filename.replace(/\.[^.]+$/, '')}.motion.json`;
	if (!Capacitor.isNativePlatform()) {
		const url = URL.createObjectURL(new Blob([motion], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = name;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
		return;
	}

	const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
	await Filesystem.writeFile({
		path: `${RECORDINGS_FOLDER}/${name}`,
		data: motion,
		directory: Directory.Documents,
		encoding: Encoding.UTF8,
		recursive: true
	});
}

export async function storeRecording(video: Blob, filename: string): Promise<string> {
	if (!Capacitor.isNativePlatform()) {
		const url = URL.createObjectURL(video);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
		return filename;
	}

	const { Filesystem, Directory } = await import('@capacitor/filesystem');
	await Filesystem.writeFile({
		path: `${RECORDINGS_FOLDER}/${filename}`,
		data: await toBase64(video),
		directory: Directory.Documents,
		recursive: true
	});
	return filename;
}

/**
 * Base64 for the Filesystem plugin, which takes a string rather than bytes. Done through FileReader
 * because a video is tens of megabytes and building the string by hand blows the call stack.
 */
function toBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error);
		reader.onload = () => {
			const result = String(reader.result);
			resolve(result.slice(result.indexOf(',') + 1));
		};
		reader.readAsDataURL(blob);
	});
}
