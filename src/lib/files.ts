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

/** Where `saveFile` leaves things on a phone, so the app can say so rather than leave you hunting. */
export function savedLocation(): 'documents' | 'download' {
	return Capacitor.isNativePlatform() ? 'documents' : 'download';
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
