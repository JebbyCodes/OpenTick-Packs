// scripts/build-site.mjs: what gets published is exactly the packs, an index that describes them truthfully, and the website; and a broken pack
// stops the whole thing instead of being published.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox } from './helpers.mjs';
import { codeFor } from '../scripts/lib/codes.mjs';
const sb = sandbox(), sha = b => createHash('sha256').update(b).digest('hex');

{
  const r = sb.node('build-site.mjs'); assert.equal(r.status, 0, r.out); assert.match(r.out, /Built 4 pack\(s\)/);
  const out = join(sb.dir, '_site'), idx = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
  assert.equal(idx.opentick, 'pack-index'); assert.equal(idx.format, 1); assert.match(idx.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(idx.packs.length, 4);
  const ids = readdirSync(join(sb.dir, 'packs')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
  assert.deepEqual(idx.packs.map(p => p.id).sort(), ids, 'every pack is listed, and nothing else');
  const names = idx.packs.map(p => p.name.toLowerCase()); assert.deepEqual(names, [...names].sort(), 'listed by name');
  for (const p of idx.packs) {
    assert.equal(p.file, `packs/${p.id}.json`); assert.equal(p.code, codeFor(p.id), 'the code comes from the id'); assert.match(p.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const served = readFileSync(join(out, p.file)), source = readFileSync(join(sb.dir, p.file));
    assert.equal(served.length, p.size, 'size is the size of the file that is served'); assert.equal(sha(served), p.sha256, 'the hash is the hash of the file that is served');
    assert.ok(served.equals(source), 'the pack is published byte for byte as it was reviewed');
    const j = JSON.parse(served.toString('utf8')); assert.equal(j.name, p.name); assert.equal(j.version, p.version); assert.ok(Array.isArray(p.tags));
    assert.equal(p.sections, (j.sections || []).length); assert.equal(p.themes, (j.themes || []).length);
    assert.equal(p.entries, (j.sections || []).reduce((n, s) => n + (s.entries || []).length, 0));
  }
  assert.equal(new Set(idx.packs.map(p => p.code)).size, idx.packs.length, 'no two packs share a code');
  assert.ok(existsSync(join(out, '.nojekyll')), 'GitHub Pages must not rewrite the files');
  for (const f of ['index.html', 'style.css', 'app.js']) assert.ok(existsSync(join(out, f)), f + ' is published');
  assert.ok(!existsSync(join(out, 'scripts')) && !existsSync(join(out, 'package.json')) && !existsSync(join(out, 'report')), 'only the website and the packs are published');
  // building twice gives the same bytes (apart from the date, which is the same day)
  const again = sb.node('build-site.mjs'); assert.equal(again.status, 0); assert.equal(readFileSync(join(out, 'index.json'), 'utf8'), JSON.stringify(idx, null, 2) + '\n');
}
// --out
{ const r = sb.node('build-site.mjs', '--out', join(sb.dir, 'elsewhere')); assert.equal(r.status, 0, r.out); assert.ok(existsSync(join(sb.dir, 'elsewhere', 'index.json'))); }
// a pack that breaks a rule: nothing is published
sb.write('packs/study-planner.json', sb.read('packs/study-planner.json').replace('"license"', '"licence-not-valid"'));
{ const r = sb.node('build-site.mjs', '--out', join(sb.dir, 'bad')); assert.equal(r.status, 1, r.out); assert.match(r.out, /Not publishing/); assert.ok(!existsSync(join(sb.dir, 'bad', 'index.json')), 'nothing was written'); }
sb.reset();
{ sb.write('packs/oops.json', '{ not json'); const r = sb.node('build-site.mjs', '--out', join(sb.dir, 'bad2')); assert.equal(r.status, 1); assert.match(r.out, /packs\/oops\.json/); assert.ok(!existsSync(join(sb.dir, 'bad2'))); }
sb.reset();
// a stray file in packs/ also stops it
{ sb.write('packs/readme.txt', 'x'); const r = sb.node('build-site.mjs', '--out', join(sb.dir, 'bad3')); assert.equal(r.status, 1); assert.match(r.out, /only pack files/); }
sb.done();
console.log('build tests passed (index matches the files, hashes, codes, website, nothing published when a pack is broken)');
