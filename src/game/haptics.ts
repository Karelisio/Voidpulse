/**
 * Retours haptiques différenciés (coup, réaction, niveau, boss, Éveil), limités en fréquence.
 * Utilise le plugin Capacitor Haptics quand il est présent, sinon navigator.vibrate.
 */
type Pattern = number | number[];

interface CapacitorHaptics {
  impact(opts: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void>;
  vibrate(opts: { duration: number }): Promise<void>;
}

export class Haptics {
  enabled = true;
  private last = 0;
  private native: CapacitorHaptics | null = null;

  setNative(native: CapacitorHaptics | null): void {
    this.native = native;
  }

  private fire(pattern: Pattern, style: 'LIGHT' | 'MEDIUM' | 'HEAVY', minGapMs: number): void {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.last < minGapMs) return;
    this.last = now;
    if (this.native) {
      void this.native.impact({ style }).catch(() => undefined);
      return;
    }
    if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  }

  tap(): void {
    this.fire(8, 'LIGHT', 60);
  }

  hurt(): void {
    this.fire(28, 'MEDIUM', 120);
  }

  reaction(): void {
    this.fire(12, 'LIGHT', 90);
  }

  levelUp(): void {
    this.fire([18, 40, 18], 'MEDIUM', 200);
  }

  boss(): void {
    this.fire([40, 60, 70], 'HEAVY', 300);
  }

  eveil(): void {
    this.fire([20, 30, 40, 30, 80], 'HEAVY', 300);
  }

  death(): void {
    this.fire([60, 40, 120], 'HEAVY', 300);
  }
}
