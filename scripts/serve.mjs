#!/usr/bin/env node
// Preview the website locally: builds _site/ and serves it at http://localhost:8080 (PORT=… to change). Needs OpenTick's source like the checks do.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/app.mjs';
import { build } from './build-site.mjs';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
// a tiny static file server: the folder, no listing, nothing outside it
export function serveDir(dir, port = 0) {
  const server = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(dir, p)); if (!f.startsWith(resolve(dir)) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }); res.end(readFileSync(f));
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = join(ROOT, '_site'); await build(out); const s = await serveDir(out, +process.env.PORT || 8080); console.log(`http://localhost:${s.address().port}/   (Ctrl+C to stop)`);
}
