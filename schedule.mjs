const WEEK = 7 * 1440;
const WEEKDAYS = {Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7};
const clockFormat = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Toronto', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const toMinutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const weekMinute = clock => (clock.day - 1) * 1440 + clock.minutes;
export function quebecClock(now = new Date()) {
  const parts = clockFormat.formatToParts(now), get = type => parts.find(p => p.type === type).value;
  return {day: WEEKDAYS[get('weekday')], minutes: Number(get('hour')) % 24 * 60 + Number(get('minute'))};
}
// Every weekly trigger as a minute offset from Monday 00:00, in list order (earlier groups win ties).
function occurrences(groups) {
  const list = [];
  for (const group of groups) for (const trigger of group.triggers) for (const day of trigger.days) list.push({group, at: (day - 1) * 1440 + toMinutes(trigger.from)});
  return list;
}
export function lastTrigger(groups, now = new Date()) {
  const nowAt = weekMinute(quebecClock(now));
  let best = null;
  for (const {group, at} of occurrences(groups)) { const age = (nowAt - at + WEEK) % WEEK; if (!best || age < best.age) best = {group, age}; }
  return best;
}
const describe = (best, nowAt) => {
  const target = nowAt + best.delta, minutes = best.at % 1440;
  return {group: best.group, delta: best.delta, at: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`, dayOffset: Math.floor(target / 1440) - Math.floor(nowAt / 1440), day: Math.floor(target % WEEK / 1440) + 1};
};
export function nextTrigger(groups, now = new Date()) {
  const nowAt = weekMinute(quebecClock(now));
  let best = null;
  for (const {group, at} of occurrences(groups)) { const delta = (at - nowAt + WEEK - 1) % WEEK + 1; if (!best || delta < best.delta) best = {group, at, delta}; }
  return best && describe(best, nowAt);
}
// The next trigger that actually switches to another group: triggers of the group already shown do not change anything.
export function nextChange(groups, currentId, now = new Date()) {
  const nowAt = weekMinute(quebecClock(now)), upcoming = occurrences(groups).map(o => ({...o, delta: (o.at - nowAt + WEEK - 1) % WEEK + 1})).sort((a, b) => a.delta - b.delta);
  let last = null;
  for (const o of upcoming) {
    if (last === o.delta) continue; // same minute: the first group of the list already won
    last = o.delta;
    if (o.group.id !== currentId) return describe(o, nowAt);
  }
  return null;
}
// A manual choice holds until the first trigger after it was made.
function manualValid(groups, manual, now) {
  if (manual.view !== 'all' && !groups.some(g => g.id === manual.view)) return false;
  if (!(manual.setAt <= now.getTime())) return false;
  const next = nextTrigger(groups, new Date(manual.setAt));
  return !next || now.getTime() < Math.floor(manual.setAt / 60000) * 60000 + next.delta * 60000;
}
export function resolveView(groups, manual, now = new Date()) {
  if (!groups.length) return {id: 'all', mode: 'auto', until: null, next: null};
  const until = nextTrigger(groups, now);
  if (manual && manualValid(groups, manual, now)) return {id: manual.view, mode: 'manual', until, next: until};
  const last = lastTrigger(groups, now), id = last ? last.group.id : 'all';
  return {id, mode: 'auto', until, next: nextChange(groups, id, now)};
}
