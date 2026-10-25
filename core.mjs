export const STORAGE_KEY = 'rtc-tower.favorites.v1';
export const EXAMPLE = {stop: '5419', route: '70', direction: '1', mode: 'route', label: '', name: 'Galeries / 5419'};
export function favoriteKey(f) { return `${f.stop}:${f.mode === 'all' ? 'all' : `${f.route}:${f.direction}`}`; }
// The stop as shown on tiles and in lists: custom label or RTC name without its trailing stop number, then the number.
export const stopTitle = (f, entry) => `${f.label || String(entry?.arret.nom || f.name).replace(/\s*\/?\s*\d{4,}$/, '')} · ${f.stop}`;
export function parseStopUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Collez un lien complet vers une page d’arrêt du RTC.'); }
  if (url.protocol !== 'https:' || !['www.rtcquebec.ca', 'rtcquebec.ca'].includes(url.hostname) || url.port || url.username || url.password) throw new Error('Le lien doit provenir du site https://www.rtcquebec.ca.');
  const match = url.pathname.match(/^\/horaires-et-trajets\/horaires-des-bus\/tous-les-parcours\/(\d{1,4})\/(\d{1,2})-[^/]+\/(\d{1,6})-[^/]+(?:\/\d{4}-\d{2}-\d{2})?\/?$/);
  if (!match) throw new Error('Ce lien ne désigne pas un arrêt. Ouvrez un parcours, puis un arrêt sur le site du RTC.');
  return {route: match[1], direction: match[2], stop: match[3]};
}
export function quebecDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('');
}
export function apiUrl(f, now = new Date()) {
  const url = new URL(`https://api-iv.rtcquebec.ca/api/legacy/${f.mode === 'all' ? 'ListeBorneVirtuelle_Arret' : 'BorneVirtuelle_ArretParcours'}`);
  url.searchParams.set('noArret', f.stop);
  url.searchParams.set('date', quebecDate(now));
  if (f.mode !== 'all') { url.searchParams.set('noParcours', f.route); url.searchParams.set('codeDirection', f.direction); }
  return url.href;
}
export function validateResponse(data, favorite) {
  const groups = Array.isArray(data) ? data : [data];
  if (!groups.length) throw new Error('Aucun parcours trouvé pour cet arrêt.');
  for (const group of groups) {
    if (!group || String(group.arret?.noArret) !== favorite.stop || !group.parcours || !Array.isArray(group.horaires)) throw new Error('La réponse du RTC est inattendue. Réessayez plus tard.');
    if (favorite.mode !== 'all' && (String(group.parcours.noParcours) !== favorite.route || String(group.parcours.codeDirection) !== favorite.direction)) throw new Error('Ce parcours ne correspond pas à cet arrêt et cette direction.');
    if (group.horaires.some(h => !h || !Number.isFinite(Date.parse(h.depart)) || typeof h.ntr !== 'boolean' || typeof h.annule !== 'boolean')) throw new Error('Les heures reçues du RTC sont invalides.');
  }
  return groups;
}
export function countdown(departure, now = Date.now()) {
  const seconds = (Date.parse(departure.depart) - now) / 1000;
  if (seconds < 0) return null;
  const minutes = Math.floor(seconds / 60);
  return minutes < 1 ? 'Imminent' : String(minutes);
}
const SERVICE_TYPES = {
  0: {name: 'leBus', className: 'is-lebus'},
  1: {name: 'eXpress', className: 'is-express'},
  2: {name: 'Parcours école', className: 'is-lebus'},
  3: {name: 'Parcours industriels', className: 'is-lebus'},
  4: {name: 'Métrobus', className: 'is-metrobus'},
  6: {name: 'Couche-tard', className: 'is-couchetard'}
};
export function serviceType(code) { return SERVICE_TYPES[code] || SERVICE_TYPES[0]; }
