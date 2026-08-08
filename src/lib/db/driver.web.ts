import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm';
import type { SqlDriver } from './driver';

/**
 * Browser driver: official SQLite compiled to WASM, running in a Worker.
 *
 * The Worker is not optional. OPFS persistence uses synchronous access handles,
 * which are only available off the main thread — a main-thread `OpfsDb` silently
 * degrades to an in-memory database. The worker also keeps queries off the UI
 * thread, which matters when a session accumulates a few hundred arrows.
 *
 * OPFS additionally requires cross-origin isolation (the COOP/COEP headers from
 * vite.config.ts). Where that is missing the database still works but lives only
 * in memory, surfaced through `persistent: false` so the UI can warn rather than
 * losing a session's scores on reload.
 */
export async function createWebDriver(filename = 'appchery.db'): Promise<SqlDriver> {
	type Promiser = (type: string, args: unknown) => Promise<unknown>;

	// The promiser resolves itself: `onready` fires once the worker has booted,
	// and the value it hands back is the function created on the line above.
	const promiser = await new Promise<Promiser>((resolve) => {
		const p: Promiser = sqlite3Worker1Promiser({ onready: () => resolve(p) });
	});

	// Ask for OPFS explicitly, and fall back to the default VFS if the worker
	// cannot provide it. The worker reports back whether the database it opened
	// actually persists — feature-detecting from the main thread proves nothing
	// about what the worker managed to do, and silently accepting a transient
	// database is exactly the failure that needs surfacing.
	type OpenResult = { result?: { persistent?: boolean } };

	const opened = (await promiser('open', { filename: `file:${filename}?vfs=opfs` }).catch(() =>
		promiser('open', { filename })
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

	return {
		kind: persistent ? 'wasm-opfs' : 'wasm-memory',
		persistent,
		query: (sql, params) => run(sql, params, true),
		exec: async (sql, params) => {
			await run(sql, params ?? [], false);
		}
	};
}
