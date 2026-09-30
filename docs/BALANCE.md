# Équilibrage

Toutes les valeurs de jeu sont dans `config/` (JSON validés par `config/schema.ts`). Le simulateur `sim/balance/` joue des parties sans rendu avec le code du jeu et produit des courbes.

```bash
npm run balance -- stages   [--runs 12] [--skill 0.6]   # survie, victoires, niveau, DPS par stage
npm run balance -- accounts [--accounts 4] [--runs 80]   # progression de comptes complets
```

Résultats dans `sim/out/` (`balance-*.jsonl`, `balance.html` : tableaux et courbes SVG). Une partie simulée tourne ~100 fois plus vite que le temps réel ; les processus se répartissent sur tous les cœurs.

## Le joueur simulé

`sim/balance/bot.ts` — un joueur « moyen » plutôt qu'un optimiseur :

- **déplacement** : orbite autour de la horde à distance de confort (les armes tuent ce qui approche), ramassage des gemmes et coffres quand la voie est libre, fuite des contacts, projectiles et zones annoncées ; les lignes de visée et de charge sont esquivées perpendiculairement ;
- **dash** de secours (encerclé, contact) ;
- **montées de niveau** par priorités (armes possédées, nouvelles armes tant qu'il reste des emplacements, passifs, soin si blessé) ; pas de pacte, pas d'achat chez le marchand ;
- **habileté** `skill` (0-1) : portée de lecture du danger, esquive des projectiles et des zones, précision, qualité des choix. En mode compte, elle progresse de 0,40 à 0,75 comme un joueur qui apprend (courbe exponentielle, constante de 15 parties).

Le bot reste plus faible qu'un humain attentif (il ne lit pas les patterns de boss) : un humain progresse un peu plus vite que les courbes ci-dessous.

Un compte simulé (`sim/balance/account.ts`) joue toujours le stage de campagne le plus avancé, alterne les personnages débloqués, applique le bilan de fin de partie avec le code du jeu (`src/meta/runend.ts`, partagé avec l'écran de jeu) puis dépense comme un joueur appliqué : talents ouverts les moins chers d'abord, points de Paragon, meilleures reliques équipées.

## Cibles

| Cible (spec)                                   | Mesure                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Première victoire du stage 1 en ~5 parties     | 1re victoire en forêt par un compte neuf                                                                      |
| Un déblocage toutes les 1 à 2 parties au début | parties des 20 premières qui apportent un personnage, un stage, une relique, un niveau de compte ou un talent |
| Progression visible au-delà de 100 h           | niveau de compte, talents, Ascension (20 paliers × 8 stages), Paragon, reliques, maîtrise                     |

## Constats et réglages

1. **Économie emballée.** Chaque victoire rapportait 7 000 à 11 000 fragments et ~100 000 XP de compte (pièces et score proportionnels aux ennemis tués, qui se comptent par dizaines de milliers dans une longue victoire) : niveau de compte maximal et arbre de talents complet en ~5 h.
   - XP de compte et de saison proportionnelles à **√score** (`meta.account.xpPerRootScore`, `retention.season.xpPerRootScore`).
   - Fragments ramenés **linéaires jusqu'à 150, puis en √ de l'excédent** (`meta.bank`, `src/modes/records.ts#bankedFragments`) ; la boutique en cours de partie n'est pas touchée.
   - Coût des talents × (1 + coût/250) : premiers rangs presque inchangés (+33 % au plus), arbre complet ≈ 248 000 fragments (contre 45 600).
2. **Début des stages avancés injuste.** Le multiplicateur de PV du stage s'appliquait dès la première seconde : l'ennemi de base ne mourait plus en un coup de l'arme de départ (loup de givre 19 PV, feu follet 21 PV contre 13 dégâts) et la horde submergeait le joueur au niveau 1. Le facteur de stage monte maintenant de 0 % à t = 0 à 50 % à 5 min puis 100 % à 10 min (les dernières minutes restent aussi dures).
3. **Ennemis de 50 s trop lourds.** Les stages 2 à 8 introduisaient à 50 s un ennemi lourd (Gardien 100 PV, Colosse de cristal, Golem de lave avec flaques) à 20 % des apparitions ; il arrive désormais à 8 % (la part normale revient à 140 s).
4. **Désert.** Prisme tireur (tir 15 dégâts toutes les 4,4 s) : 11 dégâts toutes les 5,2 s. Tempête de verre : un éclat tombait toujours à moins de 60 unités du joueur, toutes les 0,7 s, 18 dégâts ; désormais au moins à 40 unités, toutes les secondes, 12 dégâts.
5. **Toundra.** Le loup de givre, ennemi de base, était un chargeur de 30 PV : 12 PV, 6 dégâts, charges plus rares et plus lisibles (recharge 4,5 s, préparation 0,6 s), vague d'ouverture de 12 loups au lieu de 20 ; ralentissements cumulés réduits (bombe de givre, esprit du givre, yéti).
6. **Forêt.** Fin de stage un peu plus dure (PV × 3,5 à 10 min, × 5,6 à 15 min) : la première victoire arrivait dès la 1re ou 2e partie.
7. **Toundra, mur à 3 min.** Un compte sur quatre mourait ~40 fois de suite vers 2 min 40 : à 140 s, 20 % de yétis (mortiers ralentissants, restent à distance) et 15 % de colosses de cristal (bouclier frontal) s'accumulaient sans mourir (40 mortiers et 75 colosses en jeu). Yétis ramenés à 7 % des apparitions (tir toutes les 4,4 s au lieu de 3,6 s, tenaille de 6 au lieu de 12), colosses à 8 % (70 PV au lieu de 90, 13 dégâts au lieu de 17, bouclier plus étroit). Pour ce compte : victoires en toundra 0/10 → 3/10 (station, le stage précédent : 1/10).
8. **Écarté après mesure : favoriser les améliorations d'armes possédées.** Les cartes de montée de niveau proposent rarement l'amélioration d'une arme possédée (poids 1,3 contre ~100 pour les nouveautés). Les augmenter (poids 6 ou 14) fait chuter la puissance (victoires en forêt 10/24 → 4/24) : le jeu est conçu pour la variété d'éléments et la Résonance. Poids d'origine conservés.

## Résultats (compte simulé, habileté 0,40 → 0,75)

Validation finale : `npm run balance -- accounts --accounts 4 --runs 60`.

| Compte | 1re victoire forêt | Campagne finie    | Parties à déblocage (20 premières) | Après 60 parties             |
| ------ | ------------------ | ----------------- | ---------------------------------- | ---------------------------- |
| 1      | partie 2 (0,4 h)   | partie 23 (3,5 h) | 14/20                              | 13,0 h, niveau 18, 172 rangs |
| 2      | partie 1 (0,3 h)   | partie 26 (3,9 h) | 14/20                              | 11,5 h, niveau 17, 168 rangs |
| 3      | partie 1 (0,3 h)   | partie 32 (4,1 h) | 12/20                              | 9,6 h, niveau 15, 161 rangs  |
| 4      | partie 2 (0,4 h)   | partie 36 (4,8 h) | 16/20                              | 10,7 h, niveau 16, 165 rangs |

- **Première victoire** en 1 à 2 parties pour le bot (un humain qui découvre le jeu met un peu plus : cible « ~5 parties » respectée à l'échelle humaine).
- **Déblocages** : 12 à 16 des 20 premières parties apportent quelque chose (cible : une toutes les 1 à 2 parties).
- **Campagne** (8 stages, boss final) : 3,5 à 5 h. Aucun stage ne bloque plus un compte (la toundra en bloquait un avant le réglage 7).
- **Au-delà** : niveau de compte 15-18 sur 50 après 10-13 h (la courbe d'XP en √score ralentit ; ~70 à 100 h pour le maximum), ~165 rangs de talents achetés sur un arbre de ≈ 248 000 fragments, puis Ascension (20 paliers × 8 stages), Paragon, reliques et maîtrise : la progression reste visible bien au-delà de 100 h.

## Difficulté « Détente »

Retour des premières parties sur téléphone : le jeu est nettement plus dur pour un humain que pour le bot (qui voit tout l'écran à chaque image et ne se laisse pas surprendre par les effets). Réglage **Difficulté** (Réglages → Commandes), **Détente par défaut** : en Campagne, Infini et Boss Rush, dégâts des ennemis × 0,6, PV × 0,8, vitesse des projectiles × 0,8, densité × 0,85 (`config/modes.json#difficulty`, cumulé avec l'Ascension). Les défis du jour et de la semaine et le Hardcore restent identiques pour tous. **Normal** conserve l'équilibrage mesuré ci-dessus.

Mesure (forêt, compte neuf, habileté 0,3, 12 parties) : victoires 4/12 en Normal, 7/12 en Détente.
