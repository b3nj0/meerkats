import { CFG } from '../config';
import type { Rng } from './rng';

export const T = {
  Sky: 0,
  /** The walkable strip of air directly above the ground. */
  Air: 1,
  Sand: 2,
  Clay: 3,
  Rock: 4,
  Tunnel: 5,
  BoltHole: 6,
  /** Deep strata: need Flint Picks (Ironstone) and Crystal-Tipped Picks (Crystal Deep) from the Chronicle. */
  Stone: 7,
  Crystal: 8,
} as const;
export type TileId = (typeof T)[keyof typeof T];

export class Grid {
  readonly tiles: Uint8Array;
  /** Room id occupying each cell, or -1. Only underground rooms are recorded here. */
  readonly roomAt: Int16Array;
  /** Cells temporarily impassable (a jackal barking at a hole). */
  readonly blocked: Uint8Array;
  /** Underground cells the colony has seen. Deeper soil stays dark until a tunnel comes near. */
  readonly revealed: Uint8Array;
  /** Cells changed since the renderer last looked. */
  readonly changed: number[] = [];
  /** Hardest stratum Diggers can carve: 0 sand & clay, 1 + Ironstone, 2 + Crystal Deep. */
  digTier = 0;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly surfaceY: number,
  ) {
    this.tiles = new Uint8Array(w * h);
    this.roomAt = new Int16Array(w * h).fill(-1);
    this.blocked = new Uint8Array(w * h);
    this.revealed = new Uint8Array(w * h);
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  xOf(i: number): number {
    return i % this.w;
  }
  yOf(i: number): number {
    return (i / this.w) | 0;
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x: number, y: number): number {
    return this.inBounds(x, y) ? this.tiles[this.idx(x, y)] : T.Rock;
  }
  set(x: number, y: number, t: TileId): void {
    const i = this.idx(x, y);
    this.tiles[i] = t;
    this.changed.push(i);
    if (this.walkableAt(i)) this.reveal(x, y, CFG.REVEAL_RADIUS);
  }

  /** Light up the soil around a cell. Returns how many cells were newly revealed. */
  reveal(cx: number, cy: number, r: number): number {
    let n = 0;
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inBounds(x, y) || (x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r + 1) continue;
        const i = this.idx(x, y);
        if (this.revealed[i]) continue;
        this.revealed[i] = 1;
        this.changed.push(i);
        n++;
      }
    return n;
  }

  /** Reset the fog: the sky and topsoil are visible, plus the soil around every tunnel. */
  resetFog(): void {
    const top = this.surfaceY + CFG.FOG_FREE;
    for (let i = 0; i < this.tiles.length; i++) this.revealed[i] = this.yOf(i) < top ? 1 : 0;
    for (let i = 0; i < this.tiles.length; i++)
      if (this.walkableAt(i) && this.yOf(i) >= this.surfaceY) this.reveal(this.xOf(i), this.yOf(i), CFG.REVEAL_RADIUS);
  }

  /** Rows below the surface. */
  depthOf(i: number): number {
    return this.yOf(i) - this.surfaceY;
  }

  /** Solid deep rock that the colony's tools can't carve yet. */
  lockedAt(i: number): boolean {
    const t = this.tiles[i];
    return (t === T.Stone && this.digTier < 1) || (t === T.Crystal && this.digTier < 2);
  }

  walkableAt(i: number): boolean {
    if (this.blocked[i]) return false;
    const t = this.tiles[i];
    return t === T.Air || t === T.Tunnel || t === T.BoltHole;
  }
  walkable(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.walkableAt(this.idx(x, y));
  }
  solidAt(i: number): boolean {
    const t = this.tiles[i];
    return t === T.Sand || t === T.Clay || t === T.Rock || t === T.Stone || t === T.Crystal;
  }
  diggableAt(i: number): boolean {
    const t = this.tiles[i];
    if (this.yOf(i) < this.surfaceY) return false;
    return t === T.Sand || t === T.Clay || (t === T.Stone && this.digTier >= 1) || (t === T.Crystal && this.digTier >= 2);
  }
  undergroundAt(i: number): boolean {
    return this.yOf(i) >= this.surfaceY;
  }
  digTime(i: number): number {
    const t = this.tiles[i];
    return t === T.Crystal ? CFG.DIG_CRYSTAL : t === T.Stone ? CFG.DIG_STONE : t === T.Clay ? CFG.DIG_CLAY : CFG.DIG_SAND;
  }

  generate(rng: Rng): void {
    const { w, h, surfaceY: sy } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t: TileId;
        if (y < sy - 1) t = T.Sky;
        else if (y === sy - 1) t = T.Air;
        else {
          const d = y - sy;
          const sand = CFG.SAND_DEPTH + Math.round(Math.sin(x * 0.17) * 1.5 + Math.sin(x * 0.05 + 1) * 1.5);
          const stone = CFG.STONE_DEPTH + Math.round(Math.sin(x * 0.11 + 2) * 1.5 + Math.sin(x * 0.04) * 1.2);
          const crystal = CFG.CRYSTAL_DEPTH + Math.round(Math.sin(x * 0.13 + 4) * 1.5 + Math.sin(x * 0.06 + 3) * 1);
          t = d < sand ? T.Sand : d < stone ? T.Clay : d < crystal ? T.Stone : T.Crystal;
        }
        if (y >= h - 2 || (y >= sy && (x === 0 || x === w - 1))) t = T.Rock;
        this.tiles[this.idx(x, y)] = t;
      }
    }
    // Clay pockets in the sand layer.
    for (let k = 0; k < 10; k++) {
      const cx = rng.int(2, w - 3);
      const cy = rng.int(sy + 3, sy + CFG.SAND_DEPTH);
      const r = rng.range(1, 2.2);
      if (Math.abs(cx - CFG.ENTRANCE_X) < 7) continue;
      this.blob(cx, cy, r, (i) => {
        if (this.tiles[i] === T.Sand) this.tiles[i] = T.Clay;
      });
    }
    // Undiggable rock outcrops deeper down.
    for (let k = 0; k < 14; k++) {
      const cx = rng.int(2, w - 3);
      const cy = rng.int(sy + CFG.SAND_DEPTH + 1, h - 4);
      const r = rng.range(1.2, 3.2);
      if (Math.abs(cx - CFG.ENTRANCE_X) < 8) continue;
      this.blob(cx, cy, r, (i) => {
        if (this.yOf(i) >= sy) this.tiles[i] = T.Rock;
      });
    }
    this.resetFog();
    this.changed.length = 0;
  }

  /**
   * Extra outcrops in the deep strata. Uses its own rng so older parts of the
   * simulation see the same random sequence as before the strata existed.
   */
  generateDeep(rng: Rng): void {
    const sy = this.surfaceY;
    for (let k = 0; k < 12; k++) {
      const cx = rng.int(2, this.w - 3);
      const cy = rng.int(sy + CFG.STONE_DEPTH, this.h - 4);
      const r = rng.range(1.2, 3);
      if (Math.abs(cx - CFG.ENTRANCE_X) < 6) continue;
      this.blob(cx, cy, r, (i) => {
        if (this.yOf(i) >= sy) this.tiles[i] = T.Rock;
      });
    }
    this.changed.length = 0;
  }

  /** Make a small patch diggable again (a discovery must never be sealed inside solid rock). */
  clearRock(cx: number, cy: number, r: number, fill: TileId): void {
    this.blob(cx, cy, r, (i) => {
      if (this.tiles[i] === T.Rock && this.yOf(i) < this.h - 2 && this.xOf(i) > 0 && this.xOf(i) < this.w - 1) this.tiles[i] = fill;
    });
  }

  private blob(cx: number, cy: number, r: number, fn: (i: number) => void): void {
    const R = Math.ceil(r) + 1;
    for (let y = cy - R; y <= cy + R; y++) {
      for (let x = cx - R; x <= cx + R; x++) {
        if (!this.inBounds(x, y)) continue;
        const dx = x - cx;
        const dy = (y - cy) * 1.3;
        if (dx * dx + dy * dy <= r * r) fn(this.idx(x, y));
      }
    }
  }
}
