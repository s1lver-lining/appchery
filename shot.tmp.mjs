import { chromium } from 'playwright';
const [url, out, theme = 'light', width = '1280', height = '900'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: +width, height: +height },
	colorScheme: theme,
	deviceScaleFactor: 2
});
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
page.on('pageerror', (e) => problems.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: true });
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'clean');
await browser.close();
