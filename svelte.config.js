import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		// No SSR: the app must boot with no network, and Capacitor serves it
		// from the local filesystem. `fallback` makes it a true SPA.
		adapter: adapter({ fallback: 'index.html', strict: false })
	}
};
