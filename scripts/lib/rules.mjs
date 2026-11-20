// The rules a pack in this library has to follow, in one place. Used by scripts/validate.mjs (the pull request check), by scripts/build-site.mjs
// (which refuses to publish anything that breaks them) and by the tests.
//
// Two kinds of finding:  errors  stop the pull request;  warnings  are shown to the person who reviews it, who decides.
import { createHash } from 'node:crypto';
import { codeFor } from './codes.mjs';

export const FILE_MAX = 400 * 1024;                       // a pack is read on every device that adds it
export const LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'MIT', 'Apache-2.0', 'ISC', 'Unlicense'];
export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, TAG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TAGS_MAX = 6;

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// 1.2.3 vs 1.10.0 (numbers, not text); a pre-release comes before its release
export function cmpVersion(a, b) {
  const p = v => { const m = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(v || ''); return m ? [+m[1], +m[2], +m[3], m[4] || ''] : null; }, x = p(a), y = p(b); if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  if (x[3] === y[3]) return 0; if (!x[3]) return 1; if (!y[3]) return -1; return x[3] < y[3] ? -1 : 1;
}

// ---- colours: enough of CSS to judge a theme (#rgb, #rrggbb, rgb(), rgba(), hsl()) ----
export function parseColour(v) {
  v = String(v || '').trim().toLowerCase(); let m;
  if ((m = /^#([0-9a-f]{3})$/.exec(v))) return [...m[1]].map(c => parseInt(c + c, 16));
  if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v))) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  if ((m = /^rgba?\(\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?/.exec(v))) { const pct = /%/.test(v.split(')')[0].split(',')[0]); return [m[1], m[2], m[3]].map(n => Math.max(0, Math.min(255, Math.round(pct ? +n * 2.55 : +n)))); }
  if ((m = /^hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/.exec(v))) {
    const h = ((+m[1] % 360) + 360) % 360 / 360, s = Math.min(1, +m[2] / 100), l = Math.min(1, +m[3] / 100), q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(x => Math.round(x * 255));
  }
  return null;
}
const lum = ([r, g, b]) => { const c = [r, g, b].map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
export const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05); };

// ---- text a person would not want published by accident ----
// (Written to take linear time however hostile the text: the obvious one-line email pattern takes quadratic time on a long run of letters,
//  and a pull request is allowed to contain any text at all.)
function emailsIn(s) {
  const out = []; let i = s.indexOf('@');
  while (i >= 0 && out.length < 5) {
    const left = /[A-Za-z0-9._%+-]{1,64}$/.exec(s.slice(Math.max(0, i - 64), i)), right = /^[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,}/.exec(s.slice(i + 1, i + 261));
    if (left && right) out.push(left[0] + '@' + right[0]); i = s.indexOf('@', i + 1);
  }
  return out;
}
export function personalData(strings) {
  const out = new Set();
  for (const full of strings) {
    const s = full.slice(0, 20000);
    for (const m of emailsIn(s)) out.add(`an email address (${m})`);
    for (const m of s.match(/\+?\(?\d[\d\s().-]{7,40}\d/g) || []) if (m.replace(/\D/g, '').length >= 9 && !/^\d{4}-\d{2}-\d{2}/.test(m.trim())) out.add(`a phone-number-like number (${m.trim()})`);
  }
  return [...out].slice(0, 5);
}
function allStrings(v, out = []) { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(x => allStrings(x, out)); else if (v && typeof v === 'object') Object.values(v).forEach(x => allStrings(x, out)); return out; }

/* Everything wrong or doubtful about one pack file.
   file: 'packs/<id>.json'   bytes: a Buffer   parse: OpenTick's packParse
   -> { id, ok, errors, warnings, row }   row is what the index lists for it (null when there are errors) */
export function inspectPack(file, bytes, parse) {
  const errors = [], warnings = [], e = m => errors.push(m), w = m => warnings.push(m);
  const mm = /^packs\/([^/]+)\.json$/.exec(file), id = mm ? mm[1] : '';
  if (!mm) { e('A pack file must be directly inside packs/ and end in .json.'); return { id: '', ok: false, errors, warnings, row: null }; }
  if (!ID_RE.test(id) || id.length > 40) e('The file name (the pack’s id) must be lower-case words joined by hyphens, at most 40 characters: like "study-planner".');
  if (bytes.length > FILE_MAX) e(`The file is ${Math.round(bytes.length / 1024)} KB; the limit is ${FILE_MAX / 1024} KB.`);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) e('The file starts with a byte-order mark (BOM). Save it as plain UTF-8 without one.');
  let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (x) { e('The file is not valid UTF-8 text.'); return { id, ok: false, errors, warnings, row: null }; }
  let raw; try { raw = JSON.parse(text); } catch (x) { e('The file is not valid JSON: ' + x.message); return { id, ok: false, errors, warnings, row: null }; }
  let r; try { r = parse(text); } catch (x) { e('OpenTick does not accept this file: ' + (x && x.message || x)); return { id, ok: false, errors, warnings, row: null }; }
  const p = r.pack;
  for (const m of r.warnings) e('OpenTick had to change something while reading it: ' + m);
  if (p.id !== id) e(`The pack says id "${p.id}" but the file is called ${id}.json. They must be the same.`);
  if (!SEMVER.test(p.version)) e(`The version "${p.version}" is not like 1.2.3.`);
  if (!LICENSES.includes(p.license)) e(`The licence "${p.license}" is not one of: ${LICENSES.join(', ')}.`);
  if (!p.author) e('The author is missing.');
  if (p.name.length < 3) e('The name is too short.');
  if (p.description.length < 10) e('The description is missing or too short (say what the pack is for, in a sentence).');
  if (!p.sections.length && !p.themes.length) e('The pack has no sections and no themes.');
  for (const s of p.sections) { if (!s.fields.length) e(`The section “${s.name}” has no fields.`); if (s.group && !s.fields.some(f => f.key === s.group)) e(`The section “${s.name}” groups by a field that does not exist.`); }
  // tags are for the library only (the app does not use them): up to six, lower case words
  const tags = Array.isArray(raw.tags) ? raw.tags : raw.tags === undefined ? [] : null;
  if (tags === null) e('"tags" must be a list of words, like ["study", "school"].');
  else {
    if (tags.length > TAGS_MAX) e(`At most ${TAGS_MAX} tags.`);
    for (const t of tags) if (typeof t !== 'string' || !TAG_RE.test(t) || t.length > 24) e(`The tag ${JSON.stringify(t)} must be lower-case words joined by hyphens (24 characters at most).`);
    if (!tags.length) w('The pack has no tags, so it will be hard to find by topic. Add one to six in "tags".');
  }
  // themes: readable text matters more than taste
  for (const t of p.themes) {
    const bg = parseColour(t.vars['--bg']), fg = parseColour(t.vars['--text']), acc = parseColour(t.vars['--acc']), onAcc = parseColour(t.vars['--on-acc']), side = parseColour(t.vars['--side']), muted = parseColour(t.vars['--muted']);
    if (bg && fg) { const c = contrast(bg, fg); if (c < 3) e(`The theme “${t.name}”: the text colour on the background has a contrast of ${c.toFixed(1)}:1. It is hard to read; aim for 4.5:1 or more.`); else if (c < 4.5) w(`The theme “${t.name}”: text on the background has a contrast of ${c.toFixed(1)}:1 (4.5:1 or more is recommended).`); }
    if (side && fg) { const c = contrast(side, fg); if (c < 3) e(`The theme “${t.name}”: text on the sidebar has a contrast of ${c.toFixed(1)}:1.`); }
    if (bg && muted && contrast(bg, muted) < 3) w(`The theme “${t.name}”: the “muted” text colour is hard to see on the background (${contrast(bg, muted).toFixed(1)}:1).`);
    if (acc && onAcc && contrast(acc, onAcc) < 3) e(`The theme “${t.name}”: text on the accent colour (buttons) has a contrast of ${contrast(acc, onAcc).toFixed(1)}:1.`);
    if (bg && acc && contrast(bg, acc) < 1.5) w(`The theme “${t.name}”: the accent colour is almost the same as the background.`);
  }
  // things a person would not want published by accident (a reviewer decides)
  const pd = personalData(allStrings(raw)); if (pd.length) w('It contains what looks like personal data: ' + pd.join('; ') + '. Packs must not contain anyone’s personal details.');
  const links = allStrings(raw.sections || []).filter(s => /^https?:\/\//i.test(s)).length; if (links) w(`${links} link(s) in the entries: the reviewer will look at where they lead.`);
  const entries = p.sections.reduce((n, s) => n + s.entries.length, 0);
  const row = errors.length ? null : {
    code: codeFor(id), id, file, name: p.name, version: p.version, author: p.author, description: p.description, license: p.license, sections: p.sections.length, themes: p.themes.length, entries, tags: tags || [],
    size: bytes.length, sha256: sha256(bytes),
  };
  return { id, ok: !errors.length, errors, warnings, row, pack: p };
}
