// SPDX-FileCopyrightText: 2026 Calyndrae <https://calyndrae.com/projects/anti-blur>
// SPDX-License-Identifier: LicenseRef-Proprietary
// Anti Blur — © 2026 Calyndrae. All rights reserved.

// The popup's only job: say whether Anti Blur is on for the site in this tab,
// and switch it. The list itself lives in background.js; this asks and tells.

(async () => {
  const $ = id => document.getElementById(id);
  const sw = $('switch');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab && tab.url;

  // The state the page in this tab was LOADED with. A toggle only takes effect
  // on the next load, so "Reload to apply" shows exactly when the switch and
  // the page disagree — and hides again if the person switches back.
  let loadedOn = null;

  function render(state) {
    const on = state.on;
    sw.setAttribute('aria-checked', String(on));
    $('badge').classList.toggle('off', !on);
    $('badge-text').textContent = on ? 'On' : 'Off';
    $('claims').classList.toggle('off', !on);
    $('status').textContent = `Anti Blur ${on ? 'on' : 'off'} for this site`;
    $('apply').hidden = loadedOn === null || on === loadedOn;
  }

  const state = await chrome.runtime.sendMessage({ type: 'state', url });
  if (!state || !state.host) {
    // chrome:// pages, the new tab page, the Web Store, PDFs, file:// — no
    // content script reaches them, so there is nothing to switch.
    $('host').textContent = 'This page';
    $('badge').classList.add('off');
    $('badge-text').textContent = 'N/A';
    $('claims').classList.add('off');
    $('status').textContent = 'Anti Blur can’t run on this page.';
    return;
  }

  $('host').textContent = state.host;
  $('host').title = state.host;
  loadedOn = state.on;
  render(state);
  sw.disabled = false;

  sw.addEventListener('click', async () => {
    sw.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: 'toggle', url });
      if (result && result.ok) render({ on: result.on });
    } finally {
      sw.disabled = false;
      sw.focus();
    }
  });

  $('reload').addEventListener('click', () => {
    chrome.tabs.reload(tab.id);
    window.close();
  });

  // The shortcut is whatever the person has it set to in chrome://extensions/
  // shortcuts — or nothing, when another extension already took Alt+Shift+B.
  // Only shown when there is one to show.
  const commands = await chrome.commands.getAll();
  const toggle = commands.find(c => c.name === 'toggle-site');
  if (toggle && toggle.shortcut) {
    $('key-combo').textContent = toggle.shortcut;
    $('key').hidden = false;
  }
})();
