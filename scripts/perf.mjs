#!/usr/bin/env node
// The performance and error check: what does this pack do to a real OpenTick?
//
// For each pack, in headless Chromium with the processor slowed down (default 4x, about a mid-range phone):
//   1. START-UP   the app is started from saved data that holds the pack, and from the same saved data without it, several times each, taking turns.
//                 It compares the browser's own count of main-thread time, and memory after a garbage collection (medians, so one slow run does not decide).
//   2. RUNNING    every section the pack adds is drawn in each of its views (list, cards, table), the first time and the typical time; every theme is
//                 switched on and checked to really change the colours.
//   3. BUGS       any error thrown on the page, any error in the console, any request to the internet (a pack must not make the app go online),
//                 and anything the app had to change while reading the pack, fails it.
// Slow things are warned about (a person looks) or failed (well beyond what a phone should be asked to do): see perf-budget.json.
//
//   node scripts/perf.mjs [--app path/to/index.html] [--packs id,id | --from report/validate.json | --files a.json,b.json | --all]
//                         [--runs 5] [--throttle 4] [--budget perf-budget.json] [--report report]
// --app: a built OpenTick (dist/index.html). Without it the app is built from OPENTICK_DIR first.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, openTickDir, openTickVersion } from './lib/app.mjs';

const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const esc = s => String(s).replace(/[\\`*_{}\[\]<>|#~]/g, c => '\\' + c).replace(/\s+/g, ' ').slice(0, 300);

export function loadBudget(file) {
  const def = { startupCpuMs: { warn: 80, fail: 300 }, heapMB: { warn: 10, fail: 40 }, firstDrawMs: { warn: 250, fail: 900 }, typicalDrawMs: { warn: 150, fail: 500 }, elements: { warn: 4000, fail: 12000 }, themeMs: { warn: 120, fail: 400 } };
  try { return { ...def, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch (e) { return def; }
}
const grade = (v, b) => (v > b.fail ? 'fail' : v > b.warn ? 'warn' : 'ok');
const worst = (...s) => (s.includes('fail') ? 'fail' : s.includes('warn') ? 'warn' : 'ok');

async function launch(chromium) {
  const args = typeof process.getuid === 'function' && process.getuid() === 0 ? ['--no-sandbox'] : [];
  return chromium.launch({ args });
}
// one fresh browser profile: nothing saved, nothing cached, nothing allowed onto the internet
async function open(browser, url, throttle, seed, watch) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' }), found = { errors: [], external: [] };
  if (seed) await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch (e) { /* ignore */ } }, seed); // seed = [the storage key, the saved data]
  await ctx.addInitScript(() => { window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* not available */ } });
  await ctx.route('**/*', r => { const u = r.request().url(); if (/^(file|data|blob|about|chrome-extension):/i.test(u)) return r.continue(); found.external.push(u.slice(0, 120)); return r.abort(); });
  const page = await ctx.newPage();
  page.on('pageerror', e => found.errors.push('Error thrown: ' + String(e && e.message || e).split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR_(FAILED|BLOCKED|INTERNET)/.test(m.text())) found.errors.push('Console error: ' + m.text().slice(0, 200)); });
  const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.goto(url); await page.waitForSelector('#main', { timeout: 60000 }); await page.waitForTimeout(700);
  return { ctx, page, cdp, found };
}
async function metrics(h) {
  try { await h.cdp.send('HeapProfiler.collectGarbage'); } catch (e) { /* older browser */ }
  const m = Object.fromEntries((await h.cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  const long = await h.page.evaluate(() => window.__lt || []);
  return { cpuMs: (m.TaskDuration || 0) * 1000, scriptMs: (m.ScriptDuration || 0) * 1000, heapMB: (m.JSHeapUsedSize || 0) / 1048576, nodes: m.Nodes || 0, longMs: Math.max(0, ...long) };
}

export async function measure({ app, packs, runs = 5, throttle = 4, budget = loadBudget(join(ROOT, 'perf-budget.json')), log = () => {} }) {
  const { chromium } = createRequire(import.meta.url)('playwright'), url = pathToFileURL(resolve(app)).href, browser = await launch(chromium), out = [];
  try {
    // ---- the saved data to start from: the same fresh app, with and without the pack ----
    const prep = async text => {
      const h = await open(browser, url, 1, '', true);
      try {
        const r = text === null ? { warnings: [], sections: [], themes: [], entries: 0 } : await h.page.evaluate(t => { const r = packParse(t), i = packInstall(r.pack); return { warnings: r.warnings, sections: i.sections.map(s => s.id), themes: (S.settings.customThemes || []).map(c => ({ id: c.id, name: c.name, css: c.css })), entries: S.centries.length }; }, text);
        const seed = await h.page.evaluate(() => { flush(); return [KEY, localStorage.getItem(KEY)]; });
        return { ...r, seed, errors: h.found.errors.slice(), external: h.found.external.slice() };
      } finally { await h.ctx.close(); }
    };
    const base = await prep(null); if (!base.seed[1]) throw new Error('The app did not save any data to start from.');
    const runOnce = async seed => { const h = await open(browser, url, throttle, seed); try { return { ...(await metrics(h)), errors: h.found.errors, external: h.found.external }; } finally { await h.ctx.close(); } };
    const baseline = []; // the app with no pack, measured alongside every pack so that a slow moment on the machine hits both
    for (const pk of packs) {
      const r = { id: pk.id, file: pk.file, errors: [], notes: [], checks: [], draws: [], themes: [] };
      log(`  ${pk.id}`);
      try {
      const text = readFileSync(pk.file, 'utf8'), P = await prep(text);
      for (const w of P.warnings) r.errors.push('OpenTick had to change the pack while reading it: ' + w);
      for (const e of P.errors) r.errors.push(e);
      if (!P.sections.length && !P.themes.length) r.errors.push('Nothing was added by installing it.');
      // 1. start-up
      const startup = async n => { const a = [], b = []; for (let i = 0; i < n; i++) { const x = await runOnce(base.seed), y = await runOnce(P.seed); baseline.push(x); a.push(x); b.push(y); for (const q of [x, y]) { for (const e of q.errors) r.errors.push('While starting: ' + e); for (const u of q.external) r.errors.push('The app tried to go online while starting: ' + u); } } return { a, b }; };
      let { a, b } = await startup(runs), delta = median(b.map(x => x.cpuMs)) - median(a.map(x => x.cpuMs));
      if (grade(Math.max(0, delta), budget.startupCpuMs) === 'fail') { const again = await startup(runs); const d2 = median(again.b.map(x => x.cpuMs)) - median(again.a.map(x => x.cpuMs)); if (d2 < delta) { delta = d2; b = again.b; a = again.a; } r.notes.push('Start-up was measured twice because the first result was over the limit; the better one is used.'); }
      const heap = median(b.map(x => x.heapMB)) - median(a.map(x => x.heapMB)), baseCpu = median(a.map(x => x.cpuMs)), baseHeap = median(a.map(x => x.heapMB));
      r.startup = { cpuDeltaMs: round(delta, 1), baseCpuMs: round(baseCpu), packCpuMs: round(median(b.map(x => x.cpuMs))), heapDeltaMB: round(heap, 2), baseHeapMB: round(baseHeap, 1), longTaskMs: round(median(b.map(x => x.longMs))) };
      r.checks.push({ name: 'Start-up cost', value: round(Math.max(0, delta)), unit: 'ms', limit: budget.startupCpuMs, status: grade(Math.max(0, delta), budget.startupCpuMs) });
      r.checks.push({ name: 'Memory', value: round(Math.max(0, heap), 1), unit: 'MB', limit: budget.heapMB, status: grade(Math.max(0, heap), budget.heapMB) });
      // 2. running: draw every section in every view, then every theme
      const h = await open(browser, url, throttle, P.seed);
      try {
        let firstMax = 0, typMax = 0, nodesMax = 0;
        for (const id of P.sections) {
          for (const view of ['list', 'cards', 'table']) {
            const d = await h.page.evaluate(([id, view]) => { const s = xsById(id); s.view = view; U.page = id; U.sel = null; const t = []; for (let i = 0; i < 5; i++) { const a = performance.now(); render(); t.push(performance.now() - a); } const sorted = t.slice().sort((x, y) => x - y); return { name: s.name, view, first: t[0], typical: sorted[2], nodes: document.getElementsByTagName('*').length, text: (document.getElementById('main').innerText || '').trim().length, entries: xsEntries(s).length }; }, [id, view]);
            r.draws.push({ section: d.name, view, firstMs: round(d.first), typicalMs: round(d.typical), elements: d.nodes, entries: d.entries });
            firstMax = Math.max(firstMax, d.first); typMax = Math.max(typMax, d.typical); nodesMax = Math.max(nodesMax, d.nodes);
            if (!d.text) r.errors.push(`The section “${d.name}” draws nothing in the ${view} view.`);
          }
        }
        if (P.sections.length) {
          r.checks.push({ name: 'First draw of a section', value: round(firstMax), unit: 'ms', limit: budget.firstDrawMs, status: grade(firstMax, budget.firstDrawMs) });
          r.checks.push({ name: 'Typical redraw', value: round(typMax), unit: 'ms', limit: budget.typicalDrawMs, status: grade(typMax, budget.typicalDrawMs) });
          r.checks.push({ name: 'Elements on screen', value: nodesMax, unit: '', limit: budget.elements, status: grade(nodesMax, budget.elements) });
          // and the rest of the app still works with the section there
          await h.page.evaluate(() => { U.page = 'tasks'; U.nav = 'today'; render(); U.page = 'notes'; render(); U.page = 'calendar'; render(); U.page = 'tasks'; render(); });
        }
        let themeMax = 0;
        for (const t of P.themes) {
          const d = await h.page.evaluate(id => { const a = performance.now(); S.settings.theme = id; applyTheme(); render(); const ms = performance.now() - a; return { ms, bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().toLowerCase() }; }, t.id);
          const want = (/--bg\s*:\s*([^;]+)/.exec(t.css) || [])[1];
          themeMax = Math.max(themeMax, d.ms); r.themes.push({ name: t.name, ms: round(d.ms), applied: !want || d.bg === want.trim().toLowerCase() });
          if (want && d.bg !== want.trim().toLowerCase()) r.errors.push(`The theme “${t.name}” was switched on but the background is ${d.bg || 'not set'}, not ${want.trim()}.`);
        }
        if (P.themes.length) r.checks.push({ name: 'Switching a theme', value: round(themeMax), unit: 'ms', limit: budget.themeMs, status: grade(themeMax, budget.themeMs) });
        for (const e of h.found.errors) r.errors.push('While running: ' + e);
        for (const u of h.found.external) r.errors.push('The app tried to go online: ' + u);
      } finally { await h.ctx.close(); }
      r.errors = [...new Set(r.errors)].slice(0, 12);
      } catch (e) { r.errors.push('The check could not run this pack: ' + String(e && e.message || e).split('\n')[0]); }
      r.status = r.errors.length ? 'fail' : worst(...r.checks.map(c => c.status));
      out.push(r);
    }
    return { throttle, runs, baseline: { cpuMs: round(median(baseline.map(x => x.cpuMs))), heapMB: round(median(baseline.map(x => x.heapMB)), 1), cpuMin: round(Math.min(...baseline.map(x => x.cpuMs), 0) || 0), nodes: round(median(baseline.map(x => x.nodes))) }, results: out };
  } finally { await browser.close(); }
}

export function report(res, version) {
  const icon = s => (s === 'fail' ? '❌' : s === 'warn' ? '⚠️' : '✅'), all = res.results.some(r => r.status === 'fail') ? 'fail' : res.results.some(r => r.status === 'warn') ? 'warn' : 'ok';
  const L = [`## ${icon(all)} Performance and error check`, '', `Each pack was added to OpenTick ${esc(version)} in headless Chromium with the processor slowed ${res.throttle}× (about a mid-range phone), and compared with the same app without it (median of ${res.runs} starts). Without any pack the app's start-up uses about ${res.baseline.cpuMs} ms of processor time and ${res.baseline.heapMB} MB of memory.`, ''];
  if (!res.results.length) { L.push('_No packs to measure in this change._', ''); return L.join('\n'); }
  L.push('| Pack | Result | Start-up cost | Memory | First draw | Typical redraw | Elements | Errors |', '|---|---|---|---|---|---|---|---|');
  const c = (r, n) => { const x = r.checks.find(k => k.name === n); return x ? `${icon(x.status).replace('✅', '')}${x.value}${x.unit ? ' ' + x.unit : ''}`.trim() : '—'; };
  for (const r of res.results) L.push(`| \`${esc(r.id)}\` | ${icon(r.status)} | ${c(r, 'Start-up cost')} | ${c(r, 'Memory')} | ${c(r, 'First draw of a section')} | ${c(r, 'Typical redraw')} | ${c(r, 'Elements on screen')} | ${r.errors.length} |`);
  L.push('');
  for (const r of res.results) {
    const bad = r.checks.filter(k => k.status !== 'ok');
    if (!r.errors.length && !bad.length && !r.notes.length) continue;
    L.push(`**\`${esc(r.id)}\`**`, '');
    for (const e of r.errors) L.push(`- ❌ ${esc(e)}`);
    for (const k of bad) L.push(`- ${icon(k.status)} ${k.name}: ${k.value}${k.unit ? ' ' + k.unit : ''} (${k.status === 'fail' ? 'limit' : 'worth a look above'} ${k.status === 'fail' ? k.limit.fail : k.limit.warn}${k.unit ? ' ' + k.unit : ''})`);
    for (const n of r.notes) L.push(`- ${esc(n)}`);
    L.push('');
  }
  L.push('<sub>Shared GitHub machines vary a little from run to run. ⚠️ means “take a look”; ❌ means well beyond what a phone should be asked to do, or that something broke.</sub>', '');
  return L.join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const opt = { app: '', packs: null, from: '', files: null, all: false, runs: 5, throttle: 4, budget: join(ROOT, 'perf-budget.json'), report: 'report' };
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === '--app') opt.app = argv[++i]; else if (a === '--packs') opt.packs = argv[++i].split(',').filter(Boolean); else if (a === '--from') opt.from = argv[++i]; else if (a === '--files') opt.files = argv[++i].split(',').filter(Boolean); else if (a === '--all') opt.all = true; else if (a === '--runs') opt.runs = Math.max(1, +argv[++i] || 5); else if (a === '--throttle') opt.throttle = Math.max(1, +argv[++i] || 4); else if (a === '--budget') opt.budget = argv[++i]; else if (a === '--report') opt.report = argv[++i]; }
  const dir = openTickDir(); let app = opt.app;
  if (!app) { const tmp = mkdtempSync(join(tmpdir(), 'opentick-app-')); const b = spawnSync('node', [join(dir, 'build-app.mjs'), '--out', tmp], { encoding: 'utf8' }); if (b.status) throw new Error('Could not build OpenTick:\n' + b.stderr); app = join(tmp, 'index.html'); }
  if (!existsSync(app)) throw new Error('No built app at ' + app);
  let packs;
  if (opt.files) packs = opt.files.map(f => ({ id: basename(f, '.json'), file: resolve(f) }));
  else {
    let ids = opt.packs;
    if (!ids && opt.from) ids = JSON.parse(readFileSync(opt.from, 'utf8')).perfTargets || [];
    if (!ids || opt.all) ids = readdirSync(join(ROOT, 'packs')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
    packs = ids.map(id => ({ id, file: join(ROOT, 'packs', id + '.json') })).filter(p => existsSync(p.file));
  }
  const version = openTickVersion(dir);
  console.log(`Measuring ${packs.length} pack(s) in OpenTick ${version} (CPU ${opt.throttle}× slower, ${opt.runs} runs)…`);
  const res = await measure({ app, packs, runs: opt.runs, throttle: opt.throttle, budget: loadBudget(opt.budget), log: console.log });
  const md = report(res, version); mkdirSync(resolve(ROOT, opt.report), { recursive: true });
  writeFileSync(join(resolve(ROOT, opt.report), 'perf.md'), md); writeFileSync(join(resolve(ROOT, opt.report), 'perf.json'), JSON.stringify({ version, ...res }, null, 2));
  for (const r of res.results) { console.log(`${r.status === 'fail' ? '✗' : r.status === 'warn' ? '!' : '✓'} ${r.id}: ` + r.checks.map(k => `${k.name} ${k.value}${k.unit}`).join(', ')); for (const e of r.errors) console.log('    ✗ ' + e); }
  if (process.env.GITHUB_STEP_SUMMARY) { try { writeFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n', { flag: 'a' }); } catch (e) { /* not on GitHub */ } }
  return res;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().then(res => { if (res.results.some(r => r.status === 'fail')) process.exit(1); }).catch(e => { console.error(e.stack || e.message || e); process.exit(2); });
