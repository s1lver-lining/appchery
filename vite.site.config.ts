import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The app's own icons, taken from static/ rather than copied into the repository a second time. */
function appIcons(): Plugin {
	const files = ['favicon.svg', 'icon-192.png', 'icon-512.png'];
	return {
		name: 'appchery-site-icons',
		closeBundle() {
			for (const file of files) copyFileSync(`static/${file}`, `build-site/${file}`);
		}
	};
}

/**
 * The landing page, built apart from the app it advertises.
 *
 * Its own Vite project rather than a route of the app: appchery.com must serve this page and
 * nothing else. An OPFS database belongs to one origin, so an app reachable there would quietly
 * hand anybody who landed on it a second, empty database, and none of their sessions would be on
 * the address the poster names.
 *
 * It shares the app's components through the same `$lib` alias, so the curves and target faces on
 * the page are the ones the app draws rather than pictures of them.
 */
export default defineConfig({
	root: 'site',
	plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() }), appIcons()],
	resolve: {
		alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) }
	},
	// Two entries so /terms/ is a real page on a static host, with no rewrite rule to configure.
	build: {
		outDir: '../build-site',
		emptyOutDir: true,
		rollupOptions: {
			input: {
				main: fileURLToPath(new URL('./site/index.html', import.meta.url)),
				terms: fileURLToPath(new URL('./site/terms/index.html', import.meta.url))
			}
		}
	}
});
