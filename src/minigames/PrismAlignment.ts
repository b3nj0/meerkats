import Phaser from 'phaser';
import { FONT } from '../render/MeerkatView';
import { playSfx } from '../render/Sfx';
import type { MiniGameResult } from '../sim/World';
import type { MiniGame, MiniGameContext } from './types';

const COLS = 6;
const ROWS = 4;
type Mirror = '/' | '\\';

/** Reflect a direction off a mirror. Up is dy = -1. */
export function reflect(m: Mirror, dx: number, dy: number): [number, number] {
  return m === '/' ? [-dy, -dx] : [dy, dx];
}

/**
 * Prism Alignment (Crystal Conservatory): tap the selenite mirrors to rotate them
 * until the sunbeam reaches the dormant bloom.
 */
export class PrismAlignment implements MiniGame {
  readonly title = '🍄 Prism Alignment';
  readonly instructions = 'Tap crystal mirrors to turn them. Guide the sunbeam to the sleeping bloom!';
  private gfx: Phaser.GameObjects.Graphics;
  private mirrors = new Map<number, Mirror>();
  private startRow = 0;
  private bloom = 0;
  private cell: number;
  private ox: number;
  private oy: number;
  private blooms = 0;
  private taps = 0;
  private winT = 0;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor(private ctx: MiniGameContext) {
    const { scene, area: a } = ctx;
    this.cell = Math.floor(Math.min((a.height - 20) / ROWS, (a.width - 80) / COLS, 72));
    this.ox = a.centerX - (this.cell * COLS) / 2 + 20;
    this.oy = a.centerY - (this.cell * ROWS) / 2;
    this.gfx = scene.add.graphics();
    this.newPuzzle();
    scene.input.on('pointerdown', this.onTap, this);
  }

  private newPuzzle(): void {
    for (let tries = 0; tries < 100; tries++) {
      this.mirrors.clear();
      this.startRow = Math.floor(Math.random() * ROWS);
      let x = 0;
      let y = this.startRow;
      let dx = 1;
      let dy = 0;
      const visited = new Set<number>();
      const len = 6 + Math.floor(Math.random() * 4);
      let ok = true;
      for (let step = 0; step < len; step++) {
        const i = y * COLS + x;
        visited.add(i);
        if (step > 0 && step < len - 1 && Math.random() < 0.45) {
          // turn here with a mirror
          const opts: [number, number][] = dx ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
          const valid = opts.filter(([ndx, ndy]) => {
            const nx = x + ndx;
            const ny = y + ndy;
            return nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && !visited.has(ny * COLS + nx);
          });
          if (valid.length) {
            const [ndx, ndy] = valid[Math.floor(Math.random() * valid.length)];
            const m: Mirror = reflect('/', dx, dy)[0] === ndx && reflect('/', dx, dy)[1] === ndy ? '/' : '\\';
            this.mirrors.set(i, m);
            dx = ndx;
            dy = ndy;
          }
        }
        if (step === len - 1) break;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || visited.has(ny * COLS + nx)) {
          ok = false;
          break;
        }
        x = nx;
        y = ny;
      }
      if (!ok || this.mirrors.size < 2) continue;
      this.bloom = y * COLS + x;
      // decoy mirrors off the path
      for (let k = 0; k < 2; k++) {
        const free = [...Array(COLS * ROWS).keys()].filter((i) => !visited.has(i) && !this.mirrors.has(i));
        if (free.length) this.mirrors.set(free[Math.floor(Math.random() * free.length)], Math.random() < 0.5 ? '/' : '\\');
      }
      // scramble until the beam misses
      for (const [i, m] of this.mirrors) if (Math.random() < 0.6) this.mirrors.set(i, m === '/' ? '\\' : '/');
      if (this.trace().lit) {
        const first = [...this.mirrors.keys()][0];
        this.mirrors.set(first, this.mirrors.get(first) === '/' ? '\\' : '/');
        if (this.trace().lit) continue;
      }
      return;
    }
  }

  /** Follow the sunbeam from the left edge. */
  private trace(): { pts: number[]; lit: boolean } {
    let x = 0;
    let y = this.startRow;
    let dx = 1;
    let dy = 0;
    const pts: number[] = [];
    for (let n = 0; n < 40; n++) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return { pts, lit: false };
      const i = y * COLS + x;
      pts.push(i);
      if (i === this.bloom) return { pts, lit: true };
      const m = this.mirrors.get(i);
      if (m) [dx, dy] = reflect(m, dx, dy);
      x += dx;
      y += dy;
    }
    return { pts, lit: false };
  }

  private onTap(p: Phaser.Input.Pointer): void {
    if (this.winT > 0) return;
    const x = Math.floor((p.x - this.ox) / this.cell);
    const y = Math.floor((p.y - this.oy) / this.cell);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const i = y * COLS + x;
    const m = this.mirrors.get(i);
    if (!m) return;
    this.mirrors.set(i, m === '/' ? '\\' : '/');
    this.taps++;
    playSfx('pop');
    if (this.trace().lit) {
      this.blooms++;
      this.winT = 0.8;
      playSfx('success');
      const t = this.ctx.scene.add
        .text(this.ox + ((this.bloom % COLS) + 0.5) * this.cell, this.oy + Math.floor(this.bloom / COLS) * this.cell, 'Bloom! 🌸', {
          fontFamily: FONT, fontSize: '16px', color: '#b8f28c', stroke: '#14202a', strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setResolution(2);
      this.texts.push(t);
      this.ctx.scene.tweens.add({ targets: t, y: t.y - 26, alpha: 0, duration: 800, onComplete: () => t.destroy() });
    }
  }

  update(dt: number, time: number): void {
    if (this.winT > 0) {
      this.winT -= dt;
      if (this.winT <= 0) this.newPuzzle();
    }
    const g = this.gfx;
    const a = this.ctx.area;
    const c = this.cell;
    g.clear();
    g.fillStyle(0x24303a, 1);
    g.fillRect(a.x, a.y, a.width, a.height);
    g.fillStyle(0x3a4a5a, 1);
    for (let i = 0; i < COLS * ROWS; i++) g.fillRoundedRect(this.ox + (i % COLS) * c + 3, this.oy + Math.floor(i / COLS) * c + 3, c - 6, c - 6, 6);
    const center = (i: number) => ({ x: this.ox + ((i % COLS) + 0.5) * c, y: this.oy + (Math.floor(i / COLS) + 0.5) * c });
    // sun on the left
    const sy = this.oy + (this.startRow + 0.5) * c;
    g.fillStyle(0xffd23f, 1);
    g.fillCircle(this.ox - 26, sy, 14);
    const tr = this.trace();
    g.lineStyle(5, 0xfff3b0, 0.85 + Math.sin(time * 0.01) * 0.1);
    let prev = { x: this.ox - 12, y: sy };
    for (const i of tr.pts) {
      const p = center(i);
      g.lineBetween(prev.x, prev.y, p.x, p.y);
      prev = p;
    }
    // bloom
    const b = center(this.bloom);
    g.fillStyle(tr.lit ? 0xff8ac6 : 0x6b5a7a, 1);
    for (let k = 0; k < 5; k++) {
      const ang = (k / 5) * Math.PI * 2 + (tr.lit ? time * 0.003 : 0);
      g.fillCircle(b.x + Math.cos(ang) * c * 0.16, b.y + Math.sin(ang) * c * 0.16, c * (tr.lit ? 0.14 : 0.1));
    }
    g.fillStyle(tr.lit ? 0xffe14d : 0x8a7f72, 1);
    g.fillCircle(b.x, b.y, c * 0.09);
    // mirrors
    for (const [i, m] of this.mirrors) {
      const p = center(i);
      const r = c * 0.36;
      g.lineStyle(6, 0x8fd3ff, 1);
      if (m === '/') g.lineBetween(p.x - r, p.y + r, p.x + r, p.y - r);
      else g.lineBetween(p.x - r, p.y - r, p.x + r, p.y + r);
      g.lineStyle(2, 0xffffff, 0.8);
      if (m === '/') g.lineBetween(p.x - r * 0.6, p.y + r * 0.6, p.x + r * 0.6, p.y - r * 0.6);
      else g.lineBetween(p.x - r * 0.6, p.y - r * 0.6, p.x + r * 0.6, p.y + r * 0.6);
    }
  }

  finished(): boolean {
    return false;
  }

  scoreLabel(): string {
    return `Blooms ${this.blooms} · Turns ${this.taps}`;
  }

  result(): MiniGameResult {
    return { kind: 'prism', score: this.blooms, max: Math.max(this.blooms, 1), perfect: this.blooms >= 4 };
  }

  destroy(): void {
    this.ctx.scene.input.off('pointerdown', this.onTap, this);
    this.texts.forEach((t) => t.destroy());
    this.gfx.destroy();
  }
}
