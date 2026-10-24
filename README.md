# RTC Tower

Une page personnelle pour consulter les prochains passages aux arrêts du RTC à Québec. Application statique en HTML, CSS et JavaScript natif ; aucun backend ni compilation.

## Démarrer

Depuis le dépôt, avec Python 3 :

```sh
python3 -m http.server 8080 --bind 0.0.0.0
```

Servez le dossier par HTTP (les modules JavaScript ne se chargent pas correctement via `file://`). L’interface contient initialement le parcours 70 vers Val-Bélair à l’arrêt Galeries / 5419. Ajoutez un lien français de page d’arrêt RTC pour suivre le parcours sélectionné ou tous les parcours de cet arrêt. Les favoris peuvent être renommés, réordonnés et supprimés.

## Groupes d’arrêts

Un groupe (Travail, Retour, Week-end…) choisit quels favoris afficher selon le jour et l’heure. Chaque groupe a des horaires « jours + dès HH:MM » : il reste affiché jusqu’à l’horaire suivant d’un groupe, même le lendemain. Les pastilles sous « Mes arrêts » permettent de changer de groupe à la main ; ce choix tient jusqu’au prochain horaire, puis l’affichage automatique reprend (« Revenir en auto » pour l’anticiper). Un favori peut appartenir à plusieurs groupes (menu ⋯ d’une tuile › Groupes) ; « Tous » montre toujours l’ensemble. Sans groupe, rien ne change.

Organisation du code : `core.mjs` (RTC), `store.mjs` (favoris et groupes, format v2 migré depuis v1), `schedule.mjs` (résolution du groupe actif, heure de Québec), `tiles.mjs` et `groups-ui.mjs` (interface), `app.mjs` (orchestration). Les trois premiers sont purs et testés avec Node.

Les favoris sont conservés dans le `localStorage` de cette origine et de ce navigateur. Aucun compte, synchronisation, import ou export dans cette version.

## Vérifier

Node.js 20 ou supérieur, sans installation de dépendances :

```sh
node --test tests/*.test.mjs
```

## Source des données

Le JavaScript du site RTC (`schedules.bundle.js`) utilise `https://api-iv.rtcquebec.ca/api/legacy/` :

- `BorneVirtuelle_ArretParcours?noArret=5419&date=AAAAMMJJ&noParcours=70&codeDirection=1`
- `ListeBorneVirtuelle_Arret?noArret=5419&date=AAAAMMJJ`

Requêtes vérifiées sans clé le 24 octobre 2026. Le serveur renvoyait `Access-Control-Allow-Origin: *`. La page interroge directement ce service toutes les 30 secondes lorsqu’elle est visible, avec un délai maximum de 12 secondes. `ntr` distingue temps réel et planifié ; `annule` indique une annulation. Les dates utilisent le fuseau `America/Toronto`. En cas d’erreur, les dernières données restent affichées avec une mention « à confirmer ». Aucun scraping du HTML n’est nécessaire au fonctionnement.

Cette API utilisée par le site du RTC n’est pas établie comme une API publique officiellement prise en charge ; son contrat ou sa politique CORS peuvent changer. Les limites de jour de service autour de minuit restent à vérifier sur le réseau réel. Aucun service worker ne met en cache les réponses.

## Périmètre V1

- Interface responsive, sans dépendances ni ressources externes de présentation.
- Ajout par URL RTC et validation par l’API avant sauvegarde.
- Favoris locaux : parcours du lien ou arrêt complet, renommage, ordre et suppression.
- Passages, direction, temps réel/planifié, annulations et erreurs explicites.
- Pas de backend, compte, import/export ou déploiement automatique.

### Tests de l’interface (facultatifs)

Le serveur doit être démarré sur le port 8080. Ces tests utilisent Chromium installé à `/usr/bin/chromium` et des réponses RTC simulées pour vérifier les interactions et les erreurs de manière reproductible. Ils ne valident pas la connexion directe du navigateur à l’API.

```sh
npm install --prefix /tmp/rtc-browser --cache /tmp/rtc-npm-cache --no-audit --no-fund playwright@1.64.1
NODE_PATH=/tmp/rtc-browser/node_modules node tests/browser.cjs
```

`tests/browser-groups.cjs` couvre les groupes avec une horloge simulée (`page.clock`) : bascule automatique, choix manuel, création, appartenance, suppression.

Les captures de test sont écrites dans `/tmp/rtc-desktop.png` et `/tmp/rtc-mobile.png`. L’installation de Playwright sert uniquement aux tests ; aucun paquet npm n’est nécessaire pour utiliser la page.

## Publication temporaire sur GitHub Pages

Le site est servi directement depuis la branche `main`, dossier `/`, sans workflow de compilation. Le fichier `.nojekyll` indique à Pages de servir les fichiers statiques tels quels. Pour utiliser GitHub Pages sur l’offre gratuite, rendre le dépôt public, puis dans Settings → Pages choisir « Deploy from a branch », branche `main`, dossier `/ (root)`, et enregistrer.

La configuration initiale de Pages et la visibilité du dépôt nécessitent des droits d’administration que l’intégration GitHub de cette session n’expose pas. Une fois Pages activé, les modifications publiées sur `main` mettent à jour le site. Les favoris restent dans le navigateur du visiteur. Pour retirer le site temporaire, utiliser « Unpublish site » dans Settings → Pages.
