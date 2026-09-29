# Crédits audio

Tout l'audio de Voidpulse est **original**, créé pour le jeu : aucun échantillon ni banque de sons
tiers, aucune licence externe.

- **Musique** (`music/`) : compositions Tone.js (`src/audio/compositions/`), pré-rendues hors ligne
  par `npm run music:render` (stems Ogg Opus + `tracks.json`).
- **Effets sonores** (`sfx/`) : synthèse soustractive et FM (`src/audio/sfx-design/`), pré-rendus
  par `npm run sfx:render` (variantes Ogg Opus + `sfx.json`).

Remplacer un son ou une piste : déposer les fichiers et mettre à jour `sfx.json` ou `tracks.json`
(voir docs/ARCHITECTURE.md §11). Tout échantillon ajouté plus tard doit être CC0 et être listé
ci-dessous avec sa source.

## Sources tierces

Aucune.
