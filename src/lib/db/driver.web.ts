import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm';
import { base } from '$app/paths';
import type { SqlDriver } from './driver';

/**
 * Browser driver: official SQLite compiled to WASM, running in a Worker.
 *
 * The Worker is not optional. OPFS persistence uses synchronous access handles, which are only
 * available off the main thread, and the worker also keeps queries off the UI thread.
 *
 * OPFS additionally requires cross-origin isolation (the COOP/COEP headers from vite.config.ts).
 * Where that is missing the database still works but lives only in memory, surfaced through
 * `persistent: false` so the UI can warn rather than losing a session's scores on reload.
 */
/**
 * The worker rejects with its plain response object, not an Error, so `.message` is undefined and
 * `String(reason)` renders "[object Object]" — which is what the failure banner used to show.
 */
function workerMessage(reason: unknown): string {
	if (reason instanceof Error) return reason.message;
	if (reason && typeof reason === 'object') {
		const response = reason as { result?: { message?: string }; message?: string };
		const message = response.result?.message ?? response.message;
		if (message) return message;
		try {
			return JSON.stringify(reason);
		} catch {
			// Circular response objects are not worth a second attempt; the class name still helps.
			return Object.prototype.toString.call(reason);
		}
	}
	return String(reason);
}

export async function createWebDriver(filename = 'appchery.db'): Promise<SqlDriver> {
	type Promiser = (type: string, args: unknown) => Promise<unknown>;

	// The promiser resolves itself: `onready` fires once the worker has booted, and the value it
	// hands back is the function created on the line above.
	const promiser = await new Promise<Promiser>((resolve) => {
		const p: Promiser = sqlite3Worker1Promiser({
			onready: () => resolve(p),
			/**
			 * The worker is loaded from a copy in `static/sqlite/` rather than through the bundler.
			 * SQLite resolves its own `.wasm` and OPFS proxy relative to the worker script, and those
			 * runtime paths do not survive Vite's asset hashing: the built app 404s on sqlite3.wasm
			 * and never opens a database.
			 */
			worker: () => new Worker(`${base}/sqlite/sqlite3-worker1.mjs`, { type: 'module' })
		});
	});

	// Ask for OPFS explicitly, and fall back to the default VFS if the worker cannot provide it.
	// The worker reports back whether the database it opened actually persists.
	type OpenResult = { result?: { persistent?: boolean } };

	const opened = (await promiser('open', { filename: `file:${filename}?vfs=opfs` }).catch(
		(opfsReason) =>
			// Both attempts failing is the one case the UI cannot recover from, so carry each reason
			// into the message: OPFS and the in-memory fallback fail for different causes, and knowing
			// which one gave up first is the whole diagnosis.
			promiser('open', { filename }).catch((memoryReason) => {
				throw new Error(
					`SQLite could not open a database. OPFS: ${workerMessage(opfsReason)}. ` +
						`In-memory fallback: ${workerMessage(memoryReason)}.`
				);
			})
	)) as unknown as OpenResult;

	const persistent = opened.result?.persistent === true;

	if (!persistent) {
		console.warn(
			'[appchery] OPFS unavailable — the database is in-memory and will not survive a reload. ' +
				'This usually means the page is not cross-origin isolated (COOP/COEP headers missing).'
		);
	}

	async function run(sql: string, params: unknown[], wantRows: boolean): Promise<unknown[][]> {
		const response = (await promiser('exec', {
			sql,
			bind: params.length ? params : undefined,
			rowMode: 'array',
			...(wantRows ? { resultRows: [] } : {})
		})) as unknown as { result?: { resultRows?: unknown[][] } };
		return response.result?.resultRows ?? [];
	}

	await run('PRAGMA foreign_keys = ON;', [], false);
	// A commit otherwise flushes the OPFS file, which Firefox charges milliseconds for. NORMAL cannot
	// corrupt the database: at worst a power loss costs the last transaction.
	await run('PRAGMA synchronous = NORMAL;', [], false);

	return {
		kind: persistent ? 'wasm-opfs' : 'wasm-memory',
		persistent,
		query: (sql, params) => run(sql, params, true),
		exec: async (sql, params) => {
			await run(sql, params ?? [], false);
		}
	};
}
