# Voidpulse — Architecture

Document de référence (validé). Toute contribution, humaine ou sous-agent, s'y conforme.

## 1. Principes non négociables

1. **Simulation déterministe à tick fixe (60 Hz)**, découplée du rendu. Elle ne dépend ni du DOM, ni de Pixi, ni de React, ni de Capacitor : elle tourne telle quelle dans Node (simulateur d'équilibrage, tests).
2. **Zéro allocation dans la boucle chaude** (voir §5.4).
3. **Données dans `/config`** (JSON typé), **comportements dans `src/content`** (archétypes codés et paramétrés par les données).
4. **Le jeu ne lit que des fichiers audio** (`assets/audio/**`) : aucune synthèse en temps réel. Les compositions Tone.js et les designs SFX ne sont jamais embarqués.
5. **100 % hors ligne** (seule exception : vérification de mise à jour, flavor `github`).
6. TypeScript strict, pas de `any`, ESLint + Prettier, commits conventionnels.

## 2. Stack

| Domaine            | Choix                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| Build              | Vite 8, TypeScript 6 strict (bridé par typescript-eslint, TS 7 plus tard)               |
| Menus              | React 18.3 + Zustand 5 (le HUD n'est pas en React)                                      |
| Jeu                | PixiJS 8 (préférence WebGL), bitecs 0.4                                                 |
| Mobile             | Capacitor 8 (Android uniquement) + `@capacitor/screen-orientation` + plugin natif local |
| Audio              | Web Audio API (moteur maison), WebCodecs + AudioWorklet pour la musique                 |
| Composition / SFX  | Tone.js 15 rendu hors ligne (Chromium headless via Playwright), ffmpeg                  |
| Tests              | Vitest                                                                                  |
| Validation données | zod (tests et scripts uniquement, hors bundle)                                          |
| Release            | semantic-release + GitHub Actions                                                       |

Plugins Capacitor : Haptics, Preferences, Filesystem, App, StatusBar, SplashScreen, LocalNotifications, Share, KeepAwake, ScreenOrientation, CapacitorHttp (appel explicite, pas de patch global de `fetch`).

## 3. Arborescence

```
src/
  engine/     boucle à tick fixe, monde ECS + composants SoA, grille spatiale, pools, RNG, file d'événements
  systems/    input, player (déplacement, dash), ai/*, movement, weapons, projectiles, combat, status,
              resonance, spawn (director), boss, loot, pickups, hazards, runEvents
  content/    archétypes codés : armes, comportements d'IA, patterns de boss, effets de réactions, événements
  modes/      campagne, infini, quotidien, hebdo, boss rush, hardcore, entraînement (objets ModeRules)
  meta/       talents, compte/paragon, ascension, reliques, maîtrise, codex, quêtes, série, saison,
              succès, coffre hors ligne, planification des notifications
  render/     application Pixi, couches, caméra, synchronisation ECS → Particles, FX, chiffres, hud/
  audio/      engine (contexte, bus, master, ducking), music (worker de décodage, worklet mixeur,
              directeur d'intensité), sfx (banque, voix), compositions/ et sfx-design/ (hors bundle)
  save/       emplacements A/B, migrations, instantané de run, export/import
  update/     client GitHub Releases, semver, flux de mise à jour, pont natif
  theme/      jetons, thèmes Arcade / Material You / Clair / Sombre, couleurs dynamiques
  ui/         écrans et composants React
  i18n/       fr (défaut), en, fonction t() typée utilisable par React et Pixi
  platform/   enveloppes Capacitor (haptique, préférences, fichiers, cycle de vie, notifications…)
  state/      stores Zustand
config/       données JSON + schémas zod (et JSON Schema générés pour l'autocomplétion)
sim/          runner headless, bot, rapports d'équilibrage
scripts/      render-music, render-sfx, prepare-track (ffmpeg), build-atlas, ci/
assets/       sources art et icône, audio/music (stems + tracks.json), audio/sfx (+ sfx.json), CREDITS.md
android/      projet Capacitor + plugin natif VoidpulseNative
docs/         ce document, guides (export FL Studio, etc.)
```

**Frontières d'import** (vérifiées par ESLint `no-restricted-imports` et par le typecheck Node de `sim/`) :
`engine`, `systems`, `content`, `modes`, `meta` et la logique de `save` n'importent jamais `pixi.js`, `react`, `@capacitor/*`, ni `render/`, `ui/`, `audio/`, `platform/`. La simulation communique vers l'extérieur uniquement par la file d'événements et par un état lisible.

## 4. Boucle de jeu

```
TICK = 1/60 s
accumulateur += min(dtFrame, 0.25) × timeScale
tant que accumulateur ≥ TICK et ticks < MAX_TICKS_PAR_FRAME (4, ou 5×4 en vitesse ×5 debug) :
    si hitStop > 0 : hitStop -= 1   (tick gelé : la simulation n'avance pas)
    sinon          : simulation.step()
    accumulateur -= TICK
alpha = accumulateur / TICK
rendu(alpha)            ← interpolation prev → cur de chaque entité
consommateurs(événements) ← render FX, audio, haptique, statistiques
```

- Rendu via `requestAnimationFrame`, plafonné à 30 ou 60 fps (réglage). La simulation reste à 60 Hz.
- Pause : la boucle de simulation s'arrête, le rendu continue (flou, menus). Mise en arrière-plan → pause automatique + sauvegarde.

**Ordre d'un tick** : input → player/dash → ai → movement + séparation → reconstruction des grilles → weapons (tirs) → projectiles → collisions/dégâts → status + résonance → morts/loot → pickups/XP → spawn director + boss → recyclage des entités → horloge de run.

**Déterminisme** :

- Flux RNG seedés séparés (`src/engine/rng.ts`, sfc32) : `spawn`, `loot`, `combat`, `ai`, `levelup`, `events`, `cosmetic` (ce dernier n'influence jamais la simulation).
- Interdits dans la simulation : `Math.random`, `Date.now`, `performance.now`, itération sur des `Map`/`Set` dont l'ordre dépend d'entrées non déterministes.
- Conséquences : seed partagée du défi quotidien, simulateur reproductible, **reprise exacte d'une run** (instantané des tableaux de composants + états RNG + horloges).

## 5. ECS et mémoire

### 5.1 Monde

- bitecs 0.4 ; les composants sont des objets de **TypedArrays pré-alloués** de taille `MAX_ENTITIES` (4096), déclarés dans `src/engine/ecs/components.ts`.
- Exemples : `Position {x, y, px, py}` (px/py = position au tick précédent, pour l'interpolation), `Velocity`, `Radius`, `Health`, `Team`, `Enemy {type, behavior, eliteMask}`, `Projectile {weapon, pierce, ttl, element}`, `Marks {mask, t0..t5}`, `Render {atlasFrame, layer, tint, scale}`.
- Les archétypes (ennemi, projectile, gemme, FX de réaction, zone au sol…) ont chacun un **pool** : création = réactivation d'un emplacement libre, destruction = retour au pool. Les ID sont recyclés.

### 5.2 File d'événements

Ring buffer SoA pré-alloué (capacité 8192) : `type:Uint8`, `x,y:Float32`, `a,b:Int32`, `c:Float32`. Émis par la simulation (coup, critique, mort, réaction, level-up, dash, éveil, phase de boss, télégraphe…), lus une fois par frame par le rendu, l'audio, l'haptique et les statistiques de fin de run. En cas de saturation, les événements cosmétiques sont abandonnés en premier ; les événements de gameplay ne le sont jamais.

### 5.3 État lisible

L'UI et le HUD lisent un objet `RunView` mis à jour à chaque tick (PV, XP, niveau, timer, jauge de Résonance, armes, boss). React ne s'abonne qu'aux changements discrets (pause, level-up, fin de run) : aucun re-rendu React pendant l'action.

### 5.4 Règles de la boucle chaude

Dans `systems/`, `content/` et `render/` (partie synchronisation) :

- pas de littéraux objet/tableau, de closures, de `map/filter/forEach/reduce`, de spread, de concaténation de chaînes, de `for…of` ;
- boucles `for` indexées sur les résultats de requêtes et sur les TypedArrays ;
- vecteurs temporaires = variables locales numériques ou scratch pré-alloués au niveau module ;
- aucune création d'objet Pixi : tout est pré-alloué et recyclé.

Vérifié par un bench qui mesure le delta de heap sur 10 s de jeu chargé.

## 6. Collisions

- **Grille spatiale uniforme** (cellule 64 unités monde) couvrant la zone active autour du joueur (≈ 2,5 × l'écran). Reconstruite à chaque tick par tri par comptage : `cellCount`, `cellStart` (préfixe), `cellItems` (`Int32Array`) → O(n), zéro allocation.
- Grilles séparées : ennemis (requêtes des projectiles, du joueur, des réactions de zone) et ramassables (aimant).
- Entités larges (boss, mini-boss, tanks géants) dans une liste à part testée directement.
- **Séparation des foules** : répulsion avec les voisins des 3×3 cellules, plafonnée à N voisins ; au-delà de 400 ennemis, chaque ennemi ne la calcule qu'un tick sur deux (alternance pair/impair).
- Entités sorties de la zone active : repositionnées devant le joueur (ennemis ordinaires) ou recyclées (projectiles, gemmes fusionnées).
- Décors bloquants et zones de terrain (eau lente, coulées de lave, poison…) : grille statique construite au chargement du stage.

## 7. Rendu

- Application Pixi unique, conservée toute la session (jamais détruite : on cache le canvas et on arrête le ticker dans les menus). Préférence WebGL, antialias désactivé, résolution = DPR × échelle de qualité (plafond 2).
- **Couches** (ordre z) : sol/biome → zones au sol et télégraphes → ombres → gemmes → ennemis → joueur → projectiles (additif) → FX (additif) → chiffres de dégâts → HUD.
- Chaque couche massive est un **`ParticleContainer` v8** (objets `Particle`, pas `Sprite`), alimenté par un pool de particules. Un système de synchronisation copie position interpolée, rotation, échelle, teinte et frame depuis l'ECS.
- **Atlas** généré au build (`scripts/build-atlas.ts`) : sources SVG (vectoriel néon) → resvg → packing → PNG + JSON Pixi. Chaque sprite possède une frame « flash blanc » et un halo néon **pré-calculé** : aucun filtre en temps réel.
- Chiffres de dégâts : glyphes de l'atlas dans un ParticleContainer, agrégés par cible sur une courte fenêtre.
- Game feel : hit stop (ticks gelés, limité aux gros événements), screen shake (amplitude réglable), flash blanc, knockback, gemmes aspirées, explosions de particules.
- **Qualité** : particules (off / réduites / complètes), ombres, chiffres de dégâts, échelle de résolution, 30/60 fps.
- **HUD** en Pixi (`render/hud/`) : PV, XP, niveau, timer, jauge de Résonance, armes/passifs, barre de boss, joystick, recharge du dash. Taille réglable ; teinte d'accent Material You en option.

## 8. Résonance (mécanique signature)

- Six éléments, chacun avec un statut de base : **feu** (brûlure), **givre** (froid cumulatif → gel), **foudre** (électrisé : petit arc vers un voisin), **poison** (toxine cumulable), **arcane** (marque : dégâts subis augmentés), **vide** (entropie : % PV max + légère attraction).
- Chaque ennemi porte ses marques (`mask` + minuteur par élément). Un coup d'élément B sur une marque A ≠ B déclenche la réaction {A, B}, consomme les deux marques et lance une entité FX poolée. Recharge interne de 0,4 s par ennemi.
- **Jauge** : gain par réaction, bonus de diversité (paires distinctes sur 10 s glissantes), rendement décroissant sur une même paire répétée.
- **Éveil (8 s)** quand la jauge est pleine : chaque coup porte tous les éléments équipés, et un ultime fusionné dont la forme dépend de la paire dominante. Côté musique : filtre qui s'ouvre, pitch +1 demi-ton, saturation.

|            | Givre                    | Foudre                          | Poison                                 | Arcane                                  | Vide                                          |
| ---------- | ------------------------ | ------------------------------- | -------------------------------------- | --------------------------------------- | --------------------------------------------- |
| **Feu**    | Vapeur : nuage aveuglant | Surcharge : explosion + recul   | Déflagration : les toxines explosent   | Nova : salve de critiques en cercle     | Flamme noire : % PV max, se propage           |
| **Givre**  |                          | Supraconduction : armure brisée | Cristaux nécrotiques : éclats toxiques | Prisme : gel + rayons réfractés         | Zéro absolu : stase, exécution sous 15 % PV   |
| **Foudre** |                          |                                 | Chaîne toxique : arcs qui empoisonnent | Surtension : orbe d'arcs en orbite      | Faille : téléporte et regroupe les ennemis    |
| **Poison** |                          |                                 |                                        | Fléau : contagion des statuts à la mort | Corrosion : armure fondue + DoT % PV max      |
| **Arcane** |                          |                                 |                                        |                                         | Implosion : puits gravitationnel + détonation |

## 9. Systèmes de run

- **Director de spawn** : timeline JSON par stage (vagues scénarisées, formations en anneau, ligne, essaim, embuscade) + budget de densité continu fonction du temps, de l'Ascension, des pactes et du mode. Mini-boss à 5 et 10 min, boss à 15 min ; Infini : boss toutes les 10 min, montée sans plafond.
- **Boss** : machine à états par phases (seuils de PV). Chaque pattern est une séquence en données `télégraphe → exécution → récupération`, avec zones au sol, invocations, et phase de rage (< 25 % PV). Sons dédiés : apparition, télégraphe, changement de phase, mort.
- **Armes** : ~10 archétypes codés (projectile, orbite, rayon, nova, boomerang, chaîne, aura, mines, tête chercheuse, zone persistante) ; les 30 armes et leurs 30 évolutions sont des paramètres de ces archétypes. Évolution = arme au niveau max + passif requis, obtenue dans un coffre d'élite.
- **Ennemis** : 7 comportements (essaim, tank, tireur, invocateur, kamikaze, bouclier, téléporteur) × données (40 types). Élites : affixes aléatoires (rapide, régénération, fractionnement, aura glaciale…).
- **Montée de niveau** : 3 cartes ; reroll, bannir, verrouiller en quantités limitées (augmentées par les talents).
- **Événements** : marchand, autel de sacrifice, horde dorée, faille temporelle.
- **Pactes** : chaque pacte a une valeur de « chaleur » ; la somme détermine le rang de la run (C → SSS) et le multiplicateur de score.
- **Modes** : un objet `ModeRules` (seed, durée, modificateurs de spawn, règles de mort, récompenses, pistes musicales) par mode ; le cœur de la simulation ne connaît pas les modes.

## 10. Méta et rétention

Modules purs (entrée : profil + événements de run ; sortie : nouveau profil), testés unitairement : talents (60+ nœuds), niveau de compte + Paragon illimité, Ascension (20 paliers par stage), reliques (3 emplacements, rareté, amélioration, reroll), maîtrise d'arme, codex, quêtes (3 quotidiennes, 5 hebdomadaires), série de connexion, passe de saison (50 paliers, cycle de 6 semaines calculé depuis une époque fixe), 200 succès, coffre hors ligne plafonné. Horloge : temps local de l'appareil, protégé contre les retours en arrière.

## 11. Audio

### 11.1 Graphe

```
musique (worklet) ─► filtre passe-bas ─► saturation ─► envoi réverb ─► ducking ─► bus Musique ─┐
SFX (voix)  ─► panoramique ─► bus Effets ────────────────────────────────────────────────────────┤
UI ─► bus UI ────────────────────────────────────────────────────────────────────────────────────┼─► EQ graves/aigus ─► compresseur ─► limiteur ─► sortie
ambiance ─► bus Ambiance ────────────────────────────────────────────────────────────────────────┘
```

`AudioContext({ latencyHint: 'interactive', sampleRate: 48000 })`. Suspendu en arrière-plan, repris proprement au retour (et au premier geste si le navigateur l'exige).

### 11.2 Musique en streaming

Décoder des stems en `AudioBuffer` coûte ~23 Mo par minute et par stem (float32, 48 kHz, stéréo) : inacceptable sur mobile. Le moteur **streame** :

- un **Worker** démultiplexe les fichiers Ogg et décode l'Opus avec WebCodecs `AudioDecoder` ;
- il envoie le PCM (buffers transférés, via un `MessageChannel` direct) à un **AudioWorklet mixeur** qui lit tous les stems en phase à l'échantillon près, gère intro et boucle, applique les gains par couche (rampes) et le varispeed (pitch de l'Éveil) ;
- mémoire ≈ taille compressée ; repli si WebCodecs indisponible : `decodeAudioData` à 24 kHz.

Les versions calme et intense d'un stage partagent **BPM, durée et points de boucle** : elles tournent en parallèle dans le worklet, le crossfade n'est qu'un jeu de gains.

### 11.3 Musique dynamique

- Intensité brute = f(densité d'ennemis proches, PV du joueur, élites, boss), lissée (montée rapide ~1,5 s, descente lente ~6 s), convertie en paliers 0 → 3 avec hystérésis. Fonction pure, testée.
- Chaque stem déclare son palier d'entrée (`enterAt`) ; les changements sont **quantifiés à la mesure suivante**, avec un temps minimal de 2 mesures par palier. Au palier 3 : crossfade vers la version intense sur 2 mesures.
- Effets continus : passe-bas qui s'ouvre avec l'intensité, réverb et volume dynamiques.
- Éveil : montée de filtre, pitch +1 demi-ton, saturation pendant 8 s. Ducking léger sur boss, éveil, level-up.
- Pause et menus : musique filtrée et atténuée, jamais coupée. Transitions menu ↔ jeu ↔ boss ↔ fin de run par crossfades calés sur la mesure.

### 11.4 `assets/audio/music/tracks.json`

Seul contrat entre le moteur et la musique. Deux formes par piste : **stems** ou **fichier unique** (crossfade + effets seulement).

```jsonc
{
  "version": 1,
  "tracks": [
    {
      "id": "stage1-calm",
      "title": "Forêt brumeuse (calme)",
      "bpm": 100,
      "timeSignature": [4, 4],
      "key": "E dorien",
      "gainDb": 0,
      "loopStart": 9.6, // secondes : fin de l'intro = début de la boucle
      "loopEnd": 86.4, // secondes
      "group": "stage1", // pistes jouées en phase (calme / intense)
      "stems": [
        { "layer": "pads", "file": "stage1-calm/pads.ogg", "enterAt": 0 },
        { "layer": "bass", "file": "stage1-calm/bass.ogg", "enterAt": 0 },
        { "layer": "arp", "file": "stage1-calm/arp.ogg", "enterAt": 0 },
        { "layer": "drums", "file": "stage1-calm/drums.ogg", "enterAt": 1 },
        { "layer": "lead", "file": "stage1-calm/lead.ogg", "enterAt": 2 },
      ],
      // ou : "file": "stage1-calm.ogg"
    },
  ],
  "bindings": {
    "menu": "menu",
    "stages": { "1": { "calm": "stage1-calm", "intense": "stage1-intense" } },
    "boss": "boss",
    "finalBoss": "final-boss",
    "endOfRun": "end-of-run",
  },
}
```

Remplacer une piste = déposer les fichiers et mettre à jour son entrée ; aucune modification de code.

### 11.5 Effets sonores

- **Sons originaux** synthétisés hors ligne (Tone.js, `src/audio/sfx-design/`) et pré-rendus en OGG 48 kHz : aucune licence tierce. `assets/audio/CREDITS.md` le documente ; un son peut être remplacé plus tard par un échantillon CC0 en déposant le fichier et en mettant à jour `sfx.json`.
- Manifeste `assets/audio/sfx/sfx.json` : `id → { files (3 à 5 variantes), bus, gainDb, pitchVar (±5 %), volVar, maxVoices, priority, cooldownMs }`.
- Buffers décodés au début du stage. Limite de voix par type avec priorité (vol de la voix la plus ancienne et la moins prioritaire). Panoramique selon la position à l'écran ; mode casque = panoramique élargi + effet Haas.
- Sons distincts par arme, par élément, pour chacune des 15 réactions, et pour les boss (apparition, télégraphe, phase, mort).

### 11.6 Pipelines hors ligne

- `scripts/render-music` : Playwright + Chromium → chaque couche rendue seule par `Tone.Offline` → WAV → ffmpeg. **Normalisation sur la somme des stems** (-14 LUFS intégrés, -1 dBTP) puis **même gain appliqué à chaque stem** (normaliser chaque stem séparément casserait le mix). Queues de réverb/delay repliées sur le début de boucle. Encodage Opus 128 kbps. Génère `tracks.json`.
- Sidechain de la basse = automation de gain calée sur le kick (fonctionne en rendu solo). Pas de compression non linéaire sur le master au rendu : la somme des stems reste identique au mix.
- `scripts/render-sfx` : même chaîne pour les effets → `sfx.json`.
- `scripts/prepare-track` (futures pistes FL Studio) : conversion Opus, normalisation -14 LUFS sur la somme, détection du BPM et suggestion des points de boucle, écriture de l'entrée `tracks.json`. Guide d'export dans le README.

## 12. Sauvegarde

- Profil dans `Filesystem` (`Directory.Data`) sur **deux emplacements alternés** A/B : `{ magic, schemaVersion, seq, savedAt, checksum, payload }`. Au chargement : emplacement valide au `seq` le plus élevé.
- **Migrations** versionnées `vN → vN+1`, testées.
- **Instantané de run** (même mécanisme A/B) : au level-up, en pause, à la mise en arrière-plan et toutes les 60 s → reprise exacte.
- Réglages dans `Preferences` (chargement rapide au démarrage).
- Export / import d'un fichier (Share + sélecteur de fichier).

## 13. Mises à jour in-app et distribution

- Deux flavors Android : **`github`** (APK, updater actif, permission `REQUEST_INSTALL_PACKAGES`) et **`play`** (AAB, sans updater ni permission ; Google Play interdit l'auto-mise à jour hors Play).
- Au lancement (≤ 1 fois / 24 h) et sur demande : `GET /repos/{owner}/{repo}/releases/latest` (ou liste si pré-releases incluses) via `CapacitorHttp` ; comparaison semver avec la version installée ; bottom sheet (version, changelog, taille, « Mettre à jour » / « Plus tard » / « Ignorer cette version »). Jamais pendant une run.
- Plugin natif `VoidpulseNative` : téléchargement avec reprise (`Range`), progression, vérification SHA-256, installation via FileProvider + `ACTION_VIEW`, redirection vers « Sources inconnues » ; couleurs Material You (`system_accent*`), mode immersif, informations de build (flavor).
- Owner/repo : `config/app.json` (`karelisio/voidpulse`).

## 14. UI, thèmes, i18n, accessibilité

- Menus et écrans de pause (level-up, pactes, marchand, coffres, fin de run) en React ; HUD en Pixi.
- Thèmes via jetons CSS : Arcade (défaut), Material You (couleurs Monet, composants M3 maison : navigation bar, cartes, chips, bottom sheets, FAB), Clair, Sombre. Le jeu garde sa DA.
- Portrait par défaut, paysage en option. Bouton retour Android géré par une pile de navigation.
- i18n : français par défaut, anglais ; clés typées, `t()` commun à React et Pixi.
- Accessibilité : palettes daltoniennes (les éléments ont aussi une forme/icône propre), réduction des flashs, taille du HUD.
- Contrôles : joystick flottant sous le pouce, sensibilité, option main gauche ; tir automatique, visée auto (ennemi le plus proche) ou directionnelle ; dash au tap du second pouce.
- Menu debug caché (7 taps sur le numéro de version) : FPS, entités, spawn manuel, invincibilité, vitesse ×5, visualiseur d'intensité musicale.

## 15. Android

`appId` `com.karelisio.voidpulse`, minSdk 24, targetSdk = dernière stable. Permissions : INTERNET, VIBRATE, POST_NOTIFICATIONS (demandée seulement si les notifications sont activées), REQUEST_INSTALL_PACKAGES (flavor `github` uniquement). Icône SVG néon, adaptative + monochrome, splash clair/sombre via `@capacitor/assets` (sources dans `assets/`). La compilation native est vérifiée dans GitHub Actions.

## 16. CI/CD et conventions

- **Commits conventionnels** obligatoires (`feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`, `build:`), vérifiés par un hook husky local et par la CI (titre de PR + commits).
- `ci.yml` (PR) : commitlint, lint, format, typecheck, tests, build.
- `release.yml` (push sur `main`) : semantic-release calcule la version (feat → mineure, fix/perf → patch, BREAKING → majeure ; rien si aucun commit pertinent) ; l'étape `prepare` compile APK et AAB signés (`versionName` = version, `versionCode` = MAJEURE×1 000 000 + MINEURE×1 000 + PATCH) ; publication du tag et de la release (`voidpulse-vX.Y.Z.apk`, `.sha256`, AAB, notes générées). Toujours le même keystore.
- Stems OGG commités ; Git LFS pour les sources lourdes (WAV, MP3, FLAC, AIFF, FLP).
- Code : fichiers de modules en camelCase, composants React en PascalCase, tests co-localisés `*.test.ts`, commentaires en français, concis.

## 17. Délégation et critères de fin

| Qui    | Périmètre                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead   | Architecture, moteur, collisions, perf, cœur du rendu et atlas, moteur audio, compositions, Résonance, boss, director, formules de combat, archétypes, équilibrage et simulateur, revue et intégration                    |
| Sonnet | Écrans React, composants M3 et thèmes, HUD, quêtes/succès/codex/saison/série/coffre hors ligne/notifications, sauvegarde, updater + plugin natif, workflows CI/release, variantes SFX sur presets, icône/splash, tutoriel |
| Haiku  | JSON de config d'après les schémas, traductions EN, icônes SVG simples (guide de style), tests unitaires simples, README                                                                                                  |

Chaque tâche déléguée reçoit : fichiers concernés, interfaces TypeScript déjà posées, critères de fin. **Terminé = `npm run check` vert** (lint, typecheck, tests, build) + relecture du diff par le lead avant intégration.
