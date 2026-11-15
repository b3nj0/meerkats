import Phaser from 'phaser';
import { FONT } from '../render/MeerkatView';
import type { MiniGameResult } from '../sim/World';
import { rand, type MiniGame, type MiniGameContext } from './types';

type Kind = 'beetle' | 'root' | 'berry';
const KINDS: Kind[] = ['beetle', 'root', 'berry'];
const LABEL: Record<Kind, string> = { beetle: '🪲 Beetles', root: '🥕 Roots', berry: '🍓 Berries' };

interface Item {
  kind: Kind;
  c: Phaser.GameObjects.Container;
  vy: number;
  dragging: boolean;
}
interface Dung {
  c: Phaser.GameObjects.Container;
  vx: number;
}

/** Drag falling snacks into the matching baskets and flick away the dung beetles. */
export class TrailMixSort implements MiniGame {
  readonly title = '🧺 Trail-Mix Sort';
  readonly instructions = 'Drag each snack into its basket. Tap dung beetles to flick them away!';
  private items: Item[] = [];
  private dungs: Dung[] = [];
  private baskets: { kind: Kind; rect: Phaser.Geom.Rectangle }[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private spawnT = 0.3;
  private elapsed = 0;
  private correct = 0;
  private flicked = 0;
  private mistakes = 0;
  private basketTop: number;

  constructor(private ctx: MiniGameContext) {
    const { scene, area: a } = ctx;
    this.gfx = scene.add.graphics();
    this.gfx.fillStyle(0x5c4632, 1);
    this.gfx.fillRect(a.x, a.y, a.width, a.height);
    this.gfx.lineStyle(3, 0x8b6a43, 1);
    for (let k = 1; k < 4; k++) this.gfx.lineBetween(a.x, a.y + (k * a.height) / 5, a.right, a.y + (k * a.height) / 5);
    const bh = Math.min(64, a.height * 0.2);
    this.basketTop = a.bottom - bh - 4;
    const bw = a.width / 3;
    KINDS.forEach((kind, i) => {
      const rect = new Phaser.Geom.Rectangle(a.x + i * bw + 6, this.basketTop, bw - 12, bh);
      this.baskets.push({ kind, rect });
      this.gfx.fillStyle(0xc9a063, 1);
      this.gfx.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 10);
      this.gfx.lineStyle(2, 0x8b6a43, 1);
      for (let y = rect.y + 10; y < rect.bottom; y += 10) this.gfx.lineBetween(rect.x + 4, y, rect.right - 4, y);
      this.labels.push(
        scene.add
          .text(rect.centerX, rect.centerY, LABEL[kind], { fontFamily: FONT, fontSize: '15px', color: '#3b2a1e', fontStyle: 'bold' })
          .setOrigin(0.5)
          .setResolution(2),
      );
    });

    scene.input.on('drag', this.onDrag, this);
    scene.input.on('dragend', this.onDragEnd, this);
  }

  private onDrag(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container, x: number, y: number): void {
    const it = this.items.find((i) => i.c === obj);
    if (!it) return;
    it.dragging = true;
    obj.setPosition(x, y);
  }

  private onDragEnd(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container): void {
    const it = this.items.find((i) => i.c === obj);
    if (!it) return;
    it.dragging = false;
    if (obj.y > this.basketTop - 24) this.land(it);
  }

  private spawn(): void {
    const { scene, area: a } = this.ctx;
    if (Math.random() < 0.16) {
      const fromLeft = Math.random() < 0.5;
      const c = scene.add.container(fromLeft ? a.x + 10 : a.right - 10, this.basketTop - 12);
      const g = scene.add.graphics();
      g.fillStyle(0x6b4a2b, 1);
      g.fillCircle(fromLeft ? 10 : -10, -2, 8);
      g.fillStyle(0x2b1d14, 1);
      g.fillEllipse(0, 0, 18, 12);
      g.lineStyle(1.5, 0x2b1d14, 1);
      for (let k = -1; k <= 1; k++) g.lineBetween(k * 5, 4, k * 5 + 3, 9);
      c.add(g).setSize(40, 32).setInteractive({ useHandCursor: true });
      const d: Dung = { c, vx: (fromLeft ? 1 : -1) * rand(38, 55) };
      c.on('pointerdown', () => this.flick(d));
      this.dungs.push(d);
      return;
    }
    const kind = KINDS[Math.floor(Math.random() * 3)];
    const c = scene.add.container(rand(a.x + 30, a.right - 30), a.y + 14);
    const g = scene.add.graphics();
    drawSnack(g, kind);
    c.add(g).setSize(44, 44).setInteractive({ useHandCursor: true, draggable: true });
    this.items.push({ kind, c, vy: 45 + this.elapsed * 4, dragging: false });
  }

  private flick(d: Dung): void {
    this.dungs.splice(this.dungs.indexOf(d), 1);
    this.flicked++;
    d.c.disableInteractive();
    this.ctx.scene.tweens.add({
      targets: d.c,
      y: d.c.y - 120,
      x: d.c.x + d.vx,
      angle: 540,
      alpha: 0,
      duration: 500,
      onComplete: () => d.c.destroy(),
    });
    this.pop(d.c.x, d.c.y, '+1 flick!', '#b8f28c');
  }

  private land(it: Item): void {
    this.items.splice(this.items.indexOf(it), 1);
    const b = this.baskets.find((k) => it.c.x >= k.rect.x - 6 && it.c.x <= k.rect.right + 6);
    if (b && b.kind === it.kind) {
      this.correct++;
      this.pop(it.c.x, this.basketTop - 10, '+1', '#b8f28c');
    } else {
      this.mistakes++;
      this.pop(it.c.x, this.basketTop - 10, '✗', '#ff8a7a');
    }
    it.c.destroy();
  }

  private pop(x: number, y: number, text: string, color: string): void {
    const t = this.ctx.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: '18px', color, stroke: '#2b1d14', strokeThickness: 4 })
      .setOrigin(0.5)
      .setResolution(2);
    this.ctx.scene.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawn();
      this.spawnT = Math.max(0.55, 1.05 - this.elapsed * 0.04);
    }
    for (const it of [...this.items]) {
      if (it.dragging) continue;
      it.c.y += it.vy * dt;
      if (it.c.y >= this.basketTop - 6) this.land(it);
    }
    const mid = this.baskets[1].rect;
    for (const d of [...this.dungs]) {
      d.c.x += d.vx * dt;
      d.c.y = this.basketTop - 12 + Math.abs(Math.sin(this.elapsed * 12)) * -2;
      if (d.c.x > mid.x + 10 && d.c.x < mid.right - 10) {
        this.dungs.splice(this.dungs.indexOf(d), 1);
        this.mistakes++;
        this.pop(d.c.x, d.c.y - 10, 'nom! ✗', '#ff8a7a');
        d.c.destroy();
      }
    }
  }

  finished(): boolean {
    return false;
  }

  scoreLabel(): string {
    return `Sorted ${this.correct} · Flicked ${this.flicked} · Oops ${this.mistakes}`;
  }

  result(): MiniGameResult {
    const score = this.correct + this.flicked;
    return { kind: 'sort', score, max: score + this.mistakes, perfect: this.mistakes === 0 && score >= 8 };
  }

  destroy(): void {
    const s = this.ctx.scene;
    s.input.off('drag', this.onDrag, this);
    s.input.off('dragend', this.onDragEnd, this);
    for (const it of this.items) it.c.destroy();
    for (const d of this.dungs) d.c.destroy();
    this.labels.forEach((l) => l.destroy());
    this.gfx.destroy();
  }
}

function drawSnack(g: Phaser.GameObjects.Graphics, kind: Kind): void {
  if (kind === 'beetle') {
    g.lineStyle(2, 0x1f2a3a, 1);
    for (let k = -1; k <= 1; k++) {
      g.lineBetween(-9, k * 5, 9, k * 5 + 2);
    }
    g.fillStyle(0x2f6b8a, 1);
    g.fillEllipse(0, 0, 18, 22);
    g.fillStyle(0x1f4a63, 1);
    g.fillRect(-0.75, -10, 1.5, 20);
    g.fillStyle(0x1f2a3a, 1);
    g.fillCircle(0, -12, 4.5);
  } else if (kind === 'root') {
    g.fillStyle(0xe58a2b, 1);
    g.fillTriangle(-7, -10, 7, -10, 0, 14);
    g.lineStyle(1.5, 0xb86a1a, 1);
    g.lineBetween(-3, -3, 2, -3);
    g.lineBetween(-2, 4, 1, 4);
    g.lineStyle(2.5, 0x5d9b3a, 1);
    g.lineBetween(0, -10, -5, -18);
    g.lineBetween(0, -10, 4, -18);
  } else {
    g.fillStyle(0xd23c4a, 1);
    for (const [x, y] of [[-5, 2], [5, 2], [0, -5], [0, 7]]) g.fillCircle(x, y, 6);
    g.fillStyle(0xff8a95, 1);
    g.fillCircle(-2, -7, 1.8);
    g.fillStyle(0x5d9b3a, 1);
    g.fillEllipse(0, -12, 10, 4);
  }
}
