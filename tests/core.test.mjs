import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStopUrl, quebecDate, apiUrl, validateResponse, countdown, serviceType, routeServiceCode, EXAMPLE} from '../core.mjs';
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


test('accepts a dated RTC stop link and queries today instead of the link date', () => {
  const dated = 'https://www.rtcquebec.ca/horaires-et-trajets/horaires-des-bus/tous-les-parcours/71/0-terminus-gare-du-palais/5015-r-bourassa5015/2026-10-24';
  for (const suffix of ['', '/', '?view=all#horaire']) {
    const f = parseStopUrl(dated + suffix);
    assert.deepEqual(f, {route:'71', direction:'0', stop:'5015'});
    const request = new URL(apiUrl({...f, mode:'route'}, new Date('2026-10-26T16:00:00Z')));
    assert.equal(request.searchParams.get('date'), '20261026');
    assert.equal(request.searchParams.get('noArret'), '5015');
    assert.equal(request.searchParams.get('codeDirection'), '0');
  }
  for (const suffix of ['/extra', '/2026-10-24/extra', '/2026-10']) {
    assert.throws(() => parseStopUrl(url + suffix));
  }
});
test('maps RTC service types to colour classes with leBus fallback', () => {
  assert.equal(serviceType(0).className, 'is-lebus');
  assert.equal(serviceType(1).className, 'is-express');
  assert.equal(serviceType(3).className, 'is-lebus');
  assert.equal(serviceType(4).className, 'is-metrobus');
  assert.equal(serviceType(6).className, 'is-couchetard');
  assert.equal(serviceType(undefined).name, 'leBus');
});
test('the route number gives the kind of service when the RTC has not answered yet', () => {
  const codes = routes => routes.map(routeServiceCode);
  assert.deepEqual(codes(['1', '70', '185', '186', '199', '700', '799']), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(codes(['200', '584', '699']), [1, 1, 1]);
  assert.deepEqual(codes(['800', '803', '899']), [4, 4, 4]);
  assert.deepEqual(codes(['900', '910', '999']), [6, 6, 6]);
  assert.deepEqual(codes(['', 'abc', '12345', undefined]), [0, 0, 0, 0]);
  assert.equal(serviceType(routeServiceCode('584')).className, 'is-express');
});
