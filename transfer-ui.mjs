import {encodeLink, decodeLink, exportFile, importFile} from './transfer.mjs?v=13';
import {quebecDate} from './core.mjs?v=13';
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
const summary = ({favorites, groups}) => `${plural(favorites.length, 'arrêt')}, ${plural(groups.length, 'groupe')}`;
// Wires the static transfer dialog (export link / file, import file / pasted link) and the replace confirmation.
export function setupTransfer({getState, onImport}) {
  const $ = selector => document.querySelector(selector), dialog = $('#transfer-dialog'), confirm = $('#import-dialog'), status = $('#transfer-status');
  let pending = null;
  const say = (text, error = false) => { status.classList.toggle('error', error); status.textContent = text; };
  const base = () => `${location.origin}${location.pathname}${location.search}`;
  function confirmImport(state) {
    const names = state.groups.map(g => g.name).join(', ');
    $('#import-summary').textContent = `Actuellement : ${summary(getState())}. Importés : ${summary(state)}${names ? ` (${names})` : ''}.`;
    pending = state; confirm.showModal();
  }
  async function open() {
    say(''); $('#transfer-link').value = ''; $('#transfer-file').value = ''; $('#transfer-paste').value = '';
    $('#transfer-local').hidden = !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && !/^(10|192\.168)\./.test(location.hostname);
    $('#transfer-share').hidden = typeof navigator.share !== 'function';
    dialog.showModal();
    try { $('#transfer-link').value = await encodeLink(getState(), base()); } catch { say('Impossible de préparer le lien.', true); }
  }
  async function fromFile() {
    const file = $('#transfer-file').files[0]; if (!file) return;
    try { if (file.size > 100000) throw new Error('Ce fichier est trop volumineux pour être une configuration RTC Tower.'); const state = importFile(await file.text()); dialog.close(); confirmImport(state); }
    catch (error) { say(error.message, true); }
    $('#transfer-file').value = '';
  }
  async function fromPaste() {
    try { const state = await decodeLink($('#transfer-paste').value); dialog.close(); confirmImport(state); }
    catch (error) { say(error.message, true); }
  }
  $('#open-transfer').addEventListener('click', open);
  $('#transfer-close').addEventListener('click', () => dialog.close());
  $('#transfer-file').addEventListener('change', fromFile);
  $('#transfer-paste-go').addEventListener('click', fromPaste);
  $('#transfer-link').addEventListener('focus', event => event.target.select());
  $('#transfer-copy').addEventListener('click', async () => {
    const field = $('#transfer-link'); if (!field.value) return;
    try { await navigator.clipboard.writeText(field.value); say('Lien copié.'); } catch { field.select(); say('Copie impossible : le lien est sélectionné, copiez-le à la main.', true); }
  });
  $('#transfer-share').addEventListener('click', async () => {
    try { await navigator.share({title: 'Mes arrêts RTC Tower', url: $('#transfer-link').value}); } catch (error) { if (error.name !== 'AbortError') say('Partage impossible. Copiez le lien à la place.', true); }
  });
  $('#transfer-download').addEventListener('click', () => {
    const date = quebecDate(), url = URL.createObjectURL(new Blob([exportFile(getState())], {type: 'application/json'})), a = document.createElement('a');
    a.href = url; a.download = `rtc-tower-${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    say('Fichier téléchargé.');
  });
  $('#import-cancel').addEventListener('click', () => { pending = null; confirm.close(); });
  $('#import-form').addEventListener('submit', event => { event.preventDefault(); const state = pending; pending = null; confirm.close(); if (state) onImport(state); });
  return {confirmImport};
}
