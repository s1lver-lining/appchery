import type { Config } from 'drizzle-kit';

// `drizzle-kit generate` produces SQL from schema.ts. Copy the generated
// statements into src/lib/db/migrations.ts as a new array: the app applies
// migrations from bundled strings, since a webview has no filesystem.
export default {
	schema: './src/lib/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite'
} satisfies Config;
