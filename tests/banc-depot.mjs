// Banc d'essai : Biblio' Veille 1.9.0 dépose dans la boîte d'Achats (serveur local 8775).
// Prérequis : Veille servie sur 127.0.0.1:8798, achats-en-ligne local sur 8775 avec ORIGINES_DEPOT=http://127.0.0.1:8798
import { spawn } from "node:child_process"; import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const P = 9338, pause = (ms) => new Promise((r) => setTimeout(r, ms));
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", `--remote-debugging-port=${P}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "vd-"))}`, "--window-size=400,820", "about:blank"], { stdio: "ignore" });
let w; for (let i = 0; i < 60 && !w; i++) { try { w = (await (await fetch(`http://127.0.0.1:${P}/json`)).json()).find((t) => t.type === "page"); } catch {} await pause(200); }
const ws = new WebSocket(w.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let n = 0; const att = new Map(), err = [], res = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (att.has(d.id)) { att.get(d.id)(d.result); att.delete(d.id); } if (d.method === "Runtime.exceptionThrown") err.push(d.params.exceptionDetails.exception?.description); };
const env = (method, params = {}) => new Promise((r) => { const id = ++n; att.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (e) => (await env("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const ok = (nom, c, d = "") => res.push([c, nom, d]);
const lecture = async () => (await (await fetch("http://localhost:8775/api/depots", { headers: { "X-Code": "essai-lecture-1" } })).json()).depots;
await env("Runtime.enable"); await env("Page.enable"); await env("Page.setBypassCSP", { enabled: true }); // la CSP de Veille n'admet que https, le service local est en http
// Instantané d'essai : le premier livre est déjà au vivier (Commandé), un autre a été désherbé.
await fetch("http://localhost:8775/api/instantane", { method: "POST", headers: { "X-Code": "essai-lecture-1", "Content-Type": "application/json" },
  body: JSON.stringify({ genere: new Date().toISOString(), bons: [], budget: null, titres: [{ id: 1, titre: "Œuvres", isbn: "9782070360024", statut: "Commandé", session: "Octobre" }],
    references: { catalogue: { notices: [] }, desherbe: { documents: [["9782350007472", "120 ans plus tard", "", "2021", "Pilon"]] } } }) });
await env("Page.navigate", { url: "http://127.0.0.1:8798/index.html" }); await pause(1500);
// Deux livres, dont un avec accents ; boîte non réglée d'abord.
await ev(`livres.push(nouveauLivre("9782070360024",{prio:3,fields:{titre:"Œuvres complètes, tome 1",auteur:"Émile Zola",prix:"22,50 €"}}), nouveauLivre("",{fields:{titre:"Sans ISBN, à voir"}})); sauver(); render(); true`);
await ev(`document.querySelector('[data-a="envoyer"]').click()`); await pause(600);
ok("boîte coupée : envoi par mail comme avant", await ev(`!document.querySelector('[data-a="deposerAchats"]') && !!document.querySelector('[data-a="partager"]')`));
await ev(`E.feuille=null; render(); document.querySelector('[data-a="reglages"]').click()`); await pause(300);
const saisir = (id, v) => ev(`(()=>{const e=document.getElementById('${id}');e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await saisir("depot-url", "http://localhost:8775"); await saisir("depot-code", "mauvais-code-123"); await saisir("depot-par", "Rolland");
await ev(`document.querySelector('[data-a="testerDepot"]').click()`); await pause(800);
ok("test : mauvais code refusé", /refusé/.test(await ev(`document.getElementById('etat-depot').textContent`)), await ev(`document.getElementById('etat-depot').textContent`));
await saisir("depot-code", "essai-depot-12");
await ev(`document.querySelector('[data-a="testerDepot"]').click()`); await pause(800);
ok("test : bon code accepté", /accepté/.test(await ev(`document.getElementById('etat-depot').textContent`)), await ev(`document.getElementById('etat-depot').textContent`));
ok("réglages enregistrés", await ev(`JSON.parse(localStorage.getItem(CLE_REGLAGES)).depotCode==='essai-depot-12'`));
await ev(`document.querySelector('[data-a="liste"]').click()`); await pause(300);
await ev(`document.querySelector('[data-a="envoyer"]').click()`); await pause(600);
ok("déjà connu : encart dans l'envoi", /1 livre déjà connu de Biblio' Achats[\s\S]*Au vivier · Commandé/.test(await ev(`document.getElementById('feuille').textContent`)), await ev(`document.getElementById('feuille').textContent.slice(0,400)`));
ok("déjà connu : pastille dans la liste", /Au vivier · Commandé/.test(await ev(`document.getElementById('app').textContent`)));
ok("boîte réglée : bouton Déposer, mail en second", await ev(`/Déposer dans Biblio’ Achats \\(2\\)/.test(document.querySelector('[data-a="deposerAchats"]').textContent) && !!document.querySelector('[data-a="voirMail"]') && !document.querySelector('[data-a="partager"]')`));
await ev(`document.querySelector('[data-a="voirMail"]').click()`); await pause(400);
ok("« Envoyer plutôt par mail » montre le mail", await ev(`!!document.querySelector('[data-a="partager"]')`));
await ev(`E.feuille.voirMail=false; renderFeuille(); document.querySelector('[data-a="deposerAchats"]').click()`); await pause(1500);
const d = await lecture();
const l0 = d[0]?.livres?.[0] || {};
ok("dépôt reçu par la boîte", d.length === 1 && d[0].source === "veille" && d[0].par === "Rolland" && d[0].livres.length === 2, JSON.stringify(d));
ok("accents et priorité intacts", l0.titre === "Œuvres complètes, tome 1" && l0.auteur === "Émile Zola" && l0.priorite === "Indispensable" && l0.prix === "22,50 €", JSON.stringify(l0));
ok("livres marqués envoyés (dépôt)", await ev(`livres.filter(l=>l.sent&&l.sentVia==='depot').length===2`));
ok("panneau fermé", await ev(`E.feuille===null`));
// Boîte injoignable : message, rien marqué.
await ev(`livres.push(nouveauLivre("",{fields:{titre:"Troisième"}})); sauver(); R.depotUrl="http://localhost:8771"; sauverR(); render(); document.querySelector('[data-a="envoyer"]').click()`); await pause(500);
await ev(`document.querySelector('[data-a="deposerAchats"]').click()`); await pause(1500);
ok("boîte injoignable : erreur affichée, livre non marqué", /injoignable/.test(await ev(`document.getElementById('feuille').textContent`)) && await ev(`!livres.find(l=>l.fields.titre==="Troisième").sent`));
await ev(`R.depotUrl="http://localhost:8775"; sauverR(); E.feuille=null; (()=>{const l=nouveauLivre("9782350007472");livres.push(l);sauver();verifierFondsAuScan(l,()=>{});})(); render(); true`); await pause(1200);
ok("livre désherbé ajouté : pastille « Désherbé en 2021 »", /Désherbé en 2021/.test(await ev(`document.getElementById('app').textContent`)));
ok("aucune erreur de page", !err.length, err.join(" | "));
await fetch("http://localhost:8775/api/acquitter", { method: "POST", headers: { "X-Code": "essai-lecture-1", "Content-Type": "application/json" }, body: JSON.stringify({ ids: d.map((x) => x.id) }) });
for (const [c, nom, dd] of res) console.log((c ? "ok    " : "ÉCHEC ") + nom + (c || !dd ? "" : "  → " + dd));
console.log(`${res.filter((r) => r[0]).length}/${res.length}`);
edge.kill(); process.exit(0);
