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

## [1.6.0] - 2026-10-25

### Ajouté
- **Mise au point au toucher** : toucher l'image du scanner force la mise au point (anneau blanc à
  l'endroit touché), puis la mise au point continue reprend après 1,5 s. Sur les appareils qui ne
  gèrent pas le choix du point, elle se fait au centre ; sur ceux qui ne la gèrent pas du tout,
  un message le dit.

### Modifié
- **Zoom de départ ×1,5** (`zoomDepart` dans `config.js`) : on tient le téléphone plus loin du
  code, hors de la distance minimale de mise au point. Le curseur permet de revenir à ×1.

## [1.5.0] - 2026-10-25

### Ajouté
- **Le Sudoc prend le relais quand la BnF ne trouve rien.** L'ISBN donne un numéro de notice
  (`isbn2ppn`), la notice UNIMARC se lit sur `sudoc.fr` et passe par le même lecteur que la BnF :
  titre, auteur, éditeur, date, collection, prix. Pas de couverture (le Sudoc n'en donne pas).
- **Réglages : « Sources de complément »** : chaque source s'active ou se coupe, et l'ordre se
  change (▲). Les sources sont essayées dans l'ordre, la première qui trouve le livre l'emporte.
  Seul l'ISBN est envoyé. Les champs complétés portent l'étiquette de leur source (BnF ou Sudoc).

### Modifié
- Les textes de la fiche et de la liste parlent des « catalogues » au lieu de la seule BnF
  (« Trouvé Sudoc », « Compléter par les catalogues »).

## [1.4.0] - 2026-10-25

### Ajouté
- **Lot de livres** envoyé par Biblio' Veilleuse (`#lot?d=…`) : sur la page d'une série (Bédéthèque…),
  l'extension liste les albums, les fait cocher et modifier en masse, puis les envoie d'un coup.
  Les livres s'ajoutent à la liste sans ouvrir de fiche, dans l'ordre de la série (le premier tome
  en tête), la BnF complète le reste. Un ISBN déjà dans la liste est compté et ignoré. La série et le
  tome vont en commentaire, avec le site, le rayon, la collection et le format.

## [1.3.0] - 2026-10-19

### Ajouté
- L'extension (renommée **Biblio' Veilleuse**, ex Biblio' Cueillette) transmet aussi le public et la
  cote qu'elle propose d'après le rayon du libraire : ils remplissent la fiche. La date de parution,
  le rayon, la collection et le format vont en commentaire, avec le site d'origine.

## [1.2.0] - 2026-10-19

### Ajouté
- Écran **Archives** (bouton à côté de « Afficher / Masquer » les envoyés) : les envois du plus
  récent au plus ancien (« Envoi du 19/10/2026 à 09:30 · 12 livres »), les envois d'avant la date
  d'envoi regroupés en « Envoi non daté ». Pour chaque envoi : ses livres (un toucher ouvre la
  fiche, qui ramène aux Archives), **Remettre à envoyer** (mail perdu, envoi à refaire) et
  **Supprimer l'envoi** (livres et photos quittent le téléphone ; ils ne sont plus reconnus au
  scan, ce qui est déjà dans Biblio' Achats y reste).
- Réception d'un livre envoyé par l'extension Firefox **Biblio' Cueillette** (ou un favori) :
  l'adresse `…/index.html#ajout?isbn=…&titre=…&auteur=…&editeur=…&prix=…&page=…` ajoute le livre
  (« Repéré sur decitre.fr » en commentaire), ouvre sa fiche et interroge la BnF ; un livre déjà
  dans la liste est signalé, rien n'est ajouté deux fois.

## [1.1.0] - 2026-10-19

### Ajouté
- Cotes alignées sur Biblio' Achats : mangas par âge (ABDM, JBDM, EBDM ; MAN reste pour un
  manga dont l'âge est à préciser) et E1DOC (premiers documentaires).
- Motifs « Tome manquant » et « Fin de série », comme dans Achats.

### Changé côté Achats (rien à faire dans l'appli)
- Biblio' Achats relève lui-même les envois « Veille acquisitions » à son ouverture, et la
  priorité arrive dans son propre champ au lieu du commentaire.

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
