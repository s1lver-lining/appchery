/**
 * Finds the recorded scoring sessions, wherever in the corpus they have been put.
 *
 * Shared, because three tools ask the same question and they must agree about the answer. Each used
 * to read the top of the folder and nothing else, so a session dropped in as its own dated directory
 * was invisible to all of them at once: the labelling tool would not offer it, the harness did not
 * measure it, and neither said anything, because a corpus that has grown by nothing looks exactly like
 * one that was never looked in.
 *
 * One level down and no further. The corpus is sessions, and a session is a folder of ends or a run of
 * files at the top; nothing about it is a tree, and walking one would only find whatever else happened
 * to be lying about.
 */
import { readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

const VIDEO = /\.(webm|mp4|mov|mkv|m4v)$/i;

/**
 * Every recording under `root`, as the name a tool shows and the path it reads.
 *
 * The name is the file's own, without the folder it sits in. Recordings are named for the session and
 * the end and the moment they were taken, so they are already unique across the corpus, and it is the
 * name that a workspace folder and a labels file are keyed by. Putting a directory in it would have
 * moved every label that already exists.
 */
export async function listRecordings(root, only = null) {
	const found = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		if (entry.isFile() && VIDEO.test(entry.name)) {
			found.push({ name: entry.name, path: join(root, entry.name) });
			continue;
		}
		if (!entry.isDirectory()) continue;
		for (const inner of await readdir(join(root, entry.name), { withFileTypes: true })) {
			if (!inner.isFile() || !VIDEO.test(inner.name)) continue;
			found.push({ name: inner.name, path: join(root, entry.name, inner.name) });
		}
	}
	found.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	return only ? found.filter((r) => r.name.includes(only)) : found;
}

/** Where a recording's motion file would be, which exists only for the sessions recorded with one. */
export function motionPath(path) {
	return path.replace(VIDEO, '.motion.json');
}
