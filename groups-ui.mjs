import {el, svg} from './dom.mjs?v=18';
import {MAX_GROUPS} from './store.mjs?v=18';
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const clock = at => at.replace(':', ' h ');
// "à 17 h 00", "demain à 05 h 00", "lundi à 05 h 00"
function whenAt(until) { return `${until.dayOffset === 0 ? '' : until.dayOffset === 1 ? 'demain ' : `${DAY_NAMES[until.day - 1]} `}à ${clock(until.at)}`; }
function button(className, text, callback) { const b = el('button', className, text); b.type = 'button'; b.addEventListener('click', callback); return b; }
const STROKE = {fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'};
const icon = (className, d) => svg('0 0 24 24', className, [['', d]], STROKE);
const ICONS = {auto: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4.5l3 1.7', manual: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v7', edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17zM14.5 7.5l2 2', next: 'M5 12h13M13 7l5 5-5 5'};
// The view bar: one pill per group plus "Tous", the active one carrying its mode (clock = automatic, pin = chosen by hand), and a line saying what comes next.
export function renderViewBar(bar, {groups, resolved, onSelect, onAuto, onEdit, onNew}) {
  bar.replaceChildren();
  if (!groups.length) { const create = button('view-pill is-new', '+ Créer un groupe', onNew); create.title = 'Afficher des arrêts différents selon le jour et l’heure'; bar.append(create); return; }
  const pills = el('div', 'view-pills'); pills.setAttribute('role', 'group'); pills.setAttribute('aria-label', 'Groupes d’arrêts');
  for (const [id, name] of [...groups.map(g => [g.id, g.name]), ['all', 'Tous']]) {
    const pill = button('view-pill', name, () => onSelect(id)), active = resolved.id === id; pill.setAttribute('aria-pressed', String(active));
    if (!active) { pills.append(pill); continue; }
    pill.prepend(icon('pill-icon', ICONS[resolved.mode === 'manual' ? 'manual' : 'auto']));
    if (id === 'all') { pills.append(pill); continue; }
    const edit = button('pill-edit', '', () => onEdit(id)); edit.append(icon('pill-icon', ICONS.edit)); edit.setAttribute('aria-label', `Modifier le groupe ${name}`); edit.title = 'Modifier ce groupe';
    const split = el('div', 'view-pill-split'); split.append(pill, edit); pills.append(split);
  }
  const status = el('p', 'view-status'), next = resolved.next;
  if (resolved.mode === 'manual') {
    status.append(el('span', 'sr-only', 'Choisi manuellement. '), icon('status-arrow', ICONS.next), next ? `${next.group.id === resolved.id ? 'Automatique à nouveau' : `${next.group.name} reprend`} ${whenAt(next)} · ` : '', button('text-button', 'Revenir en auto', onAuto));
  } else if (groups.some(g => g.id === resolved.id)) {
    if (next) status.append(el('span', 'sr-only', 'Mode automatique. '), icon('status-arrow', ICONS.next), `${next.group.name} ${whenAt(next)}`);
  } else status.append(el('span', 'sr-only', 'Mode automatique. '), icon('status-arrow', ICONS.next), 'Tous les arrêts, aucun horaire de groupe');
  bar.append(pills); if (groups.length < MAX_GROUPS) bar.append(button('view-pill is-new', '+ Groupe', onNew));
  if (status.childNodes.length) bar.append(status);
}
// Wires the static <dialog id="group-dialog"> once; open() fills it for a new or existing group.
export function setupGroupEditor({onSave, onDelete, describe}) {
  const $ = selector => document.querySelector(selector), dialog = $('#group-dialog');
  let editing = null, triggers = [];
  function renderTriggers() {
    const list = $('#trigger-list'); list.replaceChildren();
    for (const trigger of triggers) {
      const row = el('div', 'trigger-row'), days = el('div', 'day-buttons');
      DAY_LETTERS.forEach((letter, i) => {
        const day = button('day-button', letter, () => { const on = !trigger.days.includes(i + 1); trigger.days = on ? [...trigger.days, i + 1].sort() : trigger.days.filter(d => d !== i + 1); day.setAttribute('aria-pressed', String(on)); });
        day.setAttribute('aria-label', DAY_NAMES[i]); day.setAttribute('aria-pressed', String(trigger.days.includes(i + 1))); days.append(day);
      });
      const time = el('input'); time.type = 'time'; time.value = trigger.from; time.required = true; time.setAttribute('aria-label', 'Heure de début'); time.addEventListener('input', () => { trigger.from = time.value; });
      const remove = button('icon-button', '×', () => { triggers = triggers.filter(t => t !== trigger); renderTriggers(); }); remove.setAttribute('aria-label', 'Supprimer cet horaire');
      row.append(days, el('span', 'trigger-from', 'dès'), time, remove); list.append(row);
    }
    $('#no-trigger').hidden = triggers.length > 0;
  }
  let listed = null;
  function fillMembers(isChecked) {
    const {favorites, favoriteKey} = listed, members = $('#member-list'); members.replaceChildren();
    for (const f of favorites) {
      const label = el('label', 'member'), box = el('input'), info = describe(f), text = el('span', 'member-text'); box.type = 'checkbox'; box.value = favoriteKey(f); box.checked = isChecked(box.value);
      text.append(el('span', 'member-stop', info.title)); if (info.direction) text.append(el('span', 'member-dir', info.direction)); label.title = [info.title, info.direction].filter(Boolean).join(' ');
      label.append(box, el('span', `route-badge ${info.className}`, info.badge), text); members.append(label);
    }
  }
  // Rebuilds the list once more is known about the stops (directions arriving), keeping what is ticked and the focus.
  function refreshMembers() {
    if (!dialog.open || !listed) return;
    const ticked = new Set([...document.querySelectorAll('#member-list input:checked')].map(box => box.value)), focused = document.activeElement?.closest?.('#member-list') ? document.activeElement.value : null;
    fillMembers(key => ticked.has(key));
    if (focused) [...document.querySelectorAll('#member-list input')].find(box => box.value === focused)?.focus();
  }
  function open(group, favorites, favoriteKey) {
    editing = group; triggers = group ? group.triggers.map(t => ({days: [...t.days], from: t.from})) : [{days: [1, 2, 3, 4, 5], from: '07:00'}];
    $('#group-title').textContent = group ? 'Modifier le groupe' : 'Nouveau groupe'; $('#group-name').value = group?.name ?? ''; $('#group-delete').hidden = !group; $('#group-error').textContent = '';
    listed = {favorites, favoriteKey}; fillMembers(key => group?.favorites.includes(key) ?? false);
    renderTriggers(); dialog.showModal(); $('#group-name').focus();
  }
  $('#add-trigger').addEventListener('click', () => { triggers.push({days: [1, 2, 3, 4, 5], from: '07:00'}); renderTriggers(); });
  $('#group-cancel').addEventListener('click', () => dialog.close());
  $('#group-delete').addEventListener('click', () => { if (editing) onDelete(editing.id); dialog.close(); });
  $('#group-form').addEventListener('submit', event => {
    event.preventDefault(); const name = $('#group-name').value.trim(), error = $('#group-error');
    if (!name) { error.textContent = 'Donnez un nom au groupe.'; return; }
    if (triggers.some(t => !t.days.length || !/^\d\d:\d\d$/.test(t.from))) { error.textContent = 'Chaque horaire doit avoir au moins un jour et une heure.'; return; }
    onSave({id: editing?.id, name, favorites: [...document.querySelectorAll('#member-list input:checked')].map(box => box.value), triggers: triggers.map(t => ({days: [...t.days].sort((a, b) => a - b), from: t.from}))}, Boolean(editing));
    dialog.close();
  });
  return {open, refreshMembers};
}
