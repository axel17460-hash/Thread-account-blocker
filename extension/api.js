// Script injecté dans le monde de la page Threads (world: 'MAIN') : il bloque et lit « Profils bloqués »
// via l'API GraphQL interne, en passant par le moteur réseau Relay du site, qui construit les requêtes
// exactement comme Threads (jetons, en-têtes, compteurs). Voir docs/threads-api-recon.md.
// Statuts renvoyés : 'blocked' / 'ok', 'rate_limited', 'not_ready' (modules absents de cette page :
// app.js recharge l'accueil) ou 'fallback' (app.js passe alors par l'interface, via content.js).
// Redéfini à chaque injection, pour qu'une page déjà ouverte reçoive la version à jour de l'extension.
(() => {
  // doc_id relevés le 28/10/2026 ; ceux des modules de Threads sont préférés quand la page les a chargés.
  const BLOCK_MUTATION = {
    id: '26803837702651619', metadata: {}, name: 'useTHUserBlockMutation', operationKind: 'mutation', text: null,
  };
  const BLOCKED_LIST_META = {
    is_distillery: true, is_fully_www_executable: true, root_field_name: ['xdt_blocked_list_connection'],
  };
  const BLOCKED_LIST_QUERY = {
    id: '28987597260835262', metadata: BLOCKED_LIST_META, name: 'BarcelonaBlockedListDialogQuery',
    operationKind: 'query', text: null,
  };
  const BLOCKED_LIST_NEXT_QUERY = {
    id: '29231511499768556', metadata: BLOCKED_LIST_META,
    name: 'BarcelonaBlockedListDialogPaginationFragmentRefetchableQuery', operationKind: 'query', text: null,
  };
  const MAX_PAGES = 500; // pages d'environ 177 comptes
  const RATE_LIMIT_RE = /(rate.?limit|too many|try again later|wait a few minutes|réessayez plus tard|feedback_required|checkpoint|spam|\b429\b)/i;
  const TIMEOUT_MS = 20000;

  const load = (name) => {
    try {
      return window.require(name) ?? null;
    } catch {
      return null;
    }
  };

  const execute = (network, params, variables) => new Promise((resolve, reject) => {
    const responses = [];
    const timer = setTimeout(() => reject(new Error('pas de réponse de Threads')), TIMEOUT_MS);
    network.execute(params, variables, { force: true }).subscribe({
      next: (response) => responses.push(response),
      error: (e) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); },
      complete: () => { clearTimeout(timer); resolve(responses); },
    });
  });

  const failure = (text) => (RATE_LIMIT_RE.test(text)
    ? { status: 'rate_limited', detail: text.slice(0, 300) }
    : { status: 'fallback', detail: text.slice(0, 300) });

  async function block(handle) {
    const network = typeof window.require === 'function' ? load('BarcelonaRelayEnvironment')?.getNetwork?.() : null;
    if (!network) return { status: 'not_ready', detail: 'moteur réseau de Threads introuvable' };
    const lookup = load('BarcelonaUserDialogByUsernameQuery$Parameters')?.params;
    if (!lookup) return { status: 'not_ready', detail: 'recherche de compte non chargée sur cette page' };

    try {
      const variables = { username: handle };
      for (const [name, provider] of Object.entries(lookup.providedVariables || {})) variables[name] = provider.get();
      const [found] = await execute(network, lookup, variables);
      if (found?.errors) return failure(JSON.stringify(found.errors));
      const userId = found?.data?.user?.pk;
      // Threads masque de la même façon les comptes inexistants et ceux déjà bloqués : l'interface tranchera.
      if (!userId) return { status: 'fallback', detail: 'compte masqué (déjà bloqué ou inexistant)' };

      const mutation = load('useTHUserBlockMutation.graphql')?.params || BLOCK_MUTATION;
      const [result] = await execute(network, mutation, {
        user_id: userId,
        container_module: 'ig_text_feed_profile',
        media_id: null,
        ranking_info_token: null,
        barcelona_source_quote_post_id: null,
        barcelona_source_reply_id: null,
        is_messaging_nua: null,
        consistent_thread_fbid: null,
      });
      if (result?.data?.record?.user?.friendship_status?.blocking === true) return { status: 'blocked' };
      return failure(`réponse inattendue : ${JSON.stringify(result?.errors ?? result?.data ?? null)}`);
    } catch (e) {
      return failure(e.message);
    }
  }

  /** Lit toute la liste « Profils bloqués », page par page. */
  async function listBlocked() {
    const network = typeof window.require === 'function' ? load('BarcelonaRelayEnvironment')?.getNetwork?.() : null;
    if (!network) return { status: 'not_ready', detail: 'moteur réseau de Threads introuvable' };
    const first = load('BarcelonaBlockedListDialogQuery$Parameters')?.params || BLOCKED_LIST_QUERY;
    const next = load('BarcelonaBlockedListDialogPaginationFragmentRefetchableQuery.graphql')?.params
      || BLOCKED_LIST_NEXT_QUERY;
    const handles = new Set();
    try {
      let [response] = await execute(network, first, {});
      for (let page = 0; page < MAX_PAGES; page++) {
        const results = response?.data?.results;
        if (!results) return failure(`réponse inattendue : ${JSON.stringify(response?.errors ?? response?.data ?? null)}`);
        for (const { node } of results.edges) if (node?.username) handles.add(node.username.toLowerCase());
        if (!results.page_info?.has_next_page) return { status: 'ok', handles: [...handles] };
        [response] = await execute(network, next, {
          after: results.page_info.end_cursor, before: null, first: null, last: null,
        });
      }
      return { status: 'fallback', detail: `plus de ${MAX_PAGES} pages` };
    } catch (e) {
      return failure(e.message);
    }
  }

  globalThis.__blockedexApi = { block, listBlocked };
})();
