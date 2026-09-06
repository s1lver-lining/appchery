/**
 * The vision code, built for a browser, shared by the tools that serve it.
 *
 * The worker is a bundle of its own because esbuild does not rewrite `new Worker(new URL())`.
 */
import { build } from 'esbuild';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;

const cache = new Map();

async function bundle(entry) {
	if (cache.has(entry)) return cache.get(entry);
	const built = await build({
		entryPoints: [join(ROOT, entry)],
		bundle: true,
		format: 'esm',
		write: false
	});
	const text = built.outputFiles[0].text;
	cache.set(entry, text);
	return text;
}

/** The live path as the app runs it: page fit, worker fit, and the rebase between them. */
export const cameraBundle = () => bundle('src/lib/vision/camera-entry.ts');

/** The app's own detector thread, which the camera bundle is given the URL of. */
export const workerBundle = () => bundle('src/lib/vision/detector.worker.ts');

/** The single-scanner replay, which is what the labelling tool has always watched. */
export const replayBundle = () => bundle('src/lib/vision/video-entry.ts');

/** The still detector, for the frame being labelled. */
export const stillBundle = () => bundle('src/lib/vision/still-entry.ts');
