# Voidpulse

Survivor-like mobile pour Android, nerveux et profond, en vectoriel néon. 100 % hors ligne, sans achat intégré ni publicité.

- Architecture et choix techniques : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Stack : Vite, React 18, TypeScript strict, Zustand, PixiJS v8, ECS maison, Web Audio, Capacitor 8 (Android), Vitest.

## Prérequis

| Outil       | Version                                | Pour                             |
| ----------- | -------------------------------------- | -------------------------------- |
| Node.js     | 22.14 ou plus (`.nvmrc`)               | tout                             |
| JDK         | 21 (Temurin conseillé)                 | Android (exigé par Capacitor 8)  |
| Android SDK | plateforme 36, build-tools 36.0.0      | Android                          |
| ffmpeg      | récent, avec libopus                   | scripts audio (musiques, effets) |
| Chromium    | celui de Playwright ou `CHROMIUM_PATH` | rendu des musiques et des icônes |

## Démarrage

```bash
npm ci
npm run dev          # serveur de développement (http://localhost:5173)
npm run check        # lint + typecheck + tests + build web
```

Le jeu tourne aussi dans un navigateur (souris ou tactile) ; la mise à jour intégrée, les notifications et le retour haptique n'existent que sur Android. Menu de débogage : 7 appuis sur le numéro de version de l'écran titre.

### Scripts

| Commande                | Rôle                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`           | serveur de développement                                                            |
| `npm run check`         | toutes les vérifications de la CI                                                   |
| `npm test`              | tests unitaires et de simulation (Vitest)                                           |
| `npm run format`        | Prettier sur tout le dépôt                                                          |
| `npm run android:sync`  | build web pour l'APK (sans cartes de sources) + `cap sync android`                  |
| `npm run assets:render` | icônes et logos Android depuis les SVG de `assets/src/`                             |
| `npm run music:render`  | pré-rendu des musiques composées (Tone.js → stems Opus + `tracks.json`)             |
| `npm run sfx:render`    | pré-rendu des effets sonores                                                        |
| `npm run track:prepare` | import d'une musique externe (voir [Remplacer une musique](#remplacer-une-musique)) |

## Android

```bash
npm run android:sync
cd android
./gradlew assembleGithubDebug      # APK debug avec mise à jour intégrée
./gradlew assemblePlayDebug        # APK debug sans mise à jour intégrée
adb install -r app/build/outputs/apk/github/debug/app-github-debug.apk
```

Deux variantes (_flavors_) :

- **`github`** : APK publié dans les GitHub Releases, avec la mise à jour intégrée (vérification quotidienne, téléchargement, contrôle SHA-256, installation) et la permission `REQUEST_INSTALL_PACKAGES`.
- **`play`** : AAB pour Google Play, sans mise à jour intégrée ni cette permission (Play l'interdit).

`versionName` et `versionCode` se passent à Gradle : `-PversionName=1.2.0 -PversionCode=1020099`. Dépôt interrogé par la mise à jour intégrée : `config/app.json` (`github.owner`, `github.repo`).

Ouvrir le projet dans Android Studio : `npx cap open android`.

## Publication

Tout est automatique : **chaque push sur `main`** lance `.github/workflows/release.yml`.

1. [semantic-release](https://semantic-release.gitbook.io) lit les commits depuis le dernier tag `vX.Y.Z` :
   - `fix:` ou `perf:` → version corrective (1.2.3 → 1.2.4) ;
   - `feat:` → version mineure (1.2.3 → 1.3.0) ;
   - `feat!:`, `fix!:` ou un pied `BREAKING CHANGE:` → version majeure (1.2.3 → 2.0.0) ;
   - rien d'autre (`docs:`, `chore:`, `refactor:`, `test:`, `ci:`…) → **aucune publication**.
2. Si une version est due : lint, types et tests, puis `scripts/release/build-android.sh` compile l'APK `github` et l'AAB `play` signés, vérifie la signature et la version de l'APK, calcule le SHA-256.
3. Le tag `vX.Y.Z` et la GitHub Release sont créés avec `voidpulse-vX.Y.Z.apk`, `voidpulse-vX.Y.Z.apk.sha256`, `voidpulse-vX.Y.Z.aab` et les notes générées (Nouveautés, Corrections, Performances), que la mise à jour intégrée affiche dans le jeu.

La **première version** (1.0.0) part au premier merge sur `main`. Pour publier des **préversions** (`1.1.0-beta.1`…), poussez sur une branche `beta` : elles sont marquées « Pre-release » sur GitHub et ne sont proposées qu'aux joueurs qui ont coché « Inclure les préversions ».

`versionCode` = MAJEURE × 1 000 000 + MINEURE × 10 000 + CORRECTIF × 100 + rang, rang valant 99 pour une version finale et le numéro de préversion sinon (`1.2.0-beta.3` → 1 020 003 < `1.2.0` → 1 020 099). Mineure et correctif sont donc limités à 99.

### Clé de signature (une seule fois)

Les mises à jour ne s'installent par-dessus la version existante que si elles sont signées **avec la même clé, pour toujours**. Gardez le keystore et ses mots de passe en lieu sûr (gestionnaire de mots de passe et copie hors ligne) : perdus, les joueurs devront désinstaller le jeu (et perdre leur progression locale) pour passer à la version suivante.

```bash
keytool -genkeypair -v \
  -keystore voidpulse-release.jks -storetype PKCS12 \
  -alias voidpulse -keyalg RSA -keysize 4096 -validity 36500 \
  -dname "CN=Voidpulse, O=Karelisio"
```

Avec un keystore PKCS12, le mot de passe de la clé est celui du keystore.

Encodage en base64 pour le secret GitHub :

```bash
base64 -w0 voidpulse-release.jks > keystore.b64                    # Linux
base64 -i voidpulse-release.jks | tr -d '\n' > keystore.b64        # macOS
```

```powershell
# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("voidpulse-release.jks")) | Out-File -Encoding ascii keystore.b64
```

Secrets du dépôt (_Settings → Secrets and variables → Actions_, ou avec `gh`) :

| Secret                      | Valeur                                                 |
| --------------------------- | ------------------------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | contenu de `keystore.b64`                              |
| `ANDROID_KEYSTORE_PASSWORD` | mot de passe du keystore                               |
| `ANDROID_KEY_ALIAS`         | `voidpulse`                                            |
| `ANDROID_KEY_PASSWORD`      | mot de passe de la clé (= celui du keystore en PKCS12) |

```bash
gh secret set ANDROID_KEYSTORE_BASE64 < keystore.b64
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS --body voidpulse
gh secret set ANDROID_KEY_PASSWORD
rm keystore.b64
```

`*.jks`, `*.keystore` et `keystore.b64` sont ignorés par git : ne les commitez jamais. Empreinte du certificat, à noter : `keytool -list -v -keystore voidpulse-release.jks -alias voidpulse`.

**Google Play** : l'AAB est signé avec la même clé, qui sert de clé d'importation. Avec la signature d'application Play, Google re-signe les APK distribués par le Store : les versions GitHub et Play ne peuvent donc pas se mettre à jour l'une par-dessus l'autre (désinstallation nécessaire pour changer de canal).

**Tester une publication en local** (keystore de test, sans rien publier) :

```bash
export ANDROID_KEYSTORE_PATH=$PWD/test.jks ANDROID_KEYSTORE_PASSWORD=… ANDROID_KEY_ALIAS=voidpulse ANDROID_KEY_PASSWORD=…
bash scripts/release/build-android.sh 1.0.0-beta.1     # → release/
GITHUB_TOKEN=… npx semantic-release --dry-run --no-ci   # version et notes calculées
```

## Conventions de commit

[Commits conventionnels](https://www.conventionalcommits.org/fr/) obligatoires, vérifiés à chaque commit (hook husky + commitlint) et en CI (commits et titre de la PR, qui devient le message du squash) :

```
feat(meta): reliques à trois emplacements
fix(audio): craquement à la jointure de boucle du boss
perf(render): lot unique pour les projectiles
feat!: nouveau format de sauvegarde
```

Types : `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `style`, `chore`, `build`, `ci`, `revert`. La portée (entre parenthèses) est libre. Seuls `feat`, `fix`, `perf`, `revert` et les ruptures déclenchent une publication. La CI (`.github/workflows/ci.yml`, sur chaque PR) exécute commitlint, lint, format, typecheck, tests, build web et compilation Android des deux variantes.

## Remplacer une musique

La musique est décrite par un seul fichier, `assets/audio/music/tracks.json` (format détaillé dans [ARCHITECTURE §11.4](docs/ARCHITECTURE.md#114-assetsaudiomusictracksjson)) : remplacer une piste ne demande aucune modification de code. Chaque piste est découpée en **stems** (couches) que le jeu ajoute ou retire selon l'intensité de l'action (paliers 0 à 3), et se compose d'une **intro** jouée une fois puis d'une **boucle** sans fin.

### Export depuis FL Studio

1. **Tempo entier** et mesure fixe (4/4 par défaut). Décidez la longueur de l'intro (N mesures, facultative) et de la boucle (de préférence 8, 16, 32 ou 64 mesures). Les paires calme / intense d'un même stage doivent avoir le même tempo et la même longueur de boucle (elles jouent en phase).
2. Une piste de mixeur par couche, nommée comme le fichier voulu : `pads`, `bass`, `drums`, `arp`, `lead`, `fx`… Pas de limiteur sur le master : le jeu additionne les stems et normalise lui-même.
3. **Boucle** : sélectionnez la plage de la boucle dans la playlist, _File → Export → Wave file_, 48 kHz, 32 bits float, **Split mixer tracks**, _Tail_ : **Wrap remainder** (la queue revient au début, jointure parfaite). Vous obtenez `pads.wav`, `bass.wav`…
4. **Intro** (facultative) : sélectionnez de 0 au début de la boucle, même export mais _Tail_ : **Leave remainder**, puis renommez chaque fichier `<couche>.intro.wav`. Une couche muette pendant l'intro n'a pas besoin de fichier intro.
5. Rangez tous les fichiers d'une piste dans un dossier.

### Import

```bash
npm run track:prepare -- --id stage2-calm --src ~/exports/stage2-calm \
  --intro-bars 4 --title "Récif de verre — calme" --key "Ré mineur" \
  --group stage2 --bind stage:2:calm
```

Le script convertit en Ogg Opus 48 kHz (128 kbit/s), détecte le tempo (ou `--bpm 110`) et le recale sur la longueur de la boucle, calcule les points de boucle, applique un gain commun pour viser -14 LUFS avec une crête vraie ≤ -1 dBTP, écrit `assets/audio/music/<id>/` et l'entrée de `tracks.json`, puis valide le manifeste comme le jeu. Options :

- `--enter lead=2,fx=3` : palier d'intensité de chaque couche (défaut selon le nom : pads/ambiance 0, basse/batterie 1, lead/arp 2, fx 3) ;
- `--bind` (répétable) : `menu`, `boss`, `final-boss`, `end`, `stage:N:calm`, `stage:N:intense` ;
- `--single` : fichiers complets (intro + boucle + queue) au lieu de l'export découpé, avec `--loop-start` / `--loop-end` en secondes (sinon suggérés sur la grille des mesures, à vérifier à l'écoute) ;
- `--dry-run` : analyse et affiche l'entrée sans rien écrire.

Un ajustement de volume manuel (`gainDb` dans `tracks.json`) est conservé aux imports suivants. Écoutez ensuite dans le jeu (`npm run dev`, menu de débogage → visualiseur d'intensité) et commitez les `.ogg` (les sources WAV/FLP, si vous les versionnez, passent par Git LFS).

## Licences

Code, musiques, effets sonores et visuels sont originaux (synthèse et rendu hors ligne) : voir `assets/audio/CREDITS.md`.
