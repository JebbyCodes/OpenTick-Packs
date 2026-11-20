#!/usr/bin/env node
// Builds what is published: _site/ holds the website (site/), index.json (one row per pack, with its code) and every pack file (packs/).
// GitHub Pages serves it, and OpenTick reads index.json and packs/<id>.json from there. Nothing is published unless every pack passes the rules.
//   node scripts/build-site.mjs [--out _site]
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadApp } from './lib/app.mjs';
import { checkLibrary } from './validate.mjs';

const updated = file => { try { return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { return ''; } };

export function buildIndex(packs, today = new Date().toISOString().slice(0, 10)) {
  const rows = packs.map(p => { const u = updated(p.row.file); return { ...p.row, ...(u ? { updated: u } : {}) }; }).sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : a.id < b.id ? -1 : 1));
  return { opentick: 'pack-index', format: 1, updated: today, packs: rows };
}

export async function build(out = join(ROOT, '_site')) {
  const app = await loadApp(), lib = checkLibrary(ROOT, app.parse), bad = [...lib.problems, ...lib.packs.flatMap(p => p.errors.map(e => `packs/${p.id}.json: ${e}`))];
  if (bad.length) throw new Error('Not publishing: ' + bad.join('\n  '));
  rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, 'packs'), { recursive: true });
  if (existsSync(join(ROOT, 'site'))) cpSync(join(ROOT, 'site'), out, { recursive: true });
  for (const p of lib.packs) writeFileSync(join(out, p.row.file), readFileSync(join(ROOT, p.row.file))); // the bytes the hash in the index was made from
  const index = buildIndex(lib.packs); writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n'); writeFileSync(join(out, '.nojekyll'), '');
  return { index, out };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const i = process.argv.indexOf('--out'); build(i > 0 ? resolve(process.argv[i + 1]) : undefined).then(r => console.log(`Built ${r.index.packs.length} pack(s) into ${r.out}`)).catch(e => { console.error(e.message || e); process.exit(1); });
}
