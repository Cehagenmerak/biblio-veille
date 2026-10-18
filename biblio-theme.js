/* Biblio' : bascule clair / sombre. À charger dans <head> (avant le rendu) pour éviter un flash.
   Sans choix enregistré, la page suit le système. Le bouton .b-bascule force l'autre mode et le mémorise.
   Ajout Alcuin (18 octobre 2026) : le clic est délégué au document et les boutons sont étiquetés
   à mesure qu'ils apparaissent, pour les applis qui dessinent leur en-tête en JavaScript. */
(function () {
  var CLE = "biblio-theme", h = document.documentElement;
  try { var m = localStorage.getItem(CLE); if (m === "clair" || m === "sombre") h.dataset.theme = m; } catch (e) {}
  function actuel() {
    if (h.dataset.theme) return h.dataset.theme;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "sombre" : "clair";
  }
  function etiqueter(b) {
    var s = actuel() === "sombre", l = s ? "Passer en clair" : "Passer en sombre";
    if (b.getAttribute("aria-label") === l) return;
    b.setAttribute("aria-pressed", s);
    b.setAttribute("aria-label", l);
    b.title = l;
  }
  function etiqueterTout() { document.querySelectorAll(".b-bascule").forEach(etiqueter); }
  document.addEventListener("click", function (ev) {
    if (!ev.target.closest || !ev.target.closest(".b-bascule")) return;
    var n = actuel() === "sombre" ? "clair" : "sombre";
    h.dataset.theme = n;
    try { localStorage.setItem(CLE, n); } catch (e) {}
    etiqueterTout();
    document.dispatchEvent(new CustomEvent("biblio-theme", { detail: n }));
  });
  document.addEventListener("DOMContentLoaded", function () {
    etiqueterTout();
    var attente = false;
    new MutationObserver(function () {
      if (attente) return;
      attente = true;
      requestAnimationFrame(function () { attente = false; etiqueterTout(); });
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
