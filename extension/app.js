import {
  STARTER, STATUS, applyStarterUpdate, isDone, normalizeHandle, parseBlocklists, runBlocks, writeBlocklist, BlocklistError,
} from './lib.js';

const THREADS = 'https://www.threads.com';
const PRIVACY_URL = `${THREADS}/settings/privacy`;
const $ = (id) => document.getElementById(id);

// --- Stockage (chrome.storage.local) : liste, progression et réglages survivent à la fermeture ---

// Réseaux pris en charge, chacun avec sa progression. Instagram limite davantage l'automatisation :
// pauses plus longues et plafond plus bas par défaut. La lecture préalable des profils bloqués et
// le passage par l'API interne (api.js) n'existent que pour Threads.
const PLATFORMS = {
  threads: {
    name: 'Threads', profileUrl: (h) => `${THREADS}/@${h}`, results: 'results', precheck: true, api: true,
    defaults: { min: 8, max: 20, limit: 100 },
  },
  instagram: {
    name: 'Instagram', profileUrl: (h) => `https://www.instagram.com/${h}/`, results: 'resultsInstagram', precheck: false,
    api: false, defaults: { min: 30, max: 60, limit: 30 },
  },
};

// `excluded` : comptes décochés dans la liste, qui ne seront pas bloqués.
// `settings.precheck` : lire d'abord la liste « Profils bloqués » pour sauter les comptes déjà bloqués.
// `settings.api` : sur Threads, bloquer et lire « Profils bloqués » via l'API interne (api.js), avec
// l'interface (content.js) en repli.
// `starter` : état de la liste de départ, mis à jour aussi par background.js (voir refreshStarter).
const DEFAULTS = {
  list: [], results: {}, resultsInstagram: {}, excluded: [], starter: {},
  ignore: { enabled: true }, // masquer les publications des comptes cochés (inline.js), sans bloquer
  settings: { platform: 'threads', min: 8, max: 20, limit: 100, precheck: true, api: true },
};
let store = structuredClone(DEFAULTS);
const persist = () => chrome.storage.local.set(store);
const platform = () => PLATFORMS[store.settings.platform] || PLATFORMS.threads;
const results = () => store[platform().results]; // progression du réseau choisi

// --- Pauses : dans un worker, car les minuteries d'un onglet masqué sont ralenties par Chrome ---

const timer = new Worker('timer-worker.js');
const sleepers = new Map();
let sleepSeq = 0;
timer.onmessage = ({ data: { id } }) => sleepers.get(id)?.();
const workerSleep = (ms) => new Promise((resolve) => {
  const id = ++sleepSeq;
  sleepers.set(id, () => { sleepers.delete(id); resolve(); });
  timer.postMessage({ id, ms });
});
const sleep = (ms, signal) => {
  if (!signal) return workerSleep(ms);
  if (signal.aborted) return Promise.resolve();
  return Promise.race([workerSleep(ms), new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))]);
};

// --- Onglet Threads de travail ---

let workTabId = null;

/**
 * Exécute `trigger` (qui navigue ou crée un onglet et renvoie son id), puis attend que cet onglet ait
 * fini de charger. Les événements sont écoutés avant le déclenchement : un « complete » n'est retenu
 * que s'il suit un « loading », pour ne pas confondre avec l'ancienne page.
 */
function loadAfter(trigger, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const seen = new Map(); // id d'onglet -> 'loading' puis 'done'
    let tabId = null;
    const finish = (fn, arg) => { chrome.tabs.onUpdated.removeListener(onUpdated); fn(arg); };
    const settle = () => { if (tabId !== null && seen.get(tabId) === 'done') finish(resolve, tabId); };
    const onUpdated = (id, info) => {
      if (info.status === 'loading') seen.set(id, 'loading');
      else if (info.status === 'complete' && seen.get(id) === 'loading') seen.set(id, 'done');
      settle();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    sleep(timeoutMs).then(() => finish(reject, new Error('chargement de la page trop long')));
    trigger().then((id) => { tabId = id; settle(); }, (e) => finish(reject, e));
  });
}

async function openInWorkTab(url, { active = false } = {}) {
  if (workTabId !== null) {
    try {
      return await loadAfter(async () => {
        await chrome.tabs.update(workTabId, { url, active });
        return workTabId;
      });
    } catch (e) {
      if (!/No tab with id/i.test(e.message)) throw e;
      workTabId = null; // l'utilisateur a fermé l'onglet : on en recrée un
    }
  }
  workTabId = await loadAfter(async () => (await chrome.tabs.create({ url, active })).id);
  return workTabId;
}

/** Retire le voile « ne touchez à rien » de l'onglet de travail à la fin d'une série de blocages. */
async function releaseWorkTab() {
  if (workTabId === null) return;
  await chrome.scripting.executeScript({
    target: { tabId: workTabId },
    func: () => globalThis.__blockedex?.release?.(),
  }).catch(() => {}); // onglet fermé entre-temps
}

async function callInPage(tabId, method) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (name) => globalThis.__blockedex[name](),
    args: [method],
  });
  return result;
}

async function callApi(tabId, method, args) {
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['api.js'] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (name, a) => globalThis.__blockedexApi[name](...a),
    args: [method, args],
  });
  return result;
}

// L'API s'appelle depuis la page où se trouve l'onglet de travail ; si les modules de Threads n'y sont
// pas chargés (page « introuvable »...), on le ramène sur l'accueil, qui les charge, et on réessaie.
async function viaApi(method, ...args) {
  if (workTabId === null) await openInWorkTab(`${THREADS}/`);
  let result = await callApi(workTabId, method, args);
  if (result?.status === 'not_ready') {
    await openInWorkTab(`${THREADS}/`);
    result = await callApi(workTabId, method, args);
  }
  return result;
}

const useApi = () => store.settings.api !== false && platform().api;

// --- Interface ---

const logEl = $('log');
function log(text, kind = '') {
  const li = document.createElement('li');
  li.textContent = text;
  if (kind) li.className = kind;
  logEl.append(li);
  while (logEl.children.length > 300) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.className = `status ${kind}`.trim();
}

// --- Bandeau « Traitement en cours » : étape en cours, temps écoulé, compte à rebours des pauses ---

let busyStart = 0;
let busyTimer = null;
let pauseUntil = 0; // fin de la pause en cours entre deux blocages (horodatage), 0 sinon
const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
function setStep(text) {
  pauseUntil = 0;
  $('busy-step').textContent = text;
}
function startPause(ms) {
  pauseUntil = Date.now() + ms;
  tick();
}
function tick() {
  $('busy-time').textContent = clock(Date.now() - busyStart);
  if (pauseUntil) {
    $('busy-step').textContent = `Pause avant le compte suivant : encore ${Math.max(0, Math.ceil((pauseUntil - Date.now()) / 1000))} s`
      + ' (les pauses limitent le risque de restriction du compte)';
  }
}
function setBusy(on) {
  $('busy').hidden = !on;
  if (on && !busyTimer) {
    busyStart = Date.now();
    setStep('Démarrage…');
    tick();
    busyTimer = setInterval(tick, 1000);
  } else if (!on && busyTimer) {
    clearInterval(busyTimer);
    busyTimer = null;
    pauseUntil = 0;
  }
}

const LABELS = {
  [STATUS.BLOCKED]: ['bloqué', 'ok'],
  [STATUS.ALREADY_BLOCKED]: ['déjà bloqué', 'ok'],
  [STATUS.NOT_FOUND]: ['introuvable', 'warn'],
  [STATUS.FAILED]: ['échec', 'err'],
};

const selectedList = () => {
  const excluded = new Set(store.excluded);
  return store.list.filter((h) => !excluded.has(h));
};

let listChangedWhileRunning = false; // mise à jour de la liste de départ arrivée pendant un traitement

function refresh() {
  if (!running && listChangedWhileRunning) {
    listChangedWhileRunning = false;
    renderChecklist();
  }
  const total = store.list.length;
  const selected = selectedList();
  const done = selected.filter((h) => isDone(results()[h])).length;
  const off = total - selected.length;
  const idle = !running;
  $('counts').textContent = total
    ? `${total} comptes dans la liste : ${done} déjà traités, ${selected.length - done} à traiter`
      + (off ? ` ; ${off} ${off === 1 ? 'décoché' : 'décochés'}` : '') + '.'
    : 'Aucune liste chargée.';
  $('start').disabled = !idle || selected.length === done;
  $('stop').disabled = idle;
  $('reset').disabled = !idle || !Object.keys(results()).length;
  $('load').disabled = !idle;
  $('export-btn').disabled = !idle;
  $('bar').hidden = !selected.length;
  $('bar').max = Math.max(selected.length, 1);
  $('bar').value = done;
  $('picker').hidden = !total;
  renderIgnore();
  for (const box of $('accounts').querySelectorAll('input')) box.disabled = !idle;
  setBusy(!idle);
  $('platform').disabled = !idle;
  $('platform-hint').hidden = platform().precheck;
  $('precheck').disabled = !idle || !platform().precheck;
  $('api').disabled = !idle || !platform().api;
  $('read-following').disabled = !idle;
  $('starter-add').disabled = !idle;
  $('starter-refresh').disabled = !idle;
  $('download-list').disabled = !selected.length;
  $('check-all').disabled = !idle;
  $('uncheck-all').disabled = !idle;
}

// --- Liste à cocher ---

const items = new Map(); // handle -> <li>

function setTag(li, handle) {
  const tag = li.querySelector('.tag');
  const label = LABELS[results()[handle]];
  tag.textContent = label ? label[0] : '';
  tag.className = `tag ${label ? label[1] : ''}`.trim();
}

function renderChecklist() {
  const excluded = new Set(store.excluded);
  // Noms affichés pour les comptes de la liste de départ (« @marine_lepen · Marine Le Pen »).
  const names = new Map((store.starter.accounts || []).map((a) => [a.handle, a.name]));
  items.clear();
  const ul = $('accounts');
  ul.replaceChildren(...store.list.map((handle) => {
    const li = document.createElement('li');
    li.dataset.handle = handle;
    li.innerHTML = '<label><input type="checkbox"><span class="name"></span><span class="tag"></span></label>';
    li.querySelector('input').checked = !excluded.has(handle);
    li.classList.toggle('off', excluded.has(handle));
    li.querySelector('.name').textContent = `@${handle}`;
    if (names.get(handle)) {
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = ` · ${names.get(handle)}`;
      li.querySelector('.name').append(who);
    }
    setTag(li, handle);
    items.set(handle, li);
    return li;
  }));
  applyFilter();
}

function applyFilter() {
  const query = $('filter').value.trim().replace(/^@/, '').toLowerCase();
  let shown = 0;
  for (const [handle, li] of items) {
    li.hidden = Boolean(query) && !handle.includes(query);
    if (!li.hidden) shown++;
  }
  $('accounts').querySelector('.empty')?.remove();
  if (!shown && items.size) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Aucun compte ne correspond.';
    $('accounts').append(li);
  }
}

async function setExcluded(handles, exclude) {
  const excluded = new Set(store.excluded);
  for (const h of handles) {
    if (exclude) excluded.add(h); else excluded.delete(h);
    const li = items.get(h);
    li.querySelector('input').checked = !exclude;
    li.classList.toggle('off', exclude);
  }
  store.excluded = store.list.filter((h) => excluded.has(h));
  await persist();
  refresh();
}

const visibleHandles = () => [...items].filter(([, li]) => !li.hidden).map(([h]) => h);

$('accounts').addEventListener('change', (e) => {
  const li = e.target.closest('li');
  if (li) setExcluded([li.dataset.handle], !e.target.checked);
});
$('filter').addEventListener('input', applyFilter);
$('check-all').addEventListener('click', () => setExcluded(visibleHandles(), false));
$('download-list').addEventListener('click', () => {
  const handles = selectedList();
  const day = new Date().toISOString().slice(0, 10);
  download(`la-blocklist-${day}.txt`,
    `# La Blocklist, liste du ${day} (${handles.length} ${handles.length === 1 ? 'compte' : 'comptes'})\n` + handles.map((h) => `@${h}\n`).join(''));
});
$('uncheck-all').addEventListener('click', () => setExcluded(visibleHandles(), true));

function readSettings() {
  const num = (id, fallback) => {
    const value = $(id).value.trim() === '' ? NaN : Number($(id).value);
    return Number.isFinite(value) ? Math.max(0, value) : fallback; // 0 est une valeur valide
  };
  const settings = {
    platform: $('platform').value,
    min: num('min', 8), max: num('max', 20), limit: num('limit', 100), precheck: $('precheck').checked,
    api: $('api').checked,
  };
  if (settings.min > settings.max) settings.max = settings.min;
  return settings;
}

// --- Import ---

/** Remplace la liste à traiter (tous les comptes cochés) et réaffiche la liste à cocher. */
async function useList(handles) {
  store.list = handles;
  store.excluded = [];
  // La liste est remplacée : la liste de départ n'en fait plus partie, ses mises à jour ne la
  // réintroduisent pas. On peut l'ajouter à nouveau depuis sa carte.
  if (store.starter.added) store.starter = { ...store.starter, added: false };
  await persist();
  $('filter').value = '';
  renderChecklist();
  refresh();
  renderStarter();
}

/** « 501 », « 1,2 k », « 1.0M » → nombre approximatif, ou null. */
function parseCount(text) {
  const m = /^(\d[\d\s.,]*?)\s*([kKmM])?$/.exec(String(text || '').trim());
  if (!m) return null;
  const n = Number(m[1].replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * ({ k: 1e3, m: 1e6 }[(m[2] || '').toLowerCase()] || 1));
}

$('read-following').addEventListener('click', async () => {
  const status = $('source-status');
  const handle = normalizeHandle($('source-handle').value);
  if (!handle) return setStatus(status, 'Indiquez un pseudo (@pseudo) ou un lien de profil valide.', 'err');
  running = true;
  refresh();
  progressEl = status;
  setStatus(status, `Lecture des abonnements de @${handle} en cours, suivez l'avancement en haut de la page…`, 'working');
  setStep(`Ouverture du profil @${handle} dans un onglet Threads (il passe au premier plan)…`);
  try {
    const result = await readInForeground(`${THREADS}/@${handle}`, 'readFollowing');
    if (result.status === STATUS.LOGIN_REQUIRED) {
      setStatus(status, 'Session Threads absente ou expirée : connectez-vous sur threads.com puis réessayez.', 'err');
    } else if (result.status === STATUS.NOT_FOUND) {
      setStatus(status, `Le compte @${handle} est introuvable.`, 'err');
    } else if (result.status !== 'ok') {
      setStatus(status, `Échec : ${result.detail}.`, 'err');
    } else if (!result.handles.length) {
      setStatus(status, `Aucun abonnement lu pour @${handle} : la liste actuelle n'a pas été remplacée.`, 'warn');
    } else {
      await useList(result.handles);
      setStatus($('parse-summary'), '');
      const expected = parseCount(result.expected);
      // Threads n'affiche parfois qu'une partie de la liste (constaté : ~300 sur 501).
      const partial = expected && result.handles.length < expected * 0.95;
      setStatus(status,
        `${result.handles.length} comptes lus parmi les abonnements de @${handle}`
        + (result.expected ? ` (Threads en annonce ${result.expected})` : '') + '. '
        + (partial ? 'Threads n\'a affiché qu\'une partie de la liste. ' : '')
        + 'Relisez-la ci-dessous et décochez ceux à ne pas bloquer.',
        partial ? 'warn' : 'ok');
    }
  } catch (e) {
    setStatus(status, `Échec : ${e.message}`, 'err');
  } finally {
    progressEl = null;
    running = false;
    refresh();
  }
});

$('load').addEventListener('click', async () => {
  const sources = [];
  if ($('paste').value.trim()) sources.push({ name: 'collé.txt', text: $('paste').value });
  for (const file of $('file').files) sources.push({ name: file.name, text: await file.text() });
  const summary = $('parse-summary');
  if (!sources.length) return setStatus(summary, 'Collez des comptes ou choisissez un fichier.', 'warn');
  let parsed;
  try {
    parsed = parseBlocklists(sources);
  } catch (e) {
    if (e instanceof BlocklistError) return setStatus(summary, e.message, 'err');
    throw e;
  }
  if (!parsed.handles.length) return setStatus(summary, 'Aucun compte valide trouvé.', 'err');
  await useList(parsed.handles);
  setStatus($('source-status'), '');
  const extra = [];
  if (parsed.duplicates) extra.push(`${parsed.duplicates} doublons ignorés`);
  if (parsed.invalid.length) extra.push(`${parsed.invalid.length} entrées invalides (ex. ${JSON.stringify(parsed.invalid[0])})`);
  setStatus(summary, `${parsed.handles.length} comptes valides` + (extra.length ? ` ; ${extra.join(', ')}` : '') + '.', parsed.invalid.length ? 'warn' : 'ok');
  refresh();
});

// --- Application ---

let running = false;
let controller = null;

async function blockOne(handle) {
  if (useApi()) {
    try {
      const result = await viaApi('block', handle);
      if (result?.status === STATUS.BLOCKED) {
        // Le voile « ne touchez à rien » reste sur l'onglet de travail pendant la pause qui suit.
        await callInPage(workTabId, 'cover').catch(() => {});
        return STATUS.BLOCKED;
      }
      if (result?.status === STATUS.RATE_LIMITED) {
        log(`  détail : ${result.detail}`, 'err');
        return STATUS.RATE_LIMITED;
      }
      log(`  API : ${result?.detail ?? 'pas de réponse'} ; passage par l'interface`);
    } catch (e) {
      log(`  API : ${e.message} ; passage par l'interface`);
    }
  }
  try {
    const tabId = await openInWorkTab(platform().profileUrl(handle));
    const result = await callInPage(tabId, 'blockProfile');
    if (result.status === STATUS.FAILED && result.detail) log(`  détail : ${result.detail}`, 'err');
    return result.status;
  } catch (e) {
    log(`  détail : ${e.message}`, 'err');
    return STATUS.FAILED;
  }
}

/**
 * Lit la liste « Profils bloqués » de Threads (au premier plan : la liste ne se charge pas dans un
 * onglet masqué), puis rend la main à la page La Blocklist.
 */
async function readInForeground(url, method) {
  const appTab = await chrome.tabs.getCurrent();
  try {
    const tabId = await openInWorkTab(url, { active: true });
    return await callInPage(tabId, method);
  } finally {
    if (appTab) await chrome.tabs.update(appTab.id, { active: true }).catch(() => {});
  }
}

/**
 * Lit « Profils bloqués » : via l'API si elle est activée (quelques secondes, onglet de travail en
 * arrière-plan), sinon ou en cas d'échec en faisant défiler la liste dans les réglages, au premier plan.
 */
async function readCurrentBlocks(onFallback = () => {}) {
  if (store.settings.api !== false) {
    try {
      const result = await viaApi('listBlocked');
      if (result?.status === 'ok' || result?.status === STATUS.RATE_LIMITED) return result;
      onFallback(result?.detail ?? 'pas de réponse');
    } catch (e) {
      onFallback(e.message);
    }
  }
  setStep('Ouverture des réglages Threads dans un onglet (il passe au premier plan)…');
  return readInForeground(PRIVACY_URL, 'exportBlocked');
}

/**
 * Marque « déjà bloqué » les comptes cochés présents dans vos profils bloqués, pour ne pas visiter
 * leur profil. Si la liste est illisible, chaque profil sera vérifié comme avant. Renvoie false
 * s'il faut s'arrêter (session expirée).
 */
async function skipAlreadyBlocked(handles) {
  log('Lecture de vos profils bloqués sur Threads...');
  setStep('Lecture de vos profils bloqués pour sauter ceux déjà bloqués…');
  let result;
  try {
    result = await readCurrentBlocks((detail) => log(`  API : ${detail} ; lecture par l'interface (un onglet passe au premier plan, n'y touchez pas)`));
  } catch (e) {
    log(`Lecture impossible (${e.message}) : chaque profil sera vérifié.`, 'warn');
    return true;
  }
  if (result.status === STATUS.LOGIN_REQUIRED) {
    log('Arrêt : session Threads absente ou expirée : connectez-vous sur threads.com', 'warn');
    return false;
  }
  if (result.status === STATUS.RATE_LIMITED) {
    log(`Arrêt : Threads limite votre compte (${result.detail}) ; attendez quelques heures.`, 'warn');
    return false;
  }
  if (result.status !== 'ok') {
    log(`Lecture impossible (${result.detail}) : chaque profil sera vérifié.`, 'warn');
    return true;
  }
  const blocked = new Set(result.handles);
  let skipped = 0;
  for (const h of handles) {
    if (isDone(results()[h]) || !blocked.has(h)) continue;
    results()[h] = STATUS.ALREADY_BLOCKED;
    setTag(items.get(h), h);
    skipped++;
  }
  await persist();
  refresh();
  log(`${result.handles.length} profils bloqués lus ; ${skipped} comptes de la liste déjà bloqués, sautés.`, 'ok');
  return true;
}

$('start').addEventListener('click', async () => {
  const settings = readSettings();
  store.settings = settings;
  const handles = selectedList();
  const todo = handles.filter((h) => !isDone(results()[h])).length;
  const planned = settings.limit ? Math.min(todo, settings.limit) : todo;
  const { name } = platform();
  if (!confirm(`Bloquer jusqu'à ${planned} comptes sur ${name} avec votre compte connecté ?`)) return;

  running = true;
  controller = new AbortController();
  refresh();
  log(`Démarrage sur ${name} : ${planned} comptes prévus.`);
  if (settings.precheck && platform().precheck && !await skipAlreadyBlocked(handles)) {
    running = false;
    refresh();
    return;
  }
  let attempt = 0;
  const summary = await runBlocks({
    handles,
    results: results(),
    block: (handle) => {
      setStep(`${name} : blocage de @${handle} (${++attempt} sur ${planned} au maximum)…`);
      return blockOne(handle);
    },
    sleep: (ms, signal) => {
      startPause(ms);
      return sleep(ms, signal);
    },
    delay: [settings.min, settings.max],
    limit: settings.limit,
    signal: controller.signal,
    log: (text) => log(text, 'warn'),
    onResult: async (handle, status, index, total) => {
      const [label, kind] = LABELS[status];
      log(`[${index + 1}/${total}] @${handle} : ${label}`, kind);
      setTag(items.get(handle), handle);
      await persist();
      refresh();
    },
  });
  await releaseWorkTab();
  running = false;
  const parts = Object.entries(summary.counts).map(([s, n]) => `${n} ${LABELS[s][0]}`);
  log(`Terminé : ${parts.join(', ') || 'rien à faire'} ; ${summary.remaining} restants.`, summary.aborted ? 'warn' : 'ok');
  refresh();
});

$('stop').addEventListener('click', () => controller?.abort());

// Changer de réseau : chacun garde sa progression ; on reprend ses pauses et son plafond conseillés.
$('platform').addEventListener('change', async () => {
  store.settings = { ...readSettings(), ...PLATFORMS[$('platform').value].defaults };
  $('min').value = store.settings.min;
  $('max').value = store.settings.max;
  $('limit').value = store.settings.limit;
  await persist();
  for (const [handle, li] of items) setTag(li, handle);
  refresh();
});

$('reset').addEventListener('click', async () => {
  if (!confirm(`Effacer la progression sur ${platform().name} ? Les comptes de la liste seront retraités.`)) return;
  store[platform().results] = {};
  await persist();
  for (const [handle, li] of items) setTag(li, handle);
  logEl.replaceChildren();
  refresh();
});

// --- Export ---

// Progression des lectures de listes : affichée sous le bouton qui l'a lancée.
let progressEl = null;
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'blockedex:progress' || !running) return;
  if (msg.step) setStep(msg.step);
  if (progressEl && msg.count) setStatus(progressEl, `En cours : ${msg.count} comptes trouvés…`, 'working');
});

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

$('export-btn').addEventListener('click', async () => {
  const status = $('export-status');
  running = true; // verrouille les autres boutons pendant l'export
  refresh();
  setStatus(status, 'Export en cours, suivez l\'avancement en haut de la page…', 'working');
  setStep('Lecture de vos profils bloqués…');
  progressEl = status;
  store.settings = readSettings();
  try {
    const result = await readCurrentBlocks();
    if (result.status === STATUS.LOGIN_REQUIRED) {
      setStatus(status, 'Session Threads absente ou expirée : connectez-vous sur threads.com puis réessayez.', 'err');
    } else if (result.status === STATUS.RATE_LIMITED) {
      setStatus(status, `Threads limite votre compte : attendez quelques heures (${result.detail}).`, 'err');
    } else if (result.status !== 'ok') {
      setStatus(status, `Échec : ${result.detail}. Threads a peut-être changé son interface.`, 'err');
    } else if (!result.handles.length) {
      setStatus(status, 'Aucun compte récupéré : rien n\'a été enregistré (liste vide, ou interface modifiée ?).', 'warn');
    } else {
      const format = $('format').value;
      download(`la-blocklist-bloques-${new Date().toISOString().slice(0, 10)}.${format}`, writeBlocklist(result.handles, format));
      setStatus(status, `${result.handles.length} comptes exportés.`, 'ok');
    }
  } catch (e) {
    setStatus(status, `Échec : ${e.message}`, 'err');
  } finally {
    progressEl = null;
    running = false;
    refresh();
  }
});

// --- Masquer sans bloquer (le masquage lui-même est fait par inline.js dans les onglets) ---

function renderIgnore() {
  const count = selectedList().length;
  setStatus($('ignore-status'), !store.ignore.enabled ? 'Masquage désactivé.'
    : count ? `Actif : ${count} ${count === 1 ? 'compte masqué' : 'comptes masqués'} sur Threads et Instagram.`
      : 'Actif, mais aucun compte coché pour l\'instant.', store.ignore.enabled && count ? 'ok' : '');
}

$('ignore-on').addEventListener('change', async () => {
  store.ignore = { ...store.ignore, enabled: $('ignore-on').checked };
  await persist();
  renderIgnore();
});

// --- Liste de départ ---

const dateTime = (ms) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const preview = (handles) => handles.slice(0, 5).map((h) => `@${h}`).join(', ') + (handles.length > 5 ? '…' : '');

// Résultat du dernier « Ajouter à ma liste », affiché en tête jusqu'à la prochaine nouveauté.
let starterNote = '';

function renderStarter(unseen = 0) {
  const s = store.starter;
  $('starter-add').textContent = s.added ? 'Ajouter à nouveau' : 'Ajouter à ma liste';
  $('starter-auto').checked = s.added ? Boolean(s.auto) : $('starter-auto').checked;
  $('starter-refresh').hidden = !s.added;
  if (!s.added) return setStatus($('starter-status'), '');
  const parts = [starterNote || `Ajoutée : ${(s.handles || []).length} comptes dans la liste du site.`];
  parts.push(`Vérifiée sur le site le ${dateTime(s.lastCheck)}.`);
  const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  if (unseen) {
    parts.push(`${n(unseen, 'nouveau compte ajouté', 'nouveaux comptes ajoutés')} à votre liste depuis votre dernière visite : ${preview(s.lastAdded || [])}.`);
  } else if (s.lastChange) {
    const changes = [];
    if (s.lastAdded?.length) changes.push(`${n(s.lastAdded.length, 'ajouté', 'ajoutés')} (${preview(s.lastAdded)})`);
    if (s.lastRemoved?.length) changes.push(`${n(s.lastRemoved.length, 'retiré', 'retirés')} (${preview(s.lastRemoved)})`);
    if (changes.length) parts.push(`Dernière évolution le ${dateTime(s.lastChange)} : ${changes.join(', ')}.`);
  }
  if (!s.auto) parts.push('Mise à jour automatique désactivée.');
  if (s.error) parts.push(`Dernière vérification impossible : ${s.error}.`);
  setStatus($('starter-status'), parts.join(' '), s.error ? 'warn' : unseen || starterNote ? 'ok' : '');
}

$('starter-add').addEventListener('click', async () => {
  const status = $('starter-status');
  setStatus(status, `Téléchargement de la liste ${STARTER.name}…`, 'working');
  $('starter-add').disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'starter:fetch' });
    if (!response?.ok) return setStatus(status, `Impossible de télécharger la liste : ${response?.error || 'pas de réponse'}.`, 'err');
    const handles = response.accounts.map((a) => a.handle);
    const wasEmpty = !store.list.length;
    const before = new Set(store.list);
    const { list } = applyStarterUpdate(store.list, store.starter.handles || [], handles);
    store.list = list;
    store.starter = {
      ...store.starter, added: true, auto: $('starter-auto').checked, handles, accounts: response.accounts,
      lastCheck: Date.now(), error: null, unseen: 0, lastChange: null, lastAdded: [], lastRemoved: [],
    };
    // Liste Instagram : si c'est la première liste chargée, on passe directement sur Instagram.
    if (wasEmpty && store.settings.platform !== STARTER.platform) {
      $('platform').value = STARTER.platform;
      $('platform').dispatchEvent(new Event('change'));
    }
    const fresh = handles.filter((h) => !before.has(h)).length;
    starterNote = `Ajoutée : ${handles.length} comptes de la liste de départ, dont ${fresh} nouveaux dans votre liste.`
      + ' Relisez-les dans « 2. Appliquer les blocages ».'
      + (platform().name !== 'Instagram' ? ' C\'est une liste Instagram : choisissez « Instagram » dans Réseau pour la bloquer là.' : '');
    unseenShown = 0;
    await persist();
    renderChecklist();
    refresh();
    renderStarter();
  } finally {
    $('starter-add').disabled = running;
  }
});

$('starter-auto').addEventListener('change', async () => {
  if (!store.starter.added) return;
  store.starter = { ...store.starter, auto: $('starter-auto').checked };
  await persist();
  renderStarter();
});

$('starter-refresh').addEventListener('click', async () => {
  setStatus($('starter-status'), 'Vérification de la liste sur le site…', 'working');
  const response = await chrome.runtime.sendMessage({ type: 'starter:refresh' });
  if (!response?.ok) setStatus($('starter-status'), `Vérification impossible : ${response?.error || 'pas de réponse'}.`, 'err');
  // Le reste (liste, état) arrive par chrome.storage.onChanged.
});

// background.js met à jour la liste et l'état de la liste de départ chaque jour : on garde la page à jour.
// Les nouveautés restent affichées jusqu'au rechargement de la page, même après le retrait du badge.
let unseenShown = 0;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.starter?.newValue) {
    store.starter = changes.starter.newValue;
    if (store.starter.unseen) {
      unseenShown = store.starter.unseen;
      starterNote = '';
      chrome.runtime.sendMessage({ type: 'starter:seen' }).catch(() => {});
    }
    renderStarter(unseenShown);
  }
  const list = changes.list?.newValue;
  if (list && JSON.stringify(list) !== JSON.stringify(store.list)) {
    store.list = list;
    if (running) listChangedWhileRunning = true;
    else {
      renderChecklist();
      refresh();
    }
  }
});

// --- Démarrage ---

(async () => {
  store = { ...structuredClone(DEFAULTS), ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
  $('platform').value = PLATFORMS[store.settings.platform] ? store.settings.platform : 'threads';
  $('min').value = store.settings.min;
  $('max').value = store.settings.max;
  $('limit').value = store.settings.limit;
  $('precheck').checked = store.settings.precheck !== false; // absent des réglages des versions précédentes
  $('api').checked = store.settings.api !== false;
  $('ignore-on').checked = store.ignore.enabled !== false;
  renderIgnore();
  renderChecklist();
  refresh();
  unseenShown = store.starter.unseen || 0;
  renderStarter(unseenShown);
  // Les nouveautés sont affichées : on retire le badge « +N » de l'icône.
  if (unseenShown) chrome.runtime.sendMessage({ type: 'starter:seen' }).catch(() => {});
})();
