import {STORAGE_KEY, favoriteKey, parseStopUrl, apiUrl, validateResponse, readFavorites, countdown} from './core.mjs?v=2';
const $ = selector => document.querySelector(selector);
const timeFormat = new Intl.DateTimeFormat('fr-CA', {timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const cache = new Map();
let favorites = [], savingAllowed = true, refreshing = false, lastRefresh = 0, renaming = null;
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
function sourceLink(f) {
  const group = cache.get(favoriteKey(f))?.groups?.find(g => String(g.parcours.noParcours) === f.route && String(g.parcours.codeDirection) === f.direction);
  const slug = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/ +/g, '-');
  return `https://www.rtcquebec.ca/horaires-et-trajets/horaires-des-bus/tous-les-parcours/${f.route}/${f.direction}-${slug(group?.parcours.descriptionDirection || 'direction')}/${f.stop}-${slug(group?.arret.nom || f.name)}`;
}
function rename(f) { renaming = favoriteKey(f); $('#rename-input').value = f.label; $('#rename-dialog').showModal(); $('#rename-input').focus(); }
function move(index, offset) { [favorites[index], favorites[index + offset]] = [favorites[index + offset], favorites[index]]; save(); render(); const card = document.querySelectorAll('.stop-card')[index + offset]; card?.querySelector(offset < 0 ? '[data-up]' : '[data-down]')?.focus(); }
function render() {
  const list = $('#favorites'); list.replaceChildren(); $('#count').textContent = favorites.length; $('#empty').hidden = favorites.length > 0;
  favorites.forEach((f, index) => {
    const key = favoriteKey(f), state = cache.get(key), card = el('article', 'stop-card');
    const heading = el('div', 'stop-heading'), title = el('div'), controls = el('div', 'card-actions');
    title.append(el('span', 'stop-number', `ARRÊT ${f.stop}${f.mode === 'all' ? ' · TOUS LES PARCOURS' : ''}`), el('h3', '', f.label || f.name), el('p', 'stop-subtitle', f.label ? f.name : state?.groups?.[0]?.arret.description || ''));
    const up = action('↑', `Monter ${f.label || f.name}`, () => move(index, -1), index === 0); up.dataset.up = '';
    const down = action('↓', `Descendre ${f.label || f.name}`, () => move(index, 1), index === favorites.length - 1); down.dataset.down = '';
    controls.append(up, down, action('✎', `Renommer ${f.label || f.name}`, () => rename(f)), action('×', `Supprimer ${f.label || f.name}`, () => { favorites = favorites.filter(item => favoriteKey(item) !== key); cache.delete(key); save(); render(); $('#refresh').focus(); }));
    heading.append(title, controls); card.append(heading);
    const stale = state?.updated && Date.now() - state.updated > 90000;
    if (state?.error || stale) { const error = el('p', 'error-note', `${state?.error || 'Les données ne sont plus à jour.'}${state?.groups ? ' Derniers passages reçus ci-dessous, à confirmer.' : ''}`); card.append(error); }
    if (state?.groups) {
      for (const group of state.groups) {
        const route = el('section', 'route'), routeHeading = el('div', 'route-heading');
        const direction = el('div', 'direction', group.parcours.descriptionDirection || 'Destination non précisée'); direction.setAttribute('aria-label', `Direction ${group.parcours.descriptionDirection || 'non précisée'}`);
        routeHeading.append(el('span', 'route-badge', group.parcours.noParcours), direction); route.append(routeHeading);
        const departures = group.horaires.filter(h => countdown(h) !== null).slice(0, 3);
        if (group.arretNonDesservi || group.descenteSeulement) route.append(el('p', 'route-message', group.arretNonDesservi ? 'Arrêt non desservi actuellement.' : 'Descente seulement à cet arrêt.'));
        else if (!departures.length) route.append(el('p', 'route-message', 'Aucun prochain passage annoncé.'));
        else {
          const row = el('div', 'departures');
          for (const h of departures) {
            const box = el('div', `departure${h.annule ? ' cancelled' : ''}`), remaining = countdown(h), eta = el('div', `eta${remaining === 'Imminent' ? ' imminent' : ''}`);
            const value = el('span', 'eta-value', remaining);
            if (h.ntr && !h.annule && !state.error && !stale) {
              const waves = el('img', 'realtime-icon'); waves.src = './realtime.svg'; waves.alt = ''; waves.setAttribute('aria-hidden', 'true');
              value.append(waves); eta.classList.add('has-realtime');
            }
            eta.append(value);
            if (remaining !== 'Imminent') eta.append(el('span', 'unit', 'min'));
            const meta = el('div', h.ntr && !h.annule && !state.error && !stale ? 'departure-meta sr-only' : 'departure-meta'); meta.append(document.createTextNode(h.annule ? 'Annulé' : state.error || stale ? 'À confirmer' : h.ntr ? 'Temps réel' : 'Planifié'));
            box.append(eta, el('div', 'clock-time', timeFormat.format(new Date(h.depart))), meta); row.append(box);
          }
          route.append(row);
        }
        card.append(route);
      }
    } else if (!state?.error) card.append(el('p', 'loading', 'Recherche des prochains passages…'));
    const footer = el('div', 'card-footer'); footer.append(el('span', '', state?.updated ? `Reçu à ${timeFormat.format(new Date(state.updated))}${stale || state.error ? ' · à confirmer' : ''}` : 'Source : RTC'));
    const link = el('a', '', 'Voir sur le RTC'); link.href = sourceLink(f); link.target = '_blank'; link.rel = 'noopener noreferrer'; footer.append(link); card.append(footer); list.append(card);
  });
}
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true; $('#refresh').disabled = true; $('#refresh-status').textContent = 'Actualisation…';
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
  if (refreshing) return;
  $('#refresh-status').textContent = document.hidden ? 'Actualisation en pause.' : 'Actualisation automatique.';
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
$('#first-add').addEventListener('click', () => $('#stop-url').focus());
$('#rename-cancel').addEventListener('click', () => $('#rename-dialog').close());
$('#rename-form').addEventListener('submit', event => { event.preventDefault(); const f = favorites.find(f => favoriteKey(f) === renaming); if (f) { f.label = $('#rename-input').value.trim(); save(); render(); } $('#rename-dialog').close(); });
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) { try { favorites = event.newValue === null ? [] : readFavorites(event.newValue); render(); refresh(); } catch { storageWarning('Les favoris modifiés dans un autre onglet sont illisibles.'); } } });
document.addEventListener('visibilitychange', () => { updateRefreshStatus(); if (!document.hidden) refresh(); });
window.addEventListener('online', refresh);
save(); render(); refresh();
setInterval(() => { if (!document.hidden) { if (Date.now() - lastRefresh >= 30000) refresh(); } }, 1000);
