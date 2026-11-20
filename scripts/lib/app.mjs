// The checks use OpenTick itself to read a pack: the same packParse the app runs, from the app's own test harness, so a pack that passes here is
// exactly a pack the app accepts, and the two can never drift apart. That needs the OpenTick source next to this repository (CI checks it out).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export function openTickDir() {
  const dir = resolve(process.env.OPENTICK_DIR || join(ROOT, '..', 'OpenTick'));
  if (!existsSync(join(dir, 'test', 'harness.mjs')) || !existsSync(join(dir, 'build-app.mjs'))) {
    throw new Error(`OpenTick's source was not found at ${dir}.\nCheck out https://github.com/JebbyCodes/OpenTick next to this folder (or set OPENTICK_DIR to where it is). The checks on GitHub do this by themselves.`);
  }
  return dir;
}
export const openTickVersion = dir => { try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version; } catch (e) { return '?'; } };
// -> { dir, version, makeApp, parse } ; parse(text) is the app's packParse (it throws when the app refuses the file)
export async function loadApp() {
  const dir = openTickDir(), mod = await import(pathToFileURL(join(dir, 'test', 'harness.mjs')).href), app = mod.makeApp();
  return { dir, version: openTickVersion(dir), makeApp: mod.makeApp, parse: app.packParse, install: (pack, a = mod.makeApp()) => ({ app: a, result: a.packInstall(pack) }) };
}
