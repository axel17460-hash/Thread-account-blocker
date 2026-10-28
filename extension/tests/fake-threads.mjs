// Faux Threads des tests de bout en bout : pages HTML minimales et fausse API, servies en HTTPS local
// avec un certificat auto-signé pour www.threads.com. Partagé par e2e.mjs (Chromium) et
// e2e-firefox.mjs (Firefox). Valide la mécanique de l'extension, pas les vrais sélecteurs de Threads.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const NAV = '<nav><div role="button"><svg aria-label="More" width="16" height="16"></svg></div></nav>'; // leurre
// Faux moteur réseau Relay de Threads (window.require), utilisé par le blocage via l'API (api.js).
const FAKE_REQUIRE = `<script>
window.require = (name) => ({
  BarcelonaRelayEnvironment: { getNetwork: () => ({ execute: (params, variables) => ({ subscribe: (obs) => {
    fetch('/__api?op=' + params.name + '&v=' + encodeURIComponent(JSON.stringify(variables)))
      .then((r) => r.json())
      .then((j) => { if (j.error) obs.error(new Error(j.error)); else { obs.next(j); obs.complete(); } });
  } }) }) },
  'BarcelonaUserDialogByUsernameQuery$Parameters': {
    params: { id: '1', name: 'BarcelonaUserDialogByUsernameQuery', providedVariables: { pv: { get: () => true } } },
  },
}[name]);
</script>`;
const homePage = `<!doctype html><body>${NAV}<main><h1>Accueil</h1></main>${FAKE_REQUIRE}</body>`;
const profilePage = (handle, { unblock = false, noBlock = false } = {}) => `<!doctype html><body>${NAV}${FAKE_REQUIRE}
<main><h1>${handle}</h1><div role="button" id="more"><svg aria-label="More" width="16" height="16"></svg></div></main>
<script>
document.getElementById('more').onclick = () => {
  const menu = document.createElement('div');
  menu.innerHTML = ${noBlock ? "'<div role=\"menuitem\">Report</div>'" : unblock ? "'<div role=\"menuitem\">Unblock</div>'" : "'<div role=\"menuitem\">Block</div>'"};
  document.body.append(menu);
  const item = menu.firstChild;
  if (item.textContent === 'Block') item.onclick = () => {
    const d = document.createElement('div'); d.setAttribute('role', 'dialog');
    d.innerHTML = '<button>Block</button>';
    d.querySelector('button').onclick = () => { fetch('/__block?h=${handle}'); d.remove(); };
    document.body.append(d);
  };
};
</script></body>`;

const loginPage = '<!doctype html><body><a href="/login">Log in</a></body>';
const notFoundPage = '<!doctype html><body><main><h1>Sorry, this page isn\'t available.</h1></main></body>';

export const TOTAL_BLOCKED = 55;
const privacyPage = `<!doctype html><body>${NAV}<main><div><span>Blocked profiles</span></div></main>
<script>
const total = ${TOTAL_BLOCKED};
document.querySelector('span').onclick = () => {
  const d = document.createElement('div'); d.setAttribute('role', 'dialog');
  const box = document.createElement('div'); box.style.cssText = 'height:200px;overflow-y:auto';
  d.append(box); document.body.append(d);
  let n = 0;
  const more = () => { for (let i = 0; i < 20 && n < total; i++, n++) {
    const a = document.createElement('a'); const name = 'User' + String(n + 1).padStart(2, '0');
    a.href = '/@' + name; a.textContent = name; a.style.display = 'block'; a.style.height = '30px';
    box.append(a);
    const post = document.createElement('a'); post.href = '/@' + name + '/post/1'; post.textContent = 'post'; box.append(post);
  } };
  more();
  box.onscroll = () => { if (box.scrollTop + box.clientHeight >= box.scrollHeight - 5) setTimeout(more, 300); };
};
</script></body>`;

export const visited = []; // pages chargées dans le faux Threads
export const blocked = []; // tous les blocages reçus par le faux Threads
export const apiBlocked = []; // ceux qui sont passés par l'API
function fakeApi(url, res) {
  const json = (body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const v = JSON.parse(url.searchParams.get('v'));
  const op = url.searchParams.get('op');
  if (/^BarcelonaBlockedListDialog/.test(op)) {
    // « Profils bloqués », par pages de 20 ; le curseur est la position de départ.
    const start = Number(v.after ?? 0);
    const end = Math.min(start + 20, TOTAL_BLOCKED);
    const edges = [];
    for (let n = start; n < end; n++) edges.push({ node: { username: `User${String(n + 1).padStart(2, '0')}`, pk: String(n) } });
    return json({ data: { results: { edges, page_info: { end_cursor: String(end), has_next_page: end < TOTAL_BLOCKED } } } });
  }
  if (op === 'BarcelonaUserDialogByUsernameQuery') {
    // Comme le vrai Threads : null pour un compte inexistant et pour un compte déjà bloqué.
    const hidden = ['ghost', 'already', 'needslogin'].includes(v.username);
    return json({ data: { user: hidden ? null : { pk: `id_${v.username}`, username: v.username } } });
  }
  const h = v.user_id.replace(/^id_/, '');
  if (h === 'broken') return json({ error: 'GraphQL operation responded with error: execution error' });
  if (h === 'limited') return json({ error: 'Please wait a few minutes before you try again. (feedback_required)' });
  blocked.push(h);
  apiBlocked.push(h);
  return json({ data: { record: { user: { friendship_status: { blocking: true }, id: v.user_id } } } });
}

function fakeThreads(req, res) {
  const url = new URL(req.url, 'https://www.threads.com');
  const html = (body) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(body); };
  if (url.pathname === '/__block') { blocked.push(url.searchParams.get('h')); res.writeHead(204); return res.end(); }
  if (url.pathname === '/__api') return fakeApi(url, res);
  visited.push(url.pathname);
  if (url.pathname === '/') return html(homePage);
  if (url.pathname === '/settings/privacy') return html(privacyPage);
  const m = /^\/@([^/]+)$/.exec(url.pathname);
  if (!m) return html(loginPage);
  const h = m[1];
  if (h === 'ghost') return html(notFoundPage);
  if (h === 'needslogin') return html(loginPage);
  if (h === 'already') return html(profilePage(h, { unblock: true }));
  if (h === 'broken') return html(profilePage(h, { noBlock: true }));
  return html(profilePage(h));
}

const THREADS_HOSTS = new Set(['www.threads.com', 'threads.com']);

/**
 * Démarre le faux Threads sur un port local. `proxyPort` est un proxy HTTP qui renvoie les connexions
 * vers threads.com sur ce serveur et refuse tout le reste (Firefox n'a pas d'équivalent à
 * --host-resolver-rules). `tmp` est un dossier jetable, supprimé par `close`.
 */
export async function startFakeThreads() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blockedex-e2e-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=www.threads.com',
    '-keyout', path.join(tmp, 'key.pem'), '-out', path.join(tmp, 'cert.pem')], { stdio: 'ignore' });
  const server = https.createServer(
    { key: fs.readFileSync(path.join(tmp, 'key.pem')), cert: fs.readFileSync(path.join(tmp, 'cert.pem')) }, fakeThreads);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const proxy = http.createServer((req, res) => { res.writeHead(403); res.end(); });
  proxy.on('connect', (req, socket, head) => {
    if (!THREADS_HOSTS.has(req.url.split(':')[0])) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = net.connect(port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));

  return {
    port,
    proxyPort: proxy.address().port,
    tmp,
    close() {
      server.close();
      proxy.close();
      server.closeAllConnections?.();
      proxy.closeAllConnections?.();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}
