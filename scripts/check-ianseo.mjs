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
function serveIanseo(context) {
	return context.route('**/ianseo-api/**', (route) => {
		const url = new URL(route.request().url());
		const path = url.pathname.replace('/ianseo-api', '');
		let body = null;

		if (path === '/TourList.php') body = fixture('TourList');
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

	await browser.close();

	const failed = results.filter((one) => !one.ok);
	console.log(`\n${results.length - failed.length}/${results.length} passed`);
	process.exit(failed.length === 0 ? 0 : 1);
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
