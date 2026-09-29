/** État de l'interface (Zustand) : écran courant, surcouches, réglages de debug. */
import { create } from 'zustand';
import type { CardView } from '../ui/cards';
import type { ChestView } from '../ui/ChestOverlay';
import type { MerchantView, SacrificeView } from '../ui/events';
import type { PactView } from '../ui/PactOverlay';

export type Screen = 'title' | 'select' | 'stage' | 'run';
export type Overlay = null | 'levelup' | 'chest' | 'merchant' | 'altar' | 'pact' | 'pause' | 'end';

export interface AltarView {
  offers: SacrificeView[];
  result: string | null;
}

export interface RunSummary {
  victory: boolean;
  time: number;
  kills: number;
  level: number;
  xp: number;
  damageTaken: number;
  eveils: number;
  weapons: { name: string; element: string; damage: number; icon: string }[];
  reactionDamage: number;
  eveilDamage: number;
  reactions: { name: string; count: number; color: string }[];
  dashDamage: number;
  /** Personnage, pactes scellés, rang, score, personnages débloqués par cette partie. */
  stage: string;
  character: string;
  pacts: string[];
  rank: string;
  score: number;
  bestScore: boolean;
  unlocked: string[];
  newStages: string[];
  newBosses: string[];
}

export interface LevelUpView {
  cards: CardView[];
  rerolls: number;
  banishes: number;
  locks: number;
  locked: string | null;
  level: number;
}

interface UiState {
  screen: Screen;
  overlay: Overlay;
  levelUp: LevelUpView | null;
  chest: ChestView | null;
  merchant: MerchantView | null;
  altar: AltarView | null;
  pact: PactView | null;
  summary: RunSummary | null;
  debugUnlocked: boolean;
  debugPanel: boolean;
  runId: number;
  setScreen: (screen: Screen) => void;
  setOverlay: (overlay: Overlay) => void;
  showLevelUp: (view: LevelUpView) => void;
  showChest: (view: ChestView) => void;
  showMerchant: (view: MerchantView) => void;
  showAltar: (view: AltarView) => void;
  showPact: (view: PactView) => void;
  showEnd: (summary: RunSummary) => void;
  unlockDebug: () => void;
  toggleDebugPanel: () => void;
  newRun: () => void;
}

export const useUi = create<UiState>((set) => ({
  screen: 'title',
  overlay: null,
  levelUp: null,
  chest: null,
  merchant: null,
  altar: null,
  pact: null,
  summary: null,
  debugUnlocked: new URLSearchParams(location.search).has('debug'),
  debugPanel: false,
  runId: 0,
  setScreen: (screen) => {
    set({ screen, overlay: null });
  },
  setOverlay: (overlay) => {
    set({ overlay });
  },
  showLevelUp: (levelUp) => {
    set({ overlay: 'levelup', levelUp });
  },
  showChest: (chest) => {
    set({ overlay: 'chest', chest });
  },
  showMerchant: (merchant) => {
    set({ overlay: 'merchant', merchant });
  },
  showAltar: (altar) => {
    set({ overlay: 'altar', altar });
  },
  showPact: (pact) => {
    set({ overlay: 'pact', pact });
  },
  showEnd: (summary) => {
    set({ overlay: 'end', summary });
  },
  unlockDebug: () => {
    set({ debugUnlocked: true });
  },
  toggleDebugPanel: () => {
    set((s) => ({ debugPanel: !s.debugPanel }));
  },
  newRun: () => {
    set((s) => ({ runId: s.runId + 1, overlay: null, summary: null, levelUp: null }));
  },
}));
