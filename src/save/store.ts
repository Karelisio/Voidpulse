/**
 * Sauvegarde sur deux emplacements (A/B) : chaque écriture va dans l'emplacement le plus ancien
 * avec un numéro de séquence ; au chargement on garde l'emplacement valide le plus récent.
 * Une écriture interrompue (coupure, arrêt de l'app) laisse donc toujours une copie saine.
 */
import type { KeyValueStore } from './backend';
import { decodeSlot, encodeSlot, normalize } from './codec';
import { defaultSave, type SaveData } from './schema';

const SLOTS = ['voidpulse.save.a', 'voidpulse.save.b'] as const;

export interface LoadResult {
  data: SaveData;
  /** Emplacement(s) illisible(s) ignoré(s). */
  recovered: boolean;
  fresh: boolean;
}

export class SaveStore {
  private seq = 0;
  private nextSlot = 0;
  private pending: SaveData | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly kv: KeyValueStore,
    private readonly debounceMs = 800,
  ) {}

  async load(): Promise<LoadResult> {
    const slots = await Promise.all(SLOTS.map((k) => this.kv.get(k)));
    const decoded = slots.map(decodeSlot);
    let best = -1;
    decoded.forEach((d, i) => {
      if (d && (best < 0 || d.seq > (decoded[best]?.seq ?? -1))) best = i;
    });
    const recovered = slots.some((s, i) => s !== null && decoded[i] === null);
    if (best < 0) {
      this.seq = 0;
      this.nextSlot = 0;
      return { data: defaultSave(), recovered, fresh: true };
    }
    const chosen = decoded[best];
    if (!chosen) throw new Error('état impossible');
    this.seq = chosen.seq;
    this.nextSlot = 1 - best;
    try {
      return { data: normalize(chosen.raw), recovered, fresh: false };
    } catch (e) {
      // Version plus récente que le jeu : on ne l'écrase pas.
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  /** Écrit tout de suite (fin de run, mise en arrière-plan). */
  async saveNow(data: SaveData): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    const snapshot: SaveData = { ...data, updatedAt: Date.now() };
    this.writing = this.writing.then(async () => {
      this.seq++;
      const slot = this.nextSlot;
      await this.kv.set(SLOTS[slot], encodeSlot(snapshot, this.seq));
      this.nextSlot = 1 - slot;
    });
    return this.writing;
  }

  /** Écriture différée (réglages modifiés en rafale). */
  schedule(data: SaveData): void {
    this.pending = data;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const d = this.pending;
      this.pending = null;
      if (d) void this.saveNow(d);
    }, this.debounceMs);
  }

  /** Force l'écriture d'une modification en attente. */
  async flush(): Promise<void> {
    if (this.pending) await this.saveNow(this.pending);
    await this.writing;
  }

  async reset(): Promise<void> {
    await Promise.all(SLOTS.map((k) => this.kv.remove(k)));
    this.seq = 0;
    this.nextSlot = 0;
  }
}
