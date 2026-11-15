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
} as const;
export type TileId = (typeof T)[keyof typeof T];

export class Grid {
  readonly tiles: Uint8Array;
  /** Room id occupying each cell, or -1. Only underground rooms are recorded here. */
  readonly roomAt: Int16Array;
  /** Cells temporarily impassable (a jackal barking at a hole). */
  readonly blocked: Uint8Array;
  /** Cells changed since the renderer last looked. */
  readonly changed: number[] = [];

  constructor(
    readonly w: number,
    readonly h: number,
    readonly surfaceY: number,
  ) {
    this.tiles = new Uint8Array(w * h);
    this.roomAt = new Int16Array(w * h).fill(-1);
    this.blocked = new Uint8Array(w * h);
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
    return t === T.Sand || t === T.Clay || t === T.Rock;
  }
  diggableAt(i: number): boolean {
    const t = this.tiles[i];
    return (t === T.Sand || t === T.Clay) && this.yOf(i) >= this.surfaceY;
  }
  undergroundAt(i: number): boolean {
    return this.yOf(i) >= this.surfaceY;
  }
  digTime(i: number): number {
    return this.tiles[i] === T.Clay ? CFG.DIG_CLAY : CFG.DIG_SAND;
  }

  generate(rng: Rng): void {
    const { w, h, surfaceY: sy } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t: TileId;
        if (y < sy - 1) t = T.Sky;
        else if (y === sy - 1) t = T.Air;
        else {
          const depth = CFG.SAND_DEPTH + Math.round(Math.sin(x * 0.17) * 1.5 + Math.sin(x * 0.05 + 1) * 1.5);
          t = y - sy < depth ? T.Sand : T.Clay;
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
    this.changed.length = 0;
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
