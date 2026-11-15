import Phaser from 'phaser';
import { FONT } from '../render/MeerkatView';
import { playSfx } from '../render/Sfx';
import type { MiniGameResult } from '../sim/World';
import type { MiniGame, MiniGameContext } from './types';

const N = 5;
const COLORS = [0xe5442e, 0x4a90d9, 0xf2c94c, 0x6fb04a, 0xb06ad9];

interface Fibre {
  color: number;
  a: number;
  b: number;
  path: number[];
  done: boolean;
}

/**
 * Weaver's Knot (Tinkering Workshop): drag matching coloured grass fibres
 * across the loom to connect them, without crossing another fibre.
 */
export class WeaversKnot implements MiniGame {
  readonly title = "🧵 Weaver's Knot";
  readonly instructions = 'Drag from a knot to its matching colour. Fibres can’t cross!';
  private gfx: Phaser.GameObjects.Graphics;
  private fibres: Fibre[] = [];
  private active: Fibre | null = null;
  private cell: number;
  private ox: number;
  private oy: number;
  private knots = 0;
  private tangles = 0;
  private looms = 0;
  private nextT = 0;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor(private ctx: MiniGameContext) {
    const { scene, area: a } = ctx;
    this.cell = Math.floor(Math.min((a.height - 16) / N, (a.width - 16) / N, 64));
    this.ox = a.centerX - (this.cell * N) / 2;
    this.oy = a.centerY - (this.cell * N) / 2;
    this.gfx = scene.add.graphics();
    this.newLoom();
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
  }

  /** Lay out random non-overlapping fibre paths, then show only their ends. */
  private newLoom(): void {
    for (let tries = 0; tries < 200; tries++) {
      const used = new Set<number>();
      const out: Fibre[] = [];
      const want = this.looms < 2 ? 3 : 4;
      for (let c = 0; c < want; c++) {
        const free = [...Array(N * N).keys()].filter((i) => !used.has(i));
        let cur = free[Math.floor(Math.random() * free.length)];
        const path = [cur];
        const len = 3 + Math.floor(Math.random() * 4);
        while (path.length < len) {
          const nb = this.neighbours(cur).filter((i) => !used.has(i) && !path.includes(i));
          if (!nb.length) break;
          cur = nb[Math.floor(Math.random() * nb.length)];
          path.push(cur);
        }
        const [a, b] = [path[0], path[path.length - 1]];
        const gap = Math.abs((a % N) - (b % N)) + Math.abs(Math.floor(a / N) - Math.floor(b / N));
        if (path.length < 3 || gap < 2) break;
        path.forEach((i) => used.add(i));
        out.push({ color: COLORS[c], a: path[0], b: path[path.length - 1], path: [], done: false });
      }
      if (out.length === want) {
        this.fibres = out;
        this.looms++;
        return;
      }
    }
  }

  private neighbours(i: number): number[] {
    const x = i % N;
    const y = Math.floor(i / N);
    const out: number[] = [];
    if (x > 0) out.push(i - 1);
    if (x < N - 1) out.push(i + 1);
    if (y > 0) out.push(i - N);
    if (y < N - 1) out.push(i + N);
    return out;
  }

  private cellAt(px: number, py: number): number {
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    return x >= 0 && y >= 0 && x < N && y < N ? y * N + x : -1;
  }

  private owner(i: number): Fibre | undefined {
    return this.fibres.find((f) => f.a === i || f.b === i || f.path.includes(i));
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.nextT > 0) return;
    const i = this.cellAt(p.x, p.y);
    const f = this.fibres.find((k) => !k.done && (k.a === i || k.b === i));
    if (!f) return;
    this.active = f;
    f.path = [i];
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const f = this.active;
    if (!f || !p.isDown) return;
    const target = this.cellAt(p.x, p.y);
    if (target < 0) return;
    // Fast swipes skip squares: walk toward the finger one square at a time.
    for (let guard = 0; guard < N * 2 && this.active === f; guard++) {
      const last = f.path[f.path.length - 1];
      if (last === target) return;
      const lx = last % N;
      const ly = Math.floor(last / N);
      const tx = target % N;
      const ty = Math.floor(target / N);
      const steps: number[] = [];
      if (tx !== lx) steps.push(last + Math.sign(tx - lx));
      if (ty !== ly) steps.push(last + Math.sign(ty - ly) * N);
      if (!steps.some((i) => this.step(f, i))) return;
    }
  }

  /** Extend (or backtrack) the active fibre into square i; false if blocked. */
  private step(f: Fibre, i: number): boolean {
    if (f.path.length > 1 && f.path[f.path.length - 2] === i) {
      f.path.pop(); // backtrack
      return true;
    }
    const goal = f.path[0] === f.a ? f.b : f.a;
    const o = this.owner(i);
    if ((o && o !== f) || f.path.includes(i) || (i !== goal && (i === f.a || i === f.b))) return false;
    f.path.push(i);
    if (i === goal) {
      f.done = true;
      this.active = null;
      this.knots++;
      playSfx('pop');
      this.pop(i, 'Knotted!');
      if (this.fibres.every((k) => k.done)) {
        playSfx('success');
        this.nextT = 0.5;
      }
    }
    return true;
  }

  private onUp(): void {
    const f = this.active;
    if (f && !f.done) {
      if (f.path.length > 1) this.tangles++;
      f.path = [];
    }
    this.active = null;
  }

  private pop(i: number, s: string): void {
    const x = this.ox + ((i % N) + 0.5) * this.cell;
    const y = this.oy + (Math.floor(i / N) + 0.5) * this.cell;
    const t = this.ctx.scene.add
      .text(x, y - 10, s, { fontFamily: FONT, fontSize: '15px', color: '#b8f28c', stroke: '#2b1d14', strokeThickness: 4 })
      .setOrigin(0.5)
      .setResolution(2);
    this.texts.push(t);
    this.ctx.scene.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  update(dt: number): void {
    if (this.nextT > 0) {
      this.nextT -= dt;
      if (this.nextT <= 0) this.newLoom();
    }
    const g = this.gfx;
    const a = this.ctx.area;
    const c = this.cell;
    g.clear();
    g.fillStyle(0x5c4632, 1);
    g.fillRect(a.x, a.y, a.width, a.height);
    g.fillStyle(0x8b6a43, 1);
    g.fillRoundedRect(this.ox - 8, this.oy - 8, c * N + 16, c * N + 16, 10);
    g.lineStyle(1, 0x6b4a2b, 1);
    for (let k = 0; k <= N; k++) {
      g.lineBetween(this.ox + k * c, this.oy, this.ox + k * c, this.oy + N * c);
      g.lineBetween(this.ox, this.oy + k * c, this.ox + N * c, this.oy + k * c);
    }
    const center = (i: number) => ({ x: this.ox + ((i % N) + 0.5) * c, y: this.oy + (Math.floor(i / N) + 0.5) * c });
    for (const f of this.fibres) {
      if (f.path.length > 1) {
        g.lineStyle(c * 0.28, f.color, f.done ? 1 : 0.8);
        for (let k = 1; k < f.path.length; k++) {
          const p = center(f.path[k - 1]);
          const q = center(f.path[k]);
          g.lineBetween(p.x, p.y, q.x, q.y);
        }
      }
      for (const e of [f.a, f.b]) {
        const p = center(e);
        g.fillStyle(f.color, 1);
        g.fillCircle(p.x, p.y, c * 0.3);
        g.lineStyle(2, 0x2b1d14, 0.6);
        g.strokeCircle(p.x, p.y, c * 0.3);
      }
    }
  }

  finished(): boolean {
    return false;
  }

  scoreLabel(): string {
    return `Knots ${this.knots} · Tangles ${this.tangles}`;
  }

  result(): MiniGameResult {
    return { kind: 'weave', score: this.knots, max: this.knots + this.tangles, perfect: this.tangles === 0 && this.knots >= 6 };
  }

  destroy(): void {
    const s = this.ctx.scene;
    s.input.off('pointerdown', this.onDown, this);
    s.input.off('pointermove', this.onMove, this);
    s.input.off('pointerup', this.onUp, this);
    this.texts.forEach((t) => t.destroy());
    this.gfx.destroy();
  }
}
