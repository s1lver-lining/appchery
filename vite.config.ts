/// <reference types="vitest/config" />
import basicSsl from '@vitejs/plugin-basic-ssl';
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

/**
 * Cross-origin isolation only takes effect in a secure context, and `localhost` is the only
 * insecure origin browsers exempt. A phone opening the LAN address over plain HTTP therefore gets
 * no OPFS and an in-memory database, so `dev.sh --ssl` and `run.sh --ssl` set this to serve a
 * self-signed cert instead. It stays opt-in because the cert has to be accepted by hand on every
 * device, and because a cert error still blocks Chrome's install prompt.
 */
const ssl = process.env.APPCHERY_SSL === '1';

export default defineConfig({
	plugins: [crossOriginIsolation(), ...(ssl ? [basicSsl()] : []), tailwindcss(), sveltekit()],
	// sqlite-wasm ships its own worker and .wasm; pre-bundling breaks their
	// relative resolution.
	optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
	worker: { format: 'es' },
	test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
