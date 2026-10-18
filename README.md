# Biblio' Veille
Petite appli de lecture d'ISBN sur le terrain pour veille bibliographique. Elle fait partie de l'outil de préparation des acquisitions de la bibliothèque de Parçay-Meslay et partage le style de Biblio' Tour (nom, logo « B.V »).

Ancien nom : Veille ISBN. Le mail envoyé garde l'objet « Veille acquisitions » et la pièce `veille-acquisitions-AAAA-MM-JJ.html`, que `collecter.py` et `veille.py` reconnaissent : ne pas les renommer sans modifier ces scripts. Les clés de stockage du téléphone gardent le préfixe `veille-isbn:` pour la même raison (les fiches existantes restent lisibles).

Application web installable (PWA), sans serveur ni compte : les données restent sur le téléphone.

## Fonctions
- **Scan** : un livre, « au kilomètre » (caméra ouverte, compteur, doublons signalés, annuler le dernier) ou « en pile » (tous les codes visibles d'un coup).
- **Fiche** : Titre, Auteur, Public, Cote, Motif d'office ; Éditeur, Prix indicatif, Commentaire en favoris ; photo de couverture réduite à 800 px.
- **Priorité** : balayer une ligne vers la droite (monte) ou la gauche (baisse) : À voir, Intéressant, Indispensable.
- **BnF** : complète les champs vides (SRU du Catalogue général) et récupère la couverture, livre par livre ou en lot.
- **Fonds PMB** : signale les livres déjà possédés, au scan et/ou avant l'envoi (adresse du connecteur dans Réglages).
- **Envoi** : tableau HTML partagé vers la messagerie, ou texte simple ; les livres envoyés sont masqués mais toujours reconnus au scan.

## Format du mail
L'outil d'acquisitions de la bibliothèque lit ce mail : ne pas changer ce format sans adapter son lecteur (`veille.py`).
- **Corps** : une ligne par livre, `• [Priorité] — ISBN — Titre : … — Auteur : … — …`, chaque champ précédé de son nom (`label` de `config.js`), les champs vides omis.
- **Pièce jointe** `veille-acquisitions-AAAA-MM-JJ.html` : chaque ligne du tableau porte les champs du livre en JSON dans son attribut `data-veille` (`isbn`, `priorite`, puis les `id` de `config.js`).

## Configuration
Tout se règle dans `config.js` : champs, cotes, motifs, taille des photos, adresse BnF (ou d'un relais), méthode PMB.
Le destinataire du mail et l'adresse PMB se saisissent dans l'application.

Après chaque modification des fichiers, changer `VERSION` dans `sw.js` pour forcer la mise à jour sur le téléphone.

## Licences
ZXing (`vendor/`) : Apache 2.0. Polices IBM Plex Sans, Libre Bodoni et Atkinson Hyperlegible Mono (`vendor/fonts/`) : SIL OFL 1.1.
