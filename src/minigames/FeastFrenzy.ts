import Phaser from 'phaser';
import { drawMeerkat, FONT } from '../render/MeerkatView';
import { playSfx } from '../render/Sfx';
import { PALETTES } from '../sim/Meerkat';
import type { MiniGameResult } from '../sim/World';
import { Button } from '../ui/Button';
import type { MiniGame, MiniGameContext } from './types';

type Dish = 'beetle' | 'melon' | 'grub';
const DISHES: Dish[] = ['beetle', 'melon', 'grub'];
const DISH_ICON: Record<Dish, string> = { beetle: '🪲', melon: '🍈', grub: '🐛' };

interface Guest {
  wants: Dish;
  patience: number;
  g: Phaser.GameObjects.Graphics;
  bubble: Phaser.GameObjects.Text;
  y: number;
}
interface Platter {
  dish: Dish;
  lane: number;
  x: number;
  t: Phaser.GameObjects.Text;
}

const PATIENCE = 7;

/**
 * Feast Frenzy (Grand Banquet Hall): slide gourmet platters down the banquet table
 * to the VIP guests before their patience runs out.
 */
export class FeastFrenzy implements MiniGame {
  readonly title = '🍽️ Feast Frenzy';
  readonly instructions = 'Tap a seat’s ▶ button to slide the next platter to that guest. Serve what they ask for, fast!';
  private gfx: Phaser.GameObjects.Graphics;
  private bars: Phaser.GameObjects.Graphics;
  private guests: Guest[] = [];
  private platters: Platter[] = [];
  private buttons: Button[] = [];
  private next: Dish = 'beetle';
  private nextText: Phaser.GameObjects.Text;
  private served = 0;
  private oops = 0;
  private texts: Phaser.GameObjects.Text[] = [];
  private tableL: number;
  private tableR: number;

  constructor(private ctx: MiniGameContext) {
    const { scene, area: a } = ctx;
    this.gfx = scene.add.graphics();
    this.bars = scene.add.graphics();
    const g = this.gfx;
    g.fillStyle(0x6b4a2b, 1);
    g.fillRect(a.x, a.y, a.width, a.height);
    g.fillStyle(0xd9a55b, 0.25);
    for (let k = 0; k < 4; k++) g.fillCircle(a.x + (k + 0.5) * (a.width / 4), a.y + 16, 9);
    this.tableL = a.x + 110;
    this.tableR = a.right - 90;
    const laneH = (a.height - 20) / 3;
    for (let i = 0; i < 3; i++) {
      const y = a.y + 14 + laneH * (i + 0.5);
      g.fillStyle(0x8b5a2b, 1);
      g.fillRoundedRect(this.tableL - 10, y - 14, this.tableR - this.tableL + 20, 28, 8);
      g.lineStyle(1.5, 0x5e3a18, 1);
      g.lineBetween(this.tableL, y, this.tableR, y);
      const guest = scene.add.graphics();
      drawMeerkat(guest, PALETTES[(i * 2 + 1) % PALETTES.length]);
      guest.setScale(-2.4, 2.4).setPosition(this.tableR + 46, y + 16);
      const bubble = scene.add
        .text(this.tableR + 46, y - 30, '', { fontFamily: FONT, fontSize: '20px', backgroundColor: '#fff7e6', padding: { x: 4, y: 1 } })
        .setOrigin(0.5, 1)
        .setResolution(2);
      this.guests.push({ wants: DISHES[i], patience: PATIENCE, g: guest, bubble, y });
      const b = new Button(scene, '▶', 54, Math.min(48, laneH - 8), () => this.send(i), { fontSize: 20, color: 0x5d8a3a });
      b.setPosition(a.x + 56, y);
      this.buttons.push(b);
    }
    for (const gu of this.guests) this.newOrder(gu);
    this.nextText = scene.add
      .text(a.x + 12, a.y + 8, '', { fontFamily: FONT, fontSize: '14px', color: '#fff7e6' })
      .setResolution(2);
    this.roll();
  }

  private roll(): void {
    // Usually something a guest wants right now.
    const wanted = this.guests.map((g) => g.wants);
    this.next = Math.random() < 0.8 ? wanted[Math.floor(Math.random() * wanted.length)] : DISHES[Math.floor(Math.random() * 3)];
    this.nextText.setText(`Next platter: ${DISH_ICON[this.next]}`);
  }

  private newOrder(g: Guest): void {
    g.wants = DISHES[Math.floor(Math.random() * 3)];
    g.patience = PATIENCE;
    g.bubble.setText(DISH_ICON[g.wants]);
  }

  private send(lane: number): void {
    const t = this.ctx.scene.add.text(this.tableL, this.guests[lane].y, DISH_ICON[this.next], { fontSize: '22px' }).setOrigin(0.5).setResolution(2);
    this.platters.push({ dish: this.next, lane, x: this.tableL, t });
    playSfx('pop');
    this.roll();
  }

  private pop(x: number, y: number, s: string, color: string): void {
    const t = this.ctx.scene.add
      .text(x, y, s, { fontFamily: FONT, fontSize: '16px', color, stroke: '#2b1d14', strokeThickness: 4 })
      .setOrigin(0.5)
      .setResolution(2);
    this.texts.push(t);
    this.ctx.scene.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  update(dt: number): void {
    for (const p of [...this.platters]) {
      p.x += 420 * dt;
      p.t.setX(p.x);
      if (p.x >= this.tableR) {
        const g = this.guests[p.lane];
        if (g.wants === p.dish) {
          this.served++;
          this.pop(this.tableR, g.y - 20, 'Delicious!', '#b8f28c');
          this.newOrder(g);
        } else {
          this.oops++;
          this.pop(this.tableR, g.y - 20, 'Not that!', '#ff8a7a');
        }
        p.t.destroy();
        this.platters.splice(this.platters.indexOf(p), 1);
      }
    }
    this.bars.clear();
    for (const g of this.guests) {
      g.patience -= dt;
      if (g.patience <= 0) {
        this.oops++;
        this.pop(this.tableR + 46, g.y - 40, 'Hmph!', '#ffd36b');
        this.newOrder(g);
      }
      const f = Math.max(0, g.patience / PATIENCE);
      this.bars.fillStyle(0x000000, 0.5);
      this.bars.fillRect(this.tableR + 22, g.y + 22, 48, 5);
      this.bars.fillStyle(f < 0.3 ? 0xe5442e : 0x8fd36b, 1);
      this.bars.fillRect(this.tableR + 22, g.y + 22, 48 * f, 5);
    }
  }

  finished(): boolean {
    return false;
  }

  scoreLabel(): string {
    return `Served ${this.served} · Oops ${this.oops}`;
  }

  result(): MiniGameResult {
    return { kind: 'feast', score: this.served, max: this.served + this.oops, perfect: this.oops === 0 && this.served >= 8, packId: this.ctx.packId };
  }

  destroy(): void {
    this.buttons.forEach((b) => b.destroy());
    this.guests.forEach((g) => (g.g.destroy(), g.bubble.destroy()));
    this.platters.forEach((p) => p.t.destroy());
    this.texts.forEach((t) => t.destroy());
    this.nextText.destroy();
    this.bars.destroy();
    this.gfx.destroy();
  }
}
