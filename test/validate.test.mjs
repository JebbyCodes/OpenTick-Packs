// scripts/validate.mjs as a pull request would run it: in a copy of the repository with git history, changing things and checking what it says.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { sandbox } from './helpers.mjs';
const sb = sandbox(), run = (...a) => { const r = sb.node('validate.mjs', ...a); return { ...r, md: sb.exists('report/validate.md') ? sb.read('report/validate.md') : '', json: sb.exists('report/validate.json') ? sb.json('report/validate.json') : null }; };
const edit = (id, fn) => { const p = sb.json(`packs/${id}.json`); fn(p); sb.write(`packs/${id}.json`, JSON.stringify(p, null, 2) + '\n'); };

{ const r = run(); assert.equal(r.status, 0, r.out); assert.match(r.md, /passed/); assert.equal(r.json.packs.length, 4); assert.ok(r.json.packs.every(p => /^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(p.code))); }
{ const r = run('--base', 'HEAD'); assert.equal(r.status, 0, r.out); assert.match(r.md, /No pack files changed/); assert.deepEqual(r.json.perfTargets, [], 'nothing changed, nothing to measure'); }
// changing a published pack without raising its version (the versions are read from the pack, so bumping a bundled pack never breaks this test)
const cur = sb.json('packs/study-planner.json').version, next = cur.replace(/(\d+)$/, n => +n + 1), esc = v => v.replace(/\./g, '\\.');
edit('study-planner', p => { p.description = 'Topics to learn and revise, now with an even better description.'; });
{ const r = run('--base', 'HEAD'); assert.equal(r.status, 1, r.out); assert.match(r.md, new RegExp(`already published as version ${esc(cur)}\\. Raise "version" \\(to ${esc(next)}`)); assert.match(r.md, /❌/); assert.deepEqual(r.json.changed, ['study-planner']); }
edit('study-planner', p => { p.version = next; });
{ const r = run('--base', 'HEAD'); assert.equal(r.status, 0, r.out); assert.match(r.md, /`study-planner` \| `HN6G-1CE5`/, 'the comment shows the code'); assert.deepEqual(r.json.perfTargets, ['study-planner']); assert.ok(!/garden-journal/.test(r.md), 'only what changed is listed'); }
edit('study-planner', p => { p.version = '0.9.0'; }); { const r = run('--base', 'HEAD'); assert.equal(r.status, 1); assert.match(r.md, new RegExp(`already published as version ${esc(cur)}`)); }
edit('study-planner', p => { p.version = next; p.author = 'Someone Else'; }); { const r = run('--base', 'HEAD'); assert.equal(r.status, 0); assert.match(r.md, /author changed from “OpenTick” to “Someone Else”/); }
sb.reset();
// a new pack gets its code before it is merged; its words are shown as text
{ const p = sb.json('packs/garden-journal.json'); p.id = 'my-new-pack'; p.name = 'My new pack'; sb.write('packs/my-new-pack.json', JSON.stringify(p, null, 2) + '\n');
  const r = run('--base', 'HEAD', '--strict-scope'); assert.equal(r.status, 0, r.out); assert.match(r.md, /`my-new-pack` \| `[0-9A-Z]{4}-[0-9A-Z]{4}`/); assert.deepEqual(r.json.perfTargets, ['my-new-pack']); assert.match(r.md, /code.*what people type into OpenTick/); sb.git('add', '-A'); sb.git('commit', '-qm', 'new'); }
{ edit('my-new-pack', p => { p.version = '1.0.1'; p.themes = [{ name: '<img src=x onerror=alert(1)> @octocat', vars: { '--bg': '#777777', '--text': '#808080', '--acc': '#5fbf8a', '--on-acc': '#0d1711' } }]; });
  const r = run('--base', 'HEAD'); assert.equal(r.status, 1, r.out); assert.ok(!/(^|[^\\])<img/.test(r.md), 'a name in a pack can not put markup in the comment (it is escaped)'); assert.match(r.md, /\\<img src=x/); }
sb.reset();
// the machinery changed, not a pack: everything is measured again; and a stranger may not change it
sb.write('site/app.js', sb.read('site/app.js') + '\n// changed\n');
{ const r = run('--base', 'HEAD'); assert.equal(r.status, 0, r.out); assert.equal(r.json.perfTargets.length, 5, 'every pack is measured when the machinery changes'); }
{ const r = run('--base', 'HEAD', '--strict-scope'); assert.equal(r.status, 1); assert.match(r.md, /site\/app\.js: a pack pull request may only change files in packs\//); }
sb.reset();
// deleting a pack, and files that do not belong in packs/
sb.remove('packs/calm-themes.json'); { const r = run('--base', 'HEAD', '--strict-scope'); assert.equal(r.status, 0, r.out); assert.match(r.md, /calm-themes\.json\*\* is deleted: its code stops working/); } sb.reset();
sb.write('packs/notes.txt', 'hello'); { const r = run(); assert.equal(r.status, 1); assert.match(r.md, /only pack files \(\.json\) belong in packs/); } sb.reset();
// a broken pack, with and without git
sb.write('packs/broken.json', '{ nope'); { const r = run(); assert.equal(r.status, 1); assert.match(r.md, /packs\/broken\.json:\*\* The file is not valid JSON/); } sb.reset();
// OpenTick's source missing: a plain message, not a crash
{ const r = sb.nodeEnv({ OPENTICK_DIR: join(sb.dir, 'no-such-opentick') }, 'validate.mjs'); assert.equal(r.status, 2); assert.match(r.out, /OpenTick's source was not found/); assert.ok(!/at file:|\n\s+at /.test(r.out), 'a plain message, not a stack trace'); }
sb.done();
console.log('validate tests passed (version bump, author change, new pack code, escaping, scope, deletions, broken files, OpenTick missing)');
