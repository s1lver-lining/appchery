#!/usr/bin/env node
/**
 * Renders the landing page's HTML at build time, once per language, into build-site/.
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
 *
 * Each language gets its own address, and the head of every page is rewritten to say so: the title
 * and description in the language of the page, a canonical pointing at itself, and the alternates
 * that tell a search engine the two are the same page rather than duplicates of each other.
 *
 * The robots and sitemap files are written here too, from the same list of pages: a sitemap kept by
 * hand is one that still names a page after the page is gone.
 */
import { createServer } from 'vite';
import { render } from 'svelte/server';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}build-site`;

/** The components to render, and the file the client build left as each one's shell. */
const PAGES = {
	home: { module: '/App.svelte', shell: `${OUT}/index.html`, meta: 'site.meta' },
	terms: { module: '/terms/Terms.svelte', shell: `${OUT}/terms/index.html`, meta: 'terms.meta' }
};

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
	const { LOCALES, locale, t } = await vite.ssrLoadModule('$lib/i18n');
	const { ORIGIN, path } = await vite.ssrLoadModule('/lib/routes.ts');

	/** The paths actually written, which is what the sitemap lists. */
	const written = [];

	for (const [page, { module, shell, meta }] of Object.entries(PAGES)) {
		const { default: Component } = await vite.ssrLoadModule(module);
		const source = await readFile(shell, 'utf8');

		for (const code of LOCALES) {
			// The store is read as the components render, so it is set first and the render below is
			// synchronous: nothing else can be rendering between the two.
			locale.set(code);
			const translate = get(t);
			const { body, head } = render(Component);

			const alternates = LOCALES.map(
				(other) => `\t\t<link rel="alternate" hreflang="${other}" href="${ORIGIN}${path(other, page)}" />`
			).join('\n');

			const html = source
				.replace('<html lang="en"', `<html lang="${code}"`)
				.replace(/<title>[^<]*<\/title>/, `<title>${escape(translate(`${meta}.title`))}</title>`)
				.replace(
					/<meta\s+name="description"[\s\S]*?\/>/,
					`<meta name="description" content="${escape(translate(`${meta}.description`))}" />`
				)
				.replace(
					/<link rel="canonical"[^>]*\/>/,
					`<link rel="canonical" href="${ORIGIN}${path(code, page)}" />\n${alternates}\n\t\t<link rel="alternate" hreflang="x-default" href="${ORIGIN}${path('en', page)}" />`
				)
				.replace('<div id="site"></div>', `<div id="site">${body}</div>`)
				.replace('</head>', `${head}</head>`);

			if (html === source) throw new Error(`${shell}: nothing to rewrite`);

			const file = `${OUT}${path(code, page)}index.html`;
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, html);
			console.log(`  prerendered ${file.slice(OUT.length + 1)}`);
			written.push(path(code, page));
		}
	}

	// No lastmod: it would be the day of the build rather than the day the page changed, and a date
	// that moves every deploy is one a crawler learns to ignore.
	const urls = written
		.map((at) => `\t<url>\n\t\t<loc>${ORIGIN}${at}</loc>\n\t</url>`)
		.join('\n');
	await writeFile(
		`${OUT}/sitemap.xml`,
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
	);
	console.log('  wrote sitemap.xml');

	// Everything on this host is the landing page, so there is nothing to disallow. The file is here
	// to carry the sitemap: without it a crawler only ever finds the pages it is linked to.
	await writeFile(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
	console.log('  wrote robots.txt');
} finally {
	await vite.close();
}

/** The value a Svelte store holds right now, outside a component that could subscribe to it. */
function get(store) {
	let value;
	store.subscribe((current) => (value = current))();
	return value;
}

function escape(text) {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
