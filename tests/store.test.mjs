import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLE, favoriteKey} from '../core.mjs';
import {readState, serializeState, readView, removeFavorite, toggleMembership, upsertGroup, deleteGroup, moveFavorite} from '../store.mjs';
const other = {...EXAMPLE, stop: '5015', route: '71', direction: '0', name: 'R.-Bourassa'};
const group = (over = {}) => ({id: 'g-abc', name: 'Travail', favorites: [favoriteKey(EXAMPLE)], triggers: [{days: [1, 2, 3, 4, 5], from: '05:00'}], ...over});
const state = (groups = [group()]) => ({favorites: [EXAMPLE, other], groups});
test('preserves intentionally empty favorites and validates saved data', () => {
  assert.equal(readState(null).favorites.length, 1);
  assert.deepEqual(readState('{"version":1,"favorites":[]}'), {favorites: [], groups: []});
  assert.deepEqual(readState(JSON.stringify({version: 1, favorites: [EXAMPLE]})).favorites, [EXAMPLE]);
  for (const input of ['oops', '{"version":3,"favorites":[]}', '{"version":2,"favorites":[]}', JSON.stringify({version: 1, favorites: [EXAMPLE, EXAMPLE]}), JSON.stringify({version: 1, favorites: [{...EXAMPLE, stop: '<script>'}]})]) assert.throws(() => readState(input));
});
test('migrates v1 storage to groups-ready v2 and round-trips', () => {
  const migrated = readState(JSON.stringify({version: 1, favorites: [EXAMPLE]}));
  assert.deepEqual(migrated.groups, []);
  assert.deepEqual(readState(serializeState(state())), state());
});
test('rejects invalid groups and drops references to unknown favorites', () => {
  const bad = [{id: 'x'}, {name: ''}, {name: 'a'.repeat(41)}, {triggers: [{days: [], from: '05:00'}]}, {triggers: [{days: [8], from: '05:00'}]}, {triggers: [{days: [1], from: '5:00'}]}, {triggers: [{days: [1], from: '24:00'}]}];
  for (const over of bad) assert.throws(() => readState(serializeState(state([group(over)]))), undefined, JSON.stringify(over));
  assert.throws(() => readState(serializeState(state([group(), group()]))));
  const cleaned = readState(serializeState(state([group({favorites: [favoriteKey(EXAMPLE), '9999:all', favoriteKey(EXAMPLE)]})])));
  assert.deepEqual(cleaned.groups[0].favorites, [favoriteKey(EXAMPLE)]);
});
test('group operations are pure and keep groups consistent', () => {
  const s = state(), before = JSON.stringify(s);
  assert.deepEqual(removeFavorite(s, favoriteKey(EXAMPLE)).groups[0].favorites, []);
  assert.equal(removeFavorite(s, favoriteKey(EXAMPLE)).favorites.length, 1);
  const added = toggleMembership(s, 'g-abc', favoriteKey(other));
  assert.deepEqual(added.groups[0].favorites, [favoriteKey(EXAMPLE), favoriteKey(other)]);
  assert.deepEqual(toggleMembership(added, 'g-abc', favoriteKey(other)).groups[0].favorites, [favoriteKey(EXAMPLE)]);
  assert.equal(upsertGroup(s, group({name: 'Bureau'})).groups[0].name, 'Bureau');
  assert.equal(upsertGroup(s, group({id: 'g-new'})).groups.length, 2);
  assert.equal(deleteGroup(s, 'g-abc').groups.length, 0);
  assert.equal(JSON.stringify(s), before);
});
test('moving swaps with the neighbouring visible favorite', () => {
  const third = {...EXAMPLE, stop: '1111', name: 'Troisième'}, s = {favorites: [EXAMPLE, other, third], groups: []};
  const keys = [favoriteKey(EXAMPLE), favoriteKey(third)];
  assert.deepEqual(moveFavorite(s, favoriteKey(third), -1, keys).favorites.map(favoriteKey), [favoriteKey(third), favoriteKey(other), favoriteKey(EXAMPLE)]);
  assert.equal(moveFavorite(s, favoriteKey(EXAMPLE), -1, keys), s);
});
test('reads the manual view tolerantly', () => {
  assert.deepEqual(readView('{"view":"g-abc","setAt":5}'), {view: 'g-abc', setAt: 5});
  for (const raw of [null, 'oops', '{"view":1,"setAt":5}', '{"view":"all"}']) assert.equal(readView(raw), null);
});
