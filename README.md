# La Blocklist

**Une extension Chrome et Firefox pour ignorer les comptes de votre liste sur Threads et Instagram : leurs
publications restent dans votre fil, mais vous ne les voyez plus et ne pouvez plus interagir avec.**

## Pourquoi ignorer plutôt que bloquer ?

André Janones l'a résumé dans [ce message](https://x.com/AndreJanonesMG/status/2115462221673218058) :
bloquer un compte va à l'encontre du but recherché. L'algorithme comprend seulement que vous n'avez pas
vu ses publications parce que vous l'avez bloqué. En revanche, quand une publication s'affiche dans
votre fil et que vous l'ignorez (sans la lire, l'aimer, la commenter ni interagir d'aucune façon),
l'algorithme la considère comme non pertinente, puisqu'elle vous a été montrée et que vous l'avez
laissée de côté.

> « Il y a une énorme différence entre bloquer du contenu et l'ignorer ! »
> — André Janones (traduit de l'anglais)

C'est ce que fait La Blocklist par défaut. Ignorer à la main demande de la discipline : on finit par
lire, réagir, répondre. Ici, les publications des comptes de votre liste **restent dans votre fil**,
mais sont **recouvertes d'un emoji** et ne peuvent plus être ouvertes, aimées ni commentées. Le réseau
vous les montre, vous les laissez passer.

> Ce raisonnement est celui de l'auteur du message ; Meta ne publie pas le fonctionnement exact de
> ses algorithmes.

## Ce que fait l'extension

- **Masquer sans bloquer** (par défaut) : sur threads.com et instagram.com, chaque publication, réponse
  ou commentaire d'un compte de votre liste est recouvert d'un emoji 🫧, sans rien envoyer au réseau.
- **Liste de départ** : en un clic, ajoutez la liste « On bloque l'extrême droite » publiée sur
  [onbloquelextremedroite.fr](https://www.onbloquelextremedroite.fr/liste), tenue à jour chaque jour.
- **Importer** : chargez votre propre liste de comptes (ou celle qu'un ami vous a envoyée).
- **Partir d'un compte** : prenez la liste des comptes que suit un compte Threads.
- **Choisir** : cochez ou décochez chaque compte ; seuls les comptes cochés sont masqués.
- **Bloquer, si vous préférez** : l'extension peut aussi bloquer les comptes cochés un par un, ou un
  compte précis grâce au bouton « Bloquer » affiché à côté de chaque auteur.
- **Exporter** : récupérez la liste des comptes que vous avez déjà bloqués sur Threads.

Pas de compte à créer, pas de mot de passe demandé, rien n'est envoyé à un serveur : tout se passe
dans votre Chrome, où vous êtes déjà connecté à Threads et/ou Instagram.

> L'export de vos blocages et la lecture des abonnements d'un compte sont pour l'instant réservés à
> Threads ; tout le reste fonctionne sur Threads et Instagram.

---

## 1. Installer (5 minutes)

L'extension n'est pas sur le Chrome Web Store : on l'installe à la main, une seule fois.

1. **Téléchargez** le fichier `la-blocklist-extension-….zip` sur la page
   [Releases](https://github.com/axel17460-hash/Thread-account-blocker/releases/latest).
2. **Décompressez-le** (clic droit › *Extraire tout…*) dans un dossier que vous ne supprimerez pas,
   par exemple `Documents\La Blocklist`. Chrome lit l'extension dans ce dossier à chaque démarrage.
3. Dans Chrome, tapez `chrome://extensions` dans la barre d'adresse.
4. En haut à droite, activez **Mode développeur**.
5. Cliquez sur **Charger l'extension non empaquetée** et choisissez le dossier décompressé
   (celui qui contient `manifest.json`).
6. Cliquez sur l'icône puzzle 🧩 de la barre d'outils et **épinglez** La Blocklist.
7. Vérifiez que vous êtes connecté sur [instagram.com](https://www.instagram.com) et/ou
   [threads.com](https://www.threads.com) dans ce Chrome.

Cliquez sur l'icône La Blocklist : la page de l'outil s'ouvre.

> Au démarrage, Chrome peut afficher un avertissement sur les « extensions en mode développeur » :
> c'est normal pour une extension installée de cette façon.

### Sous Firefox (version 140 ou plus récente)

Le même zip fonctionne dans Firefox. Mais Firefox n'installe durablement que les extensions signées
par Mozilla :

- **Pour essayer** : tapez `about:debugging#/runtime/this-firefox`, cliquez sur **Charger un module
  complémentaire temporaire…** et choisissez le fichier `manifest.json` du dossier décompressé.
  L'extension disparaît à la fermeture de Firefox : il faut la recharger à chaque fois.
- **Pour l'installer durablement** : il faut un fichier `.xpi` signé par Mozilla (voir « Pour les
  développeurs »). Ouvrez-le dans Firefox et acceptez l'installation.

Ensuite, épinglez La Blocklist depuis le menu des extensions (icône puzzle 🧩), connectez-vous sur
instagram.com et/ou threads.com dans ce Firefox, puis cliquez sur l'icône. Si Firefox demande
l'accès à threads.com et instagram.com, accordez-le : sans lui, l'extension ne peut rien faire.

## 2. Utiliser

La page La Blocklist a trois parties.

### Ajouter la liste de départ « On bloque l'extrême droite »

En haut de **1. Importer une liste**, la carte **Liste de départ** propose la liste de comptes
Instagram (personnalités, fachosphère, partis et médias) publiée par MISE AU POING sur
[onbloquelextremedroite.fr](https://www.onbloquelextremedroite.fr/liste). Cliquez sur
**Ajouter à ma liste** : ses comptes s'ajoutent à votre liste, tous cochés, avec leur nom à côté du
pseudo. Si votre liste était vide, le réseau passe tout seul sur **Instagram**.

Relisez-la, décochez ceux que vous ne voulez pas bloquer, puis cliquez sur **Démarrer** comme pour
n'importe quelle liste.

**Mise à jour automatique** (cochée par défaut) : chaque jour, et au démarrage de Chrome, l'extension
retélécharge la liste du site. Les nouveaux comptes sont ajoutés à votre liste et ceux que le site a
retirés en sont enlevés ; les comptes que vous avez ajoutés vous-même ne sont jamais touchés. L'icône
de l'extension affiche alors un badge **+N**, et la carte indique ce qui a changé et quand.
**Rien n'est bloqué sans vous** : relancez **Démarrer** pour bloquer les nouveaux comptes (ceux déjà
traités sont sautés). **Vérifier les mises à jour maintenant** force une vérification.

Si vous remplacez ensuite votre liste (fichier importé, abonnements d'un compte), la liste de départ
n'en fait plus partie et ses mises à jour ne la réintroduisent pas ; la carte propose de l'ajouter à
nouveau.

### Importer une liste

Dans **1. Importer une liste**, choisissez le fichier reçu (ou collez des comptes dans la zone de
texte), puis cliquez sur **Charger la liste**. Le résumé indique combien de comptes sont valides.

Formats acceptés :

- `.txt` : un compte par ligne, écrit `@pseudo`, `pseudo` ou lien de profil
  (`https://www.threads.com/@pseudo`). Une ligne qui commence par `#` est ignorée.
- `.csv` : une colonne `username` (ou `handle`, `user`, `account`…), sinon la première colonne.
- `.json` : une liste de pseudos, ou d'objets `{"username": "..."}`.

### Partir des abonnements d'un compte

Toujours dans **1. Importer une liste**, saisissez un pseudo (ou un lien de profil) et cliquez sur
**Lire ses abonnements**. Un onglet Threads passe au premier plan, ouvre la liste des comptes que ce
compte suit (*Suivi(e)s*) et la fait défiler. Comptez environ 4 minutes pour 800 comptes, et ne
touchez pas à cet onglet tant que le bandeau « Traitement en cours » est affiché.

La liste lue remplace la liste à traiter : relisez-la et décochez ceux que vous ne voulez pas bloquer
(un ami, un média…). **Télécharger les cochés** l'enregistre dans un fichier pour la partager.

> Threads n'affiche pas toujours toute la liste d'un autre compte (lors des essais : 828 comptes sur
> 1 235 annoncés). L'extension l'indique quand la lecture est partielle. Un compte privé que vous ne
> suivez pas ne peut pas être lu.

### Choisir les comptes

Sous **2. Ignorer ou bloquer les comptes cochés**, chaque compte de la liste apparaît avec une case,
**toutes cochées** au départ. Décochez ceux que vous voulez laisser tranquilles :

- la **recherche** filtre la liste ;
- **Tout cocher** / **Tout décocher** s'appliquent aux comptes affichés (pratique après une recherche).

Vos choix sont gardés, même si vous fermez la page.

### Masquer sans bloquer (recommandé)

C'est le mode par défaut, pour les raisons expliquées dans
[Pourquoi ignorer plutôt que bloquer ?](#pourquoi-ignorer-plutôt-que-bloquer-) : dans
**2. Ignorer ou bloquer les comptes cochés**, l'option **Masquer leurs publications, sans les
bloquer** est cochée.

Sur threads.com et instagram.com, chaque publication, réponse ou commentaire d'un compte coché reste à
sa place et à sa taille dans votre fil, mais il est recouvert d'un emoji qui apparaît en sautillant
(🫧 🙈 🌸 🍿 ✨…) avec la mention « @pseudo · masqué par La Blocklist ». Le cache empêche aussi de
cliquer dessus : pas d'ouverture, pas de « J'aime », pas de réponse par erreur. Pour le réseau, la
publication vous a été montrée et vous ne vous y êtes pas intéressé.

- Rien n'est envoyé à Threads ni à Instagram, et personne n'est bloqué.
- L'effet est immédiat : décochez un compte et ses publications réapparaissent, décochez l'option et
  tout redevient normal.
- Cela fonctionne avec la liste de départ comme avec votre propre liste.

### Ou les bloquer

Si vous préférez bloquer, la partie **Ou les bloquer** de la même section bloque les comptes cochés,
un par un, sur votre compte Threads ou Instagram. Gardez en tête que bloquer retire complètement le
compte de votre fil : c'est plus radical que l'ignorer.

1. Choisissez le **Réseau** : Threads ou Instagram. Chaque réseau garde sa propre progression : une
   liste déjà appliquée sur Threads peut ensuite l'être sur Instagram.
2. Laissez les pauses par défaut et le maximum par session : 8 à 20 secondes et 100 comptes sur
   Threads ; **30 à 60 secondes et 30 comptes sur Instagram**, qui limite davantage l'automatisation.
   Pauses et maximum ne comptent que les vrais blocages : un compte déjà bloqué ou introuvable est
   passé sans attendre.
3. Sur Threads, laissez cochée l'option **utiliser l'API interne** : l'extension envoie directement
   à Threads les mêmes requêtes que son site, au lieu de charger chaque profil et d'y cliquer
   (environ 3 secondes par compte, hors pauses). Quand l'API ne suffit pas (compte déjà bloqué ou
   introuvable, réponse inattendue), l'extension passe automatiquement par l'interface.
4. Cliquez sur **Démarrer** et confirmez.
5. Sur Threads, l'extension lit d'abord vos **profils bloqués** (quelques secondes via l'API ; sans
   l'API, un onglet passe au premier plan sur les réglages, environ 25 s pour 500 comptes) : les
   comptes de la liste que vous bloquez déjà sont marqués « déjà bloqué » sans visiter leur profil.
   Vous pouvez décocher l'option « Lire d'abord mes profils bloqués ». Sur Instagram, chaque profil
   est vérifié un par un.
6. Un onglet de travail traite ensuite les comptes restants. **Laissez la page La Blocklist ouverte
   et ne touchez pas à cet onglet** tant que le traitement n'est pas terminé : y cliquer ou y
   naviguer peut faire échouer des blocages.

Chaque compte affiche son résultat :

| Résultat | Signification |
| --- | --- |
| **bloqué** | le compte vient d'être bloqué |
| **déjà bloqué** | il l'était déjà, rien n'a changé |
| **introuvable** | le compte n'existe plus ou a changé de nom |
| **échec** | l'étape n'a pas abouti ; il sera retenté au prochain lancement |

**Arrêter** interrompt proprement. Relancer **Démarrer** reprend là où vous en étiez : les comptes
déjà traités sont sautés. Avec une longue liste, faites 100 comptes, puis relancez plus tard.

### Bloquer quelqu'un depuis un fil

Sur threads.com et instagram.com, un petit bouton **Bloquer** apparaît à côté du nom de chaque
auteur, dans les publications, les réponses et les commentaires (jamais à côté de votre propre nom). Un clic bloque le compte tout
de suite, sans quitter la page : un onglet s'ouvre en arrière-plan quelques secondes, bloque le
profil, puis se referme. Le bouton passe à **Blocage…** puis **Bloqué** (en vert). Si vous cliquez
sur plusieurs noms, ils sont bloqués l'un après l'autre.

Le blocage se fait sur le réseau où vous cliquez : un bouton sur Instagram bloque sur Instagram.
Pour débloquer, passez par le profil du compte (bouton « Débloquer ») ou par les réglages du réseau
(*Profils bloqués* sur Threads, *Comptes bloqués* sur Instagram).

### Exporter vos blocages (pour les sauvegarder ou les partager)

Dans **3. Exporter mes blocages actuels**, choisissez le format (`.txt` conseillé) et cliquez sur
**Exporter**. Avec l'option API (par défaut), la liste *Profils bloqués* est lue en quelques
secondes, sans ouvrir les réglages. Sinon, ou si l'API ne répond pas comme prévu, un onglet Threads
s'ouvre sur *Réglages › Confidentialité › Profils bloqués* et la liste défile toute seule (environ
25 secondes pour 500 comptes). Un fichier `la-blocklist-bloques-AAAA-MM-JJ.txt` est ensuite
téléchargé. **Ne touchez à rien pendant ce temps** : ni à l'onglet Threads, ni à la souris dessus. Pendant toute l'opération, l'onglet Threads est recouvert d'un voile
« La Blocklist travaille dans cet onglet : ne touchez à rien » qui affiche l'étape en cours et bloque
les clics et le défilement ; la page La Blocklist affiche le même avancement en haut.

C'est ce fichier que vous envoyez à quelqu'un pour qu'il bloque les mêmes comptes.

## 3. Bon à savoir

- **Prudence avec votre compte** : l'extension clique dans Threads et Instagram comme vous le
  feriez, ce que les conditions d'utilisation de Meta ne prévoient pas. Bloquer des centaines de
  comptes trop vite peut entraîner des limitations temporaires, plus vite sur Instagram (message
  « Réessayez plus tard ») : gardez les pauses et le maximum par session, et arrêtez pour la journée
  si Instagram affiche ce message.
- **Relisez une liste reçue** avant de l'appliquer. Débloquer se fait un compte à la fois.
- **Arrêt automatique** après 5 échecs de suite, si votre session Threads a expiré (reconnectez-vous
  sur threads.com, puis relancez), ou dès que Threads signale qu'il limite vos blocages : attendez
  alors quelques heures avant de relancer.
- Un compte bloqué l'est comme depuis Threads : le blocage s'étend aux autres comptes que la personne
  pourrait avoir.
- L'extension a été vérifiée sur le vrai Threads et le vrai Instagram (interface en français,
  octobre 2026). Si l'un d'eux change son site, une étape peut se mettre à échouer : signalez-le dans les
  [Issues](https://github.com/axel17460-hash/Thread-account-blocker/issues).

## 4. Mettre à jour

Téléchargez le nouveau zip, remplacez le contenu de votre dossier `La Blocklist` par celui du zip, puis
dans `chrome://extensions` cliquez sur la flèche ↻ de la carte La Blocklist.

## 5. Problèmes fréquents

- **« Session Threads absente ou expirée »** : connectez-vous sur threads.com dans ce Chrome, puis relancez.
- **L'extension a disparu** : le dossier a été déplacé ou supprimé. Remettez-le, puis rechargez-la
  depuis `chrome://extensions`.
- **Des « échec »** : vérifiez que vous n'avez pas utilisé l'onglet Threads de travail pendant le
  traitement, puis relancez **Démarrer** : les comptes en échec sont retentés, et ceux qui avaient
  en fait été bloqués s'affichent « déjà bloqué ».
- **Beaucoup d'« échec » sans toucher à l'onglet** : Threads a peut-être changé son interface.
  Arrêtez et signalez-le.

---

## Pour les développeurs

Le code de l'extension est dans [`extension/`](extension/) (Manifest V3, sans dépendance) :

- `app.html` / `app.js` : la page de l'outil ;
- `api.js` : sur Threads, le blocage et la lecture de « Profils bloqués » via l'API GraphQL interne,
  injectés dans le monde de la page pour passer par le moteur réseau du site (voir
  [docs/threads-api-recon.md](docs/threads-api-recon.md)) ;
- `content.js` : le script injecté dans Threads ; tous les libellés repérés (« Plus », « Bloquer »,
  « Profils bloqués »…) sont regroupés en tête de fichier ;
- `lib.js` : la logique pure (lecture des listes, reprise, plafond).

```bash
node --test extension/tests/lib.test.mjs   # logique pure
node extension/tests/e2e.mjs               # extension chargée dans Chromium face à un faux Threads local
node extension/tests/e2e-firefox.mjs       # la même chose, en plus court, dans Firefox
```

Les deux tests de bout en bout partagent le faux Threads de `tests/fake-threads.mjs` et ont besoin
d'`openssl`. Celui de Chromium demande le paquet npm `playwright` et son Chromium. Celui de Firefox
n'a pas de dépendance : il pilote Firefox 140+ en WebDriver BiDi (`FIREFOX=/chemin/firefox` pour
choisir le binaire). Ils vérifient la mécanique, pas les libellés du vrai Threads.

Le même dossier sert aux deux navigateurs : `background.scripts` est utilisé par Firefox et ignoré
par Chrome, qui prend `background.service_worker`. `browser_specific_settings.gecko` donne à Firefox
l'identifiant de l'extension, sa version minimale (140, pour `world: 'MAIN'` et la déclaration de
collecte de données, ici « aucune ») et ne gêne pas Chrome.

Pour signer une version Firefox (un compte addons.mozilla.org et ses clés d'API sont nécessaires ;
`--channel unlisted` donne un `.xpi` à distribuer soi-même, sans fiche sur le site de Mozilla) :

```bash
npx web-ext lint --source-dir extension --ignore-files 'tests/**'
npx web-ext sign --source-dir extension --ignore-files 'tests/**' --channel unlisted --api-key … --api-secret …
```

Pour créer le zip d'une release :

```bash
cd extension && zip -r ../la-blocklist-extension.zip . -x 'tests/*'
```

Le dossier [`blockedex/`](blockedex/) contient une ancienne version en ligne de commande Python. Elle
n'est plus maintenue et n'a pas reçu les corrections faites sur le vrai site.
