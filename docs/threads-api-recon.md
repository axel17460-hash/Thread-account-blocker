# Repérage de l'API interne de Threads (28/10/2026)

Relevé sur threads.com (interface en français), compte connecté, dans le navigateur. Aucun jeton de
session n'est reproduit ici.

## Transport

- `POST /graphql/query` (et parfois `/api/graphql`), corps `application/x-www-form-urlencoded`.
- 28 champs, dont beaucoup sont dynamiques : `av`, `__user`, `__a`, `__req` (compteur), `__hs`, `dpr`, `__ccg`,
  `__rev`, `__s`, `__hsi`, `__dyn`, `__csr`, `__hsdp`, `__hblp`, `__sjsp`, `__comet_req` (29),
  `fb_dtsg`, `jazoest`, `lsd`, `__spin_r`, `__spin_b`, `__spin_t`, `__crn`,
  `fb_api_caller_class` (`RelayModern`), `fb_api_req_friendly_name`, `server_timestamps`,
  `variables`, `doc_id`.
- En-têtes : `X-FB-Friendly-Name`, `X-BLOKS-VERSION-ID`, `X-CSRFToken`, `X-IG-App-ID`,
  `X-Web-Session-ID`, `X-Root-Field-Name`, `X-FB-LSD`, `X-ASBD-ID`.

**Ne pas reconstruire ces requêtes à la main.** La page expose son propre moteur réseau Relay, qui les
construit à l'identique de celles du site :

```js
const net = window.require('BarcelonaRelayEnvironment').getNetwork();
net.execute(params, variables, { force: true }).subscribe({ next, error, complete });
```

`window.require` n'existe que dans le monde de la page : l'extension doit injecter avec
`chrome.scripting.executeScript({ world: 'MAIN', ... })`.

## Pseudo → ID : `BarcelonaUserDialogByUsernameQuery`

- `doc_id` `28876870621994428`, champ racine `xdt_text_app_user_by_username`.
- Paramètres : `require('BarcelonaUserDialogByUsernameQuery$Parameters').params` (chargé sur les pages
  de profil). Variables : `{ username }` plus les `providedVariables` (`v.get()` pour chacune).
- Réponse : `data.user.pk` (ID numérique). Environ 300 ms.
- `data.user === null` pour un compte **inexistant** et aussi pour un compte **déjà bloqué**
  (vérifié sur `@s.arld`). Probablement aussi pour un compte désactivé. Dans tous ces cas, il n'y a rien à
  bloquer.
- Pour un compte bloqué, l'ID se trouve dans les props de la page de profil
  (`"is_self_profile":false,"user_id":"…"`).

## Blocage : `useTHUserBlockMutation`

- `doc_id` `26803837702651619`, champ racine `xdt_text_app_block_user`.
- Variables : `user_id` (obligatoire), `container_module` (`ig_text_feed_profile` depuis un profil),
  ainsi que `media_id`, `ranking_info_token`, `barcelona_source_quote_post_id`,
  `barcelona_source_reply_id`, `is_messaging_nua`, `consistent_thread_fbid`, tous à `null`.
- Le site ajoute en dur `is_auto_block_enabled: true`, dans la requête persistée elle-même. La
  fenêtre de déblocage le confirme : le blocage s'étend à « s.arld et les autres comptes que cette
  personne est susceptible d'avoir ».
- Sélection renvoyée : `record.user { id, friendship_status { blocking } }`.
- Tests :
  - **blocage réel** (`@s.arld` débloqué via l'interface, puis rebloqué via l'API dans la foulée) :
    `{"data":{"record":{"user":{"friendship_status":{"blocking":true},"id":"69322200053"}}}}`, 2,7 s.
    Après rechargement, le profil affiche bien « Débloquer ». Il n'y a pas de délai imposé entre un
    déblocage et un nouveau blocage ;
  - sur un compte déjà bloqué : `{"data":{"record":{"user":null}}}`, sans erreur, 2,7 s. L'état n'a pas
    changé ;
  - avec un `user_id` vide : erreur GraphQL `execution error` (CRITICAL). Les échecs sont donc explicites.
- Un succès se reconnaît donc à `record.user.friendship_status.blocking === true`, ou à
  `record.user === null` si le compte était déjà bloqué.
- **Pas encore vérifié** : la forme d'une réponse de limitation.

## « Profils bloqués » : `BarcelonaBlockedListDialogQuery`

- Première page : `doc_id` `28987597260835262`, variables `{}`. Pages suivantes :
  `BarcelonaBlockedListDialogPaginationFragmentRefetchableQuery`, `doc_id` `29231511499768556`,
  variables `{ after: end_cursor, before: null, first: null, last: null }`. Champ racine
  `xdt_blocked_list_connection` pour les deux.
- Réponse : `data.results.edges[].node { username, pk, full_name, profile_pic_url }` et
  `data.results.page_info { end_cursor, has_next_page }`. Les pages font 177 comptes, même avec
  `first` ou `count`.
- Les modules ne sont chargés qu'à l'ouverture de la liste dans les réglages, mais les requêtes
  marchent depuis l'accueil avec ces paramètres en dur (`metadata.root_field_name` compris) :
  321 comptes en environ 5 s, résultat identique sur trois lectures.
- C'est la même source que la fenêtre des réglages, qui charge ses lignes par ces requêtes.

## Fragilité du `doc_id`

Le module `useTHUserBlockMutation.graphql` n'est chargé qu'après l'ouverture de la fenêtre
« Bloquer » d'un profil. `Bootloader.loadModules` ne le charge pas par son nom. Pistes :

1. ouvrir la fenêtre une fois par session sur un profil, l'annuler, puis lire
   `require('useTHUserBlockMutation.graphql').params.id` ;
2. chercher `__d("useTHUserBlockMutation.threads.graphql"` dans les scripts de static.cdninstagram.com,
   qui se récupèrent depuis la page ;
3. publier le `doc_id` courant avec les listes communautaires (configuration distante), avec repli sur 1 ou 2.

## Conséquences pour l'extension

- Environ 3 s par compte (recherche 0,3 s + mutation 2,7 s), au lieu d'un chargement de page complet et
  de 4 attentes d'interface. Les pauses anti-limitation restent le facteur principal.
- Des listes communautaires qui stockent le `pk` évitent la recherche, et résistent aux changements de
  pseudo.
- L'ID de la mutation de déblocage reste à relever. Le module `useTHUserUnblockMutation.graphql` se
  charge quand on clique sur « Débloquer » d'un profil bloqué, mais la page se recharge après la
  confirmation : il faut lire `require('useTHUserUnblockMutation.graphql').params.id` avant de
  confirmer.
