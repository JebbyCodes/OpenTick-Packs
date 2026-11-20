#!/usr/bin/env node
// The pull request check: is every pack in packs/ one that OpenTick accepts, under the library's rules (scripts/lib/rules.mjs)?
//
//   node scripts/validate.mjs                      check every pack
//   node scripts/validate.mjs --base origin/main   also work out what this change touches (needs git history): shows each changed pack's code,
//                                                  requires a new version when a pack that is already published is changed, and lists what is deleted
//   --strict-scope    for pull requests from people who do not maintain the library: only packs/<id>.json files may change
//   --report <dir>    where to write validate.md (for the pull request comment) and validate.json (default: report)
//
// OpenTick's own source is needed (it reads the packs): OPENTICK_DIR, or a checkout named OpenTick next to this folder.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadApp } from './lib/app.mjs';
import { inspectPack, cmpVersion } from './lib/rules.mjs';

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const mdText = s => String(s).replace(/[\\`*_{}\[\]<>|#~]/g, c => '\\' + c).replace(/\s+/g, ' ').slice(0, 400); // text from a pack file is shown as text in the comment

/* Library-wide: files that do not belong in packs/, codes that collide. */
export function checkLibrary(root, parse) {
  const dir = join(root, 'packs'), problems = [], packs = [];
  if (!existsSync(dir)) return { problems: ['There is no packs/ folder.'], packs };
  for (const name of readdirSync(dir).sort()) {
    if (name === '.gitkeep') continue;
    const abs = join(dir, name), file = 'packs/' + name;
    if (statSync(abs).isDirectory() || !name.endsWith('.json')) { problems.push(`${file}: only pack files (.json) belong in packs/.`); continue; }
    packs.push(inspectPack(file, readFileSync(abs), parse));
  }
  findCollisions(packs);
  return { problems, packs };
}
// two packs with the same code (a one-in-a-trillion accident): both are told, one of them picks another id
export function findCollisions(packs) {
  const byCode = new Map();
  for (const p of packs) if (p.row) { if (byCode.has(p.row.code)) { const q = byCode.get(p.row.code); for (const x of [p, q]) { x.errors.push(`Its code ${x.row.code} is the same as the code of "${(x === p ? q : p).id}". Choose a different id for one of them.`); x.ok = false; } } else byCode.set(p.row.code, p); }
}

/* What a change touches, from git: [{ status: 'A'|'M'|'D', file }] */
export function changedFiles(base) { // the working folder against base: on GitHub that is the pull request; on your computer it includes what you have not committed yet
  const out = git('diff', '--name-status', '--no-renames', base).split('\n').filter(Boolean).map(l => { const [status, ...f] = l.split('\t'); return { status: status[0], file: f.join('\t') }; });
  for (const f of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) out.push({ status: 'A', file: f });
  return out;
}
const baseText = (base, file) => { try { return git('show', `${base}:${file}`); } catch (e) { return null; } };

export async function run(argv = process.argv.slice(2)) {
  const opt = { base: '', strict: false, report: 'report' };
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--base') opt.base = argv[++i]; else if (argv[i] === '--strict-scope') opt.strict = true; else if (argv[i] === '--report') opt.report = argv[++i]; }
  const app = await loadApp(), lib = checkLibrary(ROOT, app.parse), problems = [...lib.problems], notes = [];
  const by = new Map(lib.packs.map(p => [p.id, p]));
  let changes = [], changedPacks = [], otherChanged = [];
  if (opt.base) {
    try { changes = changedFiles(opt.base); } catch (e) { problems.push(`Could not work out what changed against ${opt.base}: ${String(e.message).split('\n')[0]}`); }
    for (const c of changes) {
      const m = /^packs\/([^/]+)\.json$/.exec(c.file);
      if (!m) { otherChanged.push(c.file); if (opt.strict) problems.push(`${c.file}: a pack pull request may only change files in packs/. Changes anywhere else need the maintainer (open an issue instead).`); continue; }
      if (c.status === 'D') { notes.push(`**${mdText(c.file)}** is deleted: its code stops working in every OpenTick.`); continue; }
      changedPacks.push(m[1]);
      const p = by.get(m[1]); if (!p) continue;
      const old = c.status === 'M' ? baseText(opt.base, c.file) : null;
      if (old !== null) {
        let ov = ''; try { ov = JSON.parse(old).version || ''; } catch (e) { /* the old file was broken; nothing to compare */ }
        const nv = p.pack ? p.pack.version : ''; // (a pack that failed to read has no version to compare; its errors are already listed)
        if (p.pack && ov && cmpVersion(nv, ov) <= 0) { p.errors.push(`This pack is already published as version ${ov}. Raise "version" (to ${ov.replace(/(\d+)$/, n => +n + 1)}, for example) so people who have it can tell the new one apart.`); p.ok = false; }
        try { const oa = JSON.parse(old).author; if (p.pack && oa && oa !== p.pack.author) p.warnings.push(`The author changed from “${mdText(oa)}” to “${mdText(p.pack.author)}”.`); } catch (e) { /* as above */ }
      }
    }
  }
  const shown = opt.base ? lib.packs.filter(p => changedPacks.includes(p.id)) : lib.packs;
  const errorsAll = problems.length + lib.packs.reduce((n, p) => n + p.errors.length, 0);
  // what the performance check should look at: the changed packs, or everything when only the machinery changed
  const perfTargets = opt.base ? (changedPacks.length ? changedPacks : otherChanged.length ? lib.packs.map(p => p.id) : []) : lib.packs.map(p => p.id);

  // ---- the report ----
  const lines = [`## ${errorsAll ? '❌' : '✅'} Pack check: ${errorsAll ? errorsAll + ' problem' + (errorsAll === 1 ? '' : 's') + ' to fix' : 'passed'}`, '', `Checked with OpenTick ${mdText(app.version)}, which reads the files exactly as the app does.`, ''];
  if (shown.length) {
    lines.push('| Pack | Code | What is in it | Result |', '|---|---|---|---|');
    for (const p of shown) lines.push(`| \`${mdText(p.id)}\` | ${p.row ? '`' + p.row.code + '`' : '—'} | ${p.row ? [p.row.sections ? p.row.sections + ' section' + (p.row.sections === 1 ? '' : 's') : '', p.row.themes ? p.row.themes + ' theme' + (p.row.themes === 1 ? '' : 's') : '', p.row.entries ? p.row.entries + ' entries' : ''].filter(Boolean).join(' · ') : '—'} | ${p.errors.length ? '❌' : p.warnings.length ? '⚠️' : '✅'} |`);
    lines.push('');
    if (shown.some(p => p.row)) lines.push('The **code** is what people type into OpenTick (Settings → Sections & packs → Pack library) once the pack is published. It is worked out from the pack’s id, so it never changes.', '');
  } else if (opt.base) lines.push('_No pack files changed in this pull request._', '');
  if (problems.length || lib.packs.some(p => p.errors.length)) {
    lines.push('### Problems', '');
    for (const t of problems) lines.push(`- ${mdText(t)}`);
    for (const p of lib.packs) if (!opt.base || changedPacks.includes(p.id) || p.errors.length) for (const t of p.errors) lines.push(`- **packs/${mdText(p.id)}.json:** ${mdText(t)}`);
    lines.push('');
  }
  const warn = lib.packs.filter(p => p.warnings.length && (!opt.base || changedPacks.includes(p.id)));
  if (warn.length || notes.length) { lines.push('### For the reviewer', ''); for (const p of warn) for (const t of p.warnings) lines.push(`- **packs/${mdText(p.id)}.json:** ${mdText(t)}`); for (const n of notes) lines.push(`- ${n}`); lines.push(''); }
  if (!opt.base) lines.push(`${lib.packs.length} pack${lib.packs.length === 1 ? '' : 's'} checked.`, '');
  const md = lines.join('\n');
  const json = { ok: !errorsAll, version: app.version, errors: errorsAll, problems, changed: changedPacks, perfTargets, packs: lib.packs.map(p => ({ id: p.id, code: p.row ? p.row.code : '', ok: p.ok && !p.errors.length, errors: p.errors, warnings: p.warnings })) };
  mkdirSync(resolve(ROOT, opt.report), { recursive: true });
  writeFileSync(join(resolve(ROOT, opt.report), 'validate.md'), md); writeFileSync(join(resolve(ROOT, opt.report), 'validate.json'), JSON.stringify(json, null, 2));
  // the console, plain
  for (const p of lib.packs) console.log(`${p.errors.length ? '✗' : p.warnings.length ? '!' : '✓'} ${p.id}${p.row ? '  ' + p.row.code : ''}`);
  for (const t of problems) console.error('✗ ' + t);
  for (const p of lib.packs) for (const t of p.errors) console.error(`  ✗ packs/${p.id}.json: ${t}`);
  for (const p of lib.packs) for (const t of p.warnings) console.log(`  ! packs/${p.id}.json: ${t}`);
  if (process.env.GITHUB_STEP_SUMMARY) { try { writeFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n', { flag: 'a' }); } catch (e) { /* not on GitHub */ } }
  console.log(errorsAll ? `\n${errorsAll} problem(s).` : `\nAll ${lib.packs.length} pack(s) are fine.`);
  return json;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run().then(j => { if (!j.ok) process.exit(1); }).catch(e => { console.error(e.message || e); process.exit(2); });
