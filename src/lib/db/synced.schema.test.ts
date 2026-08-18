import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { getTableColumns } from 'drizzle-orm';
import { OWNED_TABLES, LOCAL_ONLY_COLUMNS, type OwnedTableName } from './synced';

/**
 * The client schema and the server schema are written by hand, in two languages, and drift between
 * them reaches an archer as a permission or a not null error. `scripts/check-sql.sh` applies the
 * server migrations to a throwaway Postgres, dumps its columns, and points this at them.
 */

const dump = process.env.APPCHERY_SERVER_COLUMNS;

interface Column {
	nullable: boolean;
	hasDefault: boolean;
}

/** Written by the server and never sent: the pull cursor is its own to stamp. */
const SERVER_OWNED = new Set(['server_updated_at']);

function serverColumns(path: string): Map<string, Map<string, Column>> {
	const tables = new Map<string, Map<string, Column>>();
	for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
		const [table, column, nullable, hasDefault] = line.split(',');
		if (!tables.has(table)) tables.set(table, new Map());
		tables.get(table)!.set(column, { nullable: nullable === 'YES', hasDefault: hasDefault === 'YES' });
	}
	return tables;
}

// `runIf` skips the tests but still runs this body to collect them, so the dump is read inside
// them rather than here: without `check-sql.sh` there is no file to read and collection would throw.
describe.runIf(dump && existsSync(dump))('the two schemas agree', () => {
	let server: Map<string, Map<string, Column>>;
	beforeAll(() => {
		server = serverColumns(dump!);
	});

	for (const { name, table } of OWNED_TABLES) {
		const skip = new Set(LOCAL_ONLY_COLUMNS[name as OwnedTableName] ?? []);
		const sent = Object.entries(getTableColumns(table))
			.filter(([property]) => !skip.has(property))
			.map(([, column]) => column.name);

		it(`${name} takes everything the client sends`, () => {
			const columns = server.get(name);
			expect(columns, `the server has no ${name}`).toBeDefined();
			expect(sent.filter((column) => !columns!.has(column))).toEqual([]);
		});

		it(`${name} asks for nothing the client withholds`, () => {
			const columns = server.get(name)!;
			const required = [...columns]
				.filter(([column, shape]) => !sent.includes(column) && !SERVER_OWNED.has(column))
				.filter(([, shape]) => !shape.nullable && !shape.hasDefault)
				.map(([column]) => column);
			expect(required).toEqual([]);
		});
	}
});
