# Journal des versions

Biblio' Veille suit la [gestion sémantique de version](https://semver.org/lang/fr/) (SemVer) :
MAJEUR.MINEUR.CORRECTIF, comme Biblio' Tour.

- **Correctif** (1.0.1) : une correction, rien de nouveau.
- **Mineur** (1.1.0) : de nouvelles fonctions, les fiches déjà enregistrées restent valables.
- **Majeur** (2.0.0) : un changement qui oblige à reprendre les données ou les habitudes.

Le numéro figure dans `sw.js` (`VERSION`) et `config.js` (`VERSION_APP`), et s'affiche en bas de
Réglages. Chaque version publiée porte une étiquette Git `vX.Y.Z`.

**Renumérotation du 18 octobre 2026.** L'appli fonctionne et sert sur le téléphone : elle passe en
1.0.0. Les versions précédentes, numérotées v1 à v14 (v11 à v14 les 18 octobre), sont reprises
dans cette 1.0.0 ; les anciens messages de commit gardent leurs numéros « vN ».

## [1.0.0] - 2026-10-18 (ex v14)

### Modifié
- Identité de la famille Biblio' : jetons communs, **mode sombre** réglé par le bouton de l'en-tête
  ou par Réglages (même réglage), en-tête avec la marque et la tuile de Veille.
- Un seul bleu `#3767AF`, encre et neutres de la famille, polices IBM Plex Sans et Libre Bodoni
  embarquées (Atkinson Hyperlegible Mono gardée pour les ISBN), nouveaux logos et icônes.

### Antérieurement
- Mail à champs nommés, données JSON en pièce jointe, ISBN modifiable, mise à jour fiable sur le
  téléphone, trois modes de scan (un livre, au kilomètre, en pile), colonne code-barres EAN-13
  imprimable.
