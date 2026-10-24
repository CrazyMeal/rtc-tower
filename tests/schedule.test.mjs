import test from 'node:test';
import assert from 'node:assert/strict';
import {quebecClock, lastTrigger, nextTrigger, resolveView} from '../schedule.mjs';
const at = iso => new Date(iso);
const weekdays = [1, 2, 3, 4, 5];
const work = {id: 'g-work', name: 'Travail', favorites: [], triggers: [{days: weekdays, from: '05:00'}]};
const back = {id: 'g-back', name: 'Retour', favorites: [], triggers: [{days: weekdays, from: '13:00'}]};
const weekend = {id: 'g-end', name: 'Week-end', favorites: [], triggers: [{days: [6, 7], from: '00:00'}]};
const groups = [work, back, weekend];
// 2026-10-27 is a Tuesday and Québec is on EDT (UTC-4) until 1 November.
const active = (iso, manual = null) => resolveView(groups, manual, at(iso));
test('reads the Québec weekday and time, in summer and winter', () => {
  assert.deepEqual(quebecClock(at('2026-10-27T11:40:00Z')), {day: 2, minutes: 460});
  assert.deepEqual(quebecClock(at('2026-12-15T12:00:00Z')), {day: 2, minutes: 420});
  assert.deepEqual(quebecClock(at('2026-10-28T04:00:00Z')), {day: 3, minutes: 0});
});
test('the most recent trigger decides the group, overnight and across the week-end', () => {
  assert.equal(active('2026-10-27T11:40:00Z').id, 'g-work');
  assert.equal(active('2026-10-27T21:10:00Z').id, 'g-back');
  assert.equal(active('2026-10-28T06:00:00Z').id, 'g-back', 'Wednesday 02:00 is still the afternoon group');
  assert.equal(active('2026-10-28T09:00:00Z').id, 'g-work', 'Wednesday 05:00 switches exactly on the trigger');
  assert.equal(active('2026-10-31T14:00:00Z').id, 'g-end');
  assert.equal(active('2026-10-26T07:00:00Z').id, 'g-end', 'Monday 03:00 still follows Sunday');
});
test('ties go to the first group and no trigger means every stop', () => {
  const tied = [{...back, id: 'g-1'}, {...back, id: 'g-2'}];
  assert.equal(resolveView(tied, null, at('2026-10-27T21:10:00Z')).id, 'g-1');
  assert.equal(resolveView([{...work, triggers: []}], null, at('2026-10-27T21:10:00Z')).id, 'all');
  assert.deepEqual(resolveView([], null, at('2026-10-27T21:10:00Z')), {id: 'all', mode: 'auto', until: null});
  assert.equal(lastTrigger([], at('2026-10-27T21:10:00Z')), null);
  assert.equal(nextTrigger([], at('2026-10-27T21:10:00Z')), null);
});
test('computes the next trigger with its relative day', () => {
  const morning = nextTrigger(groups, at('2026-10-27T11:40:00Z'));
  assert.deepEqual([morning.group.id, morning.at, morning.delta, morning.dayOffset, morning.day], ['g-back', '13:00', 320, 0, 2]);
  const friday = nextTrigger(groups, at('2026-10-30T21:10:00Z'));
  assert.deepEqual([friday.group.id, friday.at, friday.delta, friday.dayOffset, friday.day], ['g-end', '00:00', 410, 1, 6]);
  const sunday = nextTrigger(groups, at('2026-11-02T03:00:00Z'));
  assert.equal(sunday.group.id, 'g-work');
  assert.equal(sunday.day, 1);
});
test('a manual choice holds until the next trigger, then automatic resumes', () => {
  const manual = {view: 'g-back', setAt: at('2026-10-27T11:40:00Z').getTime()};
  assert.deepEqual([active('2026-10-27T11:41:00Z', manual).id, active('2026-10-27T11:41:00Z', manual).mode], ['g-back', 'manual']);
  assert.equal(active('2026-10-27T16:59:59Z', manual).mode, 'manual');
  assert.deepEqual([active('2026-10-27T17:00:00Z', manual).id, active('2026-10-27T17:00:00Z', manual).mode], ['g-back', 'auto']);
  assert.equal(active('2026-10-27T21:10:00Z', {view: 'all', setAt: manual.setAt}).mode, 'auto');
  assert.equal(active('2026-10-27T11:41:00Z', {view: 'all', setAt: manual.setAt}).id, 'all');
  assert.equal(active('2026-10-27T11:41:00Z', {view: 'g-gone', setAt: manual.setAt}).mode, 'auto');
  assert.equal(active('2026-10-27T11:41:00Z', {view: 'all', setAt: at('2026-10-27T12:00:00Z').getTime()}).mode, 'auto', 'a choice dated in the future is ignored');
  assert.equal(active('2026-10-27T11:41:00Z', manual).until.at, '13:00');
});
