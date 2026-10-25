import {el} from './dom.mjs?v=13';
import {MAX_GROUPS} from './store.mjs?v=13';
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const clock = at => at.replace(':', ' h ');
function when(until) { return `${until.dayOffset === 0 ? '' : until.dayOffset === 1 ? 'demain ' : `${DAY_NAMES[until.day - 1]} `}${clock(until.at)}`; }
function button(className, text, callback) { const b = el('button', className, text); b.type = 'button'; b.addEventListener('click', callback); return b; }
// The view bar: one pill per group plus "Tous", and a line saying why this view is showing.
export function renderViewBar(bar, {groups, resolved, onSelect, onAuto, onEdit, onNew}) {
  bar.replaceChildren();
  if (!groups.length) { const create = button('view-pill is-new', '+ Créer un groupe', onNew); create.title = 'Afficher des arrêts différents selon le jour et l’heure'; bar.append(create); return; }
  const pills = el('div', 'view-pills'); pills.setAttribute('role', 'group'); pills.setAttribute('aria-label', 'Groupes d’arrêts');
  for (const [id, name] of [...groups.map(g => [g.id, g.name]), ['all', 'Tous']]) { const pill = button('view-pill', name, () => onSelect(id)); pill.setAttribute('aria-pressed', String(resolved.id === id)); pills.append(pill); }
  const status = el('p', 'view-status'), current = groups.find(g => g.id === resolved.id);
  if (resolved.mode === 'manual') status.append(`Choisi manuellement${resolved.until ? ` · retour automatique ${when(resolved.until)}` : ''} `, button('text-button', 'Revenir en auto', onAuto));
  else status.append(current ? `Automatique${resolved.until ? ` · jusqu’à ${when(resolved.until)}` : ''}` : 'Automatique · tous les arrêts');
  if (current) status.append(' ', button('text-button', 'Modifier', () => onEdit(current.id)));
  bar.append(pills); if (groups.length < MAX_GROUPS) bar.append(button('view-pill is-new', '+ Groupe', onNew)); bar.append(status);
}
// Wires the static <dialog id="group-dialog"> once; open() fills it for a new or existing group.
export function setupGroupEditor({onSave, onDelete}) {
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
  function open(group, favorites, favoriteKey) {
    editing = group; triggers = group ? group.triggers.map(t => ({days: [...t.days], from: t.from})) : [{days: [1, 2, 3, 4, 5], from: '07:00'}];
    $('#group-title').textContent = group ? 'Modifier le groupe' : 'Nouveau groupe'; $('#group-name').value = group?.name ?? ''; $('#group-delete').hidden = !group; $('#group-error').textContent = '';
    const members = $('#member-list'); members.replaceChildren();
    for (const f of favorites) {
      const label = el('label', 'member'), box = el('input'); box.type = 'checkbox'; box.value = favoriteKey(f); box.checked = group?.favorites.includes(box.value) ?? false;
      label.append(box, el('span', '', `${f.label || f.name} · ${f.mode === 'all' ? 'tous les parcours' : `ligne ${f.route}`}`)); members.append(label);
    }
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
  return {open};
}
