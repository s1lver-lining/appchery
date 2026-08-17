/**
 * Two browsers, one archer, one server: the multi-device case the app exists for, driven through the
 * real screens rather than through the client library.
 *
 * Playwright contexts have their own storage, so A and B are two devices with two OPFS databases and
 * two signed in sessions. What this proves is what no unit test can: that an outing recorded on one
 * phone reaches the other, that an edit travels back, and that the app goes on working with the
 * network switched off.
 *
 * Usage: node scripts/check-browser.mjs [url]     (defaults to http://127.0.0.1:4173)
 * Serve the app against a project first: `npx vite dev --mode preprod --port 4173`.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const ACCOUNT = { email: 'appchery.browser@example.com', password: 'appchery-browser-pw' };
const PHONE = { width: 390, height: 844 };

const results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/**
 * The account exists before the browser opens, so a failed sign in in the UI means the sign in is
 * broken rather than the fixture missing. One fixed account, reused every run.
 */
async function ensureAccount(envFile = '.env.preprod') {
	if (!existsSync(envFile)) return;
	const env = Object.fromEntries(
		readFileSync(envFile, 'utf8')
			.split('\n')
			.filter((line) => line.includes('='))
			.map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
	);
	if (!env.PUBLIC_SUPABASE_URL || !env.PUBLIC_SUPABASE_ANON_KEY) return;

	const client = createClient(env.PUBLIC_SUPABASE_URL, env.PUBLIC_SUPABASE_ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const { data } = await client.auth.signInWithPassword(ACCOUNT);
	if (!data?.session) {
		const { error } = await client.auth.signUp(ACCOUNT);
		if (error) throw new Error(`could not create the browser check account: ${error.message}`);
		return;
	}

	// Each run records outings. Clearing them first keeps one account with a handful of rows rather
	// than a project that grows a little every time somebody runs the checks.
	const id = data.session.user.id;
	for (const table of ['shot', 'round_end', 'activity', 'session']) {
		await client.from(table).delete().eq('user_id', id);
	}
}

await ensureAccount();

const browser = await chromium.launch();

/**
 * The pager keeps the neighbouring pages mounted, so a button's text matches several times over,
 * most of them parked off screen. This taps the one the archer can actually see.
 */
async function tap(page, text) {
	const openedMenu = await page.evaluate((wanted) => {
		/*
		 * Matched on the label as well as the text, because several buttons lose their words once the
		 * screen has content: "New session" becomes a round icon carrying only an aria-label.
		 *
		 * That icon opens a menu whose first item is called the same thing, so a plain item is
		 * preferred over the opener, and when only the opener is there the caller taps again to reach
		 * the item it revealed. Clicking an opener and stopping looks exactly like a click that failed.
		 */
		const candidates = [...document.querySelectorAll('button,a,[role=button],[role=menuitem]')].filter(
			(el) => el.textContent.trim() === wanted || el.getAttribute('aria-label') === wanted
		);
		const onScreen = candidates.filter((el) => {
			const box = el.getBoundingClientRect();
			return box.width > 0 && box.left >= 0 && box.left < window.innerWidth;
		});
		const target = onScreen.find((el) => !el.getAttribute('aria-haspopup')) ?? onScreen[0];
		if (!target) throw new Error(`no visible "${wanted}"`);
		target.click();
		return target.getAttribute('aria-haspopup') === 'menu';
	}, text);

	await page.waitForTimeout(700);
	if (openedMenu) {
		await page.evaluate((wanted) => {
			const item = [...document.querySelectorAll('button,a,[role=menuitem]')]
				.filter((el) => el.textContent.trim() === wanted && !el.getAttribute('aria-haspopup'))
				.find((el) => {
					const box = el.getBoundingClientRect();
					return box.width > 0 && box.left >= 0 && box.left < window.innerWidth;
				});
			if (item) item.click();
		}, text);
		await page.waitForTimeout(700);
	}
}

/**
 * The bottom bar specifically. "Settings" is also the name of a tab inside a session, and tapping
 * that when you meant the app's settings leaves you on a page that looks almost right.
 */
async function tapNav(page, text) {
	await page.evaluate((wanted) => {
		const link = [...document.querySelectorAll('nav a, nav button')].find(
			(el) => el.textContent.trim() === wanted || el.getAttribute('aria-label') === wanted
		);
		if (!link) throw new Error(`no "${wanted}" in the navigation bar`);
		link.click();
	}, text);
	await page.waitForTimeout(1200);
}

async function device(label) {
	const context = await browser.newContext({ viewport: PHONE });
	const page = await context.newPage();
	page.on('pageerror', (error) => console.log(`  [${label}] page error: ${error.message}`));
	return { context, page, label };
}

/**
 * The settings screen, on its data tab. Retried rather than timed: a tab that has not been painted
 * yet is not a failure, and offline the page can take a moment longer to settle.
 */
async function openDataTab(page) {
	for (let attempt = 0; attempt < 10; attempt++) {
		// Looked for on screen, not in the DOM: the pager keeps every tab mounted, so the words of a
		// tab nobody is looking at are present the whole time.
		const done = await page.evaluate(() => {
			const onScreen = (el) => {
				const box = el.getBoundingClientRect();
				return box.width > 0 && box.left >= 0 && box.left < window.innerWidth;
			};
			const email = [...document.querySelectorAll('input[type=email]')].some(onScreen);
			const signedIn = [...document.querySelectorAll('p')].some((el) => onScreen(el) && el.textContent.includes('Signed in as'));
			return email || signedIn;
		});
		if (done) return true;
		await tap(page, 'Data').catch(() => {});
		await page.waitForTimeout(800);
	}
	return false;
}

async function accountCard({ page }) {
	await page.goto(`${BASE}/settings`);
	await page.waitForSelector('nav', { timeout: 30000 });
	await page.waitForTimeout(800);
	if (!(await openDataTab(page))) throw new Error('the settings data tab never appeared');
}

async function signIn({ page, label }) {
	await page.locator('input[type=email]:visible').first().fill(ACCOUNT.email);
	await page.locator('input[type=password]:visible').first().fill(ACCOUNT.password);
	await tap(page, 'Sign in');

	const ok = await page
		.waitForSelector(`text=Signed in as ${ACCOUNT.email}`, { timeout: 40000 })
		.then(() => true)
		.catch(() => false);
	check(`${label} signs in through the settings card`, ok);
	return ok;
}

/** The button is disabled while an exchange runs, so its return is the exchange finishing. */
async function sync({ page }) {
	await tap(page, 'Sync now');
	await page.waitForFunction(
		() => {
			const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Sync now');
			return button && !button.disabled;
		},
		{ timeout: 60000 }
	);
	await page.waitForTimeout(500);
}

async function waiting({ page }) {
	return page.locator('text=/changes waiting/').count();
}

async function writeNotes({ page }, text) {
	const notes = page.locator('textarea:visible').first();
	await notes.fill(text);
	await notes.blur();
	await page.waitForTimeout(1200);
}

const a = await device('device A');
const b = await device('device B');

/* One archer, signed in on their first phone. */
await accountCard(a);
if (!(await signIn(a))) process.exit(1);

/* An outing, recorded the way an archer records one. */
const note = `shot on A at ${new Date().toISOString().slice(11, 19)}`;
await a.page.goto(`${BASE}/sessions`);
await a.page.waitForSelector('nav', { timeout: 30000 });
await a.page.waitForTimeout(1000);
await tap(a.page, 'New session');
await a.page.waitForURL(/\/sessions\/[0-9a-f-]{36}/, { timeout: 30000 });
const sessionUrl = a.page.url();
await writeNotes(a, note);
check('device A records an outing', Boolean(sessionUrl));

await accountCard(a);
// Not asserted: an automatic exchange may already have carried it, which is the app working.
await sync(a);
check('device A has nothing waiting once it has synced', (await waiting(a)) === 0);

/* The second phone, same archer. */
await accountCard(b);
if (!(await signIn(b))) process.exit(1);
await sync(b);

await b.page.goto(sessionUrl);
await b.page.waitForSelector('nav', { timeout: 30000 });
await b.page.waitForTimeout(1500);
const arrivedText = await b.page.locator('textarea:visible').first().inputValue().catch(() => '');
check('the outing reaches the second device, notes and all', arrivedText === note, arrivedText);

/* And an edit made there travels back. */
const editedNote = `${note}, edited on B`;
await writeNotes(b, editedNote);
await accountCard(b);
await sync(b);

await accountCard(a);
await sync(a);
await a.page.goto(sessionUrl);
await a.page.waitForSelector('nav', { timeout: 30000 });
await a.page.waitForTimeout(1500);
const backText = await a.page.locator('textarea:visible').first().inputValue().catch(() => '');
check('an edit on the second device travels back to the first', backText === editedNote, backText);

/*
 * A range has no signal, and that is the normal case rather than the exception.
 *
 * Navigated through the app rather than by loading a URL: a dev server is not a service worker, so a
 * document request while offline would be testing the harness rather than the app. Everything below
 * is what an archer actually does, which is to keep using a page that is already open.
 */
await a.page.goto(`${BASE}/sessions`);
await a.page.waitForSelector('nav', { timeout: 30000 });
await a.page.waitForTimeout(1500);

/*
 * Wait for the service worker to be in charge before pulling the plug. It precaches the whole app on
 * install, but a page loaded a second earlier is not yet controlled by it, and testing that moment
 * would be testing a state no returning archer is ever in. A dev server has no worker at all, which
 * is why this check belongs against a build.
 */
const controlled = await a.page
	.waitForFunction(() => navigator.serviceWorker?.controller != null, { timeout: 30000 })
	.then(() => true)
	.catch(() => false);
check('the app installs a service worker to hold itself offline', controlled);

await a.context.setOffline(true);
const opensOffline = await a.page
	.waitForSelector('nav', { timeout: 25000 })
	.then(() => true)
	.catch(() => false);
check('the app keeps working with no network', opensOffline);

await tap(a.page, 'New session');
const shotOffline = await a.page
	.waitForURL(/\/sessions\/[0-9a-f-]{36}/, { timeout: 25000 })
	.then(() => true)
	.catch(() => false);
check('an outing can be recorded with no network', shotOffline, a.page.url());

// A session is a detail page and carries no bottom bar, so the way out of it is the back arrow.
await tap(a.page, 'Back');
await a.page.waitForTimeout(1200);
await tapNav(a.page, 'Settings');
await a.page.waitForTimeout(1500);
const settingsOpened = await openDataTab(a.page);
check('the settings screen opens with no network', settingsOpened, a.page.url());
check('what was shot offline is held as waiting', (await waiting(a)) > 0);

// An exchange attempted with no network must fail quietly and leave the work queued, not lose it.
await sync(a);
check('a sync attempted offline keeps what is waiting', (await waiting(a)) > 0);

await a.context.setOffline(false);
await sync(a);
check('and it goes up once the network is back', (await waiting(a)) === 0);

await browser.close();
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (results.some((r) => !r.ok)) process.exitCode = 1;
