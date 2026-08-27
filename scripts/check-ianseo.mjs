/**
 * The ianseo screens, driven through the real pages against the pages ianseo really publishes.
 *
 * ianseo is answered from the fixtures in test/ianseo rather than over the network: a competition
 * that has moved on overnight would otherwise turn a regression into a mystery, and the point of
 * this check is the app, not the weather at somebody else's tournament.
 *
 * Usage: node scripts/check-ianseo.mjs [url]     (defaults to http://localhost:4180)
 * Serve the app first: `npx vite dev --port 4180`.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4180';
const SHOTS = 'test/pictures/ianseo';

/** The narrowest screen the app promises to work on, a normal phone, and a tablet. */
const WIDTHS = [
	{ name: 'narrow', width: 300, height: 720 },
	{ name: 'phone', width: 390, height: 844 },
	{ name: 'wide', width: 900, height: 900 }
];

const results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const fixture = (name) => readFileSync(`test/ianseo/${name}.html`, 'utf8');

/** The competitions open for entry, as Inscript'Arc listed them on the day the fixture was taken. */
function serveEntries(context) {
	return context.route('**/competitions-api/inscriptarc/**', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'text/html; charset=utf-8',
			body: readFileSync('test/inscriptarc/competitions.html', 'utf8')
		})
	);
}

/** ianseo, as it was on the day the fixtures were taken. */
function serveIanseo(context, state = {}) {
	return context.route('**/competitions-api/ianseo/**', (route) => {
		const url = new URL(route.request().url());
		const path = url.pathname.replace('/competitions-api/ianseo', '');
		let body = null;

		if (path === '/TourList.php') {
			body = fixture('TourList');
			// ianseo rebuilding a competition, which is the whole of what makes a result new.
			if (state.published) body = body.replace(/update">[^<]*</g, `update">${state.published}<`);
		}
		else if (path === '/Details.php') {
			const toId = url.searchParams.get('toId');
			body =
				toId === '29743'
					? fixture('Details-29743')
					: toId === '28536'
						? fixture('Details-28536')
						: fixture('Details');
		} else if (path.includes('/28536/ENA.php')) {
			// A French competition, whose columns ianseo heads in French and folds none of.
			body = fixture('ENA-fr');
		} else {
			const name = path.split('/').pop()?.replace('.php', '');
			try {
				body = fixture(name);
			} catch {
				body = null;
			}
		}

		if (body === null) return route.fulfill({ status: 404, body: 'no fixture' });
		route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
	});
}

/** Nothing on the page may reach past its own edge: a sideways scrollbar is the app being wrong. */
async function overflows(page) {
	return page.evaluate(() => {
		const wide = document.scrollingElement.scrollWidth > window.innerWidth + 1;
		const culprits = [...document.querySelectorAll('body *')]
			.filter((node) => node.getBoundingClientRect().right > window.innerWidth + 1)
			.filter((node) => !node.closest('.overflow-x-auto'))
			.slice(0, 3)
			.map((node) => `${node.tagName.toLowerCase()}.${(node.className || '').toString().split(' ')[0]}`);
		return { wide, culprits };
	});
}

/**
 * Waits until the page has stopped looking towns up. They are fetched one at a time with a pause
 * between, so a fixed sleep is a race the check loses whenever the machine is busy.
 */
async function settled(page) {
	// "Competitions within" shows both before the lookups begin and after they end, so it is not on
	// its own an answer. Quiet twice over, a breath apart, is.
	for (let quiet = 0, tries = 0; quiet < 2 && tries < 60; tries++) {
		const locating = await page.getByText(/Locating \d+ towns/).count();
		const done = await page.getByText(/Competitions within/).count();
		quiet = locating === 0 && done > 0 ? quiet + 1 : 0;
		await page.waitForTimeout(250);
	}
}

async function shot(page, name) {
	mkdirSync(SHOTS, { recursive: true });
	await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/**
 * A followed competition that ianseo has rebuilt since it was last opened says so, and stops saying
 * so once it has been. It is the one piece of state in the feature that spans three visits, and the
 * one that quietly did nothing at all until it was driven end to end.
 */
async function checkNewResults(browser) {
	const state = {};
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await serveIanseo(context, state);
	const page = await context.newPage();

	await page.goto(`${BASE}/ianseo/29775`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: /Follow this competition/i }).click();
	await page.waitForTimeout(250);

	await page.goto(`${BASE}/ianseo`, { waitUntil: 'networkidle' });
	await page.waitForSelector('a[href*="/ianseo/29775"]');
	check(
		'a competition just followed is not announced as new',
		(await page.getByText('New', { exact: true }).count()) === 0
	);

	// ianseo publishes something, and the archer reads the list again.
	state.published = 'Today 21:40';
	await page.getByRole('button', { name: /Refresh/i }).click();
	await page.waitForTimeout(800);
	check(
		'a competition rebuilt since it was read is announced as new',
		(await page.getByText('New', { exact: true }).count()) > 0
	);

	await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(400);
	check(
		'the home page carries the dot that leads to it',
		(await page.locator('a[href*="/ianseo"] span.bg-brand').count()) > 0
	);

	// Opening it is reading it, so it stops being new.
	await page.goto(`${BASE}/ianseo/29775`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(500);
	await page.goto(`${BASE}/ianseo`, { waitUntil: 'networkidle' });
	await page.waitForSelector('a[href*="/ianseo/29775"]');
	check(
		'a competition that has been opened stops being new',
		(await page.getByText('New', { exact: true }).count()) === 0
	);

	await context.close();
}

/**
 * ianseo unreachable, which at a shooting line is the normal case. What was read stays on screen and
 * says how old it is; a device that has never read anything says that instead of showing an empty page.
 */
async function checkOffline(browser) {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await serveIanseo(context);
	const page = await context.newPage();
	await page.goto(`${BASE}/ianseo`, { waitUntil: 'networkidle' });
	await page.waitForSelector('a[href*="/ianseo/"]');
	const before = await page.locator('a[href*="/ianseo/"]').count();

	await context.unroute('**/competitions-api/ianseo/**');
	await context.route('**/competitions-api/ianseo/**', (route) => route.abort());
	await page.getByRole('button', { name: /Refresh/i }).click();
	// The refresh has to have been tried and failed before the page can say so.
	await page
		.getByText(/could not be reached/i)
		.first()
		.waitFor({ state: 'visible', timeout: 20000 })
		.catch(() => {});

	check(
		'a list already read survives ianseo going away',
		(await page.locator('a[href*="/ianseo/"]').count()) === before
	);
	check(
		'and says so rather than passing itself off as current',
		await page.getByText(/could not be reached/i).first().isVisible()
	);
	await shot(page, 'offline-stale');
	await context.close();

	// A device that has never read anything has nothing to fall back on, and says that instead.
	const cold = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await cold.route('**/competitions-api/ianseo/**', (route) => route.abort());
	const empty = await cold.newPage();
	await empty.goto(`${BASE}/ianseo`, { waitUntil: 'networkidle' });
	// Waited for rather than slept on: the page has a database to open before it can fail to read.
	const retry = empty.getByRole('button', { name: /Try again/i });
	const offered = await retry
		.waitFor({ state: 'visible', timeout: 20000 })
		.then(() => true)
		.catch(() => false);
	check('a device with nothing read yet offers to try again', offered);
	check('and does not sit on an empty page', await empty.getByText(/could not be reached/i).first().isVisible());
	await shot(empty, 'offline-cold');
	await cold.close();
}

/**
 * The same screens in French, at the width that fits least. French is longer than English almost
 * everywhere, and a chip that fits one word and not the other is a layout that was only half tested.
 */
async function checkFrench(browser) {
	const context = await browser.newContext({
		viewport: { width: 300, height: 720 },
		locale: 'fr-FR'
	});
	await serveIanseo(context);
	const page = await context.newPage();
	await page.addInitScript(() => window.localStorage.setItem('appchery.locale', 'fr'));

	await page.goto(`${BASE}/ianseo`, { waitUntil: 'networkidle' });
	await page.waitForSelector('a[href*="/ianseo/"]');
	// The heading itself, not whatever else says the word: the header carries a second copy of the
	// title that only shows once the page is scrolled, and which of the two came first was luck.
	check(
		'French: the competition list reads',
		await page.getByRole('heading', { name: 'Compétitions' }).first().isVisible()
	);
	check('French: the list stays inside the screen', !(await overflows(page)).wide);
	await shot(page, 'french-list');

	await page.goto(`${BASE}/ianseo/26053/IQRM`, { waitUntil: 'networkidle' });
	await page.waitForSelector('table tbody tr');
	await page.locator('table tbody tr button[aria-expanded]').first().click();
	await page.waitForTimeout(200);
	check('French: an opened row offers the archer', await page.getByRole('button', { name: /^Suivre DUCROCQ Tanguy/ }).isVisible());
	check('French: the result stays inside the screen', !(await overflows(page)).wide, JSON.stringify((await overflows(page)).culprits));
	await shot(page, 'french-result');

	// The entry links are the platform's own words, and French is the one language they are already in.
	await serveEntries(context);
	await page.goto(`${BASE}/ianseo`, { waitUntil: 'networkidle' });
	await page.getByText('Inscriptions ouvertes').first().waitFor({ timeout: 20000 }).catch(() => {});
	check(
		'French: the entry links read in French',
		(await page.getByRole('link', { name: 'Inscription', exact: true }).count()) > 0
	);
	check(
		'French: and a competition says its dates the French way',
		(await page.getByText(/\d+ [a-zéû]+\.? \d{4}/).count()) > 0
	);
	await shot(page, 'french-entries');

	await page.goto(`${BASE}/tricks`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(300);
	check('French: the tricks page carries the competition tricks', await page.getByText(/La recherche va au delà/).isVisible());
	await context.close();
}

/**
 * Distance. The archer's position is granted to the browser and the geocoder answers from a table
 * here, so the check measures the app rather than the weather over somebody else's town.
 */
async function checkDistance(browser) {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		permissions: ['geolocation'],
		// Rennes, which the fixture has a competition near and several thousand kilometres from.
		geolocation: { latitude: 48.1111, longitude: -1.6743 }
	});
	await serveIanseo(context);

	// Towns, as the geocoder would give them back. Anything not named here comes back unknown.
	const TOWNS = {
		crispiano: { country: 'Italy', latitude: 40.6038, longitude: 17.2329 },
		jakarta: { country: 'Indonesia', latitude: -6.2146, longitude: 106.8451 },
		rennes: { country: 'France', latitude: 48.1111, longitude: -1.6743 }
	};
	let lookups = 0;
	await context.route('**/geocoding-api.open-meteo.com/**', (route) => {
		lookups++;
		const name = (new URL(route.request().url()).searchParams.get('name') ?? '').toLowerCase();
		const town = TOWNS[name];
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ results: town ? [{ ...town, name }] : [] })
		});
	});

	const page = await context.newPage();
	await page.goto(`${BASE}/ianseo`, { waitUntil: 'networkidle' });
	await page.waitForSelector('a[href*="/ianseo/"]');
	const all = await page.locator('a[href*="/ianseo/"]').count();

	check('no town is looked up until distance is asked for', lookups === 0);

	await page.getByRole('button', { name: /Near me/ }).click();
	await page.getByRole('button', { name: /Within 25 km/ }).click();
	// Waited on rather than slept through: the towns are looked up one at a time, on purpose.
	await settled(page);

	check('asking for distance looks the towns up', lookups > 0, `${lookups} lookups`);
	const near = await page.locator('a[href*="/ianseo/"]').count();
	check('a radius drops what is beyond it', near < all, `${near} of ${all}`);
	check(
		'and drops the competition on the other side of the world',
		(await page.getByText(/SATRIA LEGAWA/).count()) === 0
	);
	await shot(page, 'distance');

	// Widening it brings back what the tighter radius had cut.
	await page.getByRole('button', { name: /Within 25 km/ }).click();
	await page.getByRole('button', { name: /Within 500 km/ }).click();
	await settled(page);
	check(
		'widening the radius brings competitions back',
		(await page.locator('a[href*="/ianseo/"]').count()) >= near
	);

	// A second visit must not ask again: a town does not move.
	const before = lookups;
	// Every state the page passes through, not just the one it settles on: a filter applied a moment
	// late shows the whole world and then takes it away, which is a flicker nothing can catch after.
	await page.addInitScript(() => {
		window.__everShown = false;
		const watch = () => {
			if (document.body?.textContent?.includes('SATRIA LEGAWA')) window.__everShown = true;
		};
		// Started once there is a document to watch: this runs before the page has one.
		const start = () =>
			new MutationObserver(watch).observe(document.documentElement, {
				subtree: true,
				childList: true,
				characterData: true
			});
		if (document.documentElement) start();
		else document.addEventListener('DOMContentLoaded', start);
	});
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForSelector('a[href*="/ianseo/"]');
	await settled(page);
	check(
		'a reopened list arrives narrowed rather than flickering through the whole world',
		(await page.evaluate(() => window.__everShown)) === false
	);
	check('a town already located is never looked up twice', lookups === before, `${lookups - before} extra`);

	// Searching reaches past the distance filter unless it is told not to.
	await page.getByPlaceholder(/Search every competition/i).fill('jakarta');
	await page.waitForTimeout(400);
	check('a search reaches past the radius', (await page.getByText(/SATRIA LEGAWA/).count()) > 0);
	await shot(page, 'search-scope');

	await page.getByRole('button', { name: /^What I follow$/ }).click();
	await page.waitForTimeout(400);
	check(
		'and stays inside it when told to',
		(await page.getByText(/SATRIA LEGAWA/).count()) === 0
	);
	check('the list stays inside the screen with distance on', !(await overflows(page)).wide);

	await context.close();
}

/**
 * Opening one document while another is still being read. SvelteKit keeps the same component for two
 * documents of the same competition, so the slow read lands in a screen that has moved on: without a
 * guard it painted the first document's rows under the second one's name.
 */
async function checkStaleRead(browser) {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await serveIanseo(context);
	// The first document answers slowly, the second at once, so the wrong one would arrive last.
	await context.route('**/competitions-api/ianseo/TourData/**/IQRM.php', async (route) => {
		await new Promise((wake) => setTimeout(wake, 2500));
		route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture('IQRM') });
	});

	const page = await context.newPage();
	await page.goto(`${BASE}/ianseo/26053/IC`, { waitUntil: 'networkidle' });
	await page.waitForSelector('table tbody tr');

	/**
	 * Moved between the two documents the way the app moves: a link, followed by the router, which
	 * changes the address without rebuilding the screen. Loading the address afresh would rebuild it
	 * and throw the slow read away with it, which is the one case that was never in danger.
	 */
	const hop = async (to) => {
		await page.evaluate((href) => {
			const link = document.createElement('a');
			link.href = href;
			link.id = 'hop';
			link.textContent = 'hop';
			// Given a size and put on top, because a link with neither is not a link anybody can click.
			link.setAttribute('style', 'position:fixed;top:0;left:0;z-index:9999;padding:8px;background:#fff');
			document.body.append(link);
		}, to);
		await page.locator('#hop').click();
		await page.evaluate(() => document.querySelector('#hop')?.remove());
	};

	await hop('/ianseo/26053/IQRM');
	await page.waitForTimeout(300);
	await hop('/ianseo/26053/IC');
	await page.waitForSelector('table tbody tr');
	await page.waitForTimeout(3500);

	const heading = await page.locator('h1').first().innerText();
	check('a slow read never lands on the document that replaced it', /Class & Division/i.test(heading), heading);
	check(
		'and the rows on screen are the ones its own title names',
		(await page.getByText('Recurve - Men [After 60 Arrows]').count()) > 0
	);
	await context.close();
}

/**
 * The way in to a competition. The links belong to somebody else's platform, so what is checked here
 * is that the app offers them where they belong and nowhere else.
 */
async function checkEntries(browser) {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await serveIanseo(context);
	await serveEntries(context);
	const page = await context.newPage();

	await page.goto(`${BASE}/ianseo`, { waitUntil: 'networkidle' });
	await page.waitForSelector('a[href*="/ianseo/"]');
	await page.getByText('Open for entry').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});

	// The platform publishes its links in French; the app says what they are for in its own language.
	const forms = await page.getByRole('link', { name: 'Enter', exact: true }).count();
	check('what is open for entry is offered', forms > 5, `${forms} entry forms`);
	check(
		'and says what each link is for in the language the app is in',
		(await page.getByRole('link', { name: 'Who has entered' }).count()) > 0
	);
	check(
		'and every way in leaves the app rather than pretending to be part of it',
		(await page.locator('a[target="_blank"][href*="inscriptarc.fr"]').count()) > 0
	);
	check('the list stays inside the screen with the entry forms on it', !(await overflows(page)).wide);
	await shot(page, 'entries');

	// A search is about competitions, so the entry forms step out of the way rather than pad it out.
	await page.getByPlaceholder(/Search every competition/i).fill('mediterranean');
	await page.waitForTimeout(400);
	check(
		'and they stand aside for a search',
		(await page.getByRole('link', { name: 'Enter', exact: true }).count()) === 0
	);

	await context.close();
}

/**
 * The day ianseo rearranges a page. What matters is that the app says which of the two things went
 * wrong: a range with no signal, which waiting fixes, or a page this build can no longer read, which
 * waiting never fixes. And that whatever could still be read is still on screen.
 */
async function checkUnreadable(browser) {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	/** The markup rearranged: still plainly a results page, no longer one this build can read. */
	const rearrange = (html) => html.replace(/<t([dhr])\b/g, '<x$1').replace(/<\/t([dhr])>/g, '</x$1>');

	let mangle = false;
	await context.route('**/competitions-api/ianseo/**', (route) => {
		const url = new URL(route.request().url());
		const path = url.pathname.replace('/competitions-api/ianseo', '');
		let body =
			path === '/TourList.php'
				? fixture('TourList')
				: path === '/Details.php'
					? fixture('Details')
					: null;
		if (body === null) {
			const name = path.split('/').pop()?.replace('.php', '');
			try {
				body = fixture(name);
			} catch {
				body = null;
			}
		}
		if (body === null) return route.fulfill({ status: 404, body: 'no fixture' });
		route.fulfill({
			status: 200,
			contentType: 'text/html; charset=utf-8',
			body: mangle && path.includes('IQRM') ? rearrange(body) : body
		});
	});

	const page = await context.newPage();
	mangle = true;
	await page.goto(`${BASE}/ianseo/26053/IQRM`, { waitUntil: 'networkidle' });
	await page.getByText(/has changed/i).waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});

	check(
		'a page ianseo has rearranged is named as that, not as a network failure',
		await page.getByText('This page of ianseo has changed').isVisible()
	);
	check(
		'and the archer is not told to try again later, which would not help',
		(await page.getByText(/could not be reached/i).count()) === 0
	);
	await shot(page, 'unreadable');

	// What was read before it changed is still worth showing, and still says how old it is.
	mangle = false;
	await page.getByRole('button', { name: /Try again/i }).click();
	await page.waitForSelector('table tbody tr', { timeout: 20000 });
	mangle = true;
	await page.getByRole('button', { name: /Refresh/i }).click();
	await page.waitForTimeout(1500);

	check(
		'what was read before the page changed stays on screen',
		(await page.locator('table tbody tr').count()) > 3
	);
	check(
		'and says the page has changed rather than that it could not be reached',
		(await page.getByText(/ianseo has changed this page/i).count()) > 0
	);
	await shot(page, 'unreadable-stale');

	/**
	 * A page only half rearranged, which is the likelier accident. What can be read is read, and the
	 * page says outright that some of it could not be, rather than quietly showing a shorter list.
	 */
	await context.unroute('**/competitions-api/ianseo/**');
	await context.route('**/competitions-api/ianseo/**', (route) => {
		const path = new URL(route.request().url()).pathname.replace('/competitions-api/ianseo', '');
		let body = path === '/Details.php' ? fixture('Details') : null;
		if (path.includes('IQRM')) {
			// Two archers' lines left unreadable, out of a list of seven.
			body = fixture('IQRM').replace(/<td class="text-right">58[13]<\/td>/g, '<td class="text-right">581');
		}
		if (body === null) return route.fulfill({ status: 404, body: 'no fixture' });
		route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
	});

	await page.getByRole('button', { name: /Refresh/i }).click();
	await page.waitForTimeout(1500);
	check(
		'a page only half readable says so rather than quietly showing less',
		await page.getByText(/could not be read/i).first().isVisible()
	);
	check(
		'and still shows the lines it could read',
		(await page.locator('table tbody tr').count()) > 2
	);
	await shot(page, 'partial');
	await context.close();
}

/**
 * A document in the organiser's own language, with five columns and no hint from ianseo about which
 * of them a phone should drop. What matters is that an archer still gets a line each.
 */
async function checkForeignColumns(browser) {
	for (const size of [{ name: 'narrow', width: 300 }, { name: 'phone', width: 390 }]) {
		const context = await browser.newContext({ viewport: { width: size.width, height: 800 } });
		await serveIanseo(context);
		const page = await context.newPage();
		await page.goto(`${BASE}/ianseo/28536/ENA`, { waitUntil: 'networkidle' });
		await page.waitForSelector('table tbody tr');

		// The archer's own column is the one allowed to wrap, whatever language it is headed in.
		const heads = (await page.locator('table').first().locator('thead th:visible').allInnerTexts())
			.map((one) => one.trim())
			.filter(Boolean);
		check(`${size.name}: a French document keeps its narrow columns narrow`, heads.length <= 3, heads.join('/'));
		check(`${size.name}: and leads with the archer`, /athl/i.test(heads[0] ?? ''), heads[0]);

		/** One archer, one line: the row is no taller than a single line of text needs. */
		const tall = await page.evaluate(() => {
			const rows = [...document.querySelectorAll('table')][0]
				? [...document.querySelectorAll('table')[0].querySelectorAll('tbody tr')].filter(
						(r) => !r.querySelector('td[colspan]')
					)
				: [];
			const heights = rows.map((r) => r.getBoundingClientRect().height);
			return { worst: Math.max(...heights), rows: heights.length };
		});
		check(`${size.name}: one archer takes one line`, tall.worst < 56, `tallest ${Math.round(tall.worst)}px`);
		check(`${size.name}: the French list stays inside the screen`, !(await overflows(page)).wide);
		await shot(page, `french-columns-${size.name}`);
		await context.close();
	}
}

/**
 * Tapping a search result. The field has focus, so the layout has parked a spare history entry to
 * catch the back key; the tap blurs the field and navigates in one gesture, and the blur used to
 * reclaim that entry before the navigation had begun, killing it. The archer tapped a competition
 * and stayed on the list.
 */
async function checkSearchResultOpens(browser) {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await serveIanseo(context);
	const page = await context.newPage();

	await page.goto(`${BASE}/ianseo`, { waitUntil: 'networkidle' });
	await page.waitForSelector('a[href*="/ianseo/"]');
	await page.getByPlaceholder(/Search every competition/i).fill('mediterranean');
	await page.waitForTimeout(400);

	const card = page.locator('a[href*="/ianseo/"]').first();
	const wanted = (await card.getAttribute('href')) ?? '';
	await card.click();
	await page.waitForTimeout(2000);
	check(
		'a search result opens the competition it names',
		page.url().includes(wanted.split('?')[0]),
		page.url().replace(BASE, '')
	);

	// And the way back is still the search that found it.
	await page.goBack();
	await page.waitForSelector('a[href*="/ianseo/"]', { timeout: 20000 });
	check('and going back lands on the list again', page.url().replace(BASE, '').startsWith('/ianseo'));

	/**
	 * Back with the cursor in a field leaves the page, the way the hardware key does on a phone. It
	 * used to be swallowed to mean "I am done typing", and that is what killed the tap above.
	 */
	await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
	await page.getByRole('link', { name: /Competitions/ }).click();
	await page.waitForSelector('a[href*="/ianseo/"]', { timeout: 20000 });
	await page.getByPlaceholder(/Search every competition/i).click();
	await page.waitForTimeout(400);
	await page.goBack();
	await page.waitForTimeout(1200);
	check(
		'back with the cursor in the search leaves the page, as the back key does',
		page.url().replace(BASE, '') === '/',
		page.url().replace(BASE, '')
	);

	// And a sheet still swallows it, which is what the spare entry is actually for.
	await page.goBack().catch(() => {});
	await page.goto(`${BASE}/ianseo`, { waitUntil: 'networkidle' });
	await page.waitForSelector('a[href*="/ianseo/"]');
	await page.getByRole('button', { name: /Add a country/i }).click();
	await page.waitForTimeout(500);
	await page.goBack();
	await page.waitForTimeout(900);
	check(
		'back closes an open sheet without leaving the page',
		(await page.locator('[role="dialog"]').count()) === 0 &&
			page.url().replace(BASE, '').startsWith('/ianseo')
	);

	await context.close();
}

/**
 * Looking for one archer in a list of three hundred, and deciding what a result shows. Both live on
 * the line above the table, which scrolls away with it rather than sitting over it.
 */
async function checkDocumentTools(browser) {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await serveIanseo(context);
	const page = await context.newPage();
	await page.goto(`${BASE}/ianseo/28536/ENA`, { waitUntil: 'networkidle' });
	await page.waitForSelector('table tbody tr');
	const all = await page.locator('table tbody tr').count();

	await page.getByPlaceholder(/Find an archer/i).fill('cadiot');
	await page.waitForTimeout(400);
	const found = await page.locator('table tbody tr').count();
	check('a document can be searched for one archer', found > 0 && found < all, `${found} of ${all}`);
	check('and says how many lines it left', await page.getByText(/\d+ lines/).isVisible());

	await page.getByPlaceholder(/Find an archer/i).fill('nobody at all');
	await page.waitForTimeout(400);
	check(
		'a search that finds nobody says so rather than looking empty',
		await page.getByText(/Nobody by that name/).isVisible()
	);
	await page.getByPlaceholder(/Find an archer/i).fill('');
	await page.waitForTimeout(300);

	// The cross belongs to the app; the browser's own is hidden so there are never two of them.
	await page.getByPlaceholder(/Find an archer/i).fill('cadiot');
	await page.waitForTimeout(200);
	await page.locator('input[type="search"] ~ button').first().click();
	await page.waitForTimeout(300);
	check(
		'the cross empties the search',
		(await page.getByPlaceholder(/Find an archer/i).inputValue()) === ''
	);

	/**
	 * A start list opens with the two columns that tell one line from the next, and the row opens onto
	 * everything the document holds: what a column choice decides is what fits across a line, never
	 * what the archer is allowed to read.
	 */
	const headings = () => page.locator('table').first().locator('thead th:visible').allInnerTexts();
	const opens = (await headings()).map((one) => one.trim()).filter(Boolean);
	check('a start list opens with the target and the archer', opens.join('/') === 'ATHLÈTE/CIBLE', opens.join('/'));

	await page.locator('table tbody tr button[aria-expanded]').first().click();
	await page.waitForTimeout(300);
	const drawer = await page.locator('table tbody dl').first().innerText();
	check(
		'and the row opens onto every column the document holds',
		['Athlète', 'Cible', 'Clubs / Pays', 'Epreuve', 'Départ'].every((one) => drawer.includes(one)),
		drawer.replace(/\n/g, ' ').slice(0, 80)
	);
	await page.locator('table tbody tr button[aria-expanded]').first().click();
	await page.waitForTimeout(200);

	// A column asked for joins the table, and is remembered for every list that has one.
	await page.getByRole('button', { name: /Columns/i }).click();
	await page.waitForTimeout(400);
	await page.getByRole('switch', { name: 'Clubs / Pays' }).click();
	await page.waitForTimeout(400);
	check(
		'a column asked for joins the table',
		(await headings()).join('/').includes('CLUBS / PAYS')
	);
	await page.getByRole('switch', { name: 'Clubs / Pays' }).click();
	await page.waitForTimeout(400);
	// The sheet stays open between changes, so it is closed before anything else is reached for.
	await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click();
	await page.waitForTimeout(400);

	// Columns: switched off here, and gone from the table until switched back on.
	const before = (await headings()).join('/');
	await page.getByRole('button', { name: /Columns/i }).click();
	await page.waitForTimeout(400);
	await page.getByRole('switch', { name: 'Cible' }).click();
	await page.waitForTimeout(400);
	const after = (await headings()).join('/');
	check('a column switched off leaves the table', before.includes('CIBLE') && !after.includes('CIBLE'), after);

	// And it is remembered, because the next result list has the same headings on it.
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForSelector('table tbody tr');
	check(
		'and stays off when the document is opened again',
		!(await headings()).join('/').includes('CIBLE')
	);

	await page.getByRole('button', { name: /Columns/i }).click();
	await page.waitForTimeout(400);
	await page.getByRole('switch', { name: 'Cible' }).click();
	await page.waitForTimeout(400);
	check('and comes back when switched on', (await headings()).join('/').includes('CIBLE'));
	await shot(page, 'document-tools');
	await context.close();
}

/** A competition with ninety documents on it is looked through rather than read. */
async function checkCompetitionSearch(browser) {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await serveIanseo(context);
	const page = await context.newPage();
	await page.goto(`${BASE}/ianseo/26053`, { waitUntil: 'networkidle' });
	await page.waitForSelector('a[href*="/ianseo/26053/"]');
	const all = await page.locator('a[href*="/ianseo/26053/"]').count();

	await page.getByPlaceholder(/Find a document/i).fill('compound');
	await page.waitForTimeout(400);
	const found = await page.locator('a[href*="/ianseo/26053/"]').count();
	check('a competition can be searched for a class', found > 0 && found < all, `${found} of ${all}`);
	check('and says how many documents it left', await page.getByText(/\d+ documents/).isVisible());
	await context.close();
}

/**
 * Handing a competition to somebody standing next to you, and naming a club the way people say it.
 */
async function checkShareAndClubs(browser) {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await serveIanseo(context);
	const page = await context.newPage();

	await page.goto(`${BASE}/ianseo/26053`, { waitUntil: 'networkidle' });
	await page.waitForSelector('a[href*="/ianseo/26053/"]');
	await page.getByRole('button', { name: /Share this competition/i }).click();
	await page.waitForTimeout(500);

	const label = await page.getByRole('img').last().getAttribute('aria-label');
	check(
		'a competition can be handed over as a code',
		label === 'https://app.appchery.com/ianseo/26053',
		label ?? ''
	);
	check(
		'and the address is written out for anybody who would rather type it',
		await page.getByText('app.appchery.com/ianseo/26053').isVisible()
	);
	await shot(page, 'share');
	await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click();
	await page.waitForTimeout(300);

	// Clubs: the name on its own by default, the federation's number behind the setting.
	await page.goto(`${BASE}/ianseo/28536/ENA`, { waitUntil: 'networkidle' });
	await page.waitForSelector('table tbody tr');
	await page.getByRole('button', { name: /Columns/i }).click();
	await page.waitForTimeout(400);
	await page.getByRole('switch', { name: 'Clubs / Pays' }).click();
	await page.waitForTimeout(400);
	await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click();
	await page.waitForTimeout(400);

	const club = () => page.locator('table tbody tr').first().locator('td').nth(2).innerText();
	check('a club is named on its own', (await club()).trim() === 'JUSSY', (await club()).trim());

	await page.getByRole('button', { name: /Columns/i }).click();
	await page.waitForTimeout(400);
	await page.getByRole('switch', { name: /Club numbers/i }).click();
	await page.waitForTimeout(400);
	await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click();
	await page.waitForTimeout(400);
	check(
		'and carries its federation number when that is asked for',
		(await club()).trim() === '0702022 - JUSSY',
		(await club()).trim()
	);

	// The row holds the whole of it whichever way the setting is left.
	await page.locator('table tbody tr button[aria-expanded]').first().click();
	await page.waitForTimeout(300);
	check(
		'and the row holds the whole of it either way',
		(await page.locator('table tbody dl').first().innerText()).includes('0702022 - JUSSY')
	);
	await shot(page, 'club-names');
	await context.close();
}

async function run() {
	const browser = await chromium.launch();

	for (const size of WIDTHS) {
		const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
		await serveIanseo(context);
		const page = await context.newPage();

		// The competitions page, which is the whole of ianseo narrowed to what an archer follows.
		await page.goto(`${BASE}/ianseo`, { waitUntil: 'networkidle' });
		await page.waitForSelector('a[href*="/ianseo/"]', { timeout: 15000 });
		const listed = await page.locator('a[href*="/ianseo/"]').count();
		check(`${size.name}: the competition list fills`, listed > 5, `${listed} rows`);
		check(`${size.name}: the list stays inside the screen`, !(await overflows(page)).wide, JSON.stringify((await overflows(page)).culprits));
		await shot(page, `${size.name}-list`);

		// Searching is asked of the whole of ianseo, not of what the filters left on screen.
		await page.getByPlaceholder(/Search every competition/i).fill('mediterranean');
		await page.waitForTimeout(150);
		const found = await page.locator('a[href*="/ianseo/"]').count();
		check(`${size.name}: search narrows the list`, found > 0 && found < listed, `${found} rows`);
		await page.getByPlaceholder(/Search every competition/i).fill('');

		// One competition, and the documents it has published.
		await page.goto(`${BASE}/ianseo/26053`, { waitUntil: 'networkidle' });
		await page.waitForSelector('a[href*="/IQRM"]', { timeout: 15000 });
		const documents = await page.locator('a[href*="/ianseo/26053/"]').count();
		check(`${size.name}: the competition lists its documents`, documents > 8, `${documents} documents`);
		check(`${size.name}: the competition stays inside the screen`, !(await overflows(page)).wide);
		await shot(page, `${size.name}-competition`);

		// Following it, which is what the page is opened twice for.
		await page.getByRole('button', { name: /Follow this competition/i }).click();
		await page.waitForTimeout(250);
		check(
			`${size.name}: following a competition sticks`,
			await page.getByRole('button', { name: /Stop following this competition/i }).isVisible()
		);

		// A result list, redrawn from ianseo's own table.
		await page.goto(`${BASE}/ianseo/26053/IQRM`, { waitUntil: 'networkidle' });
		await page.waitForSelector('table tbody tr', { timeout: 15000 });
		const rows = await page.locator('table tbody tr').count();
		check(`${size.name}: the result list fills`, rows >= 7, `${rows} rows`);
		check(`${size.name}: the result list stays inside the screen`, !(await overflows(page)).wide, JSON.stringify((await overflows(page)).culprits));
		await shot(page, `${size.name}-result`);

		// Opening a row gives back the columns a narrow screen folded away.
		await page.locator('table tbody tr button[aria-expanded]').first().click();
		await page.waitForTimeout(200);
		const opened = await page.locator('button[aria-expanded="true"]').count();
		check(`${size.name}: a result row opens`, opened === 1);
		const follow = page.getByRole('button', { name: /^Follow DUCROCQ Tanguy/ });
		check(`${size.name}: an opened row offers the archer`, await follow.isVisible());
		await shot(page, `${size.name}-result-open`);

		await follow.click();
		await page.waitForTimeout(250);
		check(
			`${size.name}: following an archer sticks`,
			await page.getByRole('button', { name: /Stop following DUCROCQ Tanguy/ }).isVisible()
		);

		// A bracket, which is the other shape ianseo publishes anything in.
		await page.goto(`${BASE}/ianseo/29743/IBBM`, { waitUntil: 'networkidle' });
		await page.waitForSelector('button[aria-pressed]', { timeout: 15000 });
		const rounds = await page.locator('button[aria-pressed]').count();
		check(`${size.name}: the bracket lists its rounds`, rounds >= 5, `${rounds} rounds`);
		const names = await page.locator('p:has-text("Hijamad Nusuningsih")').count();
		check(`${size.name}: the bracket names both sides`, names > 0);
		check(`${size.name}: the bracket stays inside the screen`, !(await overflows(page)).wide, JSON.stringify((await overflows(page)).culprits));
		await shot(page, `${size.name}-bracket`);

		await page.locator('button[aria-pressed]').last().click();
		await page.waitForTimeout(200);
		check(`${size.name}: the final can be opened`, (await page.locator('.rounded-2xl').count()) > 0);
		await shot(page, `${size.name}-bracket-final`);

		await context.close();
	}

	await checkNewResults(browser);
	await checkOffline(browser);
	await checkFrench(browser);
	await checkDistance(browser);
	await checkStaleRead(browser);
	await checkEntries(browser);
	await checkUnreadable(browser);
	await checkForeignColumns(browser);
	await checkSearchResultOpens(browser);
	await checkDocumentTools(browser);
	await checkCompetitionSearch(browser);
	await checkShareAndClubs(browser);

	await browser.close();

	const failed = results.filter((one) => !one.ok);
	console.log(`\n${results.length - failed.length}/${results.length} passed`);
	process.exit(failed.length === 0 ? 0 : 1);
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
