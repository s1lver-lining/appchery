/**
 * The one thing every platform must provide: run SQL, get rows back.
 *
 * Drizzle sits on top of this via its `sqlite-proxy` driver, so the query layer
 * is identical whether the statements are executed by SQLite compiled to WASM in
 * a browser tab or by native SQLite through Capacitor.
 */
export interface SqlDriver {
	/** Returns result rows as arrays of column values (what sqlite-proxy expects). */
	query(sql: string, params: unknown[]): Promise<unknown[][]>;
	/** Executes without returning rows. */
	exec(sql: string, params?: unknown[]): Promise<void>;
	/** Whether writes survive an app restart. False means an in-memory fallback. */
	readonly persistent: boolean;
	readonly kind: 'wasm-opfs' | 'wasm-memory' | 'native';
}
