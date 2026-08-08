/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * SQLite's OPFS backend requires the page to be cross-origin isolated.
 *
 * Vite's own `server.headers` is not enough here: SvelteKit's dev middleware
 * handles the HTML response itself and the headers never reach the document.
 * Setting them in middleware that runs first fixes both dev and preview.
 *
 * Production needs the same two headers from whatever serves the build, or the
 * web app silently falls back to an in-memory database. The native builds are
 * unaffected — they use platform SQLite, not OPFS.
 */
function crossOriginIsolation(): Plugin {
	const headers = {
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Embedder-Policy': 'require-corp'
	};
	const middleware = (_req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => {
		for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
		next();
	};

	return {
		name: 'appchery-cross-origin-isolation',
		// Braces matter: returning `server.middlewares.use(...)` hands Vite the
		// connect stack, which it then invokes as a post-configure hook.
		configureServer(server) {
			server.middlewares.use(middleware);
		},
		configurePreviewServer(server) {
			server.middlewares.use(middleware);
		}
	};
}

export default defineConfig({
	plugins: [crossOriginIsolation(), tailwindcss(), sveltekit()],
	// sqlite-wasm ships its own worker and .wasm; pre-bundling breaks their
	// relative resolution.
	optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
	worker: { format: 'es' },
	test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
