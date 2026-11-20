// A pack's CODE: 8 letters and digits written XXXX-XXXX, worked out from the pack's id (so it never changes and needs no list to hand them out).
// The alphabet leaves out I, L, O and U, so nothing looks like anything else; OpenTick reads O as 0 and I or L as 1 when someone types one.
// DO NOT CHANGE THIS FILE'S RESULT: every code that has been shared would stop working. test/run.mjs checks fixed examples.
import { createHash } from 'node:crypto';
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function codeFor(id) {
  const digest = createHash('sha256').update('opentick-pack:' + id).digest();
  let n = 0n; for (const b of digest.subarray(0, 5)) n = (n << 8n) | BigInt(b); // 40 bits -> 8 characters of 5 bits
  let s = ''; for (let i = 0; i < 8; i++) { s = ALPHABET[Number(n & 31n)] + s; n >>= 5n; }
  return s.slice(0, 4) + '-' + s.slice(4);
}
export const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
