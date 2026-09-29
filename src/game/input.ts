/**
 * Contrôles : joystick virtuel flottant (apparaît sous le pouce et le suit), dash au tap d'un
 * second doigt ou sur le bouton, clavier (ZQSD / WASD / flèches, Espace, Échap) pour le bureau.
 */
import type { SimInput } from '../systems/state';

export interface InputSettings {
  /** Sensibilité du joystick (0,6 à 1,6) : plus haut = course plus courte. */
  sensitivity: number;
  leftHanded: boolean;
  aim: 'auto' | 'direction';
}

export const DEFAULT_INPUT: InputSettings = { sensitivity: 1, leftHanded: false, aim: 'auto' };

const DEAD_ZONE = 0.12;
const BASE_RADIUS = 58;

export class GameInput {
  moveX = 0;
  moveY = 0;
  joyActive = false;
  joyX = 0;
  joyY = 0;
  knobX = 0;
  knobY = 0;
  isTouch = false;
  onPause: (() => void) | null = null;
  private joyId = -1;
  private dashPending = false;
  private readonly keys = new Set<string>();
  private readonly listeners: [EventTarget, string, EventListener][] = [];

  constructor(
    private readonly el: HTMLElement,
    public settings: InputSettings,
    private readonly dashButton: () => { x: number; y: number; r: number },
  ) {
    this.isTouch = window.matchMedia('(pointer: coarse)').matches;
  }

  get radius(): number {
    return BASE_RADIUS / this.settings.sensitivity;
  }

  attach(): void {
    const on = <K extends keyof HTMLElementEventMap>(
      target: EventTarget,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ): void => {
      target.addEventListener(type, fn as EventListener, { passive: false });
      this.listeners.push([target, type, fn as EventListener]);
    };
    on(this.el, 'pointerdown', (e) => {
      this.onDown(e);
    });
    on(this.el, 'pointermove', (e) => {
      this.onMove(e);
    });
    on(this.el, 'pointerup', (e) => {
      this.onUp(e);
    });
    on(this.el, 'pointercancel', (e) => {
      this.onUp(e);
    });
    on(this.el, 'contextmenu', (e) => {
      e.preventDefault();
    });
    on(window, 'keydown', (e) => {
      this.onKey(e, true);
    });
    on(window, 'keyup', (e) => {
      this.onKey(e, false);
    });
    on(window, 'blur', () => {
      this.keys.clear();
      this.release();
    });
  }

  detach(): void {
    for (const [target, type, fn] of this.listeners) target.removeEventListener(type, fn);
    this.listeners.length = 0;
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown(e: PointerEvent): void {
    e.preventDefault();
    if (e.pointerType === 'touch') this.isTouch = true;
    const p = this.local(e);
    const b = this.dashButton();
    if (this.isTouch && Math.hypot(p.x - b.x, p.y - b.y) < b.r) {
      this.dashPending = true;
      return;
    }
    if (this.joyActive) {
      // Second doigt : dash.
      this.dashPending = true;
      return;
    }
    this.joyActive = true;
    this.joyId = e.pointerId;
    this.joyX = p.x;
    this.joyY = p.y;
    this.knobX = p.x;
    this.knobY = p.y;
    this.moveX = 0;
    this.moveY = 0;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Capture refusée (pointeur déjà relâché) : sans conséquence.
    }
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.joyId) return;
    e.preventDefault();
    const p = this.local(e);
    let dx = p.x - this.joyX;
    let dy = p.y - this.joyY;
    const r = this.radius;
    const d = Math.hypot(dx, dy);
    if (d > r) {
      // Le joystick suit le pouce quand il dépasse la course.
      this.joyX = p.x - (dx / d) * r;
      this.joyY = p.y - (dy / d) * r;
      dx = (dx / d) * r;
      dy = (dy / d) * r;
    }
    this.knobX = this.joyX + dx;
    this.knobY = this.joyY + dy;
    const m = Math.hypot(dx, dy) / r;
    if (m < DEAD_ZONE) {
      this.moveX = 0;
      this.moveY = 0;
    } else {
      const k = (m - DEAD_ZONE) / (1 - DEAD_ZONE) / m;
      this.moveX = (dx / r) * k;
      this.moveY = (dy / r) * k;
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.joyId) this.release();
  }

  private release(): void {
    this.joyActive = false;
    this.joyId = -1;
    this.moveX = 0;
    this.moveY = 0;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if (down && (k === 'escape' || k === 'p')) {
      this.onPause?.();
      return;
    }
    if (down && (k === ' ' || k === 'shift')) {
      e.preventDefault();
      this.dashPending = true;
      return;
    }
    if (down) this.keys.add(k);
    else this.keys.delete(k);
  }

  /** Écrit l'état des contrôles dans l'entrée de la simulation (une fois par tick). */
  apply(input: SimInput): void {
    let kx = 0;
    let ky = 0;
    const k = this.keys;
    if (k.has('arrowleft') || k.has('a') || k.has('q')) kx -= 1;
    if (k.has('arrowright') || k.has('d')) kx += 1;
    if (k.has('arrowup') || k.has('w') || k.has('z')) ky -= 1;
    if (k.has('arrowdown') || k.has('s')) ky += 1;
    if (kx !== 0 || ky !== 0) {
      const l = Math.hypot(kx, ky);
      input.moveX = kx / l;
      input.moveY = ky / l;
    } else {
      input.moveX = this.moveX;
      input.moveY = this.moveY;
    }
    if (this.dashPending) {
      input.dash = true;
      this.dashPending = false;
    }
    input.aim = this.settings.aim;
  }
}
