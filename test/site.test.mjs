// The website in a real browser: it lists the packs, searches and filters, opens a pack (code, buttons, a look inside), follows a #CODE link, fits a phone,
// and shows a hostile index and pack as plain text only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, loadApp } from '../scripts/lib/app.mjs';
import { build } from '../scripts/build-site.mjs';
import { serveDir } from '../scripts/serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
await loadApp(); // (says clearly if OpenTick's source is missing)

const out = mkdtempSync(join(tmpdir(), 'packs-site-')), { index } = await build(out), server = await serveDir(out), base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ args: typeof process.getuid === 'function' && process.getuid() === 0 ? ['--no-sandbox'] : [] });
const errs = [];
async function page(w = 1200, h = 800, url = base) { const ctx = await browser.newContext({ viewport: { width: w, height: h } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); await p.goto(url); return { ctx, p }; }
const fits = async p => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'no sideways scroll');

{ // the library as it is
  const { ctx, p } = await page();
  await p.waitForSelector('.card'); assert.equal(await p.locator('.card').count(), index.packs.length);
  assert.match(await p.innerText('#status'), new RegExp(`${index.packs.length} packs?`));
  const first = index.packs.find(r => r.id === 'study-planner');
  await p.fill('#q', 'garden'); assert.equal(await p.locator('.card').count(), 1); assert.match(await p.innerText('.card'), /Garden journal/);
  await p.fill('#q', first.code.toLowerCase().replace('-', '')); assert.equal(await p.locator('.card').count(), 1, 'a code, in any case and without the dash, finds its pack');
  await p.fill('#q', 'zzzz nothing'); assert.equal(await p.locator('.card').count(), 0); assert.match(await p.innerText('#status'), /Nothing matches/);
  await p.fill('#q', ''); await p.click('#kinds button:has-text("Themes")'); assert.equal(await p.locator('.card').count(), index.packs.filter(r => r.themes).length);
  await p.click('#kinds button:has-text("All")'); const tag = await p.locator('#tags .chip').first().innerText(); await p.click('#tags .chip >> nth=0'); assert.ok(await p.locator('.card').count() >= 1 && await p.locator('#tags .chip[aria-pressed=true]').count() === 1, 'a topic filters'); await p.click('#tags .chip >> nth=0');
  await p.selectOption('#sort', 'name'); const names = await p.locator('.card h2').allInnerTexts(); assert.deepEqual(names.map(n => n.replace(/v\d.*$/, '').trim()), [...names.map(n => n.replace(/v\d.*$/, '').trim())].sort((a, b) => a.localeCompare(b)));
  // a pack opens
  await p.click(`.card[aria-label*="${first.code}"]`); await p.waitForSelector('#dlg[open] .code strong'); assert.equal(await p.innerText('#dlg .code strong'), first.code); assert.ok(p.url().endsWith('#' + first.code), 'the link can be shared');
  await p.waitForSelector('#dlg .sec'); assert.match(await p.innerText('#dlg'), /Study planner/); assert.ok(await p.locator('#dlg .f').count() >= 3, 'its fields are listed'); assert.ok(await p.locator('#dlg tbody tr').count() >= 1, 'and some of its entries');
  assert.match(await p.getAttribute('#dlg a:has-text("Open in OpenTick")', 'href'), new RegExp(`^https://jebbycodes\\.github\\.io/OpenTick/\\?pack=${first.code}$`));
  assert.equal(await p.getAttribute('#dlg a[download]', 'href'), first.file); assert.equal((await (await fetch(base + first.file)).text()), readFileSync(join(ROOT, first.file), 'utf8'), 'the download is the file in the repository');
  await p.click('#dlg .close'); await p.waitForFunction(() => !location.hash, null, { timeout: 3000 }); assert.ok(!p.url().includes('#'), 'closing clears the link');
  const theme = index.packs.find(r => r.themes); await p.click(`.card[aria-label*="${theme.code}"]`); await p.waitForSelector('#dlg .th'); assert.equal(await p.locator('#dlg .th').count(), theme.themes, 'themes are shown as colour previews'); await p.keyboard.press('Escape');
  await ctx.close();
}
{ // a #CODE link opens that pack, in any case
  const code = index.packs[0].code, { ctx, p } = await page(1200, 800, base + '#' + code.toLowerCase());
  await p.waitForSelector('#dlg[open] .code strong'); assert.equal(await p.innerText('#dlg .code strong'), code); await ctx.close();
}
{ // a phone: nothing runs off the side, with the dialog open too
  const { ctx, p } = await page(360, 740); await p.waitForSelector('.card'); await fits(p); await p.click('.card >> nth=0'); await p.waitForSelector('#dlg[open] .code strong'); await p.waitForTimeout(300); await fits(p);
  const box = await p.locator('#dlg').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 361, 'the dialog fits the screen'); await ctx.close();
}
{ // a hostile library: text is text
  const evil = mkdtempSync(join(tmpdir(), 'packs-evil-')); cpSync(out, evil, { recursive: true }); mkdirSync(join(evil, 'packs'), { recursive: true });
  const x = '<img src=x onerror="window.__pwn=1">', row = { code: 'ABCD-EFGH', id: 'evil', file: 'packs/evil.json', name: x, version: x, author: x, description: x + '<script>window.__pwn=2</script>', license: x, sections: 1, themes: 1, entries: 1, tags: [x, 'ok'] };
  writeFileSync(join(evil, 'index.json'), JSON.stringify({ opentick: 'pack-index', format: 1, packs: [row, { ...row, code: 'JJJJ-KKKK', id: '../x', file: 'packs/../x.json' }, { ...row, code: 'bad code' }] }));
  writeFileSync(join(evil, 'packs', 'evil.json'), JSON.stringify({ opentick: 'pack', format: 1, id: 'evil', name: x, homepage: 'javascript:window.__pwn=3', sections: [{ name: x, title: x, fields: [{ name: x, type: x, key: 'a' }], entries: [{ title: x, vals: { a: x } }] }], themes: [{ name: x, vars: { '--bg': 'red;background:url(//evil.example/x)', '--text': 'expression(alert(1))', '--acc': '#fff' } }] }));
  const es = await serveDir(evil), { ctx, p } = await page(1200, 800, `http://127.0.0.1:${es.address().port}/`); await p.waitForSelector('.card');
  assert.equal(await p.locator('.card').count(), 1, 'a row with a bad code, a path outside packs/ or a bad id is dropped');
  assert.equal(await p.locator('main img, dialog img').count(), 0, 'no library text becomes an image (the logo in the header is the page\'s own)'); await p.click('.card'); await p.waitForSelector('#dlg .sec'); await p.waitForTimeout(200);
  assert.equal(await p.locator('#dlg img, #dlg script').count(), 0, 'nothing in a pack becomes an element'); assert.equal(await p.evaluate(() => window.__pwn), undefined, 'nothing ran');
  assert.equal(await p.locator('#dlg a[href^="javascript"]').count(), 0, 'a javascript: link is never used');
  assert.ok(!(await p.evaluate(() => document.querySelector('#dlg .th .pv').getAttribute('style'))).includes('evil.example'), 'a colour that is not a colour is replaced'); await ctx.close(); es.close();
}
await browser.close(); server.close();
const bad = errs.filter(e => !/Failed to load resource|favicon/i.test(e)); assert.deepEqual(bad, [], 'no errors on the page');
console.log('site tests passed (list, search, filters, a pack, #CODE links, phone, hostile library)');
