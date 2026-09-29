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
  render/     application Pixi, couches, caméra, atlas néon, synchronisation ECS → Particles, FX, chiffres, HUD
  game/       colle entre simulation et plateforme : hôte de partie (boucle, rendu, audio), entrées tactiles
              et clavier, game feel (événements → FX, caméra, hit stop, haptique, audio)
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
scripts/      render-music, render-sfx, render-assets, prepare-track (ffmpeg), release/
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

- Les composants sont des objets de **TypedArrays pré-alloués** de taille `MAX_ENTITIES` (8192), déclarés dans `src/engine/components.ts` : `Pos {x, y, px, py}` (px/py = position au tick précédent, pour l'interpolation), `Vel`, `Body`, `Life`, `Look`, `Foe`, `Status` (dont les marques élémentaires), `Shot`, `Bullet`, `Gem`, `Zone`, `Orbit`…
- Les archétypes (joueur, boss, ennemis, projectiles, balles ennemies, orbes, gemmes et pièces, zones, coffres) ont chacun un **pool** (`EntityPool`) créé une fois : plage d'ID réservée, liste dense des actifs (`Int32Array`, retrait par échange), itération à rebours quand on détruit. Création = réactivation d'un emplacement libre, remise à zéro des **seules colonnes de son archétype** (`ARCHETYPES` dans `engine/world.ts`, liste précalculée par pool). Invariant testé : aucun système n'écrit une colonne hors de l'archétype de l'entité.
- bitecs 0.4 ne sert que de registre (création du monde et des ID au démarrage) : son `addEntity`/`addComponent` alloue (Set, closures), incompatible avec la règle « zéro allocation » de la boucle chaude.
- Les tableaux de composants sont **globaux au module** : une seule `RunSim` active à la fois (les tests et le simulateur d'équilibrage enchaînent les parties, ils ne les entrelacent pas).

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
- Zones de terrain (eau lente, glace, bourbier) : `count` plaques permanentes (zones `TERRAIN`) autour du joueur, replacées hors champ au-delà de 900 unités (`systems/stagefx.ts`) ; le ralentissement des ennemis y est appliqué un tick sur six par zone via la grille.

## 7. Rendu

- Application Pixi unique, conservée toute la session (jamais détruite : on cache le canvas et on arrête le ticker dans les menus). Préférence WebGL, antialias désactivé, résolution = DPR × échelle de qualité (plafond 2).
- **Couches** (ordre z) : sol/biome → zones au sol et télégraphes → ombres → gemmes → ennemis → joueur → projectiles (additif) → FX (additif) → chiffres de dégâts → HUD.
- Chaque couche massive est un **`ParticleContainer` v8** (objets `Particle`, pas `Sprite`), alimenté par un pool de particules. Un système de synchronisation copie position interpolée, rotation, échelle, teinte et frame depuis l'ECS.
- **Atlas** dessinés au démarrage (`render/atlas.ts`) en Canvas2D : tracés vectoriels néon (halo par `shadowBlur`), packing en étagères, largeur 1024 logique à résolution 2, hauteur ajustée au contenu. Planche **principale** : tout ce que dessinent les ParticleContainer (une seule source de texture par couche) — ennemis (`render/enemy-art.ts`, un dessin par type, avant du sprite vers +x), décors d'événements (`render/prop-art.ts`), projectiles, zones et dangers, surcouches, effets, chiffres. Planche **annexe** : vaisseaux des pilotes et icônes (sprites simples). **Boss** (`render/boss-art.ts`, un dessin par boss, avant vers +x) : une texture par boss dessinée à sa première apparition (normal + flash), mise en cache ; le sprite se tourne vers le joueur. Chaque sprite possède une frame « flash blanc » et son halo **pré-calculé** : aucun filtre en temps réel. Les images blanches (zones, dangers, surcouches, balles ennemies) sont teintées au rendu. Choix : aucune dépendance native (resvg) ni fichier binaire à versionner, rendu identique partout, quelques dizaines de ms au lancement.
- **Surcouches d'ennemis** (couche des marques, additive) : halo d'élite, arc de bouclier frontal orienté (vif tant qu'il est intact), bulle d'absorption, hexagone de protection d'un soutien, anneau d'aura (aura glaciale, rayon des soutiens), marque élémentaire. **Flèches** au bord de l'écran vers le marchand, l'autel, la faille, les élites et les coffres hors champ ; voile violet pendant le temps suspendu.
- **Décor par stage** (`render/background.ts`) : sol en tuile aux couleurs de `stage.palette` avec les détails du biome (mousses, dunes et éclats, bulles, fissures, panneaux, cristaux, roseaux, runes) et voile en parallaxe (brume, cendres qui montent, neige, étoiles). Surcouches de mécanique : brume (seul un disque de 230 unités autour du joueur reste visible), blizzard (voile glacé).
- Chiffres de dégâts : glyphes de l'atlas dans un ParticleContainer, agrégés par cible sur une courte fenêtre.
- Game feel : hit stop (ticks gelés, limité aux gros événements), screen shake (amplitude réglable), flash blanc, knockback, gemmes aspirées, explosions de particules.
- **Qualité** : particules (off / réduites / complètes), ombres, chiffres de dégâts, échelle de résolution, 30/60 fps.
- **HUD** en Pixi (`render/hud/`) : PV, XP, niveau, timer, jauge de Résonance, armes/passifs, barre de boss, joystick, recharge du dash. Taille réglable ; teinte d'accent Material You en option.

## 8. Résonance (mécanique signature)

- Six éléments, chacun avec un statut de base (réglages : `config/status.json`, puissance = statistique `status` de l'arme × passifs) : **feu** (brûlure : dps pendant 2,5 s), **givre** (froid cumulatif → gel 1,2 s ; boss : ralentissement plafonné, jamais gelés), **foudre** (électrisé : +15 % de dégâts de foudre subis et 20 % de chance qu'un coup reçu projette un petit arc vers un voisin), **poison** (toxines : charges cumulables jusqu'à 12, dps par charge), **arcane** (exposition : dégâts subis de toutes sources +x %, plafonnée à 60 %), **vide** (entropie : fraction des PV max par coup, ÷10 contre les boss, et légère attraction vers l'origine du coup).
- Formule (testée) : `dégâts = base × (critique ? multCrit : 1) × (1 + exposition + fragilité + électrisation[foudre]) + entropie × PV max`. Les multiplicateurs du joueur (dégâts, noyau de l'élément) sont appliqués par l'arme ; les dégâts sur la durée tombent toutes les 0,5 s et sont crédités à l'arme source (brûlure, toxines) ou aux réactions (flamme noire, corrosion).
- Un coup « statut seul » (réactions, éclats, arcs) applique le statut sans poser de marque : les réactions ne s'enchaînent pas en cascade infinie.
- Chaque ennemi porte ses marques (`mask` + minuteur par élément). Un coup d'élément B sur une marque A ≠ B déclenche la réaction {A, B}, consomme les deux marques et lance une entité FX poolée. Recharge interne de 0,4 s par ennemi.
- **Jauge** : gain par réaction, bonus de diversité (paires distinctes sur 10 s glissantes), rendement décroissant sur une même paire répétée.
- **Éveil (8 s)** quand la jauge est pleine : chaque coup porte tous les éléments équipés, recharges ×0,6, impulsion toutes les 0,7 s (un élément équipé différent à chaque fois) accompagnée de l'effet de la **réaction dominante** (la plus fréquente sur les 30 dernières secondes) : c'est l'ultime fusionné. L'Éveil se termine par une détonation (rayon 300) qui rejoue la réaction dominante en grand. Côté musique : filtre qui s'ouvre, pitch +1 demi-ton, saturation.

Effets implémentés (`src/systems/resonance.ts`, un test par réaction) : vapeur (nuage aveuglant qui ronge, fusionné s'il se chevauche), surcharge (explosion + recul), supraconduction (étourdissement + fragilité), déflagration (consomme les toxines de la cible : dégâts accrus par charge, brûlure en zone), nova (8 éclats critiques), flamme noire (4 %/s des PV max, se propage à la mort), cristaux nécrotiques (6 éclats toxiques), prisme (gel + 3 rayons exposants), zéro absolu (stase, exécution sous 15 % PV hors boss), chaîne toxique (5 arcs empoisonnés), surtension (orbe en orbite qui foudroie, 3 au plus), faille (regroupe les ennemis au point de réaction), fléau (à la mort, statuts et marques transmis aux voisins), corrosion (fragilité + 1,5 %/s des PV max), implosion (puits qui aspire 1,1 s puis détone).

|            | Givre                    | Foudre                          | Poison                                 | Arcane                                  | Vide                                          |
| ---------- | ------------------------ | ------------------------------- | -------------------------------------- | --------------------------------------- | --------------------------------------------- |
| **Feu**    | Vapeur : nuage aveuglant | Surcharge : explosion + recul   | Déflagration : les toxines explosent   | Nova : salve de critiques en cercle     | Flamme noire : % PV max, se propage           |
| **Givre**  |                          | Supraconduction : armure brisée | Cristaux nécrotiques : éclats toxiques | Prisme : gel + rayons réfractés         | Zéro absolu : stase, exécution sous 15 % PV   |
| **Foudre** |                          |                                 | Chaîne toxique : arcs qui empoisonnent | Surtension : orbe d'arcs en orbite      | Faille : téléporte et regroupe les ennemis    |
| **Poison** |                          |                                 |                                        | Fléau : contagion des statuts à la mort | Corrosion : armure fondue + DoT % PV max      |
| **Arcane** |                          |                                 |                                        |                                         | Implosion : puits gravitationnel + détonation |

## 9. Systèmes de run

- **Director de spawn** : timeline JSON par stage (vagues scénarisées, formations en anneau, ligne, essaim, embuscade) + budget de densité continu fonction du temps, de l'Ascension, des pactes et du mode. Mini-boss à 5 et 10 min, boss à 15 min ; Infini : boss toutes les 10 min, montée sans plafond.
- **Stages** (`config/stages/*.json`) : 8 stages de campagne de 15 min (`order` 1-8), chacun avec biome, palette, 5 ennemis propres, 11 vagues, courbes de densité et de PV croissantes avec l'ordre, et une **mécanique** (`systems/stagefx.ts`, cycle `every`/`length`) : brume (vision réduite), tempête de verre (impacts annoncés autour du joueur), eaux lentes (ralentissent joueur et ennemis), coulées de lave (bande annoncée 1,6 s puis chaîne de flaques brûlantes), apesanteur (inertie du joueur), glace (glissade) et blizzard (ralentissement), bourbier (lent et toxique), puits du vide (attire joueur et ennemis). `proto` reste le stage du banc d'essai.
- **Boss** (`config/bosses.json`, `systems/boss.ts`) : 16 boss, un mini-boss et un boss final par biome. Machine à états par phases (seuils de PV) : chaque motif suit `télégraphe → exécution → récupération`. 11 motifs : salve radiale, charge, invocation, spirale, onde de choc, pluie (impacts annoncés), mur (anneau de balles avec une brèche), laser (ligne annoncée puis rayon), éventail, clignement (marque, téléportation, salve) et zone au sol. Phase de rage (< 25 % PV, ou d'emblée avec le pacte « Colère du gardien »). Mini-boss à 5 et 10 min (PV ×1,6 au second passage, coffre à la mort, la partie continue), boss final à 15 min (victoire) ; densité ×0,6 pendant un mini-boss, ×0,4 pendant le boss final. Sons dédiés : apparition, télégraphe, changement de phase, mort ; bandeau « MINI-BOSS » / « BOSS FINAL ».
- **Progression de campagne** (`meta/stages.ts`) : le stage 1 est ouvert, chaque boss final vaincu ouvre le suivant ; records par stage (score, temps, rang en victoire) et boss déjà vaincus (`profile.bosses`, base des récompenses de méta) dans la sauvegarde.
- **Armes** : 10 archétypes codés (projectile, orbite, rayon, nova, boomerang, chaîne, aura, mines, tête chercheuse, zone) × 3 = 30 armes, 5 par élément (`config/weapons.json` : statistiques de base, 7 niveaux de deltas, paramètres d'archétype). Chaque arme a une évolution (statistiques et paramètres propres) : arme au niveau max + passif requis possédé, obtenue dans un coffre d'élite. Les passifs (25, dont un « noyau » par élément) modulent dégâts, statuts, zone, durée, vitesse des projectiles, recharges, quantité, critiques, armure, régénération, chance, XP, fragments, dash et jauge ; tout passif sert au moins une évolution.
- **Élites** : une élite toutes les 55 s (dès 45 s) parmi les types du moment (hors kamikazes) : PV ×9, taille ×1,35, dégâts ×1,5, XP ×8 ; elle lâche un **coffre** (tirage déterministe à l'ouverture : évolution prioritaire, sinon montées de niveau, sinon soin ou fragments ; 1, 3 ou 5 récompenses selon la chance), révélé par une animation de tirage dans l'interface.
- **Ennemis** (`config/enemies.json`, `systems/enemies.ts`) : 40 types, 5 par biome, plus la horde dorée. 13 comportements : essaim, tank, tireur (éventail, tireur d'élite à ligne de visée), kamikaze (épines, flaque), téléporteur (destination marquée), invocateur (incantation puis créatures, plafonnées par la densité visée), bouclier (arc frontal qui absorbe les coups venus de face, pivote à vitesse limitée : on le contourne ; les dégâts sur la durée l'ignorent), chargeur (élan télégraphié par une bande au sol, ruée, récupération), mortier (obus qui vise la position anticipée, cible au sol), tourelle (salves en étoile qui tournent), soutien (protection : dégâts subis ×0,5, ou soins périodiques), fouisseur (enfoui : ni ciblable ni en collision, surgit sous le joueur après une alerte), ruée (ligne droite). Traits en paramètres : ondulation, bonds, traînée de lave, fission à la mort, flaque à la mort, givre qui ralentit le joueur. Paramètres lus en colonnes (`ENEMY_PARAM[clé][type]`) : aucune table de hachage dans la boucle chaude. Dans la faille temporelle, déplacements, minuteurs, zones et projectiles ennemis tournent au ralenti.
- **Élites** (`systems/elites.ts`, `config/affixes.json`) : 1 à 3 affixes selon le temps (`progression.elite.affixes`), tirés parmi ceux compatibles avec le comportement : rapide, régénération, fractionnement (3 copies à 30 % des PV), aura glaciale, blindé (dégâts ×0,55, insensible au recul), bouclier (bulle de 40 % des PV, rechargée après 5 s sans coup), instable (explosion différée à la mort), invocateur, téléporteur, enragé (sous 50 % PV), incandescent (traînée de flammes), artilleur (salves en étoile). Un bandeau annonce l'élite et ses affixes ; elle lâche un coffre et de l'or.
- **Vagues scénarisées** (`stage.waves`) : anneau, ligne, essaim, tenaille (deux essaims opposés), escorte (meneur, élite au besoin, et sa garde), ruée (ligne qui traverse le champ).
- **Or** : pièces (gemmes de type pièce, aimantées) lâchées par la horde dorée, les élites et 1,2 % des ennemis (jamais les créatures invoquées) ; il paie le marchand et l'autel, le reste rejoint les fragments de méta.
- **Événements** (`systems/runevents.ts`, `config/runevents.json`) : calendrier imposé par le stage (`stage.runEvents`) ou tiré au hasard (premier à 75 s puis toutes les 95 à 130 s, les quatre types passent avant une répétition, jamais pendant le boss ni 35 s avant). **Marchand** ambulant (45 s) : trois offres tirées (soins, forge d'une arme, passif, PV max, relances, coffre scellé), prix croissant avec le temps. **Autel de sacrifice** : rester 1,6 s dans son cercle ; offrande de sang (30 % des PV actuels → coffre de 3 récompenses), de chair (−15 PV max → +12 % de dégâts) ou d'or (moitié de l'or → évolution, sinon deux niveaux d'armes). **Horde dorée** (16 s) : lignes de scarabées qui traversent le champ, riches en or et en XP. **Faille temporelle** : y entrer suspend le temps 8 s (ennemis et projectiles ×0,3, XP ×1,5, musique ralentie et feutrée).
- **Montée de niveau** : 3 cartes ; reroll, bannir, verrouiller en quantités limitées (augmentées par les talents).
- **Personnages** (`config/characters.json`) : 12 pilotes, chacun avec arme de départ, passif (statistiques de personnage, malus permis, et bonus propres : dégâts sur gelés ou électrisés, charges de toxines, soins reçus, relances) et dash (`systems/dash.ts`) : standard, transfert glacé (téléportation qui gèle au départ), éclair (foudroie le trajet), nuée (flaque toxique), déphasage, faille (aspire à l'arrivée), charge (renverse), double saut (2 charges), floraison (soin), charge creuse (mine), glissade, stase (fige à l'arrivée). Déblocages selon la carrière (`meta/unlocks.ts`) ; 4 pilotes au départ.
- **Pactes** (`config/pacts.json`, `systems/pacts.ts`) : 12 paires malus/bonus, choisies au départ (0 à 3 parmi 6) et aux paliers (un de plus parmi 3). Modificateurs cumulés (`state.pacts.mods`) lus par les systèmes : vitesse, PV et dégâts des ennemis, densité, fréquence et affixes des élites, boss enragé, sans soin, sans dash, contre XP, dégâts, or, chance, zone, vitesse, récompenses de coffre. La somme des chaleurs donne le rang (C → SSS) et multiplie le score de fin (éliminations, élites, boss, temps, victoire).
- **Modes** (`config/modes.json`, `src/modes/`) : chaque mode traduit le choix du joueur en options de run et en **règles génériques** (`RunRules`, `state.rules`) ; la simulation ne connaît pas les modes. Règles : modificateurs de base (mêmes clés que les pactes, sans chaleur), partie sans fin (boss toutes les `bossEvery` s : mini-boss puis boss du stage, puis boss finaux des autres secteurs, PV +35 % par apparition ; au-delà de la fin prévue, PV, dégâts et densité des ennemis montent sans limite, densité plafonnée ; vagues rejouées en boucle), file de boss (sans foule, répit, soin et coffre entre deux boss, victoire après le dernier), bac à sable, éléments permis, PV fixés, build de départ.
  - **Campagne** / **Hardcore** : secteurs successifs ; Hardcore double les fragments ramenés, la mort en coûte la moitié.
  - **Infini** : classement local (10 meilleurs temps).
  - **Défi du jour** : graine `daily-AAAA-MM-JJ` (jour local), pilote, secteur et 2 pactes tirés ; l'essai compté est pris au lancement (quitter ne le rend pas), les suivants sont hors classement ; historique de 14 jours.
  - **Défi de la semaine** : semaine ISO, une règle parmi 8 (tout en givre, boss uniquement, un seul PV, canon de verre, marée, chasse aux élites, frénésie, brasier), meilleur score de la semaine.
  - **Boss Rush** : les 16 boss dans l'ordre de la campagne avec un build choisi (4 armes niveau 5, 3 passifs niveau 3) ; meilleur temps.
  - **Entraînement** : bac à sable invincible, atelier (armes, passifs, évolutions, ennemis, élites, boss au choix, nettoyage, vitesse) et DPS glissant sur 5 s ; aucune statistique ni récompense.
  - Fragments nets de chaque partie versés au portefeuille (`wallet`), base de la méta (4.8).

## 10. Méta et rétention

Modules purs (entrée : profil + événements de run ; sortie : nouveau profil), testés unitairement.

**Méta** (`src/meta/`, `config/talents.json`, `config/meta.json`) :

- **Fragments** : l'or net de chaque partie est versé au portefeuille (×2 en Hardcore, moitié perdue à la mort ; × bonus de talents et d'Ascension). Il paie talents, reliques et forge.
- **Talents** (`talents.ts`) : 64 nœuds en 4 branches (Assaut, Rempart, Résonance, Fortune) de 8 paliers × 2 ; un nœud s'ouvre dès qu'un nœud du palier précédent a un rang ; rangs à coût croissant ; réinitialisation remboursée. Effets : statistiques de pilote, résurrections, bonus de fragments et d'XP de compte.
- **Compte** (`account.ts`) : XP = score × 0,25 (× talents × Ascension), courbe 80 × niveau^1,3 jusqu'au niveau 50 (fragments à chaque niveau ; forge au 3, 2ᵉ emplacement de relique au 4, Ascension au 5, 3ᵉ emplacement au 10), puis niveaux **Paragon** illimités (12 000 XP) : un point par niveau à placer dans 10 statistiques plafonnées (150 à 250 points), redistribuable.
- **Ascension** (`ascension.ts`) : 20 paliers par stage ; le palier N applique les modificateurs des paliers 1 à N (mêmes clés que les pactes, sans chaleur) et multiplie les récompenses (+12 % par palier) ; une victoire au palier le plus haut ouvert ouvre le suivant.
- **Reliques** (`relics.ts`) : base (statistique signature), rareté (commune → légendaire : 1 à 4 secondaires tirées, ×1 à ×2), niveau 1-10 (+10 %/niveau) ; amélioration, relance des secondaires, recyclage, caches de la forge. Chaque mini-boss lâche sa relique (rare au moins) à sa première défaite ; tout boss a 15 % de chance d'en lâcher une.
- **Maîtrise** (`mastery.ts`) : XP = dégâts infligés × 0,01 ; 10 rangs, +2 % de dégâts par rang pour l'arme ; apparences aux rangs 3, 6 et 10 (teinte des tirs ; les images colorées d'origine passent en version blanche teintée).
- **Codex** (`codex.ts`) : ennemis tués, armes et évolutions utilisées, réactions déclenchées, boss vaincus ; fragments à 25, 50, 75 et 100 % de chaque catégorie.
- **En partie** (`bonus.ts` → `RunOptions.meta`) : statistiques cumulées (talents + Paragon + reliques) appliquées comme un passif de personnage, résurrections (mi-PV, 2,5 s d'invulnérabilité), dégâts et teintes par arme. **Fin de partie** (`progress.ts`) : codex, maîtrise, reliques, Ascension, XP de compte, lignes de l'écran de fin. L'entraînement ne rapporte rien.

**Rétention** (`src/meta/`, `config/retention.json`, `config/achievements.json`) :

- **Horloge** (`clock.ts`) : temps local de l'appareil, protégé contre les retours en arrière (au-delà de 5 min, le plus grand instant déjà vu fait foi : reculer l'heure ne recharge ni le coffre ni les quêtes).
- **Ouverture** (`retention.ts`, `state/session.ts`) : au lancement et à chaque retour au premier plan, quêtes renouvelées, saison synchronisée, coffre démarré, série de connexion comptée (bandeau à l'accueil).
- **Quêtes** (`quests.ts`) : 3 du jour et 5 de la semaine, tirées d'une graine datée parmi 19 modèles (cumul sur les parties ou meilleure valeur d'une partie), renouvelées à minuit et le lundi ; une relance par jour ; récompenses à réclamer (fragments + XP de saison).
- **Série de connexion** (`streak.ts`) : cycle de 7 jours à récompenses croissantes (+10 % par semaine complète, plafonné) ; un jour manqué fait reculer la série d'un jour au lieu de la remettre à zéro.
- **Passe de saison** (`season.ts`) : 50 paliers de 1 000 XP (score × 0,05 par partie, quêtes), saisons de 6 semaines depuis le 5 janvier 2026 (heure locale), 6 thèmes en rotation ; fragments à chaque palier, relique tous les 10 (rareté croissante) ; les paliers atteints non réclamés sont versés à la fin de la saison.
- **Succès** (`achievements.ts`) : 200, chacun une mesure de la carrière ou de la progression et une valeur ; fragments au déblocage, relevés en fin de partie et sur l'écran Objectifs.
- **Coffre hors ligne** (`chest.ts`) : 25 fragments/h (+2 % par niveau de compte), plafonné à 12 h.
- **Notifications** (`notify-plan.ts`, `platform/notify.ts`) : facultatives, désactivées par défaut (réglages → Alertes) ; nouvelles quêtes et défi du jour à 9 h, coffre plein ; plan recalculé au passage en arrière-plan, envoyé au plugin Capacitor LocalNotifications quand il est présent.
- **Fin de partie** : chronologie des dégâts par seconde et des PV (`systems/timeline.ts`, 240 relevés préalloués, pas doublé quand ils sont pleins) tracée en deux petits graphiques à axe du temps commun, avec réticule et tableau ; DPS par arme, dégâts reçus, bilan (codex, maîtrise, reliques, compte, quêtes, saison, succès) ; « Encore une partie » toujours visible.

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
- mémoire ≈ taille compressée + ~1,5 s de PCM d'avance par flux ; repli si WebCodecs indisponible : `decodeAudioData` sur le thread principal, stocké en mono 24 kHz Int16 (lecture positionnelle, pas de streaming).
- Décodage : le décodeur est configuré **sans** `description` (Chromium n'applique alors pas le pré-skip) et le worker rogne lui-même pré-skip et fin de flux (granule final) : longueurs identiques à ffmpeg, vérifié par test. Chaque tour de boucle repart d'un décodeur réinitialisé. Un point d'entrée en milieu de fichier (layout `single`) est décodé avec 80 ms de pré-roll.
- Code : `src/audio/music/` — `ogg.ts` (démultiplexeur), `decoder.worker.ts`, `mixer-core.ts` (logique du worklet, testée sous Node), `mixer.worklet.ts`, `player.ts` (decks, démarrage sur la mesure, rampes programmées en position de piste), `director.ts` (scènes et paliers), `intensity.ts`, `manifest.ts` ; `src/audio/engine.ts` (graphe, bus, réglages, cycle de vie), `sfx.ts`, `bridge.ts` (événements de jeu → sons, état → intensité).

Les versions calme et intense d'un stage partagent **BPM, durée et points de boucle** : elles tournent en parallèle dans le worklet, le crossfade n'est qu'un jeu de gains.

### 11.3 Musique dynamique

- Intensité brute = f(densité d'ennemis proches, PV du joueur, élites, boss), lissée (montée rapide ~1,5 s, descente lente ~6 s), convertie en paliers 0 → 3 avec hystérésis. Fonction pure, testée.
- Chaque stem déclare son palier d'entrée (`enterAt`) ; les changements sont **quantifiés à la mesure suivante**, avec un temps minimal de 2 mesures par palier. Au palier 3 : crossfade vers la version intense sur 2 mesures.
- Effets continus : passe-bas qui s'ouvre avec l'intensité, réverb et volume dynamiques.
- Éveil : montée de filtre, pitch +1 demi-ton, saturation pendant 8 s. Ducking léger sur boss, éveil, level-up.
- Pause et menus : musique filtrée et atténuée, jamais coupée. Transitions menu ↔ jeu ↔ boss ↔ fin de run par crossfades calés sur la mesure.

### 11.4 `assets/audio/music/tracks.json`

Seul contrat entre le moteur et la musique. Chaque piste a un **layout** :

- `split` (pistes composées, recommandé) : par stem, un fichier **boucle** (`file`, qui démarre au début de la boucle, sa queue repliée sur son début) et un fichier **intro** optionnel (`intro`, qui démarre à 0 et garde sa queue : il chevauche le début de la boucle lors de la première écoute). Aucune queue de l'intro ne pollue la boucle : jointure parfaite.
- `single` : un fichier par stem (ou un seul fichier pour toute la piste) contenant intro + boucle ; la boucle est la zone `[loopStart, loopEnd)`. Sans stems, seuls crossfade et effets s'appliquent.

```jsonc
{
  "version": 1,
  "tracks": [
    {
      "id": "stage1-calm",
      "title": "Forêt brumeuse — calme",
      "layout": "split",
      "bpm": 100,
      "timeSignature": [4, 4],
      "key": "Mi dorien",
      "gainDb": 0, // correction manuelle, conservée d'un rendu à l'autre
      "loopStart": 9.6, // secondes : fin de l'intro = début de la boucle sur la grille
      "loopEnd": 86.4, // secondes : loopEnd - loopStart = durée du fichier boucle
      "group": "stage1", // pistes jouées en phase (calme / intense)
      "stems": [
        {
          "layer": "pads",
          "file": "stage1-calm/pads.ogg",
          "intro": "stage1-calm/pads.intro.ogg",
          "enterAt": 0,
        },
        { "layer": "drums", "file": "stage1-calm/drums.ogg", "enterAt": 1 }, // intro silencieuse : pas de fichier
        {
          "layer": "lead",
          "file": "stage1-calm/lead.ogg",
          "intro": "stage1-calm/lead.intro.ogg",
          "enterAt": 2,
        },
      ],
      "loudness": { "integrated": -14.2, "truePeak": -1.8 }, // informatif
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

Remplacer une piste = déposer les fichiers et mettre à jour son entrée ; aucune modification de code. Une liaison (`bindings`) peut pointer vers n'importe quelle piste : les stages pas encore composés réutilisent le stage 1.

### 11.5 Effets sonores

- **Sons originaux** synthétisés hors ligne (Tone.js, `src/audio/sfx-design/`) et pré-rendus en OGG 48 kHz : aucune licence tierce. `assets/audio/CREDITS.md` le documente ; un son peut être remplacé plus tard par un échantillon CC0 en déposant le fichier et en mettant à jour `sfx.json`.
- Manifeste `assets/audio/sfx/sfx.json` : `id → { files (3 à 5 variantes), bus, gainDb, pitchVar (±5 %), volVar, maxVoices, priority, cooldownMs }`.
- Buffers décodés au début du stage. Limite de voix par type avec priorité (vol de la voix la plus ancienne et la moins prioritaire). Panoramique selon la position à l'écran ; mode casque = panoramique élargi + effet Haas.
- Sons distincts par arme, par élément, pour chacune des 15 réactions, et pour les boss (apparition, télégraphe, phase, mort).

### 11.6 Pipelines hors ligne

- `scripts/render-music` (`npm run music:render`) : Playwright + Chromium → chaque couche rendue seule par `Tone.Offline`, **en deux sections** (intro, boucle), chaque section ne jouant que ses propres notes et gardant sa queue. `Math.random` est seedé : rendus reproductibles à l'identique.
- Post-traitement : queue de la boucle repliée sur son début ; **pré-roll** de 30 ms (notes humanisées posées sur la frontière) replié en fin de boucle et d'intro ; **mix automatique** (loudness cible de chaque stem, en LU relatifs au mix) ; **mastering sur la somme** : boucle normalisée à -14 LUFS avec un limiteur à anticipation dont l'enveloppe, **périodique** (continue au bouclage), est appliquée à l'identique à chaque stem — la somme des stems reste exactement le mix limité ; crête vraie ≤ -1 dBTP. Encodage Opus 128 kbps en VBR contraint.
- Contrôles imprimés à chaque rendu : loudness et crête par stem, spectre par bandes d'octave, continuité de la jointure (ratio saut / pente locale ≤ 1).
- Sidechain = automation de gain calée sur le kick (fonctionne en rendu solo). Batterie : bus compressé puis écrêté en douceur pour contenir le facteur de crête.
- `scripts/render-sfx` : même chaîne pour les effets → `sfx.json`.
- `scripts/prepare-track` (pistes FL Studio ou autres) : décodage ffmpeg, conversion Opus, gain commun visant -14 LUFS sur la somme (crête vraie ≤ -1 dBTP), tempo détecté par autocorrélation des attaques puis recalé sur un nombre entier de mesures, points de boucle (intro en mesures fournie ; suggérés sur la grille pour un fichier complet), écriture de l'entrée `tracks.json` validée par `parseManifest`. Guide d'export dans le README (plage intro et plage boucle exportées séparément, boucle en _Wrap remainder_).

## 12. Sauvegarde

- Profil dans `Preferences` (SharedPreferences, incluses dans la sauvegarde Android et le transfert d'appareil ; `localStorage` sur le web, repris une fois au premier lancement natif) sur **deux emplacements alternés** A/B : `{ magic, schemaVersion, seq, savedAt, checksum, payload }`. Au chargement : emplacement valide au `seq` le plus élevé.
- **Migrations** versionnées `vN → vN+1`, testées.
- **Instantané de run** (même mécanisme A/B) : au level-up, en pause, à la mise en arrière-plan et toutes les 60 s → reprise exacte.
- Réglages dans le même profil.
- Export / import : texte (presse-papiers) ou fichier (Android : `Filesystem` cache + feuille de partage système ; web : téléchargement ; import par le sélecteur de fichiers).

## 13. Mises à jour in-app et distribution

- Deux flavors Android : **`github`** (APK, updater actif, permission `REQUEST_INSTALL_PACKAGES`) et **`play`** (AAB, sans updater ni permission ; Google Play interdit l'auto-mise à jour hors Play).
- Au lancement (≤ 1 fois / 24 h, réglage « Vérifier automatiquement ») et sur demande (Réglages › À propos) : `GET /repos/{owner}/{repo}/releases/latest` (ou les 15 dernières si « Inclure les préversions ») via `CapacitorHttp` ; `update/github.ts` choisit la release publiée la plus récente, plus récente (semver 2.0, `update/semver.ts`) que la version installée (`versionName` natif) et portant `voidpulse-vX.Y.Z.apk` avec son empreinte (champ `digest` de l'API, sinon asset `.sha256`) ; feuille du bas (`ui/UpdateSheet.tsx` : version, notes Markdown rendues sans HTML, taille, « Mettre à jour » / « Plus tard » / « Ignorer cette version »), affichée uniquement sur l'écran titre : jamais pendant une run. État : `update/updater.ts` (store Zustand), préférences dans `SaveData.update`.
- Plugin natif `VoidpulseNative` (`android/app/src/main/java/com/karelisio/voidpulse/`) : téléchargement HTTPS dans `cache/updates` avec reprise (`Range`, fichier `.part`), événements de progression, **SHA-256 obligatoire** (sinon rejet), installation via FileProvider (`cache-path` seul) + `ACTION_VIEW`, redirection vers « Installer des applis inconnues » puis reprise de l'installation au retour dans l'app ; couleur Material You (`system_accent1_500`), mode immersif, informations de build (flavor, `BuildConfig.UPDATER`). Toutes les méthodes de mise à jour refusent dans le flavor `play`.
- Owner/repo : `config/app.json` (`karelisio/voidpulse`).

## 14. UI, thèmes, i18n, accessibilité

- Menus et écrans de pause (level-up, pactes, marchand, coffres, fin de run) en React ; HUD en Pixi.
- **Thèmes** (`src/theme/`) via jetons CSS posés sur la racine (`data-theme`, `data-scheme`, `data-cvd`) : Arcade (défaut, néon), Clair, Sombre, Material You. Material You : schéma Material 3 clair ou sombre (suit l'appareil) généré en OKLCH depuis une graine — la couleur Monet de l'appareil quand un plugin la fournit (`setSystemAccent`), sinon l'accent choisi dans les réglages ; formes M3 maison (`theme/themes.css`) : boutons pleins et tonals en pilule, cartes tonales, puces, feuille du bas pour les réglages, barre de navigation et bouton flottant à l'accueil. Le jeu garde sa DA ; seul le HUD peut prendre l'accent (option).
- Portrait par défaut, paysage en option. Bouton retour Android géré par une pile de navigation.
- **i18n** (`src/i18n/`) : français par défaut, anglais. `t('espace.clé', { n })` commun à React et Pixi ; dictionnaires par espace de noms (`strings/*.ts`, `defineStrings(fr, en)` : le compilateur impose les mêmes clés en anglais) ; `num()` formate selon la langue ; `useLang()` fait se re-rendre les composants au changement de langue. Les données de jeu (armes, ennemis, boss, pilotes, pactes, stages, talents, reliques, quêtes, succès…) sont rédigées en français dans `config/` et traduites par une surcouche (`content.ts`, `content-en.json`, une clé stable par champ, repli sur le français ; une valeur peut citer un autre champ, « {stage.forest.name} ») ; un test vérifie que chaque champ a sa traduction. La simulation n'utilise aucun texte.
- **Accessibilité** : palettes des six éléments pour la deutéranopie, la protanopie et la tritanopie (menus et rendu : projectiles sans apparence, marques, zones), cherchées pour maximiser l'écart perceptuel minimal entre éléments sous le type de daltonisme visé (ΔE OKLab × 100 ≥ 17 ; les éléments gardent aussi leur icône propre) ; réduction des flashs ; taille du HUD.
- Contrôles : joystick flottant sous le pouce, sensibilité, option main gauche ; tir automatique, visée auto (ennemi le plus proche) ou directionnelle ; dash au tap du second pouce.
- Menu debug caché (7 taps sur le numéro de version) : FPS, entités, spawn manuel, invincibilité, vitesse ×5, visualiseur d'intensité musicale.

## 15. Android

`appId` `com.karelisio.voidpulse`, minSdk 24, targetSdk 36. Permissions : INTERNET, VIBRATE, POST_NOTIFICATIONS (demandée seulement si les notifications sont activées), REQUEST_INSTALL_PACKAGES (flavor `github` uniquement) ; celles du plugin de notifications (RECEIVE_BOOT_COMPLETED, WAKE_LOCK), sans alarme exacte (retirée du manifeste). Pas d'accès au stockage partagé.

- **Plugins** : App (bouton retour → pile `platform/back.ts`, sinon sortie ; reprise), Haptics, Preferences, Filesystem + Share (export, partage du résultat de run), StatusBar (superposée, immersif), SplashScreen (masqué une fois la sauvegarde chargée), LocalNotifications, ScreenOrientation (portrait par défaut, paysage ou automatique en option ; la vue du jeu suit le format), KeepAwake (pendant une run).
- **Icône** : SVG néon « pulsation du vide » dans `assets/src/` (fond, avant-plan, monochrome, notification, logo du splash) ; `npm run assets:render` produit les PNG de toutes les densités (icône adaptative + monochrome Android 13+, carrée et ronde classiques, `ic_stat_voidpulse`, logos). `@capacitor/assets` a été écarté : il réécrit l'icône adaptative (retrait de 16,7 %) et le manifeste, et ses splashs plein écran pesaient 9 Mo. **Splash** : API SplashScreen d'Android 12+ (icône sur `splash_bg`), et avant Android 12 un `layer-list` (couleur + logo) ; clair et sombre via `values-night` / `drawable-night`.
- **Compilation** : `npm run android:sync` (build web sans cartes de sources + `cap sync`), puis `./gradlew assembleGithubRelease bundlePlayRelease -PversionName=X.Y.Z -PversionCode=N` ; signature par les variables `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (sinon APK non signé). Vérifiée localement (debug et release des deux flavors) et dans GitHub Actions.

## 16. CI/CD et conventions

- **Commits conventionnels** obligatoires (`feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`, `build:`), vérifiés par un hook husky local et par la CI (titre de PR + commits).
- `ci.yml` (PR) : commitlint (commits et titre de la PR), lint, format, typecheck, tests, build web, compilation Android debug des deux flavors avec contrôle des permissions (`REQUEST_INSTALL_PACKAGES` absente du flavor `play`).
- `release.yml` (push sur `main`, préversions sur `beta`) : Node 22, JDK 21 (exigé par Capacitor 8 / AGP 8.13), cache Gradle, SDK 36 ; lint, typecheck, tests ; puis semantic-release (`.releaserc.json`) calcule la version (feat → mineure, fix/perf → patch, BREAKING → majeure ; rien si aucun commit pertinent). Son étape `prepare` exécute `scripts/release/build-android.sh` : build web (`VITE_APP_VERSION`), `cap sync`, APK `github` et AAB `play` signés (keystore décodé de `ANDROID_KEYSTORE_BASE64` dans un fichier temporaire), vérification de la signature (`apksigner`) et de la version (`aapt2`), empreinte `.sha256`. `versionCode` = MAJEURE×1 000 000 + MINEURE×10 000 + PATCH×100 + rang (99 pour une version finale, numéro de préversion sinon ; `scripts/release/version-code.ts`, testé). Publication du tag `vX.Y.Z` et de la release (`voidpulse-vX.Y.Z.apk`, `.sha256`, `.aab`, notes en français). Toujours le même keystore.
- Stems OGG commités ; Git LFS pour les sources lourdes (WAV, MP3, FLAC, AIFF, FLP).
- Code : fichiers de modules en camelCase, composants React en PascalCase, tests co-localisés `*.test.ts`, commentaires en français, concis.

## 17. Délégation et critères de fin

| Qui    | Périmètre                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead   | Architecture, moteur, collisions, perf, cœur du rendu et atlas, moteur audio, compositions, Résonance, boss, director, formules de combat, archétypes, équilibrage et simulateur, revue et intégration                    |
| Sonnet | Écrans React, composants M3 et thèmes, HUD, quêtes/succès/codex/saison/série/coffre hors ligne/notifications, sauvegarde, updater + plugin natif, workflows CI/release, variantes SFX sur presets, icône/splash, tutoriel |
| Haiku  | JSON de config d'après les schémas, traductions EN, icônes SVG simples (guide de style), tests unitaires simples, README                                                                                                  |

Chaque tâche déléguée reçoit : fichiers concernés, interfaces TypeScript déjà posées, critères de fin. **Terminé = `npm run check` vert** (lint, typecheck, tests, build) + relecture du diff par le lead avant intégration.
