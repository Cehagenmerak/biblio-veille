"use strict";

const $ = (id) => document.getElementById(id);

let livres = chargerLivres();
const R = chargerReglages();

// État de l'interface (non enregistré).
const E = {
  ecran: "liste", // liste | fiche | reglages
  sel: null, // Set des livres cochés en mode sélection, sinon null
  feuille: null, // panneau du bas ouvert : { type, ... }
  ficheId: null,
  ficheErr: null,
  bandeau: null, // progression de l'interrogation BnF en lot
  pmbEtat: "idle",
};

function sauver() {
  sauverLivres(livres);
}
function sauverR() {
  sauverReglages(R);
}
const livre = (id) => livres.find((l) => l.id === id);
const visibles = () => livres.filter((l) => !l.draft).sort((a, b) => b.ts - a.ts);
function maj(id, fn) {
  const l = livre(id);
  if (l) {
    fn(l);
    sauver();
  }
}
function supprimerLivres(ids) {
  for (const id of ids) if (livre(id)?.photo) photos.del(id);
  livres = livres.filter((l) => !ids.includes(l.id));
  sauver();
}

// ---------- Thème ----------

// Le choix clair / sombre est celui de la famille Biblio' (biblio-theme.js, clé « biblio-theme ») :
// le bouton de l'en-tête et les Réglages écrivent au même endroit. Un ancien choix des Réglages
// (R.theme : light / dark) est repris une fois, puis oublié.
function appliquerTheme() {
  if (!R.theme) return;
  const t = R.theme === "dark" ? "sombre" : "clair";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("biblio-theme", t); } catch (e) {}
  delete R.theme;
  sauverR();
}
function themeSombre() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "sombre" : matchMedia("(prefers-color-scheme: dark)").matches;
}

// ---------- Retours : message, bip, vibration ----------

function toast(msg) {
  const t = $("toast");
  t.innerHTML = `<div>${esc(msg)}</div>`;
  t.hidden = false;
  clearTimeout(toast.m);
  toast.m = setTimeout(() => (t.hidden = true), 2200);
}

function vibrer(motif) {
  try {
    navigator.vibrate?.(motif);
  } catch {}
}

let audio = null;
function bip(double) {
  vibrer(double ? [40, 60, 40] : 60);
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const son = (f, t) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = f;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(audio.destination);
      o.start(audio.currentTime + t);
      o.stop(audio.currentTime + t + 0.08);
    };
    if (double) {
      son(520, 0);
      son(520, 0.14);
    } else son(1760, 0);
  } catch {}
}

// ---------- Morceaux d'affichage ----------

const ETATS_BNF = {
  none: ["À interroger", "var(--ink2)"],
  loading: ["Recherche…", "var(--pri-ink)"],
  found: ["Trouvé BnF", "var(--ok)"],
  notfound: ["Introuvable", "var(--warn)"],
  error: ["Erreur réseau", "var(--err)"],
  na: ["Sans ISBN", "var(--ink2)"],
};
function puceBnf(st, libelle, source) {
  const [l, c] = ETATS_BNF[st] || ETATS_BNF.none;
  const texte = libelle || (st === "found" && source ? "Trouvé " + (SOURCES[source]?.nom || "BnF") : l);
  return `<span class="puce${st === "loading" ? " loading" : ""}" style="--c:${c}">${esc(texte)}</span>`;
}
function barresPrio(p) {
  return `<div class="prio-barres" aria-label="Priorité : ${PRIO[p]}">${[1, 2, 3]
    .map((i) => `<i style="height:${4 + i * 3}px${i <= p ? `;background:var(--prio${p})` : ""}"></i>`)
    .join("")}</div>`;
}
const caseHtml = (on, inactif) => `<div class="case${on ? " on" : ""}${inactif ? " inactif" : ""}">${on ? "✓" : ""}</div>`;
const seg = (on, action, libelle, attr = "") => `<button class="${on ? "on" : ""}" data-a="${action}" ${attr}>${libelle}</button>`;

// ---------- Rendu ----------

function render() {
  const app = $("app");
  const defile = app.querySelector(".liste, .contenu");
  const pos = defile ? defile.scrollTop : 0;
  const memeEcran = render.dernier === E.ecran;
  // Garde le champ en cours de saisie si l'écran est redessiné (ex. BnF qui répond).
  const actif = document.activeElement;
  const focusId = actif && app.contains(actif) && actif.id;
  const curseur = focusId && actif.selectionStart != null ? [actif.selectionStart, actif.selectionEnd] : null;
  if (E.ecran === "fiche" && !livre(E.ficheId)) E.ecran = "liste";
  app.innerHTML = E.ecran === "fiche" ? vueFiche() : E.ecran === "reglages" ? vueReglages() : E.ecran === "archives" ? vueArchives() : vueListe();
  if (memeEcran) {
    const d = app.querySelector(".liste, .contenu");
    if (d) d.scrollTop = pos;
    const el = focusId && document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (curseur) try { el.setSelectionRange(...curseur); } catch {}
    }
  }
  render.dernier = E.ecran;
  renderFeuille();
  historique();
}

function renderFeuille() {
  const f = $("feuille");
  const defile = f.querySelector(".feuille");
  const pos = defile ? defile.scrollTop : 0;
  const contenu = E.feuille ? vueFeuille() : "";
  f.innerHTML = contenu ? `<div class="voile" data-a="fermerFeuille"></div><div class="feuille"><div class="poignee"></div>${contenu}</div>` : "";
  const d = f.querySelector(".feuille");
  if (d && render.feuille === E.feuille?.type) d.scrollTop = pos;
  render.feuille = E.feuille?.type;
}

// ---------- Liste ----------

function vueListe() {
  const tous = visibles();
  const nonEnvoyes = tous.filter((l) => !l.sent);
  const nEnv = tous.length - nonEnvoyes.length;
  const vis = R.afficherEnvoyes ? tous : nonEnvoyes;
  const sel = E.sel;
  const nSel = sel ? sel.size : 0;
  let h = "";

  if (!sel) {
    h += `<div class="entete">
      <header class="b-entete">
        <div class="b-marque"><img src="tuile-128.png" alt=""><span class="b-marque-texte"><span class="b-marque-biblio">Biblio’</span><span class="b-marque-appli">Veille</span></span></div>
        <div class="b-entete-actions"><button class="btn-reglages" data-a="reglages">Réglages</button><button class="b-bascule" type="button"></button></div>
      </header>
      <div class="compteur"><span class="compteur-n">${nonEnvoyes.length}</span><span class="compteur-l">à envoyer</span><span class="compteur-t">/ ${tous.length} au total</span></div>
    </div>
    <div class="actions">
      <div class="modes-scan">
        <button class="mode-scan principal" data-a="scanner">Un livre<span>scan unitaire</span></button>
        <button class="mode-scan" data-a="scannerKilo">Au kilomètre<span>en série</span></button>
        <button class="mode-scan" data-a="scannerPile">En pile<span>plusieurs codes</span></button>
      </div>
      <button class="btn-manuel" data-a="manuel">Saisir sans code-barres</button>
    </div>`;
  } else {
    h += `<div class="entete-sel">
      <button class="fermer" data-a="quitterSel" aria-label="Quitter la sélection">✕</button>
      <div class="titre">${nSel} sélectionné${pl(nSel)}</div>
      <button class="tout" data-a="toutSel">${nSel === vis.length && nSel ? "Tout désélectionner" : "Tout sélectionner"}</button>
    </div>`;
  }

  const b = E.bandeau;
  if (b) {
    h += `<div class="bandeau"><div class="bandeau-l1"><div class="bandeau-titre">${
      b.running ? `Interrogation des catalogues… ${b.done}/${b.total}` : `Catalogues : ${b.total} livre${pl(b.total)} interrogé${pl(b.total)}`
    }</div>${b.running ? "" : `<button class="bandeau-ok" data-a="fermerBandeau">OK</button>`}</div>${
      b.running
        ? `<div class="bandeau-barre"><div style="width:${Math.max(6, (b.done / b.total) * 100)}%"></div></div>`
        : `<div class="bandeau-res"><span style="color:var(--ok)">${b.found} trouvé${pl(b.found)}</span><span style="color:var(--warn)">${b.nf} introuvable${pl(b.nf)}</span><span style="color:var(--err)">${b.err} erreur${pl(b.err)}</span></div>`
    }</div>`;
  }

  h += `<div class="outils-liste">
    <select data-c="groupe" aria-label="Regroupement">
      <option value="none"${R.groupe === "none" ? " selected" : ""}>Sans regroupement</option>
      <option value="session"${R.groupe === "session" ? " selected" : ""}>Par session</option>
      <option value="public"${R.groupe === "public" ? " selected" : ""}>Par public cible</option>
    </select>
    ${sel ? "" : `<button class="btn-selectionner" data-a="selectionner">Sélectionner</button>`}
  </div>`;
  if (nEnv) {
    h += `<div class="envoyes-bascule"><span>${
      R.afficherEnvoyes ? `${nEnv} envoyé${pl(nEnv)} visible${pl(nEnv)}` : `${nEnv} envoyé${pl(nEnv)} masqué${pl(nEnv)} · toujours reconnu${pl(nEnv)} au scan`
    }</span><span class="envoyes-boutons"><button data-a="basculerEnvoyes">${R.afficherEnvoyes ? "Masquer" : "Afficher"}</button><button data-a="archives">Archives</button></span></div>`;
  }

  h += `<div class="liste" id="liste">`;
  if (!vis.length) {
    h += `<div class="liste-vide">${tous.length ? "Tous les livres ont été envoyés." : "Aucun livre pour l'instant. Scannez un code-barres pour commencer."}</div>`;
  }
  const nLab = (n) => `${n} livre${pl(n)}`;
  const tete = (lab, n) => `<div class="groupe-tete"><span>${esc(lab)}</span><span>${nLab(n)}</span></div>`;
  if (R.groupe === "session") {
    // Une session = des ajouts espacés de moins de 2 h.
    const sessions = [];
    let cur = null, prec = null;
    for (const l of vis) {
      if (!cur || prec - l.ts > 120 * MIN) sessions.push((cur = []));
      cur.push(l);
      prec = l.ts;
    }
    for (const s of sessions) h += tete(libelleSession(s), s.length) + s.map(vueLigne).join("");
  } else if (R.groupe === "public") {
    // Un public absent de config.js (liste modifiée depuis) va avec les non renseignés, sinon le livre disparaîtrait.
    const publicDe = (l) => (PUBLICS.includes(l.fields.public) ? l.fields.public : "");
    for (const pu of [...PUBLICS, ""]) {
      const items = vis.filter((l) => publicDe(l) === pu);
      if (items.length) h += tete(pu || "Public non renseigné", items.length) + items.map(vueLigne).join("");
    }
  } else h += vis.map(vueLigne).join("");
  h += `<div style="height:12px"></div></div>`;

  if (!sel) {
    h += `<div class="pied">
      <button class="btn-pri" data-a="envoyer">Envoyer (${nonEnvoyes.length})</button>
      <button class="btn" data-a="csv">Exporter CSV</button>
    </div>`;
  } else {
    const nIsbn = tous.filter((l) => sel.has(l.id) && l.isbn).length;
    h += `<div class="pied-sel">
      <button class="btn btn-pri" data-a="bnfSel" ${nSel ? "" : "disabled"}>Compléter par les catalogues (${nIsbn})</button>
      <div class="grille2">
        <button class="btn" data-a="envoyer" ${nSel ? "" : "disabled"}>Envoyer la sélection</button>
        <button class="btn btn-danger" data-a="supprSel" ${nSel ? "" : "disabled"}>Supprimer</button>
      </div>
    </div>`;
  }
  return `<div class="ecran">${h}</div>`;
}

// ---------- Archives : les envois, du plus récent au plus ancien ----------

// Un envoi = les livres confirmés « envoyé » ensemble (même minute). Les envois d'avant
// l'enregistrement de la date (sans `sentAt`) forment un dernier groupe, non daté.
function envois() {
  const groupes = new Map();
  for (const l of visibles().filter((x) => x.sent)) {
    const k = l.sentAt ? String(Math.floor(l.sentAt / MIN)) : "nd";
    if (!groupes.has(k)) groupes.set(k, { k, quand: l.sentAt || 0, livres: [] });
    groupes.get(k).livres.push(l);
  }
  return [...groupes.values()].sort((a, b) => b.quand - a.quand);
}

function libelleEnvoi(g) {
  if (!g.quand) return "Envoi non daté";
  const d = new Date(g.quand);
  return `Envoi du ${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function vueArchives() {
  const gs = envois();
  const n = gs.reduce((s, g) => s + g.livres.length, 0);
  let h = `<div class="barre-haut"><button class="btn-lien" data-a="liste">← Liste</button>
    <div class="titre" style="padding-right:70px">Archives</div></div><div class="contenu archives">
    <div class="note">${n ? `${n} livre${pl(n)} proposé${pl(n)} aux acquisitions, en ${gs.length} envoi${pl(gs.length)}. Ils restent reconnus au scan tant qu'ils sont ici.` : "Aucun envoi pour l'instant."}</div>`;
  for (const g of gs) {
    const ouvert = E.archiveOuverte === g.k;
    const nPhotos = g.livres.filter((l) => l.photo).length;
    h += `<div class="envoi"><button class="envoi-tete" data-a="archiveOuvrir" data-k="${g.k}" aria-expanded="${ouvert}">
      <span class="envoi-titre">${esc(libelleEnvoi(g))}</span>
      <span class="envoi-n">${g.livres.length} livre${pl(g.livres.length)}${nPhotos ? ` · ${nPhotos} photo${pl(nPhotos)}` : ""} ${ouvert ? "▴" : "▾"}</span></button>`;
    if (ouvert) {
      h += `<div class="envoi-livres">${g.livres
        .map((l) => `<button class="envoi-livre" data-a="archiveFiche" data-k="${l.id}"><span class="t">${esc(l.fields.titre || formaterIsbn(l.isbn))}</span>${
          l.fields.auteur ? `<span class="a">${esc(l.fields.auteur)}</span>` : ""}</button>`)
        .join("")}</div>
      <div class="grille2"><button class="btn" data-a="archiveRemettre" data-k="${g.k}">Remettre à envoyer</button>
        <button class="btn btn-danger" data-a="archiveSupprimer" data-k="${g.k}">Supprimer l'envoi</button></div>`;
    }
    h += `</div>`;
  }
  return `<div class="ecran">${h}<div style="height:16px"></div></div></div>`;
}

function libelleSession(items) {
  const hm = (t) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const a = items[items.length - 1].ts, z = items[0].ts;
  return `${libelleJour(a)} · ${hm(a)}${z - a > MIN ? " – " + hm(z) : ""}`;
}

function vueLigne(l) {
  const t = l.fields.titre;
  const sous = [l.fields.auteur, l.fields.editeur].filter(Boolean).join(" · ");
  const coche = !!(E.sel && E.sel.has(l.id));
  const meta = [t && l.isbn ? formaterIsbn(l.isbn) : null, formaterDate(l.ts)].filter(Boolean).join(" · ");
  return `<div class="ligne-wrap"><div class="ligne-revele"></div>
  <div class="ligne${l.sent && !E.sel ? " envoye" : ""}${coche ? " coche" : ""}" data-id="${l.id}">
    ${E.sel ? caseHtml(coche) : ""}
    <div class="ligne-corps">
      ${t ? `<div class="ligne-titre">${esc(t)}</div>` : `<div class="ligne-isbn">${esc(formaterIsbn(l.isbn))}</div>`}
      ${sous ? `<div class="ligne-sous">${esc(sous)}</div>` : ""}
      <div class="ligne-meta">${barresPrio(l.prio)}${l.prio === 3 ? `<span class="tag-indisp">Indispensable</span>` : ""}<span class="mono">${esc(meta)}</span></div>
    </div>
    <div class="ligne-etats">${puceBnf(l.bnf, null, l.bnfSource)}${l.fonds ? `<span class="puce puce-fonds">Au fonds</span>` : ""}${l.sent ? `<span class="envoye">envoyé</span>` : ""}</div>
  </div></div>`;
}

// ---------- Gestes sur les lignes : appui long (sélection), balayage (priorité) ----------

let geste = null;
let ignorerClic = false;

document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest(".ligne");
  if (!el || E.ecran !== "liste") return;
  geste = { id: el.dataset.id, el, x: e.clientX, y: e.clientY, dx: 0, glisse: false };
  clearTimeout(geste.minuterie);
  geste.minuterie = setTimeout(() => {
    if (!geste || geste.glisse) return;
    const id = geste.id;
    geste = null;
    ignorerClic = true;
    setTimeout(() => (ignorerClic = false), 600);
    E.sel = E.sel || new Set();
    E.sel.add(id);
    vibrer(20);
    render();
  }, 450);
});

document.addEventListener("pointermove", (e) => {
  if (!geste) return;
  const dx = e.clientX - geste.x, dy = e.clientY - geste.y;
  if (!geste.glisse && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
    clearTimeout(geste.minuterie);
    geste = null;
    return;
  }
  if (E.sel) {
    if (Math.abs(dx) > 10) {
      clearTimeout(geste.minuterie);
      geste = null;
    }
    return;
  }
  if (!geste.glisse && Math.abs(dx) > 10) {
    geste.glisse = true;
    clearTimeout(geste.minuterie);
    try {
      geste.el.setPointerCapture(e.pointerId);
    } catch {}
  }
  if (!geste.glisse) return;
  const l = livre(geste.id);
  geste.dx = Math.max(-120, Math.min(120, dx));
  const suiv = geste.dx > 0 ? Math.min(3, l.prio + 1) : Math.max(1, l.prio - 1);
  const wrap = geste.el.parentElement, rev = wrap.querySelector(".ligne-revele");
  geste.el.classList.add("glisse");
  geste.el.style.transform = `translateX(${geste.dx}px)`;
  wrap.classList.toggle("monte", geste.dx > 0);
  wrap.classList.toggle("baisse", geste.dx < 0);
  rev.style.left = geste.dx > 0 ? "0" : "auto";
  rev.style.right = geste.dx < 0 ? "0" : "auto";
  rev.classList.toggle("arme", Math.abs(geste.dx) > 70);
  rev.textContent = suiv === l.prio ? (geste.dx > 0 ? "Déjà au maximum" : "Déjà au minimum") : (geste.dx > 0 ? "↑ " : "↓ ") + PRIO[suiv];
  e.preventDefault();
});

function finGeste() {
  if (!geste) return;
  clearTimeout(geste.minuterie);
  const g = geste;
  geste = null;
  if (!g.glisse) return;
  ignorerClic = true;
  setTimeout(() => (ignorerClic = false), 300);
  const l = livre(g.id);
  if (Math.abs(g.dx) > 70) {
    const np = g.dx > 0 ? Math.min(3, l.prio + 1) : Math.max(1, l.prio - 1);
    if (np !== l.prio) {
      maj(l.id, (x) => (x.prio = np));
      vibrer(15);
    }
  }
  g.el.classList.remove("glisse");
  g.el.style.transform = "";
  const wrap = g.el.parentElement;
  wrap.classList.remove("monte", "baisse");
  wrap.querySelector(".ligne-revele").textContent = "";
  setTimeout(render, 200);
}
document.addEventListener("pointerup", finGeste);
document.addEventListener("pointercancel", finGeste);

// ---------- Fiche ----------

const TEXTES_BNF = {
  none: ["Non interrogé", "Les catalogues (BnF, Sudoc) complèteront les champs vides. Possible plus tard, en wifi.", "Compléter par les catalogues"],
  loading: ["Interrogation en cours…", "Recherche dans les catalogues de la BnF et du Sudoc.", null],
  found: ["Trouvé à la BnF", "Champs vides complétés. Vos saisies ne sont jamais écrasées.", "Relancer"],
  notfound: ["Introuvable", "Cet ISBN n'est pas (encore) dans les catalogues interrogés, fréquent pour une parution récente.", "Réessayer"],
  error: ["Erreur réseau", "Pas de connexion, ou un catalogue n'a pas répondu. Réessayez plus tard, en wifi.", "Réessayer"],
  na: ["Sans ISBN", "L'interrogation des catalogues nécessite un ISBN.", null],
};

function champsAffiches(l) {
  return CHAMPS.filter((c) => c.toujours || R.favs[c.id] || l.extra.includes(c.id));
}

function vueFiche() {
  const l = livre(E.ficheId);
  const brouillon = !!l.draft;
  const etat = l.isbn ? l.bnf : "na";
  const [titreBnf, bDesc, bBtn] = TEXTES_BNF[etat];
  const bTitre = etat === "found" ? "Trouvé " + (l.bnfSource === "sudoc" ? "au Sudoc" : "à la BnF") : titreBnf;
  let h = `<div class="barre-haut">
    <button class="btn-lien" data-a="${brouillon ? "ficheAnnuler" : "ficheRetour"}">← ${E.retour === "archives" ? "Archives" : "Liste"}</button>
    <div class="titre">${brouillon ? "Nouveau livre" : "Fiche du livre"}</div>
    ${brouillon ? `<div style="width:80px"></div>` : `<button class="btn-suppr" data-a="ficheSuppr">Supprimer</button>`}
  </div><div class="contenu">`;

  // ISBN, priorité, fonds
  h += `<div class="bloc"><div class="lib-petit">ISBN</div>${
    l.manual
      ? `<input id="f-isbn" class="champ-saisie champ-isbn" inputmode="numeric" placeholder="13 chiffres, facultatif" value="${esc(l.isbn)}" data-i="ficheIsbn" maxlength="17">`
      : `<div class="isbn-grand">${esc(formaterIsbn(l.isbn) || "—")}</div>`
  }`;
  if (!brouillon) {
    h += `<div class="tags"><button class="tag-prio" data-a="prioSuivante" title="Toucher pour changer la priorité" style="background:var(--prio${l.prio});color:var(--prio${l.prio}-ink)">${PRIO[l.prio]}</button>${
      l.fonds ? `<span class="tag-fonds">Au fonds · ${esc(l.fondsInfo || "")}</span>` : ""
    }</div>`;
  }
  h += `<div class="meta-fiche">${
    brouillon ? "Titre ou ISBN au minimum." : `Ajouté ${formaterDate(l.ts)} · ${l.sent ? "envoyé" : "pas encore envoyé"}`
  }</div></div>`;

  // Photo de couverture
  h += `<div class="bloc" style="gap:8px"><div class="lib-champ">Photo de couverture</div>`;
  if (l.photo) {
    const url = photos.url(l.id, render);
    const p = l.photo;
    h += `<div class="photo-ligne">
      <div class="photo-vignette" role="img" aria-label="Couverture" style="${url ? `background-image:url('${url}')` : ""}"></div>
      <div class="photo-infos">
        <div class="info">Photo d'origine : ${p.ow}×${p.oh} px, ${formaterPoids(p.orig)}</div>
        <div class="gain">Envoyée : ${p.w}×${p.h} px, ${formaterPoids(p.size)}</div>
        <div class="photo-btns"><label>Reprendre<input type="file" accept="image/*" capture="environment" data-c="photo" hidden></label><button class="retirer" data-a="retirerPhoto">Retirer</button></div>
      </div></div>`;
  } else {
    h += `<label class="photo-prendre">Prendre une photo<input type="file" accept="image/*" capture="environment" data-c="photo" hidden></label>
      <div class="note">Réduite à ${CONFIG.photo.taille} px avant l'envoi : environ 100 Ko au lieu de 4 à 6 Mo.</div>`;
  }
  h += `</div>`;

  // BnF
  h += `<div class="carte-bnf"><div class="carte-bnf-l1">${puceBnf(etat, bTitre)}${
    bBtn && !brouillon ? `<button class="btn-bnf" data-a="ficheBnf">${bBtn}</button>` : ""
  }</div>${etat === "loading" ? `<div class="barre-attente"><div></div></div>` : ""}<div class="desc">${esc(bDesc)}${
    etat === "found" && l.bnfData ? esc(detailsBnf(l.bnfData)) : ""
  }</div>`;
  if (etat === "found") {
    const couv = couvBnf(l);
    h += `<div class="couv-ligne">${
      couv ? `<img class="couv-img" src="${esc(couv)}" alt="Couverture BnF">` : `<div class="couv-vide"></div>`
    }<div class="couv-txt"><b>${couv ? "Couverture BnF récupérée" : l.bnfSource === "sudoc" ? "Le Sudoc ne donne pas de couverture" : "Pas de couverture à la BnF"}</b><span>${
      couv ? (l.photo ? "Votre photo est prioritaire dans le mail." : "Affichée en vignette dans le mail, en lien (0 Ko).") : "Fréquent pour une parution récente. Prenez une photo ci-dessus."
    }</span></div></div>`;
  }
  h += `</div>`;

  // Champs
  for (const c of champsAffiches(l)) {
    const v = l.fields[c.id] || "";
    const bv = l.bnfData && l.bnfData[c.id];
    const sugg = !!bv && !!v && l.src[c.id] !== "bnf" && norm(bv) !== norm(v) && !l.dismissed[c.id];
    h += `<div class="bloc" data-champ="${c.id}"><div class="champ-tete"><label class="lib-champ" for="f-${c.id}">${esc(c.label)}</label>${
      l.src[c.id] === "bnf" && v ? `<span class="tag-bnf">${esc(nomSource(l))}</span>` : ""
    }${!c.toujours && R.favs[c.id] ? `<span class="tag-fav">★ toujours affiché</span>` : ""}<div class="esp"></div>${
      !c.toujours && !R.favs[c.id] ? `<button class="btn-retirer-champ" data-a="retirerChamp" data-k="${c.id}">Retirer</button>` : ""
    }</div>`;
    if (c.type === "select") {
      const opts =
        c.id === "cote"
          ? COTES.filter((x) => !l.fields.public || !x.pub || x.pub === l.fields.public || x.v === v).map((x) => [x.v, `${x.v} · ${x.l}`])
          : (c.options || []).map((o) => [o, o]);
      if (v && !opts.some(([o]) => o === v)) opts.unshift([v, v]);
      h += `<select id="f-${c.id}" class="champ-saisie" data-c="champ" data-k="${c.id}"><option value="">— Choisir —</option>${opts
        .map(([o, lab]) => `<option value="${esc(o)}"${o === v ? " selected" : ""}>${esc(lab)}</option>`)
        .join("")}</select>`;
    } else {
      h += `<input id="f-${c.id}" class="champ-saisie" value="${esc(v)}" placeholder="${esc(c.placeholder || "")}" data-i="champ" data-k="${c.id}" autocomplete="off">`;
    }
    if (sugg) {
      h += `<div class="suggestion"><div class="txt"><b>${esc(nomSource(l))} indique :</b> ${esc(bv)}</div><div class="grille2">
        <button class="utiliser" data-a="utiliserBnf" data-k="${c.id}">Utiliser ${esc(nomSource(l))}</button>
        <button class="garder" data-a="garderMienne" data-k="${c.id}">Garder la mienne</button></div></div>`;
    }
    h += `</div>`;
  }
  if (CHAMPS.some((c) => !champsAffiches(l).includes(c))) {
    h += `<button class="btn-ajout-champ" data-a="ajouterChamp">＋ Ajouter un champ</button>`;
  }
  if (E.ficheErr) h += `<div class="erreur">${esc(E.ficheErr)}</div>`;
  h += `</div><div class="pied-simple">${
    brouillon
      ? `<div class="grille2b"><button class="btn" data-a="ficheAnnuler">Annuler</button><button class="btn btn-pri" data-a="ficheEnregistrer">Enregistrer</button></div>`
      : `<button class="btn-pri" data-a="ficheRetour">Terminé</button>`
  }</div>`;
  return `<div class="ecran">${h}</div>`;
}

function detailsBnf(d) {
  const x = [d.date, d.collection && `coll. ${d.collection}`].filter(Boolean).join(" · ");
  return x ? ` (${x})` : "";
}

// ---------- Réglages ----------

const TEXTES_PMB = {
  testing: ["Connexion…", "attente"],
  ok: ["Connecté", "ok"],
  bad: ["Adresse invalide (https:// requis)", "ko"],
  offline: ["Pas de réseau", "ko"],
  unreachable: ["Serveur injoignable : adresse, ou accès refusé au navigateur (CORS)", "ko"],
  refused: ["Le serveur répond mais refuse la recherche", "ko"],
  empty: ["Saisissez une adresse", "ko"],
};
function textePmb() {
  return TEXTES_PMB[E.pmbEtat] || [R.pmbUrl.trim() ? "Non testé" : "Vérification désactivée", ""];
}

function vueReglages() {
  const sombre = themeSombre();
  const [pTxt, pCls] = textePmb();
  const n = visibles().length;
  return `<div class="ecran"><div class="barre-haut">
    <button class="btn-lien" data-a="liste">← Liste</button>
    <div class="titre" style="padding-right:70px">Réglages</div>
  </div><div class="contenu reglages">
    <div class="section">
      <div class="section-titre">Destinataire du mail</div>
      <input id="reglage-email" class="champ-reglage" type="email" value="${esc(R.email)}" data-i="email" placeholder="adresse@bibliotheque.fr" autocomplete="email">
      <div class="note">Enregistrée sur ce téléphone uniquement.</div>
    </div>
    <div class="section">
      <div class="section-titre">Vérifier le fonds (PMB)</div>
      <label class="lib-champ" for="pmb-url">Adresse du service PMB</label>
      <input id="pmb-url" class="champ-reglage champ-url" type="url" value="${esc(R.pmbUrl)}" data-i="pmbUrl" placeholder="https://catalogue.ma-bibliotheque.fr/pmb/ws/connector_out.php?source_id=2" autocomplete="off">
      <div class="note">Fournie par l'administrateur PMB : connecteur sortant « JSON-RPC », avec la recherche publique activée. Champ vide : vérification désactivée.</div>
      <div class="test-ligne"><button class="btn-test" data-a="testerPmb">Tester la connexion</button><div id="etat-pmb" class="etat-test ${pCls}">${esc(pTxt)}</div></div>
      <div class="segments" style="grid-template-columns:1fr 1fr 1fr;margin-top:6px">
        ${seg(R.fondsMode === "scan", "fondsMode", "Au scan", 'data-v="scan"')}
        ${seg(R.fondsMode === "send", "fondsMode", "À l'envoi", 'data-v="send"')}
        ${seg(R.fondsMode === "both", "fondsMode", "Les deux", 'data-v="both"')}
      </div>
      <div class="note">Signale les livres que la bibliothèque possède déjà. Nécessite le réseau.</div>
    </div>
    <div class="section">
      <div class="section-titre">Sources de complément</div>
      <div class="liste-champs">${R.sources.map((s, i) => `<div class="champ-ligne"><div style="flex:1;min-width:0"><div class="nom">${i + 1}. ${esc(SOURCES[s.id].nom)}</div><div class="desc" style="white-space:normal">${esc(SOURCES[s.id].detail)}</div></div>${
        i > 0 ? `<button class="btn-test" data-a="sourceMonter" data-k="${s.id}" aria-label="Interroger ${esc(SOURCES[s.id].nom)} avant la précédente">▲</button>` : ""
      }<button class="btn-test" data-a="sourceActive" data-k="${s.id}" aria-pressed="${s.on}">${s.on ? "Active" : "Coupée"}</button></div>`).join("")}</div>
      <div class="note">Essayées dans cet ordre, jusqu'à la première qui trouve le livre. Elles complètent les champs vides : vos saisies ne sont jamais écrasées. Seul l'ISBN est envoyé.</div>
    </div>
    <div class="section">
      <div class="section-titre">Thème</div>
      <div class="segments" style="grid-template-columns:1fr 1fr">
        ${seg(!sombre, "theme", "Clair", 'data-v="light"')}
        ${seg(sombre, "theme", "Sombre", 'data-v="dark"')}
      </div>
    </div>
    <div class="section">
      <div class="section-titre">Champs disponibles</div>
      <div class="f-texte">★ = affiché d'office sur chaque fiche. Les autres s'ajoutent livre par livre avec « Ajouter un champ ».</div>
      <div class="liste-champs">${CHAMPS.map((c) => {
        const on = !!R.favs[c.id];
        const desc =
          c.id === "cote" ? `Liste de ${COTES.length} cotes, filtrée selon le public`
          : c.type === "select" ? `Liste : ${(c.options || []).join(", ")}`
          : ["titre", "auteur", "editeur", "prix", "illustrateur"].includes(c.id) ? "Texte · complété par les catalogues"
          : "Texte libre";
        return `<div class="champ-ligne"><div style="flex:1;min-width:0"><div class="nom">${esc(c.label)}</div><div class="desc">${esc(desc)}</div></div>${
          c.toujours
            ? `<span class="toujours">Toujours</span>`
            : `<button class="etoile${on ? " on" : ""}" data-a="favori" data-k="${c.id}" aria-label="${on ? "Ne plus afficher d'office" : "Afficher d'office"}">${on ? "★" : "☆"}</button>`
        }</div>`;
      }).join("")}</div>
      <div class="note">Les listes de choix se modifient dans le fichier config.js.</div>
    </div>
    <div class="note">${n} livre${pl(n)} enregistré${pl(n)} sur le téléphone · aucun compte, aucun serveur.</div>
    <div class="note">Biblio' Veille ${VERSION_APP}</div>
  </div></div>`;
}

// ---------- Panneaux du bas ----------

function vueFeuille() {
  const f = E.feuille;
  switch (f.type) {
    case "confirm": {
      const l = livre(f.id);
      if (!l) return "";
      const titre = { dup: l.sent ? "Déjà envoyé" : "Déjà dans la liste", fonds: "Déjà au fonds", new: "Livre enregistré" }[f.genre];
      const note =
        f.genre === "dup"
          ? l.sent
            ? `Proposé aux acquisitions le ${new Date(l.sentAt || l.ts).toLocaleDateString("fr-FR")} : rien n'a été ajouté.`
            : "Ce livre a déjà été scanné : rien n'a été ajouté."
          : f.genre === "fonds"
          ? `Catalogue PMB : ${l.fondsInfo || ""}. Gardé dans la liste et signalé « Au fonds ».`
          : l.fields.titre || "Titre et auteur facultatifs : les catalogues pourront les compléter plus tard.";
      const couleur = { dup: "var(--warn)", fonds: "var(--fonds)", new: "var(--ok)" }[f.genre];
      const btn = { dup: "Ouvrir la fiche", fonds: "Retirer de la liste", new: "+ Titre / auteur" }[f.genre];
      return `<div class="confirm-tete"><div class="confirm-rond" style="background:${couleur}">${f.genre === "new" ? "✓" : "!"}</div>
        <div style="flex:1;min-width:0"><div class="f-titre">${titre}</div><div class="confirm-isbn">${esc(formaterIsbn(l.isbn))}</div></div></div>
        <div class="f-texte">${esc(note)}</div>
        <div class="grille2"><button class="btn btn-gris" data-a="confirmAction">${btn}</button><button class="btn btn-pri" style="font-size:16px" data-a="scanner">Scanner le suivant</button></div>`;
    }
    case "champ": {
      const l = livre(E.ficheId);
      const dispo = CHAMPS.filter((c) => !champsAffiches(l).includes(c));
      return `<div class="f-titre">Ajouter un champ</div><div class="liste-choix">${dispo
        .map((c) => `<button data-a="ajouterChampChoix" data-k="${c.id}"><span>${esc(c.label)}</span><span class="type">${c.type === "select" ? "liste" : "texte"}</span></button>`)
        .join("")}</div><button class="btn-lien" style="font-size:14px;min-height:44px" data-a="reglagesDepuisFeuille">Gérer les champs toujours affichés</button>`;
    }
    case "isbn": {
      const [txt, cls] = indiceIsbn(f.saisie);
      return `<div class="f-titre">Taper l'ISBN</div>
        <input class="isbn-saisie" inputmode="numeric" placeholder="978…" value="${esc(f.saisie)}" data-i="isbnTape" autocomplete="off" maxlength="13">
        <div id="indice-isbn" class="indice ${cls}">${txt}</div>
        <button class="btn btn-pri" data-a="validerIsbn">Ajouter</button>`;
    }
    case "envoi":
      return vueEnvoi(f);
    case "envoye": {
      const n = f.ids.length;
      return `<div class="f-titre">Le mail est-il parti ?</div>
        <div class="f-texte" style="font-size:15px">Si oui, ${n > 1 ? `les ${n} livres seront marqués` : "le livre sera marqué"} « envoyé ».</div>
        <div class="grille2b"><button class="btn" data-a="fermerFeuille">Non</button><button class="btn btn-pri" data-a="confirmerEnvoi">Oui, c'est parti</button></div>`;
    }
    case "pile": {
      const it = S.pileItems || [];
      const nAj = it.filter((x) => x.coche && x.statut !== "dup").length;
      const resume = ["new", "dup", "fonds"]
        .map((k) => {
          const n = it.filter((x) => x.statut === k).length;
          return n ? `${n} ${k === "new" ? "nouveau" + (n > 1 ? "x" : "") : k === "dup" ? "déjà listé" + pl(n) : "au fonds"}` : null;
        })
        .filter(Boolean)
        .join(" · ");
      return `<div class="f-titre">${it.length} code${pl(it.length)} détecté${pl(it.length)}</div><div class="f-texte">${resume}</div>
        <div class="liste-choix">${it
          .map((x, i) => {
            const statut =
              x.statut === "new" ? "Nouveau" : x.statut === "dup" ? (x.envoye ? "Déjà envoyé · ignoré" : "Déjà dans la liste · ignoré") : `Au fonds · ${x.info}`;
            const col = x.statut === "new" ? "var(--ok)" : x.statut === "dup" ? "var(--warn)" : "var(--fonds)";
            return `<button class="pile-item" data-a="pileCocher" data-k="${i}" ${x.statut === "dup" ? "disabled" : ""}>${caseHtml(x.coche, x.statut === "dup")}
              <div style="flex:1;min-width:0"><div class="isbn">${esc(formaterIsbn(x.isbn))}</div><div class="statut" style="color:${col}">${esc(statut)}${x.verif ? " · vérification du fonds…" : ""}</div></div></button>`;
          })
          .join("")}</div>
        <div class="grille2b"><button class="btn" data-a="recadrer">Recadrer</button><button class="btn btn-pri" data-a="ajouterPile" ${nAj ? "" : "disabled"}>Ajouter ${nAj} livre${pl(nAj)}</button></div>`;
    }
    case "archive": {
      const g = envois().find((x) => x.k === f.k);
      if (!g) return "";
      const n = g.livres.length, suppr = f.action === "supprimer";
      return `<div class="f-titre">${suppr ? `Supprimer l'envoi (${n} livre${pl(n)}) ?` : `Remettre ${n} livre${pl(n)} à envoyer ?`}</div>
        <div class="f-texte">${esc(libelleEnvoi(g))}. ${
          suppr
            ? "Les livres et leurs photos quittent le téléphone : ils ne seront plus reconnus au scan. Ce qui a été versé dans Biblio' Achats y reste."
            : "Ils reviennent dans la liste, prêts pour un nouvel envoi (mail perdu, envoi à refaire)."
        }</div>
        <div class="grille2"><button class="btn" data-a="fermerFeuille">Annuler</button><button class="btn btn-pri"${suppr ? ' style="background:var(--err)"' : ""} data-a="archiveConfirmer">${suppr ? "Supprimer" : "Remettre"}</button></div>`;
    }
    case "suppr": {
      const n = E.sel ? E.sel.size : 0;
      return `<div class="f-titre">Supprimer ${n} livre${pl(n)} ?</div>
        <div class="grille2"><button class="btn" data-a="fermerFeuille">Annuler</button><button class="btn btn-pri" style="background:var(--err)" data-a="supprimerSel">Supprimer</button></div>`;
    }
  }
  return "";
}

function indiceIsbn(s) {
  if (!s) return ["13 chiffres, commençant par 978 ou 979.", ""];
  if (isbnValide(s)) return ["ISBN valide.", "ok"];
  if (s.length < 13) return [`${s.length}/13 chiffres`, ""];
  return ["ISBN invalide : vérifiez les chiffres.", "ko"];
}

// ---------- Envoi ----------

function livresEnvoi(f) {
  const tous = livres.filter((l) => f.ids.includes(l.id));
  const verifie = f.fonds !== "checking";
  const hits = verifie ? tous.filter((l) => l.fonds) : [];
  const eff = (f.exclure && hits.length ? tous.filter((l) => !l.fonds) : tous).sort((a, b) => b.prio - a.prio || b.ts - a.ts);
  return { hits, eff };
}

function vueEnvoi(f) {
  const { hits, eff } = livresEnvoi(f);
  const n = eff.length;
  const html = R.formatMail !== "text";
  let h = `<div class="f-titre">Envoyer ${n} livre${pl(n)}</div><div class="f-texte">À : ${esc(R.email || "(destinataire à renseigner dans Réglages)")}</div>`;
  if (f.fonds || hits.length) {
    const titre =
      f.fonds === "checking" ? "Vérification du fonds PMB…"
      : f.fonds === "error" ? (navigator.onLine ? "Fonds non vérifié : PMB injoignable" : "Fonds non vérifié : pas de réseau")
      : hits.length ? `${hits.length} livre${pl(hits.length)} déjà au fonds`
      : "Aucun livre déjà au fonds";
    const col = hits.length ? "var(--fonds)" : f.fonds === "error" ? "var(--err)" : "var(--ink)";
    h += `<div class="fonds-bloc"><div class="fonds-titre" style="color:${col}">${titre}</div>${f.fonds === "checking" ? `<div class="barre-attente"><div></div></div>` : ""}`;
    if (hits.length) {
      h += hits.map((l) => `<div class="fonds-hit"><span>${esc(l.fields.titre || formaterIsbn(l.isbn))}</span><span>${esc(l.fondsInfo || "au fonds")}</span></div>`).join("");
      h += `<button class="case-ligne" data-a="exclureFonds">${caseHtml(f.exclure)}Les retirer de cet envoi</button>`;
    }
    h += `</div>`;
  }
  h += `<div class="segments" style="grid-template-columns:1fr 1fr">${seg(html, "formatMail", "Tableau HTML", 'data-v="html"')}${seg(!html, "formatMail", "Texte simple", 'data-v="text"')}</div>`;

  const nCouv = eff.filter((l) => !l.photo && couvBnf(l)).length;
  const avecPhoto = eff.filter((l) => l.photo);
  const poidsPhotos = avecPhoto.reduce((t, l) => t + Math.round(l.photo.size * 1.37), 0);
  const partPhotos = avecPhoto.length ? `${avecPhoto.length} photo${pl(avecPhoto.length)} ≈ ${formaterPoids(poidsPhotos)}` : "aucune photo";
  if (html) {
    h += `<div class="apercu"><div class="apercu-intro">Bonjour, voici ${n} titre${pl(n)} repéré${pl(n)} pour les acquisitions, classés par priorité.</div>
      <div class="apercu-tete"><span>Couv.</span><span>Livre</span><span>Priorité</span></div>${eff
        .map((l) => {
          let v = `<div class="apercu-sans"></div>`;
          if (l.photo) {
            const u = photos.url(l.id, renderFeuille);
            v = u ? `<img class="apercu-couv" src="${u}" alt="">` : `<div class="apercu-couv"></div>`;
          } else if (couvBnf(l)) v = `<img class="apercu-couv" src="${esc(couvBnf(l))}" alt="">`;
          const [fond, encre] = COULEURS_PRIO_MAIL[l.prio];
          return `<div class="apercu-ligne">${v}<div class="apercu-livre"><b>${esc(l.fields.titre || "(titre à compléter)")}</b><div>${esc(sousLigneMail(l))}</div><div class="mono">${esc(
            l.isbn ? formaterIsbn(l.isbn) : "sans ISBN"
          )}</div></div><span class="apercu-prio" style="background:${fond};color:${encre}">${PRIO[l.prio]}</span></div>`;
        })
        .join("")}${nCouv ? `<div class="apercu-credit">Couvertures : BnF, Catalogue général, récupérées le ${new Date().toLocaleDateString("fr-FR")}.</div>` : ""}</div>`;
    const total = f.document ? f.document.size : (2 + n) * 1024 + poidsPhotos;
    h += `<div class="poids">Tableau HTML ≈ ${formaterPoids(Math.max(1024, total - poidsPhotos))} · ${nCouv} vignette${pl(nCouv)} BnF en lien (0 Ko) · ${partPhotos} · total ≈ ${formaterPoids(total)}</div>`;
  } else {
    h += `<div class="apercu-texte">${esc(corpsTexte(eff))}</div><div class="poids">Texte ≈ ${formaterPoids(new Blob([corpsTexte(eff)]).size)} · sans photo</div>`;
  }
  if (html && !partageFichiers()) {
    h += `<div class="note">Ce navigateur ne sait pas joindre un fichier au mail : le tableau sera enregistré dans Téléchargements, à joindre à la main.</div>`;
  }
  const bloque = f.fonds === "checking" || !n || (html && !f.document);
  h += `<button class="btn btn-pri" data-a="partager" ${bloque ? "disabled" : ""}>${
    f.fonds === "checking" ? "Vérification…" : html && !f.document && n ? "Préparation…" : html && !partageFichiers() ? `Enregistrer et ouvrir le mail (${n})` : `Partager vers le mail (${n})`
  }</button>`;
  return h;
}

// Le navigateur sait-il passer un fichier à la messagerie (partage Android) ?
function partageFichiers() {
  try {
    return !!(navigator.canShare && navigator.canShare({ files: [new File(["x"], "t.html", { type: "text/html" })] }));
  } catch {
    return false;
  }
}

// Prépare le fichier HTML à l'avance : le partage doit partir directement du toucher.
async function preparerDocument() {
  const f = E.feuille;
  if (!f || f.type !== "envoi") return;
  f.document = null;
  const jeton = (f.jeton = (f.jeton || 0) + 1);
  if (R.formatMail === "text" || f.fonds === "checking") return renderFeuille();
  renderFeuille();
  const { eff } = livresEnvoi(f);
  if (!eff.length) return;
  const html = await documentHtml(eff);
  if (E.feuille !== f || f.jeton !== jeton) return;
  f.document = new File([html], `veille-acquisitions-${dateFichier()}.html`, { type: "text/html" });
  renderFeuille();
}

async function ouvrirEnvoi() {
  const tous = visibles();
  const ids = E.sel && E.sel.size ? [...E.sel] : tous.filter((l) => !l.sent).map((l) => l.id);
  if (!ids.length) return toast("Rien à envoyer");
  const verifier = !!R.pmbUrl.trim() && ["send", "both"].includes(R.fondsMode);
  const f = (E.feuille = { type: "envoi", ids, fonds: verifier ? "checking" : null, exclure: true });
  render();
  if (!verifier) return preparerDocument();
  if (!navigator.onLine) {
    f.fonds = "error";
    return preparerDocument();
  }
  const aVerifier = livres.filter((l) => ids.includes(l.id) && l.isbn);
  let reponses = 0;
  await enParallele(aVerifier, 4, async (l) => {
    const r = await verifierFonds(R.pmbUrl.trim(), l.isbn);
    if (r) {
      reponses++;
      maj(l.id, (x) => {
        x.fonds = r.fonds;
        x.fondsInfo = r.info;
      });
    }
  });
  if (E.feuille !== f) return render();
  f.fonds = reponses || !aVerifier.length ? "done" : "error";
  render();
  preparerDocument();
}

async function enParallele(items, n, fn) {
  const file = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, file.length) }, async () => {
      while (file.length) await fn(file.shift());
    })
  );
}

async function partager() {
  const f = E.feuille;
  const { eff } = livresEnvoi(f);
  if (!eff.length) return;
  const objet = `${CONFIG.objetMail} (${eff.length})`;
  const texte = corpsTexte(eff);
  const ouvrirMailto = () => {
    const url = `mailto:${encodeURIComponent(R.email)}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(texte)}`;
    if (url.length > 6000 && !confirm("La liste est longue : le mail risque d'être tronqué. Continuer ? (sinon, utilisez « Exporter CSV »)")) return false;
    window.location.href = url;
    return true;
  };
  const demanderSiParti = () => {
    E.feuille = { type: "envoye", ids: eff.map((l) => l.id) };
    setTimeout(renderFeuille, 800);
  };

  if (R.formatMail === "text") {
    if (!R.email) {
      toast("Renseignez d'abord le destinataire.");
      E.feuille = null;
      E.ecran = "reglages";
      return render();
    }
    if (ouvrirMailto()) demanderSiParti();
    return;
  }
  const fichier = f.document;
  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    // Le partage ne transmet pas le destinataire : on le met dans le presse-papiers.
    if (R.email && navigator.clipboard) navigator.clipboard.writeText(R.email).then(() => toast(`Adresse copiée : ${R.email}`)).catch(() => {});
    try {
      await navigator.share({ files: [fichier], title: objet, text: texte });
      demanderSiParti();
    } catch (e) {
      if (e.name !== "AbortError") toast("Partage impossible : essayez « Texte simple ».");
    }
    return;
  }
  // Pas de partage de fichier : on enregistre le tableau et on ouvre le mail en texte.
  await partagerOuTelecharger(fichier, objet);
  toast("Tableau enregistré : joignez-le au mail.");
  if (R.email && ouvrirMailto()) demanderSiParti();
}

// ---------- Catalogues : BnF, puis Sudoc ----------

async function interrogerLot(ids, avecBandeau) {
  if (!navigator.onLine) toast("Pas de réseau : les catalogues seront interrogés plus tard, en wifi.");
  if (!R.sources.some((x) => x.on)) return toast("Aucune source de complément active : voir Réglages.");
  const cibles = livres.filter((l) => ids.includes(l.id) && l.isbn && l.bnf !== "loading").map((l) => l.id);
  if (!cibles.length) return toast("Aucun ISBN à interroger");
  for (const id of cibles) maj(id, (l) => (l.bnf = "loading"));
  const b = avecBandeau ? (E.bandeau = { running: true, done: 0, total: cibles.length, found: 0, nf: 0, err: 0 }) : null;
  render();
  for (const id of cibles) {
    const l = livre(id);
    if (!l) continue;
    const res = navigator.onLine ? await interrogerSources(l.isbn, R.sources) : { statut: "error" };
    let couv = false;
    if (res.statut === "found" && CONFIG.bnf.couvertures && res.data.ark) couv = await testerCouverture(urlCouvertureBnf(res.data.ark));
    maj(id, (x) => {
      x.bnf = res.statut;
      x.bnfSource = res.statut === "found" ? res.source : null;
      if (res.statut !== "found") return;
      x.bnfData = res.data;
      x.cover = couv;
      for (const c of CHAMPS) {
        const v = res.data[c.id];
        if (!v) continue;
        if (!x.fields[c.id]) {
          x.fields[c.id] = v;
          x.src[c.id] = "bnf";
        }
        if (!c.toujours && !x.extra.includes(c.id)) x.extra.push(c.id);
      }
    });
    if (b) {
      b.done++;
      b[{ found: "found", notfound: "nf", error: "err" }[res.statut]]++;
      if (b.done >= b.total) b.running = false;
    }
    render();
    await new Promise((ok) => setTimeout(ok, 300));
  }
}

// ---------- Fonds au moment du scan ----------

function fondsAuScan() {
  return !!R.pmbUrl.trim() && ["scan", "both"].includes(R.fondsMode) && navigator.onLine;
}

function verifierFondsAuScan(l, siAuFonds) {
  if (!fondsAuScan() || !l.isbn) return;
  verifierFonds(R.pmbUrl.trim(), l.isbn).then((r) => {
    if (!r || !livre(l.id)) return;
    maj(l.id, (x) => {
      x.fonds = r.fonds;
      x.fondsInfo = r.info;
    });
    if (r.fonds) siAuFonds();
    else if (!S.actif) render();
  });
}

// ---------- Scanner ----------

const S = {
  actif: false, mode: "unit", kiloN: 0, dernier: null, torche: false, caps: null,
  boucle: null, pauseJusqua: 0, dernierLu: null, pile: new Map(), pileNouveau: 0, pileFigee: false, pileItems: null,
  messageJusqua: 0,
};
const video = $("video");

const AIDES = {
  unit: "Placez le code-barres dans le cadre.",
  kilo: "Enchaînez les livres : la caméra reste ouverte.",
  pile: "Cadrez la pile ou la table : tous les codes visibles sont lus d'un coup.",
};

async function ouvrirScan(mode) {
  E.feuille = null;
  E.sel = null;
  render();
  Object.assign(S, { mode, kiloN: 0, dernier: null, dernierLu: null, pauseJusqua: 0, torche: false });
  viderPile();
  $("scanner").hidden = false;
  majScan();
  historique();
  try {
    S.caps = await Camera.demarrer(video);
  } catch (e) {
    fermerScan();
    const refuse = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
    toast(refuse ? "Accès à la caméra refusé : vérifiez l'autorisation du site." : "Caméra indisponible : essayez « Taper l'ISBN ».");
    return;
  }
  if ($("scanner").hidden) return Camera.arreter(video); // fermé pendant l'ouverture
  const z = S.caps.zoom;
  $("zoom-ligne").hidden = !z;
  if (z) {
    // Zoom de départ ×1,5 : on tient le téléphone plus loin, hors de la distance minimale de mise au point.
    const depart = Math.min(Math.max(z.min, CONFIG.zoomDepart), z.max);
    Object.assign($("zoom"), { min: z.min, max: Math.min(z.max, z.min * 8), step: z.step || 0.1, value: depart });
    Camera.zoom(depart);
    $("zoom-val").textContent = "×" + depart.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  }
  $("btn-torche").disabled = !S.caps.torche;
  S.actif = true;
  boucler();
}

function boucler() {
  if (!S.actif) return;
  if (S.pileFigee) return void (S.boucle = setTimeout(boucler, 200));
  Lecteur.lireVideo(video, S.mode === "pile")
    .then(traiterLecture)
    .catch(() => {})
    .finally(() => {
      if (S.actif) S.boucle = setTimeout(boucler, Lecteur.natif() ? 100 : 60);
    });
}

function messageScan(txt) {
  $("scan-aide").textContent = txt;
  S.messageJusqua = Date.now() + 2500;
}

function traiterLecture(codes) {
  if (!S.actif) return;
  if (Date.now() > S.messageJusqua) $("scan-aide").textContent = AIDES[S.mode];
  const valides = codes.filter((c) => isbnValide(c.text));
  if (!valides.length) {
    if (codes.length) messageScan(`Code lu (${codes[0].text}) mais ce n'est pas un ISBN (978/979).`);
    if (S.mode === "pile") verifierPileStable();
    return;
  }
  if (S.mode !== "pile") return lectureIsbn(valides[0].text);
  if (S.pileFigee) return;
  for (const c of valides) {
    if (!S.pile.has(c.text)) S.pileNouveau = Date.now();
    S.pile.set(c.text, c.box);
  }
  dessinerPile();
  verifierPileStable();
}

// Après 1,5 s sans nouveau code, on montre la liste des codes trouvés.
function verifierPileStable() {
  if (S.pileFigee || !S.pile.size || Date.now() - S.pileNouveau < 1500) return;
  figerPile();
}

function statutPile(isbn) {
  const ex = livres.find((l) => l.isbn === isbn && !l.draft);
  return ex ? { statut: "dup", envoye: ex.sent } : { statut: "new" };
}

function dessinerPile() {
  const zone = $("pile-boites");
  const vw = video.clientWidth, vh = video.clientHeight, sw = video.videoWidth, sh = video.videoHeight;
  if (!sw) return;
  const k = Math.max(vw / sw, vh / sh), ox = (vw - sw * k) / 2, oy = (vh - sh * k) / 2;
  const COUL = { new: "oklch(0.78 0.17 150)", dup: "oklch(0.82 0.15 75)", fonds: "oklch(0.75 0.13 300)" };
  const LIB = { new: "Nouveau", dup: "Déjà listé", fonds: "Au fonds" };
  zone.innerHTML = [...S.pile.entries()]
    .filter(([, b]) => b)
    .map(([isbn, b]) => {
      const st = (S.pileItems && S.pileItems.find((x) => x.isbn === isbn)?.statut) || statutPile(isbn).statut;
      return `<div class="pile-boite" style="--c:${COUL[st]};left:${ox + b.x * k}px;top:${oy + b.y * k}px;width:${b.w * k}px;height:${Math.max(24, b.h * k)}px"><span>${LIB[st]}</span></div>`;
    })
    .join("");
}

function figerPile() {
  S.pileFigee = true;
  bip(false);
  S.pileItems = [...S.pile.keys()].map((isbn) => {
    const s = statutPile(isbn);
    return { isbn, statut: s.statut, envoye: s.envoye, info: null, coche: s.statut === "new", verif: s.statut === "new" && fondsAuScan() };
  });
  dessinerPile();
  // Fonds : les nouveaux déjà possédés passent en « Au fonds », décochés.
  for (const it of S.pileItems) {
    if (!it.verif) continue;
    verifierFonds(R.pmbUrl.trim(), it.isbn).then((r) => {
      it.verif = false;
      if (r && r.fonds) Object.assign(it, { statut: "fonds", info: r.info, coche: false });
      dessinerPile();
      if (E.feuille?.type === "pile") renderFeuille();
    });
  }
  setTimeout(() => {
    if (S.pileFigee && !$("scanner").hidden) {
      E.feuille = { type: "pile" };
      renderFeuille();
      historique();
    }
  }, 700);
}

function viderPile() {
  S.pile = new Map();
  S.pileFigee = false;
  S.pileItems = null;
  S.pileNouveau = 0;
  $("pile-boites").innerHTML = "";
}

function lectureIsbn(isbn) {
  const now = Date.now();
  if (now < S.pauseJusqua) return;
  // Au kilomètre, le livre encore dans le cadre n'est pas relu en boucle.
  if (S.mode === "kilo" && S.dernierLu && S.dernierLu.isbn === isbn && now - S.dernierLu.at < 4000) {
    S.dernierLu.at = now;
    return;
  }
  S.dernierLu = { isbn, at: now };
  const existant = livres.find((l) => l.isbn === isbn && !l.draft);

  if (S.mode === "kilo") {
    S.pauseJusqua = now + CONFIG.pauseKilometre;
    if (existant) {
      bip(true);
      flash("dup", existant.sent ? "Déjà envoyé" : "Déjà dans la liste");
      S.dernier = { isbn, id: null, dup: true };
      return majScan();
    }
    const l = nouveauLivre(isbn);
    livres.push(l);
    sauver();
    S.kiloN++;
    S.dernier = { isbn, id: l.id };
    bip(false);
    flash("ok", "✓ Ajouté");
    majScan();
    verifierFondsAuScan(l, () => {
      if (!S.actif) return;
      bip(true);
      flash("fonds", "Ajouté · déjà au fonds");
      if (S.dernier && S.dernier.id === l.id) S.dernier.fonds = true;
      majScan();
    });
    return;
  }

  // Un livre (ou ISBN tapé) : retour à la liste avec le panneau de confirmation.
  fermerScan(true);
  if (existant) {
    bip(true);
    E.feuille = { type: "confirm", id: existant.id, genre: "dup" };
    return render();
  }
  const l = nouveauLivre(isbn);
  livres.push(l);
  sauver();
  bip(false);
  E.feuille = { type: "confirm", id: l.id, genre: "new" };
  render();
  verifierFondsAuScan(l, () => {
    if (E.feuille?.type === "confirm" && E.feuille.id === l.id) E.feuille.genre = "fonds";
    render();
  });
}

function flash(genre, texte) {
  const coul = { ok: "oklch(0.78 0.17 150)", dup: "oklch(0.82 0.15 75)", fonds: "oklch(0.75 0.13 300)" }[genre];
  const f = $("flash"), cadre = $("cadre");
  f.textContent = texte;
  f.style.background = coul;
  f.hidden = false;
  cadre.style.borderColor = coul;
  cadre.style.boxShadow = `0 0 0 6px color-mix(in oklch, ${coul} 35%, transparent)`;
  clearTimeout(flash.m);
  flash.m = setTimeout(() => {
    f.hidden = true;
    cadre.style.borderColor = "";
    cadre.style.boxShadow = "";
  }, 1000);
}

function majScan() {
  const kilo = S.mode === "kilo";
  $("scanner").classList.toggle("pile", S.mode === "pile");
  if (Date.now() > S.messageJusqua) $("scan-aide").textContent = AIDES[S.mode];
  $("btn-scan-fermer").textContent = kilo ? "Terminer" : "Annuler";
  $("kilo-compteur").hidden = !kilo;
  $("kilo-n").textContent = S.kiloN;
  $("kilo-libelle").textContent = "scanné" + pl(S.kiloN);
  const d = S.dernier;
  $("scan-dernier").hidden = !(kilo && d);
  if (kilo && d) {
    $("dernier-libelle").textContent = d.dup ? "Déjà scanné, ignoré" : d.fonds ? "Ajouté, mais déjà au fonds" : "Dernier ajouté";
    $("dernier-isbn").textContent = formaterIsbn(d.isbn);
    $("btn-annuler-dernier").hidden = !d.id;
  }
  const t = $("btn-kilo-terminer");
  t.hidden = !kilo;
  t.textContent = `Terminer · ${S.kiloN} ajouté${pl(S.kiloN)}`;
  $("btn-torche").classList.toggle("on", S.torche);
}

function fermerScan(silencieux) {
  S.actif = false;
  clearTimeout(S.boucle);
  if (S.torche) Camera.torche(false);
  Camera.arreter(video);
  $("scanner").hidden = true;
  viderPile();
  if (E.feuille && ["pile", "isbn"].includes(E.feuille.type)) E.feuille = null;
  if (!silencieux) {
    if (S.mode === "kilo" && S.kiloN) toast(`${S.kiloN} livre${pl(S.kiloN)} ajouté${pl(S.kiloN)} à la liste`);
    render();
  }
}

$("btn-scan-fermer").addEventListener("click", () => fermerScan());
$("btn-kilo-terminer").addEventListener("click", () => fermerScan());
$("btn-annuler-dernier").addEventListener("click", () => {
  const id = S.dernier && S.dernier.id;
  if (!id) return;
  supprimerLivres([id]);
  S.kiloN--;
  S.dernier = null;
  majScan();
  toast("Dernier scan annulé");
});
$("btn-torche").addEventListener("click", () => {
  S.torche = !S.torche;
  Camera.torche(S.torche);
  majScan();
});
$("zoom").addEventListener("input", (e) => {
  Camera.zoom(+e.target.value);
  $("zoom-val").textContent = "×" + (+e.target.value).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
});
// Toucher l'image force la mise au point à cet endroit (les boutons et le zoom ne comptent pas).
$("scanner").addEventListener("click", async (e) => {
  if (!S.actif || S.pileFigee || e.target.closest("button, input, .scan-bas, .scan-haut")) return;
  const r = video.getBoundingClientRect(), sw = video.videoWidth, sh = video.videoHeight;
  if (!sw) return;
  const k = Math.max(r.width / sw, r.height / sh);
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const x = (px - (r.width - sw * k) / 2) / (sw * k), y = (py - (r.height - sh * k) / 2) / (sh * k);
  const anneau = document.createElement("div");
  anneau.className = "anneau-focus";
  anneau.style.left = px + "px";
  anneau.style.top = py + "px";
  $("scanner").appendChild(anneau);
  setTimeout(() => anneau.remove(), 900);
  const ok = await Camera.mettreAuPoint(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)));
  if (!ok) messageScan("Mise au point manuelle indisponible sur cet appareil.");
});
$("btn-isbn-clavier").addEventListener("click", () => {
  E.feuille = { type: "isbn", saisie: "" };
  renderFeuille();
  historique();
  $("feuille").querySelector("input")?.focus();
});

// Plan B : photo prise avec l'appareil photo du téléphone (vraie mise au point).
$("btn-photo").addEventListener("click", () => $("fichier-photo").click());
$("fichier-photo").addEventListener("change", async (e) => {
  const fichier = e.target.files[0];
  e.target.value = "";
  if (!fichier) return;
  messageScan("Photo : lecture des codes-barres…");
  const codes = await Lecteur.lireFichier(fichier, S.mode === "pile");
  const valides = codes.filter((c) => isbnValide(c.text));
  if (!valides.length) {
    return messageScan(codes.length ? `Code lu (${codes[0].text}) mais ce n'est pas un ISBN (978/979).` : "Aucun code lu sur la photo : rapprochez-vous, code bien net et à plat.");
  }
  if (S.mode === "pile") {
    viderPile();
    for (const c of valides) S.pile.set(c.text, null);
    return figerPile();
  }
  S.pauseJusqua = 0;
  lectureIsbn(valides[0].text);
});

// ---------- Retour arrière d'Android : ferme le panneau, le scanner ou l'écran ouvert ----------

let niveauHisto = 0;
function profondeur() {
  return (E.ecran !== "liste" ? 1 : 0) + (!$("scanner").hidden ? 1 : 0) + (E.feuille ? 1 : 0) + (E.sel ? 1 : 0) > 0 ? 1 : 0;
}
function historique() {
  const p = profondeur();
  if (p > niveauHisto) history.pushState({ veille: 1 }, "");
  niveauHisto = Math.max(niveauHisto, p);
}
window.addEventListener("popstate", () => {
  niveauHisto = 0;
  if (E.feuille) {
    if (E.feuille.type === "pile") viderPile();
    E.feuille = null;
    renderFeuille();
  } else if (!$("scanner").hidden) fermerScan();
  else if (E.ecran === "fiche" && livre(E.ficheId)?.draft) annulerBrouillon();
  else if (E.ecran === "fiche") quitterFiche();
  else if (E.ecran !== "liste") E.ecran = "liste";
  else if (E.sel) E.sel = null;
  if ($("scanner").hidden) render();
  else historique();
});

// ---------- Actions ----------

function annulerBrouillon() {
  supprimerLivres([E.ficheId]); // et sa photo, sinon elle resterait dans le téléphone
  E.ecran = "liste";
  E.ficheId = null;
}

// Ce qui empêche d'enregistrer la fiche telle quelle, ou null.
function erreurFiche(l) {
  if (!l.isbn && !(l.fields.titre || "").trim()) return "Indiquez au moins un titre ou un ISBN.";
  if (l.isbn && !isbnValide(l.isbn)) return "ISBN invalide : 13 chiffres commençant par 978 ou 979.";
  if (l.isbn && livres.some((x) => x !== l && !x.draft && x.isbn === l.isbn)) return "Cet ISBN est déjà dans la liste.";
  return null;
}

// Retour à la liste. Un livre saisi à la main garde son ISBN modifiable : il doit rester valide et unique.
function quitterFiche() {
  const l = livre(E.ficheId);
  if (l?.manual && (E.ficheErr = erreurFiche(l))) return;
  // Une fiche ouverte depuis les Archives y ramène.
  Object.assign(E, { ecran: E.retour || "liste", ficheId: null, ficheErr: null, retour: null });
}

// Livres d'un envoi des Archives, par sa clé.
const livresDeLEnvoi = (k) => (envois().find((g) => g.k === k) || { livres: [] }).livres;

const ACTIONS = {
  reglages: () => ((E.ecran = "reglages"), (E.pmbEtat = "idle")),
  liste: () => (E.ecran = "liste"),
  scanner: () => ouvrirScan("unit"),
  scannerKilo: () => ouvrirScan("kilo"),
  scannerPile: () => ouvrirScan("pile"),
  manuel: () => {
    const l = nouveauLivre("", { draft: true, manual: true });
    livres.push(l);
    Object.assign(E, { ecran: "fiche", ficheId: l.id, ficheErr: null, feuille: null });
  },
  selectionner: () => (E.sel = new Set()),
  quitterSel: () => (E.sel = null),
  toutSel: () => {
    const vis = visibles().filter((l) => R.afficherEnvoyes || !l.sent);
    E.sel = E.sel.size === vis.length ? new Set() : new Set(vis.map((l) => l.id));
  },
  basculerEnvoyes: () => {
    R.afficherEnvoyes = !R.afficherEnvoyes;
    sauverR();
    if (E.sel) E.sel = new Set();
  },
  fermerBandeau: () => (E.bandeau = null),
  archives: () => ((E.ecran = "archives"), (E.sel = null)),
  archiveOuvrir: (el) => (E.archiveOuverte = E.archiveOuverte === el.dataset.k ? null : el.dataset.k),
  archiveFiche: (el) => Object.assign(E, { ecran: "fiche", ficheId: el.dataset.k, ficheErr: null, retour: "archives" }),
  archiveRemettre: (el) => (E.feuille = { type: "archive", action: "remettre", k: el.dataset.k }),
  archiveSupprimer: (el) => (E.feuille = { type: "archive", action: "supprimer", k: el.dataset.k }),
  archiveConfirmer: () => {
    const f = E.feuille, ids = livresDeLEnvoi(f.k).map((l) => l.id), n = ids.length;
    if (f.action === "remettre") {
      for (const id of ids) maj(id, (l) => ((l.sent = false), delete l.sentAt));
      toast(`${n} livre${pl(n)} remis à envoyer`);
    } else {
      supprimerLivres(ids);
      toast(`${n} livre${pl(n)} supprimé${pl(n)}`);
    }
    E.feuille = null;
    E.archiveOuverte = null;
  },
  bnfSel: () => {
    const ids = [...E.sel];
    E.sel = null;
    interrogerLot(ids, true);
    return false;
  },
  supprSel: () => (E.feuille = { type: "suppr" }),
  supprimerSel: () => {
    const n = E.sel.size;
    supprimerLivres([...E.sel]);
    E.sel = null;
    E.feuille = null;
    toast(`${n} livre${pl(n)} supprimé${pl(n)}`);
  },
  envoyer: () => (ouvrirEnvoi(), false),
  csv: () => {
    const tous = visibles();
    if (!tous.length) return toast("Liste vide."), false;
    partagerOuTelecharger(fichierCsv(tous), "Biblio' Veille");
    return false;
  },
  fermerFeuille: () => {
    if (E.feuille?.type === "pile") viderPile();
    E.feuille = null;
  },

  // Panneaux
  confirmAction: () => {
    const f = E.feuille;
    if (f.genre === "fonds") {
      supprimerLivres([f.id]);
      E.feuille = null;
      toast("Retiré de la liste");
      return;
    }
    Object.assign(E, { ecran: "fiche", ficheId: f.id, feuille: null, ficheErr: null });
  },
  validerIsbn: () => {
    const s = E.feuille.saisie;
    if (!isbnValide(s)) return toast("ISBN incomplet ou invalide"), false;
    E.feuille = null;
    renderFeuille();
    S.pauseJusqua = 0;
    S.dernierLu = null;
    if (S.mode === "pile") S.mode = "unit";
    lectureIsbn(s);
    return false;
  },
  exclureFonds: () => {
    E.feuille.exclure = !E.feuille.exclure;
    preparerDocument();
    return false;
  },
  formatMail: (el) => {
    R.formatMail = el.dataset.v;
    sauverR();
    preparerDocument();
    return false;
  },
  partager: () => (partager(), false),
  confirmerEnvoi: () => {
    const ids = E.feuille.ids;
    for (const id of ids) maj(id, (l) => ((l.sent = true), (l.sentAt = Date.now())));
    E.feuille = null;
    E.sel = null;
    toast(`${ids.length} livre${pl(ids.length)} marqué${pl(ids.length)} envoyé${pl(ids.length)}`);
  },
  pileCocher: (el) => {
    const it = S.pileItems[+el.dataset.k];
    if (it.statut !== "dup") it.coche = !it.coche;
    renderFeuille();
    return false;
  },
  recadrer: () => {
    viderPile();
    E.feuille = null;
    renderFeuille();
    return false;
  },
  ajouterPile: () => {
    const items = S.pileItems.filter((x) => x.coche && x.statut !== "dup");
    for (const x of items) livres.push(nouveauLivre(x.isbn, x.statut === "fonds" ? { fonds: true, fondsInfo: x.info } : {}));
    sauver();
    E.feuille = null;
    fermerScan(true);
    toast(`${items.length} livre${pl(items.length)} ajouté${pl(items.length)}`);
  },

  // Fiche
  ficheRetour: quitterFiche,
  ficheAnnuler: annulerBrouillon,
  ficheSuppr: () => {
    supprimerLivres([E.ficheId]);
    E.ecran = "liste";
    E.ficheId = null;
    toast("Livre supprimé");
  },
  ficheEnregistrer: () => {
    const l = livre(E.ficheId);
    if ((E.ficheErr = erreurFiche(l))) return;
    l.draft = false;
    l.ts = Date.now();
    sauver();
    Object.assign(E, { ecran: "liste", ficheId: null, ficheErr: null });
    toast("Livre enregistré");
    verifierFondsAuScan(l, render);
  },
  prioSuivante: () => maj(E.ficheId, (l) => (l.prio = (l.prio % 3) + 1)),
  ficheBnf: () => (interrogerLot([E.ficheId], false), false),
  retirerPhoto: () => {
    photos.del(E.ficheId);
    maj(E.ficheId, (l) => (l.photo = null));
  },
  retirerChamp: (el) =>
    maj(E.ficheId, (l) => {
      l.extra = l.extra.filter((k) => k !== el.dataset.k);
      delete l.fields[el.dataset.k];
      delete l.src[el.dataset.k];
    }),
  utiliserBnf: (el) =>
    maj(E.ficheId, (l) => {
      l.fields[el.dataset.k] = l.bnfData[el.dataset.k];
      l.src[el.dataset.k] = "bnf";
    }),
  garderMienne: (el) => maj(E.ficheId, (l) => (l.dismissed[el.dataset.k] = true)),
  ajouterChamp: () => (E.feuille = { type: "champ" }),
  ajouterChampChoix: (el) => {
    maj(E.ficheId, (l) => l.extra.push(el.dataset.k));
    E.feuille = null;
  },
  reglagesDepuisFeuille: () => {
    E.feuille = null;
    E.ecran = "reglages";
    E.pmbEtat = "idle";
  },

  // Réglages
  testerPmb: async () => {
    const url = R.pmbUrl.trim();
    if (!url) {
      E.pmbEtat = "empty";
      return;
    }
    E.pmbEtat = "testing";
    render();
    E.pmbEtat = await testerPmb(url);
    if (E.ecran === "reglages") render();
  },
  fondsMode: (el) => {
    R.fondsMode = el.dataset.v;
    sauverR();
  },
  theme: (el) => {
    R.theme = el.dataset.v;
    appliquerTheme();
  },
  favori: (el) => {
    R.favs[el.dataset.k] = !R.favs[el.dataset.k];
    sauverR();
  },
  sourceActive: (el) => {
    const s = R.sources.find((x) => x.id === el.dataset.k);
    if (s) s.on = !s.on;
    sauverR();
  },
  sourceMonter: (el) => {
    const i = R.sources.findIndex((x) => x.id === el.dataset.k);
    if (i > 0) [R.sources[i - 1], R.sources[i]] = [R.sources[i], R.sources[i - 1]];
    sauverR();
  },
};

document.addEventListener("click", (e) => {
  const ligne = e.target.closest(".ligne");
  if (ligne && E.ecran === "liste") {
    if (ignorerClic) return;
    const id = ligne.dataset.id;
    if (E.sel) {
      E.sel.has(id) ? E.sel.delete(id) : E.sel.add(id);
    } else Object.assign(E, { ecran: "fiche", ficheId: id, ficheErr: null });
    return render();
  }
  const el = e.target.closest("[data-a]");
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.a];
  if (!fn) return;
  const r = fn(el, e);
  if (r === false) return;
  if (r instanceof Promise) return void r.then(() => render());
  // Un panneau ouvert par-dessus le scanner ne redessine pas l'écran du dessous.
  if (!$("scanner").hidden) renderFeuille();
  else render();
});

// Listes déroulantes et fichiers : redessinés à la sélection.
document.addEventListener("change", async (e) => {
  const el = e.target;
  const c = el.dataset.c;
  if (c === "groupe") {
    R.groupe = el.value;
    sauverR();
    render();
  } else if (c === "champ") {
    const k = el.dataset.k, v = el.value;
    maj(E.ficheId, (l) => {
      l.fields[k] = v;
      l.src[k] = "user";
      // La cote renseigne le public ; un public incompatible efface la cote.
      if (k === "cote") {
        const ct = COTES.find((x) => x.v === v);
        if (ct && ct.pub && !l.fields.public) {
          l.fields.public = ct.pub;
          l.src.public = "user";
        }
      }
      if (k === "public" && l.fields.cote) {
        const ct = COTES.find((x) => x.v === l.fields.cote);
        if (ct && ct.pub && v && ct.pub !== v) l.fields.cote = "";
      }
    });
    render();
  } else if (c === "photo") {
    const fichier = el.files && el.files[0];
    if (!fichier) return;
    const id = E.ficheId;
    try {
      const { blob, meta } = await reduirePhoto(fichier);
      await photos.put(id, blob);
      maj(id, (l) => (l.photo = meta));
    } catch {
      toast("Image illisible");
    }
    render();
  }
});

// Champs texte : enregistrés à la frappe, sans redessiner (le clavier reste ouvert).
document.addEventListener("input", (e) => {
  const el = e.target;
  const i = el.dataset.i;
  if (i === "champ") {
    const k = el.dataset.k;
    maj(E.ficheId, (l) => {
      l.fields[k] = el.value;
      l.src[k] = "user";
    });
    el.closest(".bloc")?.querySelector(".tag-bnf")?.remove();
  } else if (i === "ficheIsbn") {
    const v = el.value.replace(/[^0-9]/g, "").slice(0, 13);
    if (v !== el.value) el.value = v;
    const l = livre(E.ficheId);
    if (v === l.isbn) return;
    // Autre ISBN : ce que la BnF et PMB disaient du précédent ne vaut plus (titre, couverture, « Au fonds »).
    // Les champs remplis par la BnF sont vidés, à l'écran aussi ; les saisies restent.
    for (const k of Object.keys(l.src)) {
      if (l.src[k] !== "bnf") continue;
      delete l.fields[k];
      delete l.src[k];
      const champ = $("f-" + k);
      if (champ) {
        champ.value = "";
        champ.closest(".bloc").querySelector(".tag-bnf")?.remove();
      }
    }
    Object.assign(l, { isbn: v, bnf: v ? "none" : "na", bnfSource: null, bnfData: null, cover: null, fonds: null, fondsInfo: null, dismissed: {} });
    if (!l.draft) sauver();
  } else if (i === "isbnTape") {
    const v = el.value.replace(/[^0-9]/g, "").slice(0, 13);
    if (v !== el.value) el.value = v;
    E.feuille.saisie = v;
    const [txt, cls] = indiceIsbn(v);
    const ind = $("indice-isbn");
    ind.textContent = txt;
    ind.className = "indice " + cls;
  } else if (i === "email") {
    R.email = el.value.trim();
    sauverR();
  } else if (i === "pmbUrl") {
    R.pmbUrl = el.value.trim();
    sauverR();
    E.pmbEtat = "idle";
    const [t, cls] = textePmb();
    const etat = $("etat-pmb");
    etat.textContent = t;
    etat.className = "etat-test " + cls;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.dataset.i === "isbnTape") ACTIONS.validerIsbn();
});

// ---------- Livre envoyé par l'extension Firefox (ou un favori) ----------
// Adresse : …/index.html#ajout?isbn=…&titre=…&auteur=…&editeur=…&prix=…&page=…
// Le livre est ajouté à la liste, sa fiche s'ouvre, la BnF complète ce qui manque.

function ajoutDepuisAdresse() {
  const h = location.hash;
  if (!h.startsWith("#ajout?")) return false;
  history.replaceState(null, "", location.pathname + location.search);
  const p = new URLSearchParams(h.slice(7));
  const g = (k) => (p.get(k) || "").trim().slice(0, 300);
  const isbn = g("isbn").replace(/[^0-9Xx]/g, "");
  const ok = !!isbn && isbnValide(isbn);
  const existant = ok && livres.find((l) => l.isbn === isbn && !l.draft);
  if (existant) {
    E.feuille = { type: "confirm", id: existant.id, genre: "dup" };
    return true;
  }
  if (!ok && !g("titre")) {
    toast("Rien de reconnu sur la page : ni ISBN ni titre.");
    return true;
  }
  const l = nouveauLivre(ok ? isbn : "", ok ? {} : { manual: true });
  for (const k of ["titre", "auteur", "editeur", "prix"]) {
    if (g(k)) (l.fields[k] = g(k)), (l.src[k] = "user");
  }
  // Public et cote proposés par l'extension, s'ils existent dans config.js.
  if (PUBLICS.includes(g("public"))) (l.fields.public = g("public")), (l.src.public = "user");
  if (COTES.some((c) => c.v === g("cote"))) (l.fields.cote = g("cote")), (l.src.cote = "user");
  let site = "";
  try {
    site = g("page") ? new URL(g("page")).hostname.replace(/^www\./, "") : "";
  } catch {}
  // Parution, rayon, collection, format : en commentaire (Achats les reprend au versement).
  const note = [site && "Repéré sur " + site, g("parution") && "parution " + g("parution"), g("rayon") && "rayon : " + g("rayon"),
    g("collection") && "collection " + g("collection"), g("format")].filter(Boolean).join(" · ");
  if (note) (l.fields.commentaire = note), (l.src.commentaire = "user");
  livres.push(l);
  sauver();
  Object.assign(E, { ecran: "fiche", ficheId: l.id, ficheErr: null, feuille: null, retour: null });
  if (ok) interrogerLot([l.id], false);
  toast(`Livre ajouté${site ? " depuis " + site : ""}`);
  return true;
}

// ---------- Lot de livres envoyé par l'extension Firefox (une série, une liste) ----------
// Adresse : …/index.html#lot?d=… (JSON en UTF-8, en base64 pour adresse ; voir envoi.js de l'extension).
// Les livres sont ajoutés à la liste sans ouvrir de fiche, dans l'ordre reçu ; la BnF complète le reste.

function lotDepuisAdresse() {
  const h = location.hash;
  if (!h.startsWith("#lot?")) return false;
  history.replaceState(null, "", location.pathname + location.search);
  let lot;
  try {
    const b64 = (new URLSearchParams(h.slice(5)).get("d") || "").replace(/-/g, "+").replace(/_/g, "/");
    lot = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    if (!Array.isArray(lot.livres)) throw new Error("pas de livres");
  } catch {
    toast("Lot illisible : rien n'a été ajouté.");
    return true;
  }
  const g = (x, k) => String((x && x[k]) ?? "").trim().slice(0, 300);
  let site = "";
  try {
    site = g(lot, "page") ? new URL(g(lot, "page")).hostname.replace(/^www\./, "") : "";
  } catch {}
  const t0 = Date.now();
  const ids = [];
  let doublons = 0;
  for (const x of lot.livres.slice(0, 200)) {
    const isbn = g(x, "isbn").replace(/[^0-9Xx]/g, "");
    const ok = !!isbn && isbnValide(isbn);
    if (ok && livres.some((l) => l.isbn === isbn && !l.draft)) {
      doublons++;
      continue;
    }
    if (!ok && !g(x, "titre")) continue;
    const l = nouveauLivre(ok ? isbn : "", ok ? {} : { manual: true });
    l.ts = t0 - ids.length; // le premier du lot reste en tête de liste
    for (const k of ["titre", "auteur", "editeur", "prix"]) {
      if (g(x, k)) (l.fields[k] = g(x, k)), (l.src[k] = "user");
    }
    if (PUBLICS.includes(g(x, "public"))) (l.fields.public = g(x, "public")), (l.src.public = "user");
    if (COTES.some((c) => c.v === g(x, "cote"))) (l.fields.cote = g(x, "cote")), (l.src.cote = "user");
    const note = [site && "Repéré sur " + site, g(x, "serie") && "série " + g(x, "serie") + (g(x, "tome") ? ", tome " + g(x, "tome") : ""),
      g(x, "parution") && "parution " + g(x, "parution"), g(lot, "rayon") && "rayon : " + g(lot, "rayon"),
      g(x, "collection") && "collection " + g(x, "collection"), g(x, "format")].filter(Boolean).join(" · ");
    if (note) (l.fields.commentaire = note), (l.src.commentaire = "user");
    livres.push(l);
    ids.push(l.id);
  }
  sauver();
  Object.assign(E, { ecran: "liste", ficheId: null, ficheErr: null, feuille: null, retour: null });
  if (ids.length) interrogerLot(ids, true);
  const pl = (n) => (n > 1 ? "s" : "");
  toast(ids.length
    ? `${ids.length} livre${pl(ids.length)} ajouté${pl(ids.length)}${doublons ? `, ${doublons} déjà dans la liste` : ""}`
    : doublons ? "Ces livres sont déjà dans la liste." : "Rien de reconnu dans ce lot.");
  return true;
}
window.addEventListener("hashchange", () => (ajoutDepuisAdresse() || lotDepuisAdresse()) && render());

// ---------- Démarrage ----------

appliquerTheme();
sauver(); // enregistre la conversion depuis la première version, le cas échéant
ajoutDepuisAdresse() || lotDepuisAdresse();
render();

if ("serviceWorker" in navigator) {
  // Une nouvelle version vient de s'installer : on recharge pour l'afficher tout de suite
  // (pas au tout premier lancement, ni en plein scan ou en pleine saisie).
  const avaitVersion = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!avaitVersion || recharge.fait) return;
    recharge();
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
}

function recharge() {
  if (!$("scanner").hidden || E.ecran === "fiche" || E.feuille) {
    return void setTimeout(recharge, 3000);
  }
  recharge.fait = true;
  location.reload();
}
