import Phaser from 'phaser';
import { FONT, drawMeerkat } from '../render/MeerkatView';
import { PALETTES } from '../sim/Meerkat';
import type { MiniGameResult } from '../sim/World';
import { rand, type MiniGame, type MiniGameContext } from './types';

interface Patch {
  x: number;
  y: number;
  dirt: number;
}
interface Burr {
  x: number;
  y: number;
  popped: boolean;
}

/** Rub the sand off a meerkat's coat and pop the burrs off its tail to fill the purr meter. */
export class BurrBrush implements MiniGame {
  readonly title: string;
  readonly instructions = 'Rub away the dust and tap the sticky burrs off the tail!';
  private bg: Phaser.GameObjects.Graphics;
  private kat: Phaser.GameObjects.Graphics;
  private fx: Phaser.GameObjects.Graphics;
  private purrText: Phaser.GameObjects.Text;
  private patches: Patch[] = [];
  private burrs: Burr[] = [];
  private k: number;
  private last: { x: number; y: number } | null = null;
  private brush = { x: 0, y: 0 };
  private purrT = 0;

  constructor(private ctx: MiniGameContext) {
    const { scene, area: a } = ctx;
    const m = ctx.target;
    this.title = `🪮 Burr & Beetle Brush${m ? `: ${m.name}` : ''}`;
    this.bg = scene.add.graphics();
    this.bg.fillStyle(0x7a5a3a, 1);
    this.bg.fillRect(a.x, a.y, a.width, a.height);
    this.bg.fillStyle(0xfff0a0, 0.25);
    this.bg.fillTriangle(a.centerX - 60, a.y, a.centerX + 40, a.y, a.centerX + 140, a.bottom);
    this.bg.fillTriangle(a.centerX - 60, a.y, a.centerX + 140, a.bottom, a.centerX - 10, a.bottom);
    this.bg.fillStyle(0xb2aca3, 1);
    this.bg.fillEllipse(a.centerX, a.bottom - 10, a.width * 0.5, 22);

    this.k = Math.min((a.height - 30) / 19, (a.width * 0.6) / 16);
    const k = this.k;
    const ox = a.centerX + 2 * k;
    const oy = a.bottom - 14;
    this.kat = scene.add.graphics().setPosition(ox, oy).setScale(k);
    drawMeerkat(this.kat, PALETTES[m?.palette ?? 0]);
    const toScreen = (x: number, y: number) => ({ x: ox + x * k, y: oy + y * k });

    for (let i = 0; i < 9; i++) {
      const ang = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random());
      const p = i < 7 ? toScreen(Math.cos(ang) * 2.8 * r, -6.5 + Math.sin(ang) * 4.2 * r) : toScreen(rand(-0.5, 3), rand(-14, -11.5));
      this.patches.push({ ...p, dirt: 1 });
    }
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      this.burrs.push({ ...toScreen(-2 - t * 5.2, -3 + t * 2.8 - 0.4), popped: false });
    }

    this.fx = scene.add.graphics();
    this.purrText = scene.add
      .text(a.x + 16, a.y + 14, '', { fontFamily: FONT, fontSize: '16px', color: '#fff7e6' })
      .setResolution(2);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    this.brush = { x: p.x, y: p.y };
    this.last = { x: p.x, y: p.y };
    for (const b of this.burrs) {
      if (!b.popped && Math.hypot(b.x - p.x, b.y - p.y) < Math.max(22, this.k * 1.4)) {
        b.popped = true;
        this.sparkle(b.x, b.y, 'pop!');
        return;
      }
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    this.brush = { x: p.x, y: p.y };
    if (!p.isDown || !this.last) return;
    const moved = Math.hypot(p.x - this.last.x, p.y - this.last.y);
    this.last = { x: p.x, y: p.y };
    for (const d of this.patches) {
      if (d.dirt <= 0) continue;
      if (Math.hypot(d.x - p.x, d.y - p.y) < Math.max(26, this.k * 1.8)) {
        d.dirt -= moved / (this.k * 7);
        if (d.dirt <= 0.05) {
          d.dirt = 0;
          this.sparkle(d.x, d.y, '✨');
        }
      }
    }
  }

  private onUp(): void {
    this.last = null;
  }

  private sparkle(x: number, y: number, text: string): void {
    const t = this.ctx.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: '16px', color: '#fff6a0', stroke: '#2b1d14', strokeThickness: 3 })
      .setOrigin(0.5)
      .setResolution(2);
    this.ctx.scene.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  private progress(): { done: number; max: number } {
    const done = this.patches.filter((d) => d.dirt <= 0).length + this.burrs.filter((b) => b.popped).length;
    return { done, max: this.patches.length + this.burrs.length };
  }

  update(dt: number, time: number): void {
    const f = this.fx;
    f.clear();
    const k = this.k;
    for (const d of this.patches) {
      if (d.dirt <= 0) continue;
      f.fillStyle(0x8a6a44, 0.85 * d.dirt);
      f.fillCircle(d.x, d.y, k * 0.9);
      f.fillStyle(0x6b4a2b, 0.7 * d.dirt);
      f.fillCircle(d.x + k * 0.3, d.y - k * 0.2, k * 0.4);
    }
    for (const b of this.burrs) {
      if (b.popped) continue;
      f.fillStyle(0x4f8a2a, 1);
      f.fillCircle(b.x, b.y, k * 0.65);
      f.lineStyle(2, 0x3a6a1a, 1);
      for (let s = 0; s < 8; s++) {
        const ang = (s / 8) * Math.PI * 2 + time * 0.001;
        f.lineBetween(b.x, b.y, b.x + Math.cos(ang) * k * 1.0, b.y + Math.sin(ang) * k * 1.0);
      }
    }
    // the brush cursor
    const { x, y } = this.brush;
    if (x || y) {
      f.fillStyle(0x8b5a2b, 1);
      f.fillRoundedRect(x - 16, y - 22, 32, 10, 4);
      f.lineStyle(2, 0xe8dcc0, 1);
      for (let s = -12; s <= 12; s += 4) f.lineBetween(x + s, y - 12, x + s, y - 2);
    }
    // purr meter
    const { done, max } = this.progress();
    const a = this.ctx.area;
    const mw = 22;
    const mh = a.height - 60;
    f.fillStyle(0x2b1d14, 0.8);
    f.fillRoundedRect(a.right - mw - 14, a.y + 40, mw, mh, 8);
    f.fillStyle(0xf2a541, 1);
    const fill = (mh - 6) * (done / max);
    f.fillRoundedRect(a.right - mw - 11, a.y + 43 + (mh - 6 - fill), mw - 6, Math.max(1, fill), 6);
    this.purrT += dt;
    const purr = done / max > 0.6 ? ' purrrr ♪' : '';
    this.purrText.setText(`Purr meter${purr}`);
    if (done / max > 0.6) this.kat.setRotation(Math.sin(this.purrT * 8) * 0.02);
  }

  finished(): boolean {
    const { done, max } = this.progress();
    return done === max;
  }

  scoreLabel(): string {
    const { done, max } = this.progress();
    return `Clean ${done}/${max}`;
  }

  result(): MiniGameResult {
    const { done, max } = this.progress();
    return { kind: 'brush', score: done, max, perfect: done === max, targetId: this.ctx.target?.id };
  }

  destroy(): void {
    const s = this.ctx.scene;
    s.input.off('pointerdown', this.onDown, this);
    s.input.off('pointermove', this.onMove, this);
    s.input.off('pointerup', this.onUp, this);
    this.bg.destroy();
    this.kat.destroy();
    this.fx.destroy();
    this.purrText.destroy();
  }
}
