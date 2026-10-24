import {favoriteKey, countdown, serviceType} from './core.mjs?v=10';
import {el, svg, timeFormat} from './dom.mjs?v=10';
const realtimeIcon = () => svg('0 0 20 20', 'realtime-icon', [['wave-inner', 'M2 8a10 10 0 0 1 10 10'], ['wave-outer', 'M2 2a16 16 0 0 1 16 16']]);
const arrow = () => svg('0 0 24 24', 'direction-arrow', [['', 'M4 12h15M13 6l6 6-6 6']], {fill: 'none', stroke: 'currentColor', 'stroke-width': '2.4'});
function sourceLink(f, entry) {
  const slug = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/ +/g, '-');
  const route = entry?.parcours.noParcours ?? f.route, direction = entry?.parcours.codeDirection ?? f.direction;
  return `https://www.rtcquebec.ca/horaires-et-trajets/horaires-des-bus/tous-les-parcours/${route}/${direction}-${slug(entry?.parcours.descriptionDirection || 'direction')}/${f.stop}-${slug(entry?.arret.nom || f.name)}`;
}
function departureBox(h, state, stale, kind) {
  const remaining = countdown(h), live = h.ntr && !h.annule && !state.error && !stale;
  const box = el('div', `${kind}${h.annule ? ' cancelled' : ''}`), eta = el('div', `eta${remaining === 'Imminent' ? ' imminent' : ''}`), value = el('span', 'eta-value', remaining);
  if (live) { value.append(realtimeIcon()); eta.classList.add('has-realtime'); }
  eta.append(value);
  if (remaining !== 'Imminent') eta.append(el('span', 'unit', 'min'));
  const meta = el('div', live ? 'departure-meta sr-only' : 'departure-meta'); meta.append(document.createTextNode(h.annule ? 'Annulé' : state.error || stale ? 'À confirmer' : h.ntr ? 'Temps réel' : 'Planifié'));
  box.append(eta, el('div', 'clock-time', timeFormat.format(new Date(h.depart))), meta); return box;
}
function menu(f, position, count, menuKey, ui) {
  const key = favoriteKey(f), name = `${f.label || f.name}${f.mode === 'all' ? ' (tous les parcours)' : ''}`, details = el('details', 'tile-menu'), summary = el('summary', '', '⋯'), items = el('div', 'menu-items');
  summary.setAttribute('aria-label', `Options pour ${name}`); details.open = ui.menuKey === menuKey;
  details.addEventListener('toggle', () => { if (details.open) ui.menuKey = menuKey; else if (ui.menuKey === menuKey) ui.menuKey = null; });
  const item = (text, label, callback, disabled = false) => { const b = el('button', 'menu-item', text); b.type = 'button'; b.disabled = disabled; b.setAttribute('aria-label', `${label} ${name}`); b.addEventListener('click', callback); return b; };
  const close = callback => () => { ui.menuKey = null; callback(); };
  items.append(item('Monter', 'Monter', close(() => ui.actions.move(key, -1)), position === 0), item('Descendre', 'Descendre', close(() => ui.actions.move(key, 1)), position === count - 1), item('Renommer', 'Renommer', close(() => ui.actions.rename(f))));
  if (ui.groups.length) {
    items.append(el('div', 'menu-label', 'Groupes'));
    for (const g of ui.groups) { const toggle = item(g.name, `Groupe ${g.name} :`, () => ui.actions.toggleGroup(g.id, key)); toggle.classList.add('menu-toggle'); toggle.setAttribute('aria-pressed', String(ui.isMember(g.id, key))); items.append(toggle); }
  }
  items.append(item('Supprimer', 'Supprimer', close(() => ui.actions.remove(f))));
  details.append(summary, items); return details;
}
// One tile per route; `entry` is one parcours/arrêt record from the RTC response (null while loading or on error).
export function renderTile(f, position, count, entry, state, stale, ui) {
  const key = favoriteKey(f), type = serviceType(entry?.parcours.codeTypeService), card = el('article', 'tile');
  card.dataset.favorite = key;
  const menuKey = entry ? `${key}:${entry.parcours.noParcours}:${entry.parcours.codeDirection}` : key;
  const badge = el('span', `route-badge ${entry ? type.className : 'is-unknown'}`, entry ? entry.parcours.noParcours : f.mode === 'all' ? '···' : f.route); if (entry) badge.title = type.name;
  const destination = entry?.parcours.descriptionDirection || (entry ? 'Destination non précisée' : '');
  const direction = el('div', 'direction'); if (entry) { direction.append(arrow(), el('span', '', destination)); direction.title = destination; direction.setAttribute('aria-label', `Direction ${entry.parcours.descriptionDirection || 'non précisée'}`); }
  const stop = el('div', 'stop-line'), link = el('a', '', `${f.label || String(entry?.arret.nom || f.name).replace(/\s*\/?\s*\d{4,}$/, '')} · ${f.stop}`); link.href = sourceLink(f, entry); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = 'Voir sur le site du RTC'; stop.append(link);
  const info = el('div', 'tile-info'); info.append(direction, stop); card.append(badge, info, menu(f, position, count, menuKey, ui));
  if (!entry) { card.append(el('p', 'route-message', state?.error || 'Recherche des prochains passages…')); return card; }
  if (state.error || stale) card.append(el('p', 'tile-note', `${state.error || 'Les données ne sont plus à jour.'} Derniers passages à confirmer.`));
  const departures = entry.horaires.filter(h => countdown(h) !== null).slice(0, 3);
  if (entry.arretNonDesservi || entry.descenteSeulement) { card.classList.add('is-idle'); card.append(el('p', 'route-message', entry.arretNonDesservi ? 'Arrêt non desservi' : 'Descente seulement')); }
  else if (!departures.length) { card.classList.add('is-idle'); card.append(el('p', 'route-message', 'Aucun passage annoncé')); }
  else {
    const [next, ...later] = departures; card.append(departureBox(next, state, stale, 'departure'));
    if (later.length) {
      const open = ui.expanded.has(menuKey), list = el('div', 'later-departures'); list.id = `later-${key.replace(/\W/g, '-')}-${entry.parcours.noParcours}-${entry.parcours.codeDirection}`; list.hidden = !open;
      for (const h of later) list.append(departureBox(h, state, stale, 'later'));
      const more = el('button', 'more-button', open ? '−' : `+${later.length}`); more.type = 'button'; more.setAttribute('aria-expanded', String(open)); more.setAttribute('aria-controls', list.id); more.title = open ? 'Masquer les passages suivants' : 'Voir les passages suivants'; more.setAttribute('aria-label', more.title);
      more.addEventListener('click', () => { if (ui.expanded.has(menuKey)) ui.expanded.delete(menuKey); else ui.expanded.add(menuKey); ui.actions.rerender(); document.getElementById(list.id)?.parentElement.querySelector('.more-button')?.focus(); });
      card.append(more, list);
    }
  }
  return card;
}
