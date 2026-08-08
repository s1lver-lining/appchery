import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { SqlDriver } from './driver';

/**
 * iOS / Android driver: real native SQLite through Capacitor.
 *
 * Unlike the web driver this is always persistent, and it is not subject to the
 * storage-eviction rules that make browser persistence unreliable on iOS — which
 * is the main reason the app ships as a Capacitor shell rather than a plain PWA.
 */
export async function createNativeDriver(dbName = 'appchery'): Promise<SqlDriver> {
	const sqlite = new SQLiteConnection(CapacitorSQLite);
	const conn: SQLiteDBConnection = await sqlite.createConnection(
		dbName,
		false,
		'no-encryption',
		1,
		false
	);
	await conn.open();
	await conn.execute('PRAGMA foreign_keys = ON;');

	return {
		kind: 'native',
		persistent: true,
		async query(sql, params) {
			const result = await conn.query(sql, params as never[]);
			// Capacitor returns objects keyed by column name; sqlite-proxy wants
			// positional arrays, and object key order matches the SELECT order.
			return (result.values ?? []).map((row) => Object.values(row as object));
		},
		async exec(sql, params) {
			await conn.run(sql, (params ?? []) as never[], false);
		}
	};
}
