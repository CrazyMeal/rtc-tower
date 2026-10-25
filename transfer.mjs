import {favoriteKey} from './core.mjs?v=16';
import {parseState} from './store.mjs?v=16';
const LINK_VERSION = 1, MAX_LINK = 8000, MAX_PACKED = 65536, MAX_FILE = 100000, APP = 'rtc-tower';
const bad = () => new Error('Ce lien de transfert est invalide ou incomplet.');
function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw bad();
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
// Streams the bytes through a (de)compressor; the output is capped so a tiny link cannot inflate into something huge.
async function pipe(bytes, transform, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw bad(); }
    chunks.push(value);
  }
  const out = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}
const toMask = days => days.reduce((mask, day) => mask | 1 << (day - 1), 0);
const fromMask = mask => [1, 2, 3, 4, 5, 6, 7].filter(day => mask & 1 << (day - 1));
// Compact tuples: favorites as arrays, groups pointing at favorites by index, days as a bitmask.
export function pack({favorites, groups}) {
  const index = new Map(favorites.map((f, i) => [favoriteKey(f), i]));
  return [LINK_VERSION,
    favorites.map(f => [f.stop, f.route, f.direction, f.mode === 'all' ? 'a' : 'r', f.label, f.name]),
    groups.map(g => [g.name, g.favorites.map(key => index.get(key)).filter(i => i !== undefined), g.triggers.map(t => [toMask(t.days), t.from.replace(':', '')])])];
}
export function unpack(packed) {
  if (!Array.isArray(packed) || packed[0] !== LINK_VERSION || !Array.isArray(packed[1]) || !Array.isArray(packed[2])) throw bad();
  const favorites = packed[1].map(t => {
    if (!Array.isArray(t)) throw bad();
    return {stop: t[0], route: t[1], direction: t[2], mode: t[3] === 'a' ? 'all' : t[3] === 'r' ? 'route' : undefined, label: t[4], name: t[5]};
  });
  const stamp = Date.now().toString(36);
  const groups = packed[2].map((t, i) => {
    if (!Array.isArray(t) || !Array.isArray(t[1]) || !Array.isArray(t[2])) throw bad();
    return {id: `g-${stamp}${i.toString(36)}`, name: t[0], favorites: t[1].map(n => favorites[n] && favoriteKey(favorites[n])),
      triggers: t[2].map(x => {
        if (!Array.isArray(x) || !Number.isInteger(x[0]) || typeof x[1] !== 'string' || x[1].length !== 4) throw bad();
        return {days: fromMask(x[0]), from: `${x[1].slice(0, 2)}:${x[1].slice(2)}`};
      })};
  });
  return parseState({version: 2, favorites, groups});
}
export async function encodeLink(state, base) {
  const json = new TextEncoder().encode(JSON.stringify(pack(state)));
  return `${base.split('#')[0]}#import=${LINK_VERSION}.${toBase64Url(await pipe(json, new CompressionStream('deflate-raw'), MAX_PACKED))}`;
}
// Accepts a full link or a bare "#import=…" fragment.
export async function decodeLink(input) {
  const text = String(input).trim();
  if (!text || text.length > MAX_LINK) throw bad();
  const fragment = text.includes('#') ? text.slice(text.lastIndexOf('#') + 1) : text, match = fragment.match(/^import=(\d+)\.([A-Za-z0-9_-]+)$/);
  if (!match || Number(match[1]) !== LINK_VERSION) throw bad();
  try {
    const json = await pipe(fromBase64Url(match[2]), new DecompressionStream('deflate-raw'), MAX_PACKED);
    return unpack(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(json)));
  } catch { throw bad(); }
}
export const exportFile = ({favorites, groups}, now = new Date()) => JSON.stringify({app: APP, exportedAt: now.toISOString(), version: 2, favorites, groups}, null, 2);
export function importFile(text) {
  if (text.length > MAX_FILE) throw new Error('Ce fichier est trop volumineux pour être une configuration RTC Tower.');
  let saved;
  try { saved = JSON.parse(text); } catch { throw new Error('Ce fichier n’est pas un export RTC Tower lisible.'); }
  if (!saved || saved.app !== APP) throw new Error('Ce fichier n’est pas un export RTC Tower.');
  try { return parseState(saved); } catch { throw new Error('Ce fichier d’export est invalide ou corrompu.'); }
}
