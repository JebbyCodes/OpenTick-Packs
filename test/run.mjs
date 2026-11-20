// All of the library's own tests, one after the other.   node test/run.mjs [--no-browser]
// They need OpenTick's source next to this folder (or OPENTICK_DIR); the browser ones also need Playwright with Chromium.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const dir = dirname(fileURLToPath(import.meta.url)), noBrowser = process.argv.includes('--no-browser');
const tests = [['codes.test.mjs', false], ['rules.test.mjs', false], ['validate.test.mjs', false], ['build.test.mjs', false], ['site.test.mjs', true], ['perf.test.mjs', true]];
let failed = 0;
for (const [file, browser] of tests) {
  if (browser && noBrowser) { console.log(`- ${file} (skipped: --no-browser)`); continue; }
  const r = spawnSync('node', [join(dir, file)], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: process.env, timeout: 10 * 60 * 1000 });
  if (r.status === 0) console.log(`✓ ${file}: ${r.stdout.trim().split('\n').pop()}`); else { failed++; console.log(`✗ ${file}\n${r.stdout}${r.stderr}`); }
}
console.log(failed ? `\n${failed} test file(s) failed.` : '\nAll the library tests passed.'); process.exit(failed ? 1 : 0);
