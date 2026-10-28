// Test de bout en bout dans Firefox : installe l'extension (installation temporaire, comme depuis
// about:debugging) et la fait travailler contre le FAUX Threads de fake-threads.mjs. Firefox est piloté
// en WebDriver BiDi, sans dépendance : il suffit de Firefox 140+ et d'openssl. BiDi ne peut pas
// naviguer vers une page moz-extension:// : on l'ouvre depuis la fenêtre du navigateur, ce qu'autorise
// --remote-allow-system-access (réservé aux tests).
//
// Usage : node extension/tests/e2e-firefox.mjs   (FIREFOX=/chemin/vers/firefox pour un autre binaire)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOTAL_BLOCKED, apiBlocked, blocked, startFakeThreads, visited } from './fake-threads.mjs';

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { browser_specific_settings: { gecko } } = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'));
const UUID = '0b10c0de-0000-4000-8000-00000000b10c'; // fixé par préférence, pour connaître l'URL de la page
const appUrl = `moz-extension://${UUID}/app.html`;

const fake = await startFakeThreads();
const profile = path.join(fake.tmp, 'profile');
const downloads = path.join(fake.tmp, 'downloads');
fs.mkdirSync(profile);
fs.mkdirSync(downloads);
const prefs = {
  'extensions.webextensions.uuids': JSON.stringify({ [gecko.id]: UUID }),
  // threads.com passe par le proxy du faux Threads, qui refuse tout autre site.
  'network.proxy.type': 1,
  'network.proxy.ssl': '127.0.0.1',
  'network.proxy.ssl_port': fake.proxyPort,
  'network.proxy.http': '127.0.0.1',
  'network.proxy.http_port': fake.proxyPort,
  'browser.download.dir': downloads,
  'browser.download.folderList': 2,
  'browser.download.useDownloadDir': true,
  'browser.download.always_ask_before_handling_new_types': false,
};
fs.writeFileSync(path.join(profile, 'user.js'),
  Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n') + '\n');

const firefox = spawn(process.env.FIREFOX || 'firefox',
  ['-headless', '-no-remote', '-profile', profile, '--remote-debugging-port', '0', '--remote-allow-system-access'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((resolve, reject) => {
  let err = '';
  firefox.stderr.on('data', (chunk) => {
    err += chunk;
    const m = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(err);
    if (m) resolve(m[1]);
  });
  firefox.on('exit', (code) => reject(new Error(`Firefox s'est arrêté (${code}) : ${err.slice(-500)}`)));
});

// --- Client WebDriver BiDi minimal ---
const ws = new WebSocket(`${wsUrl}/session`);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.type === 'error') reject(new Error(`${msg.error} : ${msg.message}`));
    else resolve(msg.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

await send('session.new', {
  capabilities: { alwaysMatch: { acceptInsecureCerts: true, unhandledPromptBehavior: { default: 'accept' } } },
});
await send('webExtension.install', { extensionData: { type: 'path', path: extensionPath } });

// Ouvre la page La Blocklist dans un onglet, depuis la fenêtre du navigateur, et renvoie son contexte.
const { contexts: [browserWindow] } = await send('browsingContext.getTree', { 'moz:scope': 'chrome' });
await send('script.evaluate', {
  expression: `gBrowser.selectedTab = gBrowser.addTab(${JSON.stringify(appUrl)},
    { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); 0`,
  target: { context: browserWindow.context }, awaitPromise: false,
});
let target;
for (let i = 0; i < 100 && !target; i++) {
  const { contexts } = await send('browsingContext.getTree', {});
  const app = contexts.find((c) => c.url === appUrl);
  if (app) target = { context: app.context };
  else await new Promise((r) => setTimeout(r, 100));
}
assert.ok(target, 'la page La Blocklist ne s\'est pas ouverte');

/** Évalue `fn(...args)` dans la page La Blocklist et renvoie sa valeur (JSON). */
async function inApp(fn, ...args) {
  const r = await send('script.evaluate', {
    expression: `(async () => JSON.stringify(await (${fn})(...${JSON.stringify(args)})))()`,
    target, awaitPromise: true, resultOwnership: 'none',
  });
  if (r.type === 'exception') throw new Error(r.exceptionDetails.text);
  return r.result.value === undefined ? undefined : JSON.parse(r.result.value);
}
const loaded = () => waitUntil(() => inApp(() => document.readyState === 'complete' && Boolean(document.querySelector('#log'))).catch(() => false), 'chargement de la page');
const text = (sel) => inApp((s) => document.querySelector(s).textContent, sel);
const fill = (sel, value) => inApp((s, v) => {
  const el = document.querySelector(s);
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, sel, value);
const click = (sel) => inApp((s) => document.querySelector(s).click(), sel);
const setChecked = (sel, on) => inApp((s, v) => { document.querySelector(s).checked = v; }, sel, on);
async function waitUntil(fn, what, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) throw new Error(`délai dépassé : ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}
const logEnds = (n) => waitUntil(async () => (await text('#log')).split('Terminé').length > n, `${n}e « Terminé »`)
  .catch(async (e) => { throw new Error(`${e.message}\njournal : ${await text('#log')}`); });
// « Charger la liste » est asynchrone : on attend son résumé avant de continuer.
async function loadList(value) {
  await inApp(() => { document.querySelector('#parse-summary').textContent = ''; });
  await fill('#paste', value);
  await click('#load');
  await waitUntil(async () => (await text('#parse-summary')) !== '', 'chargement de la liste');
  return text('#parse-summary');
}
const setPause = async () => { await fill('#min', '0'); await fill('#max', '0'); };
let step = 0;
const ok = (name) => console.log(`ok ${++step} - ${name}`);

try {
  await loaded();
  assert.deepEqual(await inApp(() => chrome.permissions.contains({ origins: ['https://www.threads.com/*'] })), true);
  assert.deepEqual(await inApp(() => chrome.runtime.sendMessage({ type: 'starter:seen' })), { ok: true });
  // background.js retrouve ainsi l'onglet La Blocklist déjà ouvert quand on clique sur l'icône.
  const tabs = await inApp(async () => (await chrome.runtime.getContexts({ contextTypes: ['TAB'] }))
    .map((c) => ({ tab: typeof c.tabId, window: typeof c.windowId, url: c.documentUrl })));
  assert.deepEqual(tabs, [{ tab: 'number', window: 'number', url: appUrl }]);
  ok('installation : page ouverte, accès à threads.com accordé, arrière-plan qui répond, onglet retrouvable');

  // 1. Application via l'API, avec repli sur l'interface (précontrôle via l'API compris)
  assert.match(await loadList('@Alice\nghost\nalready\nbroken\nalice\nnot valid\nhttps://www.threads.com/@Bob'),
    /5 comptes valides.*1 doublons.*1 entrées invalides/);
  await setPause();
  await click('#start');
  await logEnds(1);
  const log1 = await text('#log');
  assert.deepEqual([...blocked].sort(), ['alice', 'bob'], log1);
  assert.deepEqual([...apiBlocked].sort(), ['alice', 'bob']);
  assert.match(log1, /55 profils bloqués lus/);
  assert.match(log1, /@ghost : introuvable/);
  assert.match(log1, /@already : déjà bloqué/);
  assert.match(log1, /@broken : échec/);
  assert.ok(!visited.includes('/settings/privacy'), 'la liste doit être lue via l\'API');
  ok('application : profils bloqués et blocages via l\'API, introuvable / déjà bloqué / échec par l\'interface');

  // 2. Limitation par Threads : arrêt net
  blocked.length = 0;
  await click('#reset');
  await loadList('q1\nlimited\nq2');
  await click('#start');
  await logEnds(1);
  assert.deepEqual(blocked, ['q1']);
  assert.match(await text('#log'), /limite les blocages sur votre compte/);
  ok('limitation : arrêt immédiat');

  // 3. API désactivée : tout passe par l'interface (lecture des profils bloqués au premier plan comprise)
  blocked.length = 0;
  apiBlocked.length = 0;
  visited.length = 0;
  await click('#reset');
  await loadList('p1\np2\nuser03');
  await setChecked('#api', false);
  await click('#start');
  await logEnds(1);
  assert.deepEqual(blocked, ['p1', 'p2']);
  assert.deepEqual(apiBlocked, []);
  assert.ok(visited.includes('/settings/privacy'), visited.join(' '));
  assert.match(await text('#log'), /55 profils bloqués lus ; 1 comptes de la liste déjà bloqués/);
  ok('interface seule : profils bloqués lus par défilement, blocages par clics');

  // 4. Export (API désactivée : défilement), fichier téléchargé et relisible
  await click('#export-btn');
  let file;
  await waitUntil(() => {
    file = fs.readdirSync(downloads).find((f) => /^la-blocklist-bloques-.*\.txt$/.test(f));
    return file && !fs.existsSync(path.join(downloads, `${file}.part`));
  }, 'téléchargement de l\'export');
  const lines = fs.readFileSync(path.join(downloads, file), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  assert.equal(lines.length, TOTAL_BLOCKED);
  assert.equal(new Set(lines).size, TOTAL_BLOCKED);
  ok(`export : ${TOTAL_BLOCKED} comptes dans ${file}`);

  console.log('tous les tests e2e Firefox passent');
} finally {
  await send('session.end').catch(() => {});
  ws.close();
  firefox.kill();
  await new Promise((r) => firefox.once('exit', r));
  fake.close();
}
