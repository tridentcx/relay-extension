'use strict';

async function mountRelayPopup() {
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  setTimeout(() => {
    window.location.replace(chrome.runtime.getURL('popup-app.html'));
  }, 0);
}

mountRelayPopup().catch(() => {
  const shell = document.getElementById('instantShell');
  if (!shell) return;
  const p = shell.querySelector('p');
  if (p) p.textContent = 'Relay had trouble opening. Close this popup and try again.';
});
