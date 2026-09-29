/**
 * Grille spatiale uniforme, reconstruite à chaque tick par tri par comptage (O(n), aucune
 * allocation). Elle couvre une fenêtre centrée sur un point (le joueur) : les entités hors
 * fenêtre sont rangées dans les cellules du bord, ce qui reste correct (les requêtes
 * vérifient ensuite la distance exacte).
 */
export class SpatialGrid {
  readonly cols: number;
  readonly rows: number;
  originX = 0;
  originY = 0;
  private readonly cellStart: Int32Array;
  private readonly cellFill: Int32Array;
  private readonly items: Int32Array;
  private readonly itemCell: Int32Array;
  count = 0;

  constructor(
    readonly cellSize: number,
    cols: number,
    rows: number,
    readonly capacity: number,
  ) {
    this.cols = cols;
    this.rows = rows;
    this.cellStart = new Int32Array(cols * rows + 1);
    this.cellFill = new Int32Array(cols * rows);
    this.items = new Int32Array(capacity);
    this.itemCell = new Int32Array(capacity);
  }

  get width(): number {
    return this.cols * this.cellSize;
  }

  get height(): number {
    return this.rows * this.cellSize;
  }

  private cellX(x: number): number {
    const c = Math.floor((x - this.originX) / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private cellY(y: number): number {
    const c = Math.floor((y - this.originY) / this.cellSize);
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  /** Reconstruit la grille autour de (cx, cy) à partir des `n` premiers eids de `list`. */
  rebuild(
    cx: number,
    cy: number,
    list: Int32Array,
    n: number,
    xs: Float32Array,
    ys: Float32Array,
  ): void {
    this.originX = cx - this.width / 2;
    this.originY = cy - this.height / 2;
    const cells = this.cols * this.rows;
    const start = this.cellStart;
    const fill = this.cellFill;
    start.fill(0);
    const count = n < this.capacity ? n : this.capacity;
    for (let i = 0; i < count; i++) {
      const eid = list[i];
      const c = this.cellY(ys[eid]) * this.cols + this.cellX(xs[eid]);
      this.itemCell[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < cells; c++) {
      start[c + 1] += start[c];
      fill[c] = start[c];
    }
    for (let i = 0; i < count; i++) this.items[fill[this.itemCell[i]]++] = list[i];
    this.count = count;
  }

  /**
   * Écrit dans `out` les eids des cellules recouvrant le cercle (x, y, r) : candidats à tester
   * par distance exacte. Renvoie leur nombre (borné par la taille de `out`).
   */
  query(x: number, y: number, r: number, out: Int32Array): number {
    const x0 = this.cellX(x - r);
    const x1 = this.cellX(x + r);
    const y0 = this.cellY(y - r);
    const y1 = this.cellY(y + r);
    const max = out.length;
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * this.cols;
      for (let cx = x0; cx <= x1; cx++) {
        const c = row + cx;
        const end = this.cellStart[c + 1];
        for (let k = this.cellStart[c]; k < end; k++) {
          if (n >= max) return n;
          out[n++] = this.items[k];
        }
      }
    }
    return n;
  }
}
