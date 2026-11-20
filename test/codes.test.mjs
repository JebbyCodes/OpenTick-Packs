// A pack's code is worked out from its id and must never change: every code that has been shared depends on it.
import assert from 'node:assert/strict';
import { codeFor, CODE_RE, ALPHABET } from '../scripts/lib/codes.mjs';
const FIXED = { 'study-planner': 'HN6G-1CE5', 'garden-journal': 'SE1T-VKKW', 'home-maintenance': '0VS3-XGBB', 'calm-themes': 'QH0G-2RKW' };
for (const [id, code] of Object.entries(FIXED)) assert.equal(codeFor(id), code, `the code of ${id} must not change`);
assert.equal(ALPHABET.length, 32); assert.ok(!/[ILOU]/.test(ALPHABET), 'no I, L, O or U');
const seen = new Set();
for (let i = 0; i < 20000; i++) { const c = codeFor('pack-' + i); assert.match(c, CODE_RE); assert.ok(!seen.has(c), 'no collisions in 20 000 ids'); seen.add(c); }
assert.equal(codeFor('x'), codeFor('x'), 'the same id always gives the same code'); assert.notEqual(codeFor('x'), codeFor('y'));
console.log('code tests passed (fixed codes, alphabet, 20 000 ids without a collision)');
