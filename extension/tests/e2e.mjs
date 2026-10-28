// Test de bout en bout : charge l'extension dans Chromium et la fait travailler contre un FAUX Threads
// (pages HTML servies en interceptant https://www.threads.com). Valide la mécanique de l'extension,
// pas les vrais sélecteurs de Threads.
//
// Usage : node extension/tests/e2e.mjs   (nécessite le paquet `playwright`, un Chromium et openssl)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { TOTAL_BLOCKED, apiBlocked, blocked, startFakeThreads, visited } from './fake-threads.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const fake = await startFakeThreads();
const { port, tmp } = fake;
const userDataDir = path.join(tmp, 'profile');
// Chrome résout threads.com vers notre serveur local (et accepte son certificat auto-signé).
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    `--host-resolver-rules=MAP www.threads.com 127.0.0.1:${port},MAP threads.com 127.0.0.1:${port}`,
    '--ignore-certificate-errors',
    '--no-proxy-server', // l'environnement peut imposer un proxy, qui court-circuiterait la redirection ci-dessus
  ],
});

// Requête de chauffe : sans elle, la toute première navigation ouverte par l'extension dans ce
// Chromium neuf échoue (réseau pas encore initialisé), ce qui ne dit rien sur l'extension elle-même.
const warmup = await context.newPage();
await warmup.goto('https://www.threads.com/@warmup');
await warmup.close();

let worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
const extId = new URL(worker.url()).host;
const app = await context.newPage();
app.on('dialog', (d) => d.accept());
app.on('pageerror', (e) => { throw e; });
const appUrl = `chrome-extension://${extId}/app.html`;
await app.goto(appUrl);

const setPause = async () => { await app.fill('#min', '0'); await app.fill('#max', '0'); };
const results = {};
let step = 0;
const ok = (name) => console.log(`ok ${++step} - ${name}`);

// 1. Import + application (API, avec repli sur l'interface)
await app.fill('#paste', '@Alice\nghost\nalready\nbroken\nalice\nnot valid\nhttps://www.threads.com/@Bob');
await app.click('#load');
assert.match(await app.textContent('#parse-summary'), /5 comptes valides.*1 doublons.*1 entrées invalides/);
ok('import : doublon et entrée invalide signalés');

assert.equal(await app.isChecked('#api'), true);
await setPause();
await app.click('#start');
await app.waitForFunction(() => document.querySelector('#log').textContent.includes('Terminé'), null, { timeout: 60000 });
const log1 = await app.textContent('#log');
assert.deepEqual(blocked.sort(), ['alice', 'bob']);
assert.deepEqual(apiBlocked.sort(), ['alice', 'bob']);
assert.match(log1, /@alice : bloqué/);
assert.match(log1, /@ghost : introuvable/);
assert.match(log1, /@already : déjà bloqué/);
assert.match(log1, /@broken : échec/);
assert.match(log1, /compte masqué \(déjà bloqué ou inexistant\) ; passage par l'interface/);
assert.match(log1, /execution error ; passage par l'interface/);
assert.match(await app.textContent('#counts'), /5 comptes dans la liste : 4 déjà traités, 1 à traiter/);
ok('application : bloqués via l\'API ; introuvable / déjà bloqué / échec tranchés par l\'interface en repli');

// 2. Reprise : seul l'échec est retenté, rien de déjà fait n'est rebloqué
blocked.length = 0;
await app.click('#start');
await app.waitForFunction(() => document.querySelector('#log').textContent.split('Terminé').length > 2, null, { timeout: 60000 });
assert.deepEqual(blocked, []);
ok('reprise : les comptes déjà traités sont sautés, l\'échec est retenté');

// 3. Persistance
await app.reload();
assert.match(await app.textContent('#counts'), /5 comptes dans la liste : 4 déjà traités/);
ok('persistance : liste et progression retrouvées après rechargement');

// 3 bis. Limitation par Threads : arrêt net, sans repli sur l'interface
blocked.length = 0;
await app.click('#reset');
await app.fill('#paste', 'q1\nlimited\nq2');
await app.click('#load');
await setPause();
await app.click('#start');
await app.waitForFunction(() => document.querySelector('#log').textContent.includes('Terminé'), null, { timeout: 60000 });
assert.deepEqual(blocked, ['q1']);
assert.match(await app.textContent('#log'), /limite les blocages sur votre compte/);
assert.match(await app.textContent('#counts'), /3 comptes dans la liste : 1 déjà traités, 2 à traiter/);
ok('limitation : arrêt immédiat, le compte limité et les suivants restent à traiter');

// 3 ter. Comptes déjà dans « Profils bloqués » : ignorés sans visiter leur profil
blocked.length = 0;
visited.length = 0;
await app.click('#reset');
await app.fill('#paste', 'user01\n@User02\nfresh1');
await app.click('#load');
await setPause();
await app.click('#start');
await app.waitForFunction(() => document.querySelector('#log').textContent.includes('Terminé'), null, { timeout: 60000 });
assert.deepEqual(blocked, ['fresh1']);
assert.match(await app.textContent('#log'), /55 profils bloqués lus ; 2 comptes de la liste déjà bloqués, sautés/);
assert.match(await app.textContent('#counts'), /3 comptes dans la liste : 3 déjà traités, 0 à traiter/);
assert.ok(!visited.some((p) => /^\/@user0[12]$/i.test(p)), visited.join(' '));
assert.ok(!visited.includes('/settings/privacy'), 'la liste doit être lue via l\'API, sans ouvrir les réglages');
ok('déjà bloqués : « Profils bloqués » lu via l\'API (3 pages), comptes ni visités ni rebloqués');

// 4. Session expirée : arrêt net, les suivants ne sont pas traités
blocked.length = 0;
await app.click('#reset');
await app.fill('#paste', 'carol\nneedslogin\ndave');
await app.click('#load');
await setPause();
await app.click('#start');
await app.waitForFunction(() => document.querySelector('#log').textContent.includes('Terminé'), null, { timeout: 60000 });
assert.deepEqual(blocked, ['carol']);
assert.match(await app.textContent('#log'), /session Threads absente ou expirée/);
ok('session expirée : arrêt immédiat, les comptes suivants ne sont pas touchés');

// 5. Plafond par session, API désactivée : tout passe par l'interface
blocked.length = 0;
apiBlocked.length = 0;
await app.click('#reset');
await app.fill('#paste', 'p1\np2\np3\np4');
await app.click('#load');
await app.fill('#limit', '2');
await app.uncheck('#api');
await setPause();
await app.click('#start');
await app.waitForFunction(() => document.querySelector('#log').textContent.includes('Terminé'), null, { timeout: 60000 });
assert.deepEqual(blocked, ['p1', 'p2']);
assert.deepEqual(apiBlocked, []);
assert.match(await app.textContent('#counts'), /2 à traiter/);
ok('plafond (API désactivée) : 2 comptes traités par l\'interface, 2 restants');

// 6. Export : défilement jusqu'au bout, liens de posts ignorés, fichier relisible
const [download] = await Promise.all([app.waitForEvent('download'), app.click('#export-btn')]);
const exported = fs.readFileSync(await download.path(), 'utf8');
const lines = exported.split('\n').filter((l) => l && !l.startsWith('#'));
assert.equal(lines.length, TOTAL_BLOCKED);
assert.equal(lines[0], '@user01');
assert.equal(lines.at(-1), `@user${TOTAL_BLOCKED}`);
assert.equal(new Set(lines).size, TOTAL_BLOCKED);
assert.match(download.suggestedFilename(), /^la-blocklist-bloques-\d{4}-\d{2}-\d{2}\.txt$/);
ok(`export : ${TOTAL_BLOCKED} comptes récupérés par défilement, sans doublons ni liens de posts`);

// 7. Aller-retour : le fichier exporté est ré-importable
await app.fill('#paste', '');
await app.setInputFiles('#file', { name: 'export.txt', mimeType: 'text/plain', buffer: Buffer.from(exported) });
await app.click('#load');
await app.waitForFunction((n) => document.querySelector('#parse-summary').textContent.startsWith(`${n} comptes valides.`), TOTAL_BLOCKED);
ok('aller-retour : le fichier exporté se ré-importe tel quel');

await context.close();
fake.close();
console.log('tous les tests e2e passent');
