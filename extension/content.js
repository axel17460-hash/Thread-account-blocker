// Script injecté dans l'onglet Threads : il manipule la page comme le ferait l'utilisateur.
// Les sélecteurs reposent sur les libellés accessibles (EN/FR) et peuvent casser si Threads change
// son interface : tout ce qui en dépend est regroupé dans RE, labelOf et findMoreButton.
(() => {
  if (globalThis.__blockedex) return;

  // Le même script sert sur Threads et sur Instagram ; seuls quelques repères changent.
  const INSTAGRAM = /(^|\.)instagram\.com$/.test(location.hostname);

  const RE = {
    more: /^(more|plus)$/i,
    // Bouton « … » de l'en-tête d'un profil Instagram.
    options: /^(options|more options|plus d.options)$/i,
    block: /^(block|bloquer)$/i,
    unblock: /^(unblock|débloquer)$/i,
    login: /^(log in|se connecter)$/i,
    notFound: /(this page isn.t available|page not found|but this page is|page is gone|cette page n.est (malheureusement )?pas disponible|page introuvable|mais cette page l.est|la page a disparu)/i,
    blockedRow: /(blocked profiles|profils bloqués)/i,
    blockedTitle: /^(bloqué\(e\)|blocked)/i, // titre de la fenêtre « Profils bloqués »
    // Compteur « 1,0 M followers » de l'en-tête de profil, qui ouvre la fenêtre des abonnés/abonnements.
    followersCount: /^\d[\d\s.,]*\s*[kKmM]?\s*(followers?|abonné\(e\)s|abonnés)$/i,
    followingTab: /^(following|suivi\(e\)s|abonnements)/i,
    // Gros bouton d'action de l'en-tête de profil, qui sert de repère pour trouver son bouton « Plus ».
    profileAction: /^(follow|follow back|following|requested|unblock|suivre|suivre en retour|suivi\(e\)|abonné\(e\)|demande envoyée|débloquer)$/i,
  };
  const PROFILE_HREF_RE = /^\/@([A-Za-z0-9._]+)\/?$/;
  const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

  const isVisible = (el) => el.getClientRects().length > 0;
  const labelOf = (el) => {
    const own = el.getAttribute('aria-label');
    if (own) return own.trim();
    const text = el.textContent.trim();
    if (text) return text;
    const svg = el.querySelector('svg[aria-label]');
    return svg ? svg.getAttribute('aria-label').trim() : '';
  };
  // --- Voile sur l'onglet de travail ---
  // Pendant que La Blocklist manipule la page, un voile la recouvre : il explique qu'il ne faut pas y
  // toucher et bloque souris, défilement et clavier de l'utilisateur. Nos propres actions (el.click(),
  // scrollTop) ne passent pas par ces événements et continuent de fonctionner.
  const OVERLAY_ID = 'blockedex-overlay';
  const BLOCKED_EVENTS = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'wheel', 'touchstart', 'touchmove', 'keydown', 'contextmenu'];
  const swallow = (event) => {
    if (!event.isTrusted) return; // nos événements simulés (Échap…) passent
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  function showOverlay(step) {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.setAttribute('aria-live', 'polite');
      overlay.innerHTML = `
        <style>
          #${OVERLAY_ID} { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center;
            background: rgb(0 0 0 / 0.55); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; cursor: wait; }
          #${OVERLAY_ID} .bx-card { max-width: min(460px, calc(100vw - 32px)); padding: 20px 22px; border-radius: 14px;
            background: #fff; color: #15181e; box-shadow: 0 12px 40px rgb(0 0 0 / 0.35); border: 2px solid #b45309; }
          #${OVERLAY_ID} .bx-head { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 17px; color: #b45309; }
          #${OVERLAY_ID} .bx-spin { flex: none; width: 18px; height: 18px; border: 3px solid #e5e7eb; border-top-color: #b45309;
            border-radius: 50%; animation: bx-spin 0.8s linear infinite; }
          #${OVERLAY_ID} .bx-step { margin: 12px 0 8px; font-weight: 600; }
          #${OVERLAY_ID} .bx-hint { margin: 0; color: #5b6472; font-size: 13.5px; }
          @keyframes bx-spin { to { transform: rotate(360deg); } }
        </style>
        <div class="bx-card">
          <div class="bx-head"><span class="bx-spin"></span><span>La Blocklist travaille dans cet onglet : ne touchez à rien</span></div>
          <p class="bx-step"></p>
          <p class="bx-hint">Ne cliquez pas, ne faites pas défiler et ne fermez pas cet onglet : vous feriez échouer
            l'opération. Vous serez ramené automatiquement sur la page La Blocklist, où l'avancement est affiché.</p>
        </div>`;
      // Hors de <body> : l'application Threads ne le touche pas et il n'entre pas dans le texte de la page.
      document.documentElement.append(overlay);
      for (const type of BLOCKED_EVENTS) window.addEventListener(type, swallow, { capture: true, passive: false });
    }
    if (step) overlay.querySelector('.bx-step').textContent = step;
  }
  function hideOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
    for (const type of BLOCKED_EVENTS) window.removeEventListener(type, swallow, { capture: true });
  }
  // Éléments ajoutés par La Blocklist (voile, boutons « Bloquer » d'inline.js) : à ignorer dans la page.
  const isOurs = (el) => Boolean(el.closest(`#${OVERLAY_ID}, .blockedex-btn, .lb-cover`));

  const find = (re, root = document) =>
    [...root.querySelectorAll('[role="button"],[role="menuitem"],button,a')]
      .find((el) => isVisible(el) && !isOurs(el) && re.test(labelOf(el)));
  // La navigation et l'en-tête de colonne ont aussi un bouton « Plus ». Le vrai Threads n'a pas de <main> :
  // on part du bouton d'action du profil (Suivre, Débloquer…) et on remonte jusqu'au premier « Plus ».
  const findMoreButton = () => {
    if (INSTAGRAM) {
      const header = document.querySelector('main header') || document.querySelector('header');
      return (header && find(RE.options, header)) || null;
    }
    const main = document.querySelector('main, [role="main"]');
    if (main) return find(RE.more, main) || null;
    for (let el = find(RE.profileAction); el && el !== document.body; el = el.parentElement) {
      const more = find(RE.more, el);
      if (more) return more;
    }
    return null;
  };
  // Un profil déjà bloqué affiche directement un bouton « Débloquer », hors de toute fenêtre.
  const profileIsBlocked = () =>
    [...document.querySelectorAll('[role="button"],button')].some((el) =>
      isVisible(el) && RE.unblock.test(labelOf(el)) && !el.closest('[role="dialog"],[role="menu"]'));
  const click = (el) => el.click();
  const fail = (detail) => ({ status: 'failed', detail });
  const handleFromHref = (href) => {
    const m = PROFILE_HREF_RE.exec(href || '');
    return m ? m[1].toLowerCase() : null;
  };

  // Attend qu'une condition devienne vraie : MutationObserver (non ralenti dans un onglet masqué)
  // plus un sondage de secours. Renvoie la valeur de la condition, ou null au bout du délai.
  const waitFor = (fn, timeout = 10000) =>
    new Promise((resolve) => {
      let finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        clearTimeout(timer);
        clearInterval(poll);
        resolve(value);
      };
      const check = () => {
        try {
          const value = fn();
          if (value) finish(value);
        } catch { /* la page est en cours de rendu */ }
      };
      const observer = new MutationObserver(check);
      const timer = setTimeout(() => finish(null), timeout);
      const poll = setInterval(check, 500);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      check();
    });

  const isLoginPage = () => location.pathname.startsWith('/login')
    || location.pathname.startsWith('/accounts/login') || Boolean(find(RE.login));

  /**
   * Clique sur `target()` jusqu'à ce que `ready()` devienne vrai. Juste après le chargement, la page
   * est affichée avant d'être active : un premier clic peut ne rien faire, il faut alors recommencer.
   */
  async function clickUntil(target, ready, attempts = 4, timeout = 5000) {
    for (let i = 0; i < attempts; i++) {
      const el = target();
      if (el) click(el);
      const result = await waitFor(ready, timeout);
      if (result) return result;
    }
    return null;
  }

  /** À appeler sur la page d'un profil : bloque le compte. */
  async function blockProfile() {
    const state = await waitFor(() => {
      if (isLoginPage()) return 'login';
      if (RE.notFound.test(document.body.innerText)) return 'not_found';
      if (profileIsBlocked()) return 'already_blocked';
      return findMoreButton() ? 'ready' : null;
    }, 20000);
    if (state === 'login') return { status: 'login_required' };
    if (state === 'not_found') return { status: 'not_found' };
    if (state === 'already_blocked') return { status: 'already_blocked' };
    if (state !== 'ready') return fail('profil non chargé');

    const item = await clickUntil(findMoreButton, () => find(RE.unblock) || find(RE.block), 3);
    if (!item) return fail('menu « Bloquer » introuvable');
    if (RE.unblock.test(labelOf(item))) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { status: 'already_blocked' };
    }
    // Sur Instagram, le menu est lui-même une fenêtre qui contient « Bloquer » : ce n'est pas la confirmation.
    const menuDialog = item.closest('[role="dialog"]');
    click(item);

    // D'autres fenêtres (aperçus de profil, notifications…) peuvent être ouvertes en même temps,
    // surtout si l'on utilise l'onglet : on ne suit que la fenêtre de confirmation elle-même.
    const confirm = await waitFor(() => {
      for (const dialog of document.querySelectorAll('[role="dialog"]')) {
        if (dialog === menuDialog || dialog.contains(item)) continue;
        const button = find(RE.block, dialog);
        if (button) return button;
      }
      return null;
    });
    if (!confirm) return fail('confirmation introuvable');
    const confirmDialog = confirm.closest('[role="dialog"]');
    click(confirm);
    // Le blocage est acquis dès que le profil affiche « Débloquer », ou que la confirmation a disparu.
    const done = await waitFor(() =>
      profileIsBlocked() || !confirmDialog.isConnected || !isVisible(confirmDialog), 15000);
    return done ? { status: 'blocked' } : fail('la confirmation ne s\'est pas fermée');
  }

  const findRowByText = (re) =>
    [...document.querySelectorAll('div,span,a,button,[role="button"]')].find((el) => isVisible(el) && !isOurs(el)
      && [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && re.test(n.textContent.trim())));

  // Sur le vrai Threads, les lignes de « Profils bloqués » n'ont pas de lien de profil : le pseudo est
  // la première ligne de texte de la ligne qui porte le bouton « Débloquer ».
  const unblockButtons = (dialog) =>
    [...dialog.querySelectorAll('[role="button"],button')].filter((b) => RE.unblock.test(b.textContent.trim()));
  const rowOf = (button, dialog) => {
    let row = button;
    while (row.parentElement && row.parentElement !== dialog
      && unblockButtons(row.parentElement).length === 1) row = row.parentElement;
    return row;
  };
  const handleFromRow = (row) => {
    const first = row.innerText.split('\n').map((s) => s.trim()).find(Boolean) || '';
    return HANDLE_RE.test(first) && !RE.unblock.test(first) ? first.toLowerCase() : null;
  };

  const scrollListToEnd = (dialog) => {
    const items = [...dialog.querySelectorAll('a[href^="/@"]'), ...unblockButtons(dialog)];
    const last = items[items.length - 1];
    if (!last) return;
    last.scrollIntoView({ block: 'end' });
    for (let el = last.parentElement; el && el !== document.body; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
        el.scrollTop = el.scrollHeight;
        break;
      }
    }
  };

  // Threads ouvre d'abord une fenêtre vide puis la remplace par celle qui contient la liste :
  // on ne garde donc pas l'élément, on reprend la fenêtre visible à chaque lecture.
  const currentDialog = () => [...document.querySelectorAll('[role="dialog"]')].filter(isVisible).pop() || null;
  const profileLinks = (dialog) =>
    [...dialog.querySelectorAll('a[href^="/@"]')].map((a) => handleFromHref(a.getAttribute('href'))).filter(Boolean);

  // Étape en cours, affichée en direct sur la page La Blocklist (bandeau « Traitement en cours »).
  const progress = (step, count) => {
    if (document.getElementById(OVERLAY_ID)) showOverlay(step); // même étape sur le voile de l'onglet
    chrome.runtime.sendMessage({ type: 'blockedex:progress', step, count }).catch(() => {});
  };

  /**
   * Fait défiler la liste de la fenêtre ouverte jusqu'au bout et renvoie les comptes lus.
   * `read(dialog)` extrait les pseudos affichés ; on s'arrête après 3 passages sans nouveau compte.
   * `label` nomme la liste dans les messages de progression.
   */
  async function collectList(read, label) {
    progress(`${label} : chargement de la liste…`);
    // Toutes les fenêtres visibles : une autre fenêtre (avis, notification) peut se trouver au-dessus.
    const dialogs = () => [...document.querySelectorAll('[role="dialog"]')].filter(isVisible);
    const readNow = () => dialogs().flatMap(read);
    // On fait défiler la fenêtre qui contient le plus de comptes, c'est-à-dire la liste.
    const listDialog = () => dialogs().map((d) => [d, read(d).length]).sort((a, b) => b[1] - a[1])[0]?.[0];
    // La liste peut mettre plus de 10 s à arriver (onglet tout juste ouvert, longue liste) : on attend
    // les premiers comptes avant de compter les passages « sans nouveau compte ».
    await waitFor(() => readNow().length, 20000);
    const found = new Set();
    let idle = 0;
    for (let round = 0; round < 2000 && idle < 3; round++) {
      const before = found.size;
      readNow().forEach((h) => found.add(h));
      if (found.size === before) {
        idle++;
        if (found.size) progress(`${label} : ${found.size} comptes trouvés, vérification de la fin de la liste…`, found.size);
      } else {
        idle = 0;
        progress(`${label} : ${found.size} comptes trouvés, défilement…`, found.size);
      }
      const dialog = listDialog();
      if (dialog) scrollListToEnd(dialog);
      await waitFor(() => readNow().some((h) => !found.has(h)), 4000);
    }
    return [...found];
  }

  /** À appeler sur la page des réglages de confidentialité : lit la liste « Profils bloqués ». */
  async function exportBlocked() {
    const state = await waitFor(() => (isLoginPage() ? 'login' : findRowByText(RE.blockedRow)), 20000);
    if (state === 'login') return { status: 'login_required' };
    if (!state) return fail('« Profils bloqués » introuvable dans les réglages');
    progress('Ouverture de la liste « Profils bloqués »…');

    const read = (dialog) => [
      ...profileLinks(dialog),
      ...unblockButtons(dialog).map((b) => handleFromRow(rowOf(b, dialog))),
    ].filter(Boolean);
    // La liste est ouverte quand une fenêtre affiche des comptes, ou le titre « Bloqué(e) » d'une liste
    // vide. Une fenêtre vide passagère pendant le chargement ne compte pas.
    const opened = await clickUntil(() => findRowByText(RE.blockedRow), () => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(isVisible);
      if (dialogs.some((d) => read(d).length)) return 'list';
      return dialogs.some((d) => RE.blockedTitle.test(d.innerText.trim())) ? 'titled' : null;
    }, 4, 6000);
    if (!opened) return fail('la liste des profils bloqués ne s\'est pas ouverte');

    const handles = await collectList(read, 'Profils bloqués');
    return { status: 'ok', handles };
  }

  /**
   * À appeler sur la page d'un profil : lit la liste des comptes qu'il suit (onglet « Suivi(e)s »
   * de la fenêtre des abonnés). Threads n'affiche pas toujours toute la liste : `expected` est le
   * nombre qu'il annonce, pour signaler une lecture partielle.
   */
  async function readFollowing() {
    const owner = handleFromHref(location.pathname);
    const state = await waitFor(() => {
      if (isLoginPage()) return 'login';
      if (RE.notFound.test(document.body.innerText)) return 'not_found';
      return find(RE.followersCount) ? 'ready' : null;
    }, 20000);
    if (state === 'login') return { status: 'login_required' };
    if (state === 'not_found') return { status: 'not_found' };
    if (state !== 'ready') return fail('compteur d\'abonnés introuvable sur le profil');
    progress('Ouverture de la liste des abonnements…');

    const tabOf = () => {
      const dialog = currentDialog();
      return dialog && [...dialog.querySelectorAll('[role="tab"]')].find((t) => RE.followingTab.test(t.textContent.trim()));
    };
    const tab = await clickUntil(() => find(RE.followersCount), tabOf);
    if (!tab) return fail('onglet des abonnements introuvable (compte privé ?)');
    const expected = (/(\d[\d\s.,]*\s*[kKmM]?)$/.exec(tab.textContent.trim()) || [])[1] || null;
    if (tab.getAttribute('aria-selected') !== 'true') {
      // L'onglet lui-même ne réagit pas au clic : c'est le bouton qu'il contient.
      const followers = new Set(profileLinks(currentDialog()));
      const selected = await clickUntil(() => {
        const t = tabOf();
        return t && (t.querySelector('[role="button"]') || t);
      }, () => tabOf()?.getAttribute('aria-selected') === 'true', 3);
      if (!selected) return fail('impossible d\'ouvrir l\'onglet des abonnements');
      // Attendre que la liste des abonnés soit remplacée, pour ne pas les mélanger.
      await waitFor(() => profileLinks(currentDialog()).some((h) => !followers.has(h)), 6000);
    }

    const handles = (await collectList(profileLinks, 'Abonnements')).filter((h) => h !== owner);
    return { status: 'ok', handles, expected };
  }

  // Chaque opération pose le voile pendant qu'elle travaille. Après un blocage il reste en place pendant
  // la pause qui précède le compte suivant ; la page La Blocklist appelle `release` à la fin de la série.
  const withOverlay = (fn, step, keepAfter) => async () => {
    showOverlay(step);
    try {
      return await fn();
    } finally {
      if (keepAfter) showOverlay(keepAfter);
      else hideOverlay();
    }
  };
  globalThis.__blockedex = {
    blockProfile: withOverlay(blockProfile, 'Blocage de ce compte en cours…',
      'Compte traité. Pause avant le compte suivant : ne touchez toujours à rien.'),
    exportBlocked: withOverlay(exportBlocked, 'Lecture de vos profils bloqués…'),
    readFollowing: withOverlay(readFollowing, 'Lecture des abonnements de ce compte…'),
    // Blocages via l'API (api.js) : l'onglet ne fait rien lui-même, mais garde le voile pendant la série.
    cover: async () => showOverlay('Blocages en cours via l\'API de Threads : ne touchez à rien.'),
    release: hideOverlay,
  };
})();
