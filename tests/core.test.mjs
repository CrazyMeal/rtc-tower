import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStopUrl, quebecDate, apiUrl, readFavorites, validateResponse, countdown, EXAMPLE} from '../core.mjs';
const url = 'https://www.rtcquebec.ca/horaires-et-trajets/horaires-des-bus/tous-les-parcours/70/1-val-belair/5419-galeries5419';
test('extracts identifiers from the supplied RTC stop link', () => {
  assert.deepEqual(parseStopUrl(url + '?test=1#horaire'), {route:'70',direction:'1',stop:'5419'});
  assert.deepEqual(parseStopUrl(url + '/'), {route:'70',direction:'1',stop:'5419'});
});
test('rejects unrelated hosts, credentials and incomplete links', () => {
  for (const value of [url.replace('rtcquebec.ca','rtcquebec.ca.evil.com'), url.replace('www.', 'user@www.'), url.replace('https:', 'http:'), 'javascript:alert(1)', url.split('/5419')[0]]) assert.throws(() => parseStopUrl(value));
});
test('uses Québec date across UTC midnight and daylight saving boundaries', () => {
  assert.equal(quebecDate(new Date('2026-10-25T02:00:00Z')), '20261024');
  assert.equal(quebecDate(new Date('2026-01-02T04:59:00Z')), '20260101');
  assert.equal(quebecDate(new Date('2026-01-02T05:00:00Z')), '20260102');
});
test('constructs route and whole-stop requests with a fresh local date', () => {
  const now = new Date('2026-10-25T02:00:00Z');
  const route = new URL(apiUrl(EXAMPLE, now));
  assert.equal(route.searchParams.get('date'),'20261024'); assert.equal(route.searchParams.get('codeDirection'),'1');
  const all = new URL(apiUrl({...EXAMPLE,mode:'all'}, now));
  assert.ok(all.pathname.endsWith('/ListeBorneVirtuelle_Arret')); assert.equal(all.searchParams.has('noParcours'),false);
});
test('preserves intentionally empty favorites and validates saved data', () => {
  assert.equal(readFavorites(null).length,1);
  assert.deepEqual(readFavorites('{"version":1,"favorites":[]}'),[]);
  assert.deepEqual(readFavorites(JSON.stringify({version:1,favorites:[EXAMPLE]})),[EXAMPLE]);
  for (const input of ['oops', '{"version":2,"favorites":[]}', JSON.stringify({version:1,favorites:[EXAMPLE,EXAMPLE]}), JSON.stringify({version:1,favorites:[{...EXAMPLE,stop:'<script>'}]})]) assert.throws(() => readFavorites(input));
});
test('validates stop and direction and rejects malformed RTC responses', () => {
  const group = {arret:{noArret:'5419'},parcours:{noParcours:'70',codeDirection:'1'},horaires:[]};
  assert.equal(validateResponse(group,EXAMPLE).length,1);
  assert.throws(() => validateResponse({...group,arret:{noArret:'1234'}},EXAMPLE));
  assert.throws(() => validateResponse({...group,parcours:{noParcours:'70',codeDirection:'0'}},EXAMPLE));
  assert.throws(() => validateResponse({...group,horaires:[{depart:'bad'}]},EXAMPLE));
  assert.throws(() => validateResponse([],EXAMPLE));
});
test('countdowns use absolute departure time and exclude past passages', () => {
  const now = Date.parse('2026-10-24T20:00:00Z');
  assert.equal(countdown({depart:'2026-10-24T16:20:01-04:00'},now),'20');
  assert.equal(countdown({depart:'2026-10-24T16:00:30-04:00'},now),'Imminent');
  assert.equal(countdown({depart:'2026-10-24T15:59:59-04:00'},now),null);
});
