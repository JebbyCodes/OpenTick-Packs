// A throw-away copy of this repository in a temporary folder (with its own git history) for tests that change files and run the real scripts.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, openTickDir } from '../scripts/lib/app.mjs';
export function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'packs-sandbox-'));
  for (const f of ['scripts', 'packs', 'site', 'package.json', 'perf-budget.json', '.gitignore']) cpSync(join(ROOT, f), join(dir, f), { recursive: true });
  const git = (...a) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=Test', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'base');
  const env = { ...process.env, OPENTICK_DIR: openTickDir() };
  const nodeEnv = (extra, script, ...args) => { const r = spawnSync('node', [join(dir, 'scripts', script), ...args], { cwd: dir, env: { ...env, ...extra }, encoding: 'utf8', timeout: 240000 }); return { status: r.status, out: r.stdout + r.stderr }; };
  const node = (script, ...args) => nodeEnv({}, script, ...args);
  const read = f => readFileSync(join(dir, f), 'utf8'), write = (f, t) => writeFileSync(join(dir, f), t), json = f => JSON.parse(read(f));
  return { dir, git, node, nodeEnv, read, write, json, exists: f => existsSync(join(dir, f)), remove: f => rmSync(join(dir, f)), reset: () => { git('checkout', '-q', '--', '.'); git('clean', '-qfd'); }, done: () => rmSync(dir, { recursive: true, force: true }) };
}
