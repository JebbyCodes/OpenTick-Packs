// The rules, one mistake at a time: each is caught with a sentence a contributor can act on; the seed packs are clean.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadApp } from '../scripts/lib/app.mjs';
import { inspectPack, parseColour, contrast, cmpVersion, personalData, sha256, FILE_MAX } from '../scripts/lib/rules.mjs';
import { findCollisions } from '../scripts/validate.mjs';
const app = await loadApp(), parse = app.parse, J = x => JSON.parse(JSON.stringify(x));
const files = readdirSync(join(ROOT, 'packs')).filter(f => f.endsWith('.json')).sort(), good = id => JSON.parse(readFileSync(join(ROOT, 'packs', id + '.json'), 'utf8'));
const check = (id, mutate, file = `packs/${id}.json`) => { const out = mutate ? mutate(good(id)) : readFileSync(join(ROOT, 'packs', id + '.json')); const bytes = Buffer.isBuffer(out) ? out : Buffer.from(typeof out === 'string' ? out : JSON.stringify(out, null, 2)); return inspectPack(file, bytes, parse); };
const has = (r, re, kind = 'errors') => assert.ok(r[kind].some(m => re.test(m)), `${kind} should match ${re}: ${JSON.stringify(r[kind])}`);

// the seed packs are clean, with a row for the index
for (const f of files) { const r = check(f.replace('.json', '')); assert.deepEqual(J(r.errors), [], f); assert.ok(r.row && r.row.code && r.row.sha256.length === 64 && r.row.size > 0, f); assert.equal(r.row.sha256, sha256(readFileSync(join(ROOT, 'packs', f))), 'the hash is of the file as it is'); }
assert.ok(files.length >= 4);
const sp = check('study-planner'); assert.equal(sp.row.sections, 1); assert.equal(sp.row.entries, 3); assert.equal(sp.row.code, 'HN6G-1CE5'); assert.ok(sp.row.tags.length >= 1);

// each mistake
has(check('study-planner', p => ({ ...p, id: 'something-else' })), /says id "something-else" but the file is called study-planner\.json/);
has(check('study-planner', null, 'packs/Bad_Name.json'), /lower-case words joined by hyphens/);
has(check('study-planner', null, 'packs/sub/dir.json'), /directly inside packs/); has(check('study-planner', null, 'packs/readme.txt'), /directly inside packs/);
has(check('study-planner', p => ({ ...p, version: '1.0' })), /version/); has(check('study-planner', p => { delete p.version; return p; }), /version/);
has(check('study-planner', p => ({ ...p, license: 'All rights reserved' })), /licence/); has(check('study-planner', p => ({ ...p, author: '' })), /author is missing/);
has(check('study-planner', p => ({ ...p, description: 'short' })), /description/); has(check('study-planner', p => ({ ...p, name: 'ab' })), /name is too short/);
has(check('study-planner', p => ({ ...p, sections: [], themes: [] })), /no sections and no themes|does not accept/);
has(check('study-planner', () => 'not json {'), /not valid JSON`?/); has(check('study-planner', () => Buffer.from([0xff, 0xfe, 0x00])), /not valid UTF-8/);
has(check('study-planner', () => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(join(ROOT, 'packs', 'study-planner.json'))])), /byte-order mark/);
has(check('study-planner', p => ({ ...p, pad: 'x'.repeat(FILE_MAX) })), /KB; the limit is 400 KB/);
has(check('study-planner', p => { p.sections[0].fields[0].type = 'hologram'; return p; }), /had to change something while reading/);
has(check('study-planner', p => ({ ...p, tags: 'study' })), /"tags" must be a list/); has(check('study-planner', p => ({ ...p, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })), /At most 6 tags/); has(check('study-planner', p => ({ ...p, tags: ['Not Valid'] })), /tag "Not Valid"/);
has(check('study-planner', p => ({ ...p, tags: [] })), /no tags/, 'warnings'); has(check('study-planner', p => { delete p.tags; return p; }), /no tags/, 'warnings');
has(check('study-planner', () => ({ opentick: 'pack', format: 99 })), /does not accept/);
// personal data and links are for a person to look at
has(check('study-planner', p => { p.sections[0].entries[0].notes = 'Ask anna.smith@example.com or call +44 7700 900123'; return p; }), /personal data.*email address.*phone-number/, 'warnings');
assert.deepEqual(personalData(['2026-11-19', 'Version 1.2.3', 'call 5551234', '2026-11-19 10:00', 'x@y.co']), ['an email address (x@y.co)'], 'dates and short numbers are not phone numbers');
has(check('study-planner', p => { p.sections[0].entries[0].vals.resource = 'https://example.com/a'; return p; }), /link\(s\) in the entries/, 'warnings');
// themes: readable text matters
const theme = (vars) => check('calm-themes', p => { p.themes[0].vars = { ...p.themes[0].vars, ...vars }; return p; });
has(theme({ '--bg': '#777777', '--text': '#888888' }), /contrast of 1\.\d:1.*hard to read/); has(theme({ '--bg': '#ffffff', '--text': '#808080' }), /4\.5:1 or more is recommended/, 'warnings');
assert.ok(!theme({ '--bg': '#ffffff', '--side': '#f5f5f5', '--text': '#111111', '--muted': '#555555' }).errors.length, 'a readable theme is accepted');
has(theme({ '--acc': '#ffffff', '--on-acc': '#f0f0f0' }), /accent colour \(buttons\)/);
assert.deepEqual(parseColour('#fff'), [255, 255, 255]); assert.deepEqual(parseColour('#112233'), [17, 34, 51]); assert.deepEqual(parseColour('rgb(1, 2, 3)'), [1, 2, 3]); assert.deepEqual(parseColour('hsl(0, 100%, 50%)'), [255, 0, 0]); assert.equal(parseColour('red'), null); assert.equal(parseColour('url(x)'), null);
assert.ok(Math.abs(contrast([0, 0, 0], [255, 255, 255]) - 21) < 0.01); assert.ok(Math.abs(contrast([255, 255, 255], [255, 255, 255]) - 1) < 0.01);
// versions are numbers, not text
assert.equal(cmpVersion('1.10.0', '1.9.0'), 1); assert.equal(cmpVersion('1.0.0', '1.0.0'), 0); assert.equal(cmpVersion('1.0.0-beta', '1.0.0'), -1); assert.equal(cmpVersion('2.0.0', '10.0.0'), -1);
// two packs with one code
{ const a = { id: 'a', errors: [], ok: true, row: { code: 'AAAA-AAAA' } }, b = { id: 'b', errors: [], ok: true, row: { code: 'AAAA-AAAA' } }, c = { id: 'c', errors: [], ok: true, row: { code: 'BBBB-BBBB' } }; findCollisions([a, b, c]); assert.equal(a.errors.length, 1); assert.equal(b.errors.length, 1); assert.equal(c.errors.length, 0); assert.match(a.errors[0], /same as the code of "b"/); }
console.log('rules tests passed (clean packs, every mistake caught, themes, personal data, versions, collisions)');
