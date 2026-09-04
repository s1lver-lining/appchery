#!/usr/bin/env node
/**
 * Renders the landing page's HTML at build time, into the files the client build just wrote.
 *
 * The page is a Svelte app with an empty `<div id="site">`, which is all a crawler that does not
 * run JavaScript ever sees: no headline, no copy, nothing to index. Google renders JS on a second
 * pass, but Bing, the social unfurlers and the AI crawlers largely do not, so the page has to
 * arrive already written.
 *
 * Done here rather than by a framework: appchery.com is static files on FTP, so there is no server
 * to render on, and the site is a plain Vite project rather than SvelteKit. Vite's own SSR module
 * loader compiles the same components a second time for the server, so the markup is generated
 * from the components themselves rather than kept as a copy that would drift from them.
 */
import { createServer } from 'vite';
import { render } from 'svelte/server';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}build-site`;

/** The pages to write, each named by the component it renders and the file the build left for it. */
const PAGES = [
	{ module: '/App.svelte', html: `${OUT}/index.html` },
	{ module: '/terms/Terms.svelte', html: `${OUT}/terms/index.html` }
];

// Production, so the components compile without Svelte's dev-time instrumentation: it expects a
// component context that only exists inside a running app, and there is none out here. The plugin
// reads this rather than the mode, so it has to be set on the environment.
process.env.NODE_ENV ??= 'production';

const vite = await createServer({
	configFile: `${root}vite.site.config.ts`,
	server: { middlewareMode: true },
	appType: 'custom'
});

try {
	for (const page of PAGES) {
		const { default: Component } = await vite.ssrLoadModule(page.module);
		const { body, head } = render(Component);

		const shell = await readFile(page.html, 'utf8');
		const written = shell
			.replace('<div id="site"></div>', `<div id="site">${body}</div>`)
			.replace('</head>', `${head}</head>`);

		if (written === shell) throw new Error(`${page.html}: no <div id="site"> to render into`);
		await writeFile(page.html, written);
		console.log(`  prerendered ${page.html.slice(OUT.length + 1)}`);
	}
} finally {
	await vite.close();
}
