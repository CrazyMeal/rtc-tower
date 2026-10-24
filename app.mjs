import {STORAGE_KEY, favoriteKey, parseStopUrl, apiUrl, validateResponse, readFavorites, countdown, serviceType} from './core.mjs?v=3';
const $ = selector => document.querySelector(selector);
const timeFormat = new Intl.DateTimeFormat('fr-CA', {timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const cache = new Map();
let favorites = [], savingAllowed = true, refreshing = false, lastRefresh = 0, renaming = null;
const expanded = new Set();
let openMenu = null;
function storageWarning(message) { $('#storage-warning').textContent = message; $('#storage-warning').hidden = false; }
try { favorites = readFavorites(localStorage.getItem(STORAGE_KEY)); }
catch { savingAllowed = false; storageWarning('Vos favoris enregistrés ne sont pas accessibles ou sont invalides. Ils sont conservés tels quels ; les changements de cette session ne seront pas sauvegardés.'); }
function save() {
  if (!savingAllowed) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({version: 1, favorites})); }
  catch { storageWarning('Ce navigateur ne permet pas de sauvegarder vos favoris. Les changements restent disponibles pour cette session uniquement.'); }
}
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function action(text, title, callback, disabled = false) {
  const button = el('button', 'icon-button', text); button.type = 'button'; button.title = title; button.setAttribute('aria-label', title); button.disabled = disabled; button.addEventListener('click', callback); return button;
}
async function request(favorite) {
  let response;
  try { response = await fetch(apiUrl(favorite), {signal: AbortSignal.timeout(12000), cache: 'no-store', credentials: 'omit'}); }
  catch { throw new Error('Le RTC ne répond pas pour le moment. Vérifiez votre connexion ou réessayez.'); }
  if (!response.ok) throw new Error(`Données RTC indisponibles (erreur ${response.status}). Réessayez plus tard.`);
  let data;
  try { data = await response.json(); } catch { throw new Error('La réponse du RTC est illisible. Réessayez plus tard.'); }
  return validateResponse(data, favorite);
}
function sourceLink(f, group) {
  const slug = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/ +/g, '-');
  const route = group?.parcours.noParcours ?? f.route, direction = group?.parcours.codeDirection ?? f.direction;
  return `https://www.rtcquebec.ca/horaires-et-trajets/horaires-des-bus/tous-les-parcours/${route}/${direction}-${slug(group?.parcours.descriptionDirection || 'direction')}/${f.stop}-${slug(group?.arret.nom || f.name)}`;
}
function rename(f) { renaming = favoriteKey(f); $('#rename-input').value = f.label; $('#rename-dialog').showModal(); $('#rename-input').focus(); }
function move(index, offset) { [favorites[index], favorites[index + offset]] = [favorites[index + offset], favorites[index]]; save(); render(); document.querySelector(`.tile[data-favorite="${favoriteKey(favorites[index + offset])}"] summary`)?.focus(); }
function departureBox(h, state, stale, kind) {
  const remaining = countdown(h), live = h.ntr && !h.annule && !state.error && !stale;
  const box = el('div', `${kind}${h.annule ? ' cancelled' : ''}`), eta = el('div', `eta${remaining === 'Imminent' ? ' imminent' : ''}`), value = el('span', 'eta-value', remaining);
  if (live) { const waves = el('img', 'realtime-icon'); waves.src = './realtime.svg'; waves.alt = ''; waves.setAttribute('aria-hidden', 'true'); value.append(waves); eta.classList.add('has-realtime'); }
  eta.append(value);
  if (remaining !== 'Imminent') eta.append(el('span', 'unit', 'min'));
  const meta = el('div', live ? 'departure-meta sr-only' : 'departure-meta'); meta.append(document.createTextNode(h.annule ? 'Annulé' : state.error || stale ? 'À confirmer' : h.ntr ? 'Temps réel' : 'Planifié'));
  box.append(eta, el('div', 'clock-time', timeFormat.format(new Date(h.depart))), meta); return box;
}
const arrow = () => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'direction-arrow'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2.4'); const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M4 12h15M13 6l6 6-6 6'); svg.append(path); return svg; };
function menu(f, index, menuKey) {
  const name = `${f.label || f.name}${f.mode === 'all' ? ' (tous les parcours)' : ''}`, details = el('details', 'tile-menu'), summary = el('summary', '', '⋯'), items = el('div', 'menu-items');
  summary.setAttribute('aria-label', `Options pour ${name}`); details.open = openMenu === menuKey;
  details.addEventListener('toggle', () => { if (details.open) openMenu = menuKey; else if (openMenu === menuKey) openMenu = null; });
  const item = (text, label, callback, disabled = false) => { const b = el('button', 'menu-item', text); b.type = 'button'; b.disabled = disabled; b.setAttribute('aria-label', `${label} ${name}`); b.addEventListener('click', callback); return b; };
  const key = favoriteKey(f);
  items.append(item('Monter', 'Monter', () => { openMenu = null; move(index, -1); }, index === 0), item('Descendre', 'Descendre', () => { openMenu = null; move(index, 1); }, index === favorites.length - 1), item('Renommer', 'Renommer', () => { openMenu = null; rename(f); }), item('Supprimer', 'Supprimer', () => { openMenu = null; favorites = favorites.filter(x => favoriteKey(x) !== key); cache.delete(key); save(); render(); $('#refresh').focus(); }));
  details.append(summary, items); return details;
}
function tile(f, index, group, state, stale) {
  const key = favoriteKey(f), type = serviceType(group?.parcours.codeTypeService), card = el('article', 'tile');
  card.dataset.favorite = key;
  const menuKey = group ? `${key}:${group.parcours.noParcours}:${group.parcours.codeDirection}` : key;
  const badge = el('span', `route-badge ${group ? type.className : 'is-unknown'}`, group ? group.parcours.noParcours : f.mode === 'all' ? '···' : f.route); if (group) badge.title = type.name;
  const destination = group?.parcours.descriptionDirection || (group ? 'Destination non précisée' : '');
  const direction = el('div', 'direction'); if (group) { direction.append(arrow(), el('span', '', destination)); direction.title = destination; direction.setAttribute('aria-label', `Direction ${group.parcours.descriptionDirection || 'non précisée'}`); }
  const stop = el('div', 'stop-line'), link = el('a', '', `${f.label || String(group?.arret.nom || f.name).replace(/\s*\/?\s*\d{4,}$/, '')} · ${f.stop}`); link.href = sourceLink(f, group); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = 'Voir sur le site du RTC'; stop.append(link);
  const info = el('div', 'tile-info'); info.append(direction, stop); card.append(badge, info, menu(f, index, menuKey));
  if (!group) { card.append(el('p', 'route-message', state?.error || 'Recherche des prochains passages…')); return card; }
  if (state.error || stale) card.append(el('p', 'tile-note', `${state.error || 'Les données ne sont plus à jour.'} Derniers passages à confirmer.`));
  const departures = group.horaires.filter(h => countdown(h) !== null).slice(0, 3);
  if (group.arretNonDesservi || group.descenteSeulement) card.append(el('p', 'route-message', group.arretNonDesservi ? 'Arrêt non desservi actuellement.' : 'Descente seulement à cet arrêt.'));
  else if (!departures.length) card.append(el('p', 'route-message', 'Aucun prochain passage annoncé.'));
  else {
    const [next, ...later] = departures; card.append(departureBox(next, state, stale, 'departure'));
    if (later.length) {
      const open = expanded.has(menuKey), list = el('div', 'later-departures'); list.id = `later-${index}-${group.parcours.noParcours}-${group.parcours.codeDirection}`; list.hidden = !open;
      for (const h of later) list.append(departureBox(h, state, stale, 'later'));
      const more = el('button', 'more-button', open ? '−' : `+${later.length}`); more.type = 'button'; more.setAttribute('aria-expanded', String(open)); more.setAttribute('aria-controls', list.id); more.title = open ? 'Masquer les passages suivants' : 'Voir les passages suivants'; more.setAttribute('aria-label', more.title);
      more.addEventListener('click', () => { if (expanded.has(menuKey)) expanded.delete(menuKey); else expanded.add(menuKey); render(); document.getElementById(list.id)?.parentElement.querySelector('.more-button')?.focus(); });
      card.append(more, list);
    }
  }
  return card;
}
function render() {
  const list = $('#favorites'); list.replaceChildren(); $('#count').textContent = favorites.length; $('#empty').hidden = favorites.length > 0;
  favorites.forEach((f, index) => {
    const state = cache.get(favoriteKey(f)), stale = state?.updated && Date.now() - state.updated > 90000;
    if (state?.groups) for (const group of state.groups) list.append(tile(f, index, group, state, stale));
    else list.append(tile(f, index, null, state, stale));
  });
  updateRefreshStatus();
}
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true; $('#refresh').disabled = true; updateRefreshStatus();
  try {
    await Promise.all(favorites.map(async f => {
      const key = favoriteKey(f);
      try {
        const groups = await request(f);
        if (!favorites.some(item => favoriteKey(item) === key)) return;
        cache.set(key, {groups, updated: Date.now(), error: null});
        f.name = String(groups[0].arret.nom || `Arrêt ${f.stop}`);
      } catch (error) { if (favorites.some(item => favoriteKey(item) === key)) cache.set(key, {...cache.get(key), error: error.message}); }
    }));
    lastRefresh = Date.now(); render();
  } finally { refreshing = false; $('#refresh').disabled = false; updateRefreshStatus(); }
}
function updateRefreshStatus() {
  const received = lastRefresh ? `Reçu à ${timeFormat.format(new Date(lastRefresh))}${[...cache.values()].some(state => state.error) ? ' · à confirmer' : ''}` : '';
  $('#refresh-status').textContent = refreshing ? 'Actualisation…' : document.hidden ? 'Actualisation en pause.' : received;
}
$('#add-form').addEventListener('submit', async event => {
  event.preventDefault(); const status = $('#form-status'), submit = $('#add-submit'); status.classList.remove('error'); status.textContent = '';
  try {
    const f = {...parseStopUrl($('#stop-url').value), mode: $('#stop-mode').value, label: $('#stop-label').value.trim(), name: ''};
    const key = favoriteKey(f);
    if (favorites.some(item => favoriteKey(item) === key)) throw new Error('Cet arrêt avec cette sélection de parcours est déjà dans vos favoris.');
    submit.disabled = true; status.textContent = 'Vérification de l’arrêt auprès du RTC…';
    const groups = await request(f); f.name = String(groups[0].arret.nom || `Arrêt ${f.stop}`);
    // Recheck after the asynchronous request, in case another tab added this stop.
    if (favorites.some(item => favoriteKey(item) === key)) throw new Error('Ce favori existe déjà.');
    favorites.push(f); cache.set(key, {groups, updated: Date.now(), error: null}); save(); render(); $('#add-form').reset(); status.textContent = `${f.label || f.name} ajouté à vos arrêts.`;
  } catch (error) { status.classList.add('error'); status.textContent = error.message; }
  finally { submit.disabled = false; }
});
$('#refresh').addEventListener('click', refresh);
document.addEventListener('click', event => { if (openMenu && !event.target.closest('.tile-menu')) { openMenu = null; document.querySelectorAll('.tile-menu[open]').forEach(d => { d.open = false; }); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && openMenu) { const d = document.querySelector('.tile-menu[open]'); openMenu = null; document.querySelectorAll('.tile-menu[open]').forEach(x => { x.open = false; }); d?.querySelector('summary').focus(); } });
$('#first-add').addEventListener('click', () => $('#stop-url').focus());
$('#rename-cancel').addEventListener('click', () => $('#rename-dialog').close());
$('#rename-form').addEventListener('submit', event => { event.preventDefault(); const f = favorites.find(f => favoriteKey(f) === renaming); if (f) { f.label = $('#rename-input').value.trim(); save(); render(); } $('#rename-dialog').close(); });
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) { try { favorites = event.newValue === null ? [] : readFavorites(event.newValue); render(); refresh(); } catch { storageWarning('Les favoris modifiés dans un autre onglet sont illisibles.'); } } });
document.addEventListener('visibilitychange', () => { updateRefreshStatus(); if (!document.hidden) refresh(); });
window.addEventListener('online', refresh);
save(); render(); refresh();
setInterval(() => { if (!document.hidden) { if (Date.now() - lastRefresh >= 30000) refresh(); } }, 1000);
