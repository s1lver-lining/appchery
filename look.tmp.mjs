import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:4186';
const SHOT = '/tmp/claude-1000/-home-u-scripts-appchery/d374bd17-48c3-4753-b2ba-49ce9532a62d/scratchpad';
const GPX = '/home/u/Downloads/2026-09-20 Ghostracer.gpx';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 })).newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message.slice(0, 160)));
async function tap(text) {
	await page.evaluate((w) => {
		const all = [...document.querySelectorAll('button, a, label')];
		const hit = all.find((e) => e.textContent.trim() === w) ?? all.find((e) => e.textContent.includes(w));
		if (!hit) throw new Error(`nothing says "${w}"`);
		hit.click();
	}, text);
	await page.waitForTimeout(700);
}
await page.goto(`${BASE}/sessions`);
await page.waitForSelector('nav:visible');
await page.waitForTimeout(1500);
await tap('New session');
await page.waitForURL(/\/sessions\/[0-9a-f-]{36}/);
await page.waitForTimeout(800);
await tap('Add'); await tap('Running');
await page.waitForURL(/\/activities\//);
await page.waitForTimeout(1200);
await page.setInputFiles('input[type=file]', GPX);
await page.waitForTimeout(3500);
await page.screenshot({ path: `${SHOT}/20-default-tab.png`, fullPage: true });
await tap('This run');
await page.waitForTimeout(7000);
await page.screenshot({ path: `${SHOT}/21-map-zoom.png`, fullPage: true });
console.log('nav control:', await page.evaluate(() => Boolean(document.querySelector('.maplibregl-ctrl-zoom-in'))));
console.log('done');
await browser.close();
