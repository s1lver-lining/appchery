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
		else if (/\.(ts|js|mjs|svelte|json|toml|html|sh)$/.test(entry)) out.push(path);
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
		for (const file of readdirSync('.').filter((name) => name.startsWith('.env'))) {
			for (const line of readFileSync(file, 'utf8').split('\n')) {
				for (const claims of tokensIn(line)) {
					expect(`${file}: ${claims.role}`).not.toContain('service_role');
				}
			}
		}
	});

	/**
	 * The word check above is about the client bundle, where `service_role` has no business appearing
	 * at all. This one is about the rest of the repository, which is going public: the deployed
	 * function, the deploy and evaluation scripts, and the server configuration are all places a key
	 * is easier to paste than into `src`, and the Cloudflare function is where one would actually work.
	 *
	 * Decoded rather than matched, because a key is a JWT and nothing about it says "secret": the
	 * server configuration names the role in a comment, which is not a key and must not read as one.
	 */
	it('carries no privileged key anywhere else that ships', () => {
		const roots = ['functions', 'scripts', 'supabase', 'static'].filter((dir) => existsSync(dir));
		const files = [
			...roots.flatMap((dir) => walk(dir)),
			...readdirSync('.').filter((name) => /\.(ts|js|mjs|json|toml|html|sh)$/.test(name))
		];

		const offenders = files.filter((path) =>
			tokensIn(readFileSync(path, 'utf8')).some((claims) => claims.role && claims.role !== 'anon')
		);
		expect(offenders).toEqual([]);
	});
});

/** Every JWT payload in a piece of text, so a key is judged by what it grants rather than by where it sits. */
function tokensIn(text: string): { role?: string }[] {
	const found: { role?: string }[] = [];
	for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\./g)) {
		try {
			found.push(JSON.parse(Buffer.from(match[1], 'base64url').toString()));
		} catch {
			// Three dot separated words that are not a token. Nothing to judge.
		}
	}
	return found;
}
