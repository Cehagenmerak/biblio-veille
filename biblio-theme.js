/* Biblio' : thème clair / sombre, réglé dans « Réglages ». À charger dans <head> (avant le rendu) pour éviter un flash.
   Par défaut, la page suit l'appareil. Le choix se fait par des boutons radio name="b-theme"
   de valeur "systeme", "clair" ou "sombre" (ou un <select name="b-theme">), placés dans les Réglages.
   Ajout Alcuin (22 octobre 2026) : l'écoute est déléguée au document et les choix sont cochés à mesure
   qu'ils apparaissent, pour les applis qui dessinent leurs Réglages en JavaScript. Un événement
   « biblio-theme » signale le changement aux applis qui redessinent quelque chose (graphiques, plan). */
(function () {
  var CLE = "biblio-theme", h = document.documentElement;
  function lire() { try { var m = localStorage.getItem(CLE); return m === "clair" || m === "sombre" ? m : "systeme"; } catch (e) { return "systeme"; } }
  function appliquer(m) { if (m === "clair" || m === "sombre") h.dataset.theme = m; else delete h.dataset.theme; }
  function cocher() {
    var choix = lire();
    document.querySelectorAll('[name="b-theme"]').forEach(function (c) {
      if (c.tagName === "SELECT") { if (c.value !== choix) c.value = choix; }
      else if (c.checked !== (c.value === choix)) c.checked = c.value === choix;
    });
  }
  appliquer(lire());
  document.addEventListener("change", function (ev) {
    var c = ev.target;
    if (!c || c.name !== "b-theme") return;
    var m = c.value;
    appliquer(m);
    try { if (m === "systeme") localStorage.removeItem(CLE); else localStorage.setItem(CLE, m); } catch (e) {}
    cocher();
    document.dispatchEvent(new CustomEvent("biblio-theme", { detail: m }));
  });
  document.addEventListener("DOMContentLoaded", function () {
    cocher();
    var attente = false;
    new MutationObserver(function () {
      if (attente) return;
      attente = true;
      requestAnimationFrame(function () { attente = false; cocher(); });
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
