/* OpenTick Packs: the website. It lists index.json, lets people search and filter, and shows a pack's code, a download and what is inside.
   Everything from the library is shown as text (never as HTML), links are checked before they are used, and colours are checked before
   they are put in a style, so a pack can not change this page. */
(() => {
  'use strict';
  const APP = 'https://jebbycodes.github.io/OpenTick/', REPO = 'https://github.com/JebbyCodes/OpenTick-Packs';
  const $ = s => document.querySelector(s);
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const CODE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
  const colour = v => (typeof v === 'string' && /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/a-z-]{3,40}\))$/i.test(v.trim()) ? v.trim() : '');
  const httpUrl = v => (typeof v === 'string' && /^https?:\/\/[^\s<>"']+$/i.test(v) ? v : '');
  const state = { packs: [], q: '', kind: 'all', tag: '', sort: 'new' };
  const ICONS = {
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4c3 0 5.6-2.5 5.6-5.6C22.9 5.7 18 2 12 2z"/>',
  };
  const icon = name => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '20'); s.setAttribute('height', '20'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = ICONS[name]; return s; }; // (innerHTML of a fixed string above, never of library data)

  function clean(raw) { // the index is data from the network: keep only what is well formed
    if (!raw || raw.opentick !== 'pack-index' || !Array.isArray(raw.packs)) throw new Error('The library sent something that is not a pack index.');
    const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n), int = v => (Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0);
    return raw.packs.filter(p => p && CODE.test(p.code) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id) && p.file === `packs/${p.id}.json`).map(p => ({ code: p.code, id: p.id, file: p.file, name: str(p.name, 60) || p.id, version: str(p.version, 20), author: str(p.author, 60), description: str(p.description, 300), license: str(p.license, 40), sections: int(p.sections), themes: int(p.themes), entries: int(p.entries), tags: (Array.isArray(p.tags) ? p.tags : []).map(t => str(t, 24)).filter(Boolean).slice(0, 6), updated: /^\d{4}-\d\d-\d\d$/.test(p.updated || '') ? p.updated : '' }));
  }
  const counts = p => [p.sections ? plural(p.sections, 'section') : '', p.themes ? plural(p.themes, 'theme') : '', p.entries ? plural(p.entries, 'entry').replace('entrys', 'entries') : ''].filter(Boolean);
  const matches = p => {
    if (state.kind === 'sections' && !p.sections) return false; if (state.kind === 'themes' && !p.themes) return false; if (state.tag && !p.tags.includes(state.tag)) return false;
    const words = state.q.toLowerCase().split(/\s+/).filter(Boolean), hay = [p.name, p.id, p.author, p.description, p.code, p.code.replace('-', ''), p.tags.join(' ')].join(' ').toLowerCase().replace(/-/g, ' ');
    return words.every(w => hay.includes(w.replace(/-/g, ' ')));
  };
  const order = { new: (a, b) => (b.updated || '').localeCompare(a.updated || '') || a.name.localeCompare(b.name), name: (a, b) => a.name.localeCompare(b.name), size: (a, b) => b.entries - a.entries || a.name.localeCompare(b.name) };

  function copy(text, button) {
    const done = () => { const old = button.textContent; button.textContent = 'Copied'; setTimeout(() => { button.textContent = old; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => { prompt('Copy this code:', text); });
    else prompt('Copy this code:', text);
  }

  function chips() {
    const kinds = $('#kinds'); kinds.replaceChildren(...[['all', 'All'], ['sections', 'Sections'], ['themes', 'Themes']].map(([k, l]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.kind === k), text: l, onclick: () => { state.kind = k; render(); } })));
    const count = {}; for (const p of state.packs) for (const t of p.tags) count[t] = (count[t] || 0) + 1;
    $('#tags').replaceChildren(...Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14).map(([t]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.tag === t), text: '#' + t, onclick: () => { state.tag = state.tag === t ? '' : t; render(); } })));
  }
  function render() {
    chips();
    const hits = state.packs.filter(matches).sort(order[state.sort]), grid = $('#grid'), st = $('#status');
    st.className = 'status'; st.textContent = state.packs.length ? (hits.length ? `${plural(hits.length, 'pack')}${hits.length === state.packs.length ? '' : ' of ' + state.packs.length}` : 'Nothing matches. Try fewer words, or clear the filters.') : 'The library has no packs yet.';
    grid.replaceChildren(...hits.map(p => h('li', {}, h('button', { type: 'button', class: 'card', onclick: () => open(p), 'aria-label': `${p.name}, code ${p.code}. Open` },
      h('div', { class: 'head' }, h('span', { class: 'ic' }, icon(p.themes && !p.sections ? 'palette' : 'layers')), h('h2', {}, p.name, p.version ? h('em', { text: 'v' + p.version }) : null)),
      h('p', { text: p.description }),
      h('div', { class: 'meta' }, p.author ? h('span', { text: 'by ' + p.author }) : null, counts(p).map(c => h('span', { text: c }))),
      h('span', { class: 'codechip', text: p.code })))));
  }

  // ---- one pack ----
  async function open(p) {
    const dlg = $('#dlg'), body = $('#dlg-body'), copyBtn = h('button', { type: 'button', class: 'btn pri', text: 'Copy code' });
    copyBtn.addEventListener('click', () => copy(p.code, copyBtn));
    const preview = h('div', {}, h('p', { class: 'note', text: 'Looking inside…' }));
    body.replaceChildren(h('div', { class: 'd' },
      h('button', { type: 'button', class: 'close', text: 'Close', onclick: () => dlg.close() }),
      h('h2', { id: 'dlg-title', text: p.name }), h('p', { class: 'by', text: [p.version ? 'Version ' + p.version : '', p.author ? 'by ' + p.author : '', p.license].filter(Boolean).join(' · ') }),
      p.description ? h('p', { class: 'desc', text: p.description }) : null,
      h('div', { class: 'code' }, h('strong', { text: p.code }), copyBtn, h('small', { text: 'In OpenTick: Settings → Sections & packs → Pack library → type this code.' })),
      h('div', { class: 'btns' }, h('a', { class: 'btn', href: `${APP}?pack=${encodeURIComponent(p.code)}`, rel: 'noopener', text: 'Open in OpenTick (web app)' }), h('a', { class: 'btn', href: p.file, download: `${p.id}.json`, text: 'Download the file' }), h('a', { class: 'btn', href: `${REPO}/blob/main/${p.file}`, rel: 'noopener', text: 'View on GitHub' })),
      h('h3', { text: 'Inside' }), preview,
      h('p', { class: 'how', html: null }, h('b', { text: 'Using the file instead of the code: ' }), 'in OpenTick choose Settings → Sections & packs → Add a pack… and pick the downloaded file.')));
    if (!dlg.open) dlg.showModal(); history.replaceState(null, '', '#' + p.code);
    try {
      const r = await fetch(p.file, { cache: 'no-cache' }); if (!r.ok) throw new Error('not found'); const j = JSON.parse(await r.text());
      preview.replaceChildren(...inside(j));
    } catch (e) { preview.replaceChildren(h('p', { class: 'note', text: 'Could not load the preview. The download button still works.' })); }
  }
  function inside(j) {
    const out = [], home = httpUrl(j.homepage);
    for (const s of (Array.isArray(j.sections) ? j.sections : []).slice(0, 12)) {
      const fields = (Array.isArray(s.fields) ? s.fields : []).slice(0, 24), entries = (Array.isArray(s.entries) ? s.entries : []).slice(0, 5), box = h('div', { class: 'sec' }, h('b', { text: String(s.name || 'Section').slice(0, 60) }));
      box.append(h('div', {}, fields.map(f => h('span', { class: 'f' }, String(f.name || '').slice(0, 40), h('i', { text: String(f.type || 'text') })))));
      if (entries.length) { const cols = fields.slice(0, 4); box.append(h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: String(s.title || 'Name').slice(0, 30) }), cols.map(f => h('th', { text: String(f.name || '').slice(0, 40) })))), h('tbody', {}, entries.map(e => h('tr', {}, h('td', { text: String(e.title || '').slice(0, 80) }), cols.map(f => { const v = e.vals && e.vals[f.key]; return h('td', { text: v == null ? '' : Array.isArray(v) ? v.join(', ') : v === true ? '✓' : String(v).slice(0, 80) }); }))))))); }
      out.push(box);
    }
    const th = (Array.isArray(j.themes) ? j.themes : []).slice(0, 6);
    if (th.length) out.push(h('div', { class: 'themes' }, th.map(t => { const v = t && t.vars || {}, bg = colour(v['--bg']) || '#222', side = colour(v['--side']) || bg, tx = colour(v['--text']) || '#eee', acc = colour(v['--acc']) || '#58f';
      return h('div', { class: 'th' }, h('div', { class: 'pv', style: `background:${bg}` }, h('i', { style: `background:${side}` }), h('div', { style: `color:${tx}` }, 'Aa task', h('br'), h('u', { style: `background:${acc}` }))), h('p', { text: String(t.name || 'Theme').slice(0, 40) })); })));
    if (home) out.push(h('p', { class: 'note' }, 'More from the author: ', h('a', { href: home, rel: 'noopener noreferrer', text: home })));
    return out.length ? out : [h('p', { class: 'note', text: 'Nothing to preview.' })];
  }

  // ---- start ----
  async function start() {
    $('#q').addEventListener('input', e => { state.q = e.target.value; render(); });
    $('#sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
    $('#dlg').addEventListener('close', () => { if (location.hash) history.replaceState(null, '', location.pathname + location.search); });
    $('#dlg').addEventListener('click', e => { if (e.target === $('#dlg')) $('#dlg').close(); });
    try {
      const r = await fetch('index.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('The library answered ' + r.status + '.');
      state.packs = clean(await r.json()); render();
      const hash = decodeURIComponent(location.hash.slice(1)).toUpperCase(), hit = CODE.test(hash) && state.packs.find(p => p.code === hash); if (hit) open(hit);
    } catch (e) { const st = $('#status'); st.className = 'status bad'; st.textContent = 'Could not load the library: ' + (e && e.message || e); }
  }
  start();
})();
