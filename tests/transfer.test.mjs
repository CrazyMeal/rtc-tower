import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLE, favoriteKey} from '../core.mjs';
import {MAX_FAVORITES, readState, serializeState} from '../store.mjs';
import {encodeLink, decodeLink, exportFile, importFile, pack} from '../transfer.mjs';
const other = {...EXAMPLE, stop: '5015', route: '71', direction: '0', label: 'Retour à la maison', name: 'R.-Bourassa'};
const all = {stop: '1111', route: '70', direction: '1', mode: 'all', label: '', name: 'Terminus é'};
const BASE = 'https://example.github.io/rtc-tower/';
const state = () => ({favorites: [EXAMPLE, other, all], groups: [
  {id: 'g-work', name: 'Travail', favorites: [favoriteKey(EXAMPLE), favoriteKey(all)], triggers: [{days: [1, 2, 3, 4, 5], from: '05:00'}, {days: [6], from: '09:30'}]},
  {id: 'g-back', name: 'Retour', favorites: [favoriteKey(other)], triggers: [{days: [1, 2, 3, 4, 5, 6, 7], from: '13:00'}]}]});
const withoutIds = s => ({...s, groups: s.groups.map(({id, ...g}) => g)});
// Builds a link around an arbitrary payload, as a hostile or corrupted sender could.
async function forge(bytes) {
  const out = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')), buf = new Uint8Array(await new Response(out).arrayBuffer());
  return `${BASE}#import=1.${Buffer.from(buf).toString('base64url')}`;
}
test('link round-trips favorites, memberships and triggers', async () => {
  const link = await encodeLink(state(), BASE + '#old');
  assert.ok(link.startsWith(`${BASE}#import=1.`));
  const decoded = await decodeLink(link);
  assert.deepEqual(withoutIds(decoded), withoutIds(state()));
  assert.ok(decoded.groups.every(g => /^g-[a-z0-9]{1,20}$/.test(g.id)));
  assert.equal(new Set(decoded.groups.map(g => g.id)).size, 2);
  assert.deepEqual(readState(serializeState(decoded)), decoded);
  assert.deepEqual(withoutIds(await decodeLink(link.slice(link.indexOf("#")))), withoutIds(decoded));
});
test('link stays short for a typical configuration', async () => {
  const favorites = Array.from({length: 8}, (_, i) => ({stop: String(5000 + i), route: String(70 + i), direction: '1', mode: 'route', label: i % 2 ? 'Travail' : '', name: `Arrêt numéro ${i} / ${5000 + i}`}));
  const groups = ['Travail', 'Retour', 'Week-end'].map((name, i) => ({id: `g-${i}`, name, favorites: favorites.slice(i, i + 4).map(favoriteKey), triggers: [{days: [1, 2, 3, 4, 5], from: '07:00'}]}));
  const link = await encodeLink({favorites, groups}, BASE);
  assert.ok(link.length < 700, `link length ${link.length}`);
  assert.equal((await decodeLink(link)).favorites.length, 8);
});
test('an empty configuration round-trips', async () => {
  assert.deepEqual(await decodeLink(await encodeLink({favorites: [], groups: []}, BASE)), {favorites: [], groups: []});
});
test('rejects malformed, tampered or oversized links', async () => {
  const good = await encodeLink(state(), BASE), packed = pack(state());
  const tampered = structuredClone(packed); tampered[1][0][0] = '<script>';
  const unknownVersion = structuredClone(packed); unknownVersion[0] = 2;
  const badMode = structuredClone(packed); badMode[1][0][3] = 'x';
  const badTrigger = structuredClone(packed); badTrigger[2][0][2][0] = [1, '5:00'];
  const tooMany = structuredClone(packed); tooMany[1] = Array.from({length: MAX_FAVORITES + 1}, (_, i) => ['1', String(i), '0', 'r', '', 'n']); tooMany[2] = [];
  const inputs = ['', 'hello', `${BASE}#import=`, `${BASE}#import=1.`, `${BASE}#import=1.***`, `${BASE}#import=2.${good.split('.').pop()}`, good.slice(0, -10), good + 'A'.repeat(8000),
    `${BASE}#import=1.AAAA`, await forge(new TextEncoder().encode('not json')), await forge(new TextEncoder().encode('{"a":1}'))];
  for (const payload of [tampered, unknownVersion, badMode, badTrigger, tooMany]) inputs.push(await forge(new TextEncoder().encode(JSON.stringify(payload))));
  for (const input of inputs) await assert.rejects(() => decodeLink(input), /lien de transfert/, input.slice(0, 80));
});
test('refuses a payload that inflates beyond the cap', async () => {
  await assert.rejects(async () => decodeLink(await forge(new Uint8Array(5_000_000).fill(32))), /lien de transfert/);
});
test('file export round-trips and accepts v1 files', () => {
  const text = exportFile(state(), new Date('2026-10-25T12:00:00Z'));
  assert.equal(JSON.parse(text).app, 'rtc-tower');
  assert.deepEqual(importFile(text), state());
  assert.deepEqual(importFile(JSON.stringify({app: 'rtc-tower', version: 1, favorites: [EXAMPLE]})), {favorites: [EXAMPLE], groups: []});
});
test('rejects files that are not valid RTC Tower exports', () => {
  const ok = JSON.parse(exportFile(state()));
  for (const text of ['oops', 'null', '{"version":2,"favorites":[],"groups":[]}', JSON.stringify({...ok, version: 3}), JSON.stringify({...ok, favorites: [{...EXAMPLE, stop: '<b>'}]}), JSON.stringify({...ok, favorites: [EXAMPLE, EXAMPLE]}), 'x'.repeat(100001)]) assert.throws(() => importFile(text), undefined, text.slice(0, 60));
});
test('the destination travels with the link, and links without it still decode', async () => {
  const withTo = {favorites: [{...EXAMPLE, to: 'Val-Bélair'}, {...other}], groups: []};
  const decoded = await decodeLink(await encodeLink(withTo, BASE));
  assert.deepEqual(decoded.favorites.map(f => f.to), ['Val-Bélair', undefined]);
  const old = pack({favorites: [EXAMPLE], groups: []});
  assert.equal(old[1][0].length, 6);
  assert.equal((await decodeLink(await forge(new TextEncoder().encode(JSON.stringify(old))))).favorites[0].to, undefined);
  const long = pack(withTo); long[1][0][6] = 'x'.repeat(81);
  await assert.rejects(async () => decodeLink(await forge(new TextEncoder().encode(JSON.stringify(long)))), /lien de transfert/);
});
