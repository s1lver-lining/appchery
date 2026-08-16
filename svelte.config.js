import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

/**
 * How many commits the tree being built has behind it: monotonic, and it names exactly the code
 * that was deployed, which a timestamp does not. A source tree with no git history falls back to
 * the clock, because the number's only other job is to be different from the last one.
 */
function buildNumber() {
	try {
		return execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return String(Math.floor(Date.now() / 1000));
	}
}

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		// No SSR: the app must boot with no network, and Capacitor serves it
		// from the local filesystem. `fallback` makes it a true SPA.
		adapter: adapter({ fallback: 'index.html', strict: false }),
		// Read back by the about section and by the service worker, which names its cache after it.
		version: { name: `${pkg.version}+${buildNumber()}` }
	}
};
