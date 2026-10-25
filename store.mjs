import {EXAMPLE, favoriteKey} from './core.mjs?v=16';
export const VIEW_KEY = 'rtc-tower.view.v1';
export const MAX_GROUPS = 12;
export const MAX_FAVORITES = 60;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
function parseFavorites(list) {
  if (list.length > MAX_FAVORITES) throw new Error('Trop de favoris.');
  const unique = new Set();
  return list.map(f => {
    if (!f || !/^\d{1,6}$/.test(f.stop) || !/^\d{1,4}$/.test(f.route) || !/^\d{1,2}$/.test(f.direction) || !['route', 'all'].includes(f.mode) || typeof f.label !== 'string' || f.label.length > 60 || typeof f.name !== 'string') throw new Error('Favoris enregistrés invalides.');
    const key = favoriteKey(f);
    if (unique.has(key)) throw new Error('Favoris en double.');
    unique.add(key);
    return {stop: f.stop, route: f.route, direction: f.direction, mode: f.mode, label: f.label, name: f.name};
  });
}
function parseTrigger(t) {
  if (!t || !Array.isArray(t.days) || !t.days.length || t.days.some(d => !Number.isInteger(d) || d < 1 || d > 7) || typeof t.from !== 'string' || !TIME.test(t.from)) throw new Error('Horaires de groupe invalides.');
  return {days: [...new Set(t.days)].sort((a, b) => a - b), from: t.from};
}
function parseGroups(list, favorites) {
  if (!Array.isArray(list) || list.length > MAX_GROUPS) throw new Error('Groupes enregistrés invalides.');
  const keys = new Set(favorites.map(favoriteKey)), ids = new Set();
  return list.map(g => {
    if (!g || typeof g.id !== 'string' || !/^g-[a-z0-9]{1,20}$/.test(g.id) || ids.has(g.id) || typeof g.name !== 'string' || !g.name.trim() || g.name.length > 40 || !Array.isArray(g.favorites) || !Array.isArray(g.triggers) || g.triggers.length > 14) throw new Error('Groupes enregistrés invalides.');
    ids.add(g.id);
    return {id: g.id, name: g.name.trim(), favorites: [...new Set(g.favorites.filter(key => keys.has(key)))], triggers: g.triggers.map(parseTrigger)};
  });
}
export function parseState(saved) {
  if (!saved || ![1, 2].includes(saved.version) || !Array.isArray(saved.favorites)) throw new Error('Format de favoris inconnu.');
  const favorites = parseFavorites(saved.favorites);
  return {favorites, groups: saved.version === 2 ? parseGroups(saved.groups, favorites) : []};
}
export function readState(raw) {
  if (raw === null) return {favorites: [{...EXAMPLE}], groups: []};
  return parseState(JSON.parse(raw));
}
export const serializeState = ({favorites, groups}) => JSON.stringify({version: 2, favorites, groups});
// The manual view is a convenience: anything unreadable simply means "automatic".
export function readView(raw) {
  try {
    const saved = JSON.parse(raw);
    return saved && typeof saved.view === 'string' && Number.isFinite(saved.setAt) ? {view: saved.view, setAt: saved.setAt} : null;
  } catch { return null; }
}
export function removeFavorite(state, key) {
  return {favorites: state.favorites.filter(f => favoriteKey(f) !== key), groups: state.groups.map(g => ({...g, favorites: g.favorites.filter(k => k !== key)}))};
}
export function toggleMembership(state, groupId, key) {
  return {...state, groups: state.groups.map(g => g.id !== groupId ? g : {...g, favorites: g.favorites.includes(key) ? g.favorites.filter(k => k !== key) : [...g.favorites, key]})};
}
export function upsertGroup(state, group) {
  const exists = state.groups.some(g => g.id === group.id);
  return {...state, groups: exists ? state.groups.map(g => g.id === group.id ? group : g) : [...state.groups, group]};
}
export function deleteGroup(state, id) { return {...state, groups: state.groups.filter(g => g.id !== id)}; }
// Swap with the neighbouring favorite that is actually visible, so a move is never invisible.
export function moveFavorite(state, key, offset, visibleKeys) {
  const from = visibleKeys.indexOf(key), to = from + offset;
  if (from < 0 || to < 0 || to >= visibleKeys.length) return state;
  const a = state.favorites.findIndex(f => favoriteKey(f) === key), b = state.favorites.findIndex(f => favoriteKey(f) === visibleKeys[to]);
  const favorites = [...state.favorites]; [favorites[a], favorites[b]] = [favorites[b], favorites[a]];
  return {...state, favorites};
}
