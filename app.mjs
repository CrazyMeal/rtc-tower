import {STORAGE_KEY, favoriteKey, parseStopUrl, apiUrl, validateResponse} from './core.mjs?v=11';
import {VIEW_KEY, readState, serializeState, readView, removeFavorite, toggleMembership, upsertGroup, deleteGroup, moveFavorite} from './store.mjs?v=11';
import {resolveView} from './schedule.mjs?v=11';
import {timeFormat} from './dom.mjs?v=11';
import {renderTile} from './tiles.mjs?v=11';
import {renderViewBar, setupGroupEditor} from './groups-ui.mjs?v=11';
const $ = selector => document.querySelector(selector);
const cache = new Map();
let favorites = [], groups = [], manual = null, savingAllowed = true, refreshing = false, refreshQueued = false, lastRefresh = 0, renaming = null, viewSignature = '';
function storageWarning(message) { $('#storage-warning').textContent = message; $('#storage-warning').hidden = false; }
try { const state = readState(localStorage.getItem(STORAGE_KEY)); favorites = state.favorites; groups = state.groups; manual = readView(localStorage.getItem(VIEW_KEY)); }
catch { savingAllowed = false; storageWarning('Vos favoris enregistrés ne sont pas accessibles ou sont invalides. Ils sont conservés tels quels ; les changements de cette session ne seront pas sauvegardés.'); }
function save() {
  if (!savingAllowed) return;
  try { localStorage.setItem(STORAGE_KEY, serializeState({favorites, groups})); }
  catch { storageWarning('Ce navigateur ne permet pas de sauvegarder vos favoris. Les changements restent disponibles pour cette session uniquement.'); }
}
function saveView() {
  if (!savingAllowed) return;
  try { if (manual) localStorage.setItem(VIEW_KEY, JSON.stringify(manual)); else localStorage.removeItem(VIEW_KEY); } catch { /* the manual choice is a convenience */ }
}
const snapshot = () => ({favorites, groups});
function commit(next) { favorites = next.favorites; groups = next.groups; save(); render(); }
const currentView = () => resolveView(groups, manual, new Date());
function visibleFavorites(view) { const group = groups.find(g => g.id === view.id); return view.id === 'all' ? favorites : favorites.filter(f => group?.favorites.includes(favoriteKey(f))); }
function chooseView(view) { manual = view === null ? null : {view, setAt: Date.now()}; saveView(); render(); refresh(true); }
async function request(favorite) {
  let response;
  try { response = await fetch(apiUrl(favorite), {signal: AbortSignal.timeout(12000), cache: 'no-store', credentials: 'omit'}); }
  catch { throw new Error('Le RTC ne répond pas pour le moment. Vérifiez votre connexion ou réessayez.'); }
  if (!response.ok) throw new Error(`Données RTC indisponibles (erreur ${response.status}). Réessayez plus tard.`);
  let data;
  try { data = await response.json(); } catch { throw new Error('La réponse du RTC est illisible. Réessayez plus tard.'); }
  return validateResponse(data, favorite);
}
function rename(f) { renaming = favoriteKey(f); $('#rename-input').value = f.label; $('#rename-dialog').showModal(); $('#rename-input').focus(); }
const editor = setupGroupEditor({
  onSave(group, existed) {
    const saved = {...group, id: group.id ?? `g-${Date.now().toString(36)}`};
    if (!existed) { manual = {view: saved.id, setAt: Date.now()}; saveView(); }
    commit(upsertGroup(snapshot(), saved)); refresh(true);
  },
  onDelete(id) { if (manual?.view === id) { manual = null; saveView(); } commit(deleteGroup(snapshot(), id)); refresh(true); }
});
const ui = {
  expanded: new Set(), menuKey: null,
  get groups() { return groups; },
  isMember: (groupId, key) => groups.find(g => g.id === groupId)?.favorites.includes(key) ?? false,
  actions: {
    move(key, offset) { commit(moveFavorite(snapshot(), key, offset, visibleFavorites(currentView()).map(favoriteKey))); document.querySelector(`.tile[data-favorite="${key}"] summary`)?.focus(); },
    rename,
    remove(f) { const key = favoriteKey(f); cache.delete(key); commit(removeFavorite(snapshot(), key)); $('#refresh').focus(); },
    toggleGroup(groupId, key) { commit(toggleMembership(snapshot(), groupId, key)); refresh(true); },
    rerender: () => render()
  }
};
function render() {
  const view = currentView(); viewSignature = `${view.id}:${view.mode}`;
  if (manual && view.mode === 'auto') { manual = null; saveView(); }
  const visible = visibleFavorites(view), list = $('#favorites'), group = groups.find(g => g.id === view.id);
  list.replaceChildren(); $('#count').textContent = visible.length; $('#empty').hidden = favorites.length > 0;
  $('#group-empty').hidden = !favorites.length || visible.length > 0; $('#group-empty-name').textContent = group?.name ?? '';
  $('#view-bar').hidden = !favorites.length;
  renderViewBar($('#view-bar'), {groups, resolved: view, onSelect: id => { if (id !== view.id || view.mode === 'manual') chooseView(id); }, onAuto: () => chooseView(null), onEdit: id => editor.open(groups.find(g => g.id === id), favorites, favoriteKey), onNew: () => editor.open(null, favorites, favoriteKey)});
  visible.forEach((f, position) => {
    const state = cache.get(favoriteKey(f)), stale = state?.updated && Date.now() - state.updated > 90000;
    if (state?.entries) for (const entry of state.entries) list.append(renderTile(f, position, visible.length, entry, state, stale, ui));
    else list.append(renderTile(f, position, visible.length, null, state, stale, ui));
  });
  updateRefreshStatus();
}
async function refresh(queue = false) {
  if (document.hidden) return;
  if (refreshing) { if (queue === true) refreshQueued = true; return; }
  refreshing = true; $('#refresh').disabled = true; updateRefreshStatus();
  try {
    await Promise.all(visibleFavorites(currentView()).map(async f => {
      const key = favoriteKey(f);
      try {
        const entries = await request(f);
        if (!favorites.some(item => favoriteKey(item) === key)) return;
        cache.set(key, {entries, updated: Date.now(), error: null});
        f.name = String(entries[0].arret.nom || `Arrêt ${f.stop}`);
      } catch (error) { if (favorites.some(item => favoriteKey(item) === key)) cache.set(key, {...cache.get(key), error: error.message}); }
    }));
    lastRefresh = Date.now(); render();
  } finally { refreshing = false; $('#refresh').disabled = false; updateRefreshStatus(); if (refreshQueued) { refreshQueued = false; refresh(); } }
}
function updateRefreshStatus() {
  const failing = visibleFavorites(currentView()).some(f => cache.get(favoriteKey(f))?.error);
  const received = lastRefresh ? `Reçu à ${timeFormat.format(new Date(lastRefresh))}${failing ? ' · à confirmer' : ''}` : '';
  $('#refresh-status').textContent = refreshing ? 'Actualisation…' : document.hidden ? 'Actualisation en pause.' : received;
}
$('#add-form').addEventListener('submit', async event => {
  event.preventDefault(); const status = $('#form-status'), submit = $('#add-submit'); status.classList.remove('error'); status.textContent = '';
  const shownGroup = () => groups.find(g => g.id === currentView().id);
  try {
    const f = {...parseStopUrl($('#stop-url').value), mode: $('#stop-mode').value, label: $('#stop-label').value.trim(), name: ''};
    const key = favoriteKey(f), existing = favorites.find(item => favoriteKey(item) === key);
    if (existing) {
      const group = shownGroup();
      if (!group || group.favorites.includes(key)) throw new Error('Cet arrêt avec cette sélection de parcours est déjà dans vos favoris.');
      commit(toggleMembership(snapshot(), group.id, key)); refresh(true); $('#add-form').reset(); status.textContent = `${existing.label || existing.name} ajouté à ${group.name}.`; return;
    }
    submit.disabled = true; status.textContent = 'Vérification de l’arrêt auprès du RTC…';
    const entries = await request(f); f.name = String(entries[0].arret.nom || `Arrêt ${f.stop}`);
    // Recheck after the asynchronous request, in case another tab added this stop.
    if (favorites.some(item => favoriteKey(item) === key)) throw new Error('Ce favori existe déjà.');
    const group = shownGroup(), next = {favorites: [...favorites, f], groups};
    cache.set(key, {entries, updated: Date.now(), error: null}); commit(group ? toggleMembership(next, group.id, key) : next); $('#add-form').reset(); status.textContent = `${f.label || f.name} ajouté à ${group ? group.name : 'vos arrêts'}.`;
  } catch (error) { status.classList.add('error'); status.textContent = error.message; }
  finally { submit.disabled = false; }
});
$('#refresh').addEventListener('click', () => refresh());
document.addEventListener('click', event => { if (ui.menuKey && !event.target.closest('.tile-menu')) { ui.menuKey = null; document.querySelectorAll('.tile-menu[open]').forEach(d => { d.open = false; }); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && ui.menuKey) { const d = document.querySelector('.tile-menu[open]'); ui.menuKey = null; document.querySelectorAll('.tile-menu[open]').forEach(x => { x.open = false; }); d?.querySelector('summary').focus(); } });
$('#first-add').addEventListener('click', () => $('#stop-url').focus());
$('#rename-cancel').addEventListener('click', () => $('#rename-dialog').close());
$('#rename-form').addEventListener('submit', event => { event.preventDefault(); const f = favorites.find(f => favoriteKey(f) === renaming); if (f) { f.label = $('#rename-input').value.trim(); save(); render(); } $('#rename-dialog').close(); });
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== VIEW_KEY && event.key !== null) return;
  if (event.key !== STORAGE_KEY) manual = readView(event.newValue);
  if (event.key === STORAGE_KEY || event.key === null) {
    try { const state = event.newValue === null ? {favorites: [], groups: []} : readState(event.newValue); favorites = state.favorites; groups = state.groups; }
    catch { storageWarning('Les favoris modifiés dans un autre onglet sont illisibles.'); return; }
  }
  render(); refresh(true);
});
document.addEventListener('visibilitychange', () => { updateRefreshStatus(); if (!document.hidden) refresh(); });
window.addEventListener('online', () => refresh());
save(); render(); refresh();
setInterval(() => {
  if (document.hidden) return;
  const view = currentView();
  if (`${view.id}:${view.mode}` !== viewSignature) { render(); refresh(true); }
  else if (Date.now() - lastRefresh >= 30000) refresh();
}, 1000);
