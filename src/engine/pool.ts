/**
 * Pool d'entités d'un archétype : toutes les entités sont créées une fois au démarrage (avec
 * leurs composants), puis activées / désactivées sans allocation. La liste active est dense
 * (Int32Array) et se parcourt par index ; `despawn` échange avec le dernier élément, donc une
 * boucle qui désactive des entités doit parcourir la liste à l'envers.
 */
export class EntityPool {
  /** Entités actives, denses sur [0, count). */
  readonly active: Int32Array;
  count = 0;
  private readonly free: Int32Array;
  private freeCount = 0;
  /** Position de chaque entité dans `active` (-1 si inactive), indexée par eid. */
  private readonly slot: Int32Array;

  constructor(
    readonly name: string,
    readonly capacity: number,
    maxEntities: number,
    create: () => number,
    /** Remise à zéro des composants d'une entité (appelée à chaque activation). */
    readonly reset: (eid: number) => void = () => undefined,
  ) {
    this.active = new Int32Array(capacity);
    this.free = new Int32Array(capacity);
    this.slot = new Int32Array(maxEntities).fill(-1);
    // Pile de libres : on dépile dans l'ordre de création (déterminisme).
    const created = new Int32Array(capacity);
    for (let i = 0; i < capacity; i++) {
      const eid = create();
      if (eid >= maxEntities) throw new Error(`Pool ${name} : eid ${eid} ≥ ${maxEntities}`);
      created[i] = eid;
    }
    for (let i = capacity - 1; i >= 0; i--) this.free[this.freeCount++] = created[i];
  }

  /** Active une entité ; renvoie son eid, ou -1 si le pool est plein. */
  spawn(): number {
    if (this.freeCount === 0) return -1;
    const eid = this.free[--this.freeCount];
    this.slot[eid] = this.count;
    this.active[this.count++] = eid;
    return eid;
  }

  despawn(eid: number): void {
    const i = this.slot[eid];
    if (i < 0) return;
    const last = this.active[--this.count];
    this.active[i] = last;
    this.slot[last] = i;
    this.slot[eid] = -1;
    this.free[this.freeCount++] = eid;
  }

  isActive(eid: number): boolean {
    return this.slot[eid] >= 0;
  }

  get full(): boolean {
    return this.freeCount === 0;
  }

  /** Pile des entités libres, du fond vers le sommet (instantané de partie). */
  freeStack(): Int32Array {
    return this.free.slice(0, this.freeCount);
  }

  /**
   * Restauration d'un instantané : liste active et pile des libres exactes (l'ordre des
   * libres décide des identifiants des prochaines entités, donc de la suite de la partie).
   */
  restore(active: ArrayLike<number>, free: ArrayLike<number>): void {
    if (active.length + free.length !== this.capacity) {
      throw new Error(`Pool ${this.name} : instantané incohérent`);
    }
    this.slot.fill(-1);
    this.count = 0;
    for (let k = 0; k < active.length; k++) {
      const eid = active[k];
      this.slot[eid] = this.count;
      this.active[this.count++] = eid;
    }
    this.freeCount = 0;
    for (let k = 0; k < free.length; k++) this.free[this.freeCount++] = free[k];
  }

  /** Désactive tout (fin de run), en conservant l'ordre déterministe des libres. */
  clear(): void {
    for (let i = this.count - 1; i >= 0; i--) this.despawn(this.active[i]);
  }
}
