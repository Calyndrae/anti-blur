// SPDX-FileCopyrightText: 2026 Calyndrae <https://calyndrae.com/projects/anti-blur>
// SPDX-License-Identifier: LicenseRef-Proprietary
// Anti Blur — © 2026 Calyndrae. All rights reserved.

// Owns one thing: which sites Anti Blur is OFF for, and keeping inject.js off
// those sites.
//
// WHY THE SCRIPT IS REGISTERED HERE AND NOT IN THE MANIFEST. inject.js has to
// run before the page's own scripts or it is pointless, and a MAIN-world
// script cannot ask chrome.storage anything before it runs. The one way to
// leave a site out ahead of time is `excludeMatches` on a registered content
// script, which chrome.scripting can rewrite whenever the list changes.
//
// The list is a set of hostnames, kept in chrome.storage.local, never sent
// anywhere. "This site" means the hostname in the address bar: turning it off
// for www.youtube.com leaves music.youtube.com alone.

const SCRIPT_ID = 'anti-blur';
const KEY = 'offSites';

const pattern = host => `*://${host}/*`;

async function offSites() {
  const { [KEY]: list } = await chrome.storage.local.get(KEY);
  return Array.isArray(list) ? list : [];
}

// http, https and file pages are the only ones a content script can reach,
// and only http(s) ones have a hostname to name a site by.
function hostOf(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? u.hostname : null;
  } catch {
    return null;
  }
}

// Serialised: two toggles in quick succession must not race each other's
// read-modify-write of the list or of the registration.
let chain = Promise.resolve();
const serial = job => (chain = chain.then(job, job));

async function sync() {
  const script = {
    id: SCRIPT_ID,
    js: ['inject.js'],
    matches: ['<all_urls>'],
    excludeMatches: (await offSites()).map(pattern),
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: true,
    matchOriginAsFallback: true,
    persistAcrossSessions: true,
  };
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}

async function isOff(host) {
  return host !== null && (await offSites()).includes(host);
}

async function setOff(host, off) {
  const list = (await offSites()).filter(h => h !== host);
  if (off) list.push(host);
  await chrome.storage.local.set({ [KEY]: list });
  await sync();
}

// ─── The toolbar badge ─────────────────────────────────────────────────────
// "OFF" on a tab whose site is switched off, nothing otherwise — on is the
// normal state and does not need saying on every tab.
async function paint(tabId, url) {
  const off = await isOff(hostOf(url));
  await chrome.action.setBadgeText({ tabId, text: off ? 'OFF' : '' });
  await chrome.action.setTitle({
    tabId,
    title: off ? 'Anti Blur — off for this site' : 'Anti Blur — on for this site',
  });
}

async function paintAll() {
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id !== undefined) paint(tab.id, tab.url).catch(() => {});
  }
}

chrome.action.setBadgeBackgroundColor({ color: '#6E737C' }).catch(() => {});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status === 'loading') paint(tabId, tab.url).catch(() => {});
});

// ─── Toggling ──────────────────────────────────────────────────────────────
// The change applies from the next load: Anti Blur is either in a page from
// its first line or not at all, and it cannot be taken back out of a page
// that already has it. Both the popup and the shortcut say so.
async function toggle(tab) {
  const host = hostOf(tab && tab.url);
  if (!host) return { ok: false, reason: 'unsupported' };
  return serial(async () => {
    const off = !(await isOff(host));
    await setOff(host, off);
    await paintAll();
    return { ok: true, host, on: !off };
  });
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-site') return;
  const [active] = tab ? [tab] : await chrome.tabs.query({ active: true, currentWindow: true });
  const result = await toggle(active);
  if (result.ok) chrome.tabs.reload(active.id);
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || typeof message.type !== 'string') return false;
  if (message.type === 'state') {
    const host = hostOf(message.url);
    isOff(host).then(off => reply({ host, on: host !== null && !off }));
    return true;
  }
  if (message.type === 'toggle') {
    toggle({ url: message.url }).then(reply);
    return true;
  }
  return false;
});

// ─── Registration ──────────────────────────────────────────────────────────
// At every start of the worker, not only on install: a registration that was
// lost (a profile copied without it, an update that failed half way) would
// otherwise leave Anti Blur silently doing nothing until the next install.
chrome.runtime.onInstalled.addListener(() => { serial(sync).then(paintAll); });
chrome.runtime.onStartup.addListener(() => { serial(sync).then(paintAll); });
serial(sync).catch(() => {});

// Exposed for the test bench, which drives this worker over the DevTools
// protocol. Nothing in the extension calls these.
self.antiBlur = { setOff: (host, off) => serial(() => setOff(host, off)), offSites };
