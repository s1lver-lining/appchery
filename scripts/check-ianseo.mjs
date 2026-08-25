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
			body = toId === '29743' ? fixture('Details-29743') : fixture('Details');
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
	check('French: the competition list reads', await page.getByText('Compétitions').first().isVisible());
	check('French: the list stays inside the screen', !(await overflows(page)).wide, JSON.stringify((await overflows(page)).culprits));
	await shot(page, 'french-list');

	await page.goto(`${BASE}/ianseo/26053/IQRM`, { waitUntil: 'networkidle' });
	await page.waitForSelector('table tbody tr');
	await page.locator('table tbody tr button[aria-expanded]').first().click();
	await page.waitForTimeout(200);
	check('French: an opened row offers the archer', await page.getByRole('button', { name: /^Suivre DUCROCQ Tanguy/ }).isVisible());
	check('French: the result stays inside the screen', !(await overflows(page)).wide, JSON.stringify((await overflows(page)).culprits));
	await shot(page, 'french-result');

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
	await page.getByText(/Competitions within/).waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
	await page.waitForTimeout(1500);

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
	await page.waitForTimeout(1200);
	check(
		'widening the radius brings competitions back',
		(await page.locator('a[href*="/ianseo/"]').count()) >= near
	);

	// A second visit must not ask again: a town does not move.
	const before = lookups;
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForSelector('a[href*="/ianseo/"]');
	await page.waitForTimeout(1500);
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

	await browser.close();

	const failed = results.filter((one) => !one.ok);
	console.log(`\n${results.length - failed.length}/${results.length} passed`);
	process.exit(failed.length === 0 ? 0 : 1);
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
