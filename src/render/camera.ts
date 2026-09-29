/** Caméra : suivi amorti, zoom adapté à l'écran, tremblement (modèle « trauma »). */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  /** Hauteur (ou largeur en paysage) de monde visible visée, en unités. */
  viewSpan = 960;
  /** Amplitude du tremblement réglable (0 à 1). */
  shakeScale = 1;
  offsetX = 0;
  offsetY = 0;
  private trauma = 0;
  private time = 0;

  resize(width: number, height: number): void {
    const span = Math.max(width, height);
    this.zoom = span / this.viewSpan;
  }

  follow(tx: number, ty: number, dt: number, snap = false): void {
    if (snap) {
      this.x = tx;
      this.y = ty;
    } else {
      const k = 1 - Math.exp(-dt * 10);
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
    }
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma * this.shakeScale;
    const t = this.time * 38;
    this.offsetX = s * 14 * (Math.sin(t * 1.1) + Math.sin(t * 2.3 + 1.7) * 0.5);
    this.offsetY = s * 14 * (Math.sin(t * 1.3 + 0.6) + Math.sin(t * 2.9 + 2.2) * 0.5);
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }
}
