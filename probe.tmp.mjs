import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const p = await b.newPage({ viewport: { width: 390, height: 800 } });
const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.goto('http://localhost:4173/', { waitUntil:'networkidle' }); await p.waitForTimeout(3500);
await p.getByRole('button', { name: /New session/i }).click(); await p.waitForTimeout(1600);
await p.getByRole('button', { name: /^Add$/ }).click(); await p.waitForTimeout(600);
await p.getByText('WA Indoor 18m').click(); await p.waitForTimeout(1800);
for (const v of ['10','9','9']) { await p.getByRole('button',{name:v,exact:true}).click(); await p.waitForTimeout(150); }
await p.waitForTimeout(1500);
await p.reload({ waitUntil:'networkidle' }); await p.waitForTimeout(3500);
console.log('AFTER RELOAD:', (await p.locator('body').innerText()).replace(/\n+/g,' | ').slice(0,140));
const info = await p.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const keys = await caches.keys();
  return { sw: !!reg?.active, caches: keys.length, entries: keys.length ? (await (await caches.open(keys[0])).keys()).length : 0 };
});
console.log('PWA:', JSON.stringify(info));
// Offline: the shell must still boot from cache.
await p.context().setOffline(true);
await p.reload({ waitUntil:'domcontentloaded' }).catch(()=>{});
await p.waitForTimeout(4000);
console.log('OFFLINE BOOT:', (await p.locator('body').innerText()).replace(/\n+/g,' | ').slice(0,140));
console.log('ERR:', errs.slice(0,3));
await b.close();
