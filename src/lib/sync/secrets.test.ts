import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The anon key is meant to ship and Row Level Security is what protects the data. A service role key
 * bypasses every policy in `supabase/migrations`, so one reaching a bundle would undo the whole of
 * doc/sync.md section 7 in a single line, and it would do so silently.
 */

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) walk(path, out);
		else if (/\.(ts|js|svelte|json|html)$/.test(entry)) out.push(path);
	}
	return out;
}

describe('the client never carries a service role key', () => {
	it('mentions service_role nowhere in src', () => {
		const offenders = walk('src')
			.filter((path) => !path.endsWith('secrets.test.ts'))
			.filter((path) => readFileSync(path, 'utf8').includes('service_role'));
		expect(offenders).toEqual([]);
	});

	/**
	 * A Supabase key is a JWT, and its middle segment names the role it grants. Decoding what the env
	 * files actually hold catches the paste that put the wrong key in the right variable, which
	 * reading the variable name never would.
	 */
	it('has only anon keys in the environment files', () => {
		for (const file of ['.env', '.env.preprod', '.env.production', '.env.example']) {
			if (!existsSync(file)) continue;

			for (const line of readFileSync(file, 'utf8').split('\n')) {
				const value = line.split('=').slice(1).join('=').trim();
				const segments = value.split('.');
				if (segments.length !== 3) continue;

				let claims: { role?: string };
				try {
					claims = JSON.parse(Buffer.from(segments[1], 'base64').toString());
				} catch {
					continue;
				}
				expect(`${file}: ${claims.role}`).not.toContain('service_role');
			}
		}
	});
});
