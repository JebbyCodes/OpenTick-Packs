// scripts/perf.mjs in a real browser: it measures a real pack (the numbers have the right shape), fails a pack that is far too heavy, and notices
// what a pack must never do to the app: an error on the page, a request to the internet, an app that draws nothing. Needs Playwright with Chromium.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, openTickDir } from '../scripts/lib/app.mjs';
import { measure, report, loadBudget } from '../scripts/perf.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'packs-perf-')), dir = openTickDir();
const b = spawnSync('node', [join(dir, 'build-app.mjs'), '--out', join(tmp, 'app')], { encoding: 'utf8' }); assert.equal(b.status, 0, b.stderr);
const app = join(tmp, 'app', 'index.html'), html = readFileSync(app, 'utf8'), budget = loadBudget(join(ROOT, 'perf-budget.json'));
const tamper = (name, script) => { mkdirSync(join(tmp, name), { recursive: true }); const f = join(tmp, name, 'index.html'); writeFileSync(f, html.replace(/<\/body>\s*<\/html>\s*$/i, `<script>${script}</script></body></html>`)); return f; };
assert.notEqual(tamper('probe', '1').length, 0);
const pack = (id, patch = {}) => { const p = JSON.parse(readFileSync(join(ROOT, 'packs', 'garden-journal.json'), 'utf8')); Object.assign(p, { id, name: 'Test ' + id }, patch); const f = join(tmp, id + '.json'); writeFileSync(f, JSON.stringify(p)); return { id, file: f }; };
const quick = { runs: 1, throttle: 2, budget };

// ---- a real pack from the library, and a theme-only pack ----
{
  const real = { id: 'garden-journal', file: join(ROOT, 'packs', 'garden-journal.json') }, themes = { id: 'calm-themes', file: join(ROOT, 'packs', 'calm-themes.json') };
  const res = await measure({ app, packs: [real, themes], ...quick }), [g, t] = res.results;
  assert.equal(res.results.length, 2); assert.ok(res.baseline.cpuMs > 0 && res.baseline.heapMB > 0, 'the app with no pack was measured');
  assert.deepEqual(g.errors, [], g.errors.join('\n')); assert.notEqual(g.status, 'fail');
  assert.equal(g.draws.length, 3, 'one section, drawn in list, cards and table'); assert.deepEqual(g.draws.map(d => d.view), ['list', 'cards', 'table']);
  assert.ok(g.draws.every(d => d.elements > 50 && d.firstMs >= 0), 'every view drew something');
  assert.deepEqual(g.checks.map(c => c.name), ['Start-up cost', 'Memory', 'First draw of a section', 'Typical redraw', 'Elements on screen']);
  assert.ok(g.startup && typeof g.startup.cpuDeltaMs === 'number');
  assert.deepEqual(t.errors, [], t.errors.join('\n')); assert.ok(t.themes.length >= 2 && t.themes.every(x => x.applied), 'every theme was switched on and changed the colours'); assert.ok(t.checks.some(c => c.name === 'Switching a theme'));
  const md = report({ ...res }, '0.0.0'); assert.match(md, /Performance and error check/); assert.match(md, /`garden-journal`/); assert.match(md, /`calm-themes`/);
}
// ---- far too heavy: the most the app accepts in one section (500 entries, 24 fields), which makes a very wide table ----
{
  const fields = Array.from({ length: 24 }, (_, i) => ({ key: 'f' + i, name: 'Field ' + i, type: i % 3 === 0 ? 'number' : i % 3 === 1 ? 'check' : 'text' }));
  const entries = Array.from({ length: 500 }, (_, i) => ({ title: 'Plant number ' + i, vals: Object.fromEntries(fields.map((f, j) => [f.key, f.type === 'number' ? i + j : f.type === 'check' ? (i + j) % 2 === 0 : 'Value ' + i + '/' + j])), notes: 'Some notes about it. '.repeat(3) }));
  const heavy = pack('too-heavy', { sections: [{ name: 'Wide', icon: 'leaf', color: '#34b36b', title: 'Thing', view: 'table', fields, entries }], themes: [] });
  const res = await measure({ app, packs: [heavy], ...quick }), r = res.results[0];
  assert.deepEqual(r.errors, [], 'it is a valid pack, only a heavy one: ' + r.errors.join('\n'));
  assert.equal(r.status, 'fail', JSON.stringify(r.checks)); assert.ok(r.checks.some(c => c.status === 'fail'), 'a measured limit was passed: ' + JSON.stringify(r.checks));
  assert.match(report(res, '0.0.0'), /❌/);
}
// ---- errors, the internet, and an app that does not start ----
{
  const err = tamper('throws', "setTimeout(function(){ throw new Error('boom from a pack'); }, 400);");
  const r = (await measure({ app: err, packs: [pack('p-err')], ...quick })).results[0];
  assert.equal(r.status, 'fail'); assert.ok(r.errors.some(e => /boom from a pack/.test(e)), r.errors.join('\n')); assert.match(report({ throttle: 2, runs: 1, baseline: { cpuMs: 1, heapMB: 1 }, results: [r] }, '0'), /boom from a pack/);
}
{
  const net = tamper('online', "setTimeout(function(){ try { fetch('https://tracker.example.com/ping?x=1'); } catch (e) {} }, 400);");
  const r = (await measure({ app: net, packs: [pack('p-net')], ...quick })).results[0];
  assert.equal(r.status, 'fail'); assert.ok(r.errors.some(e => /go online/.test(e) && /tracker\.example\.com/.test(e)), r.errors.join('\n'));
}
{
  const con = tamper('console', "setTimeout(function(){ console.error('something is wrong'); }, 400);");
  const r = (await measure({ app: con, packs: [pack('p-con')], ...quick })).results[0];
  assert.equal(r.status, 'fail'); assert.ok(r.errors.some(e => /Console error: something is wrong/.test(e)), r.errors.join('\n'));
}
// ---- a pack that adds nothing, and a file the app will not take ----
{
  const empty = pack('p-empty', { sections: [], themes: [] }), junk = { id: 'p-junk', file: join(tmp, 'junk.json') }; writeFileSync(junk.file, '{ nope');
  const res = await measure({ app, packs: [empty, junk], ...quick });
  assert.equal(res.results[0].status, 'fail'); assert.equal(res.results[1].status, 'fail'); assert.ok(res.results[1].errors.some(e => /could not run this pack/.test(e)), res.results[1].errors.join('\n'));
}
// ---- a clean pack right after a bad one is not affected by it ----
{
  const res = await measure({ app, packs: [pack('p-bad-theme', { themes: [{ name: 'Odd', vars: { '--bg': '#101010', '--text': '#f0f0f0' } }], sections: [] }), { id: 'garden-journal', file: join(ROOT, 'packs', 'garden-journal.json') }], ...quick });
  assert.equal(res.results[1].errors.length, 0, res.results[1].errors.join('\n'));
}
console.log('perf tests passed (real packs measured, a heavy pack fails, a page error, a request to the internet and a console error are caught, empty and broken packs fail)');
