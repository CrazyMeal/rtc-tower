// Offers the browser's install prompt on phones; the button exists only while the browser says the app can be installed.
export function setupInstall() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { /* installing is a convenience */ });
  const button = document.querySelector('#install-app'), standalone = matchMedia('(display-mode: standalone)');
  let deferred = null;
  const hide = () => { deferred = null; button.hidden = true; };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (standalone.matches) return;
    deferred = event; button.hidden = false;
  });
  window.addEventListener('appinstalled', hide);
  button.addEventListener('click', async () => {
    const prompt = deferred; if (!prompt) return;
    hide();
    try { await prompt.prompt(); await prompt.userChoice; } catch { /* dismissed or unavailable */ }
  });
}
