import Phaser from 'phaser';
import { CFG } from '../config';
import { PALETTES, type Meerkat, type Palette, type Role } from '../sim/Meerkat';

const S = CFG.TILE;
export const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';

/** Draws a meerkat facing right with its feet at (0,0), about 15px tall. */
export function drawMeerkat(g: Phaser.GameObjects.Graphics, p: Palette): void {
  g.lineStyle(2.2, p.coat, 1);
  g.beginPath();
  g.moveTo(-2, -3);
  g.lineTo(-5, -1.6);
  g.lineTo(-7.2, -0.2);
  g.strokePath();
  g.fillStyle(p.dark, 1);
  g.fillCircle(-7.4, -0.2, 1.1);
  g.fillRect(-2, -2, 1.6, 2);
  g.fillRect(1, -2, 1.6, 2);
  g.fillStyle(p.coat, 1);
  g.fillEllipse(0, -6.5, 7, 10);
  g.fillStyle(p.belly, 1);
  g.fillEllipse(1.4, -6, 3.6, 7);
  g.fillStyle(p.coat, 1);
  g.fillEllipse(2.7, -7.6, 2, 3.4);
  g.fillEllipse(1.2, -12.6, 5.6, 4.8);
  g.fillEllipse(3.7, -12.1, 3.4, 2.6);
  g.fillStyle(p.belly, 1);
  g.fillEllipse(2.2, -11.7, 2.4, 1.8);
  g.fillStyle(p.dark, 1);
  g.fillEllipse(2.4, -13.1, 2.3, 1.8);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(2.8, -13.3, 0.45);
  g.fillStyle(0x2a1a12, 1);
  g.fillCircle(5.3, -12.2, 0.7);
  g.fillStyle(p.dark, 1);
  g.fillCircle(-0.5, -13.8, 0.95);
}

function drawAccessory(g: Phaser.GameObjects.Graphics, m: Meerkat): void {
  g.clear();
  if (m.pup) {
    // a little tuft and big eyes
    g.fillStyle(0xfff7e6, 1);
    g.fillCircle(2.8, -13.3, 0.7);
    g.lineStyle(0.6, 0x5a4126, 1);
    g.lineBetween(0.5, -15, 0, -16.5);
    g.lineBetween(1.3, -15, 1.6, -16.6);
    return;
  }
  const role: Role = m.role;
  const items = m.pack.items;
  // status marks under the gear
  if (m.status.dusty) {
    g.fillStyle(0x8a6a44, 0.85);
    for (const [x, y] of [[-1.5, -8], [1, -4], [2, -10], [-2, -5], [0.5, -13]]) g.fillCircle(x, y, 0.7);
  }
  if (m.status.burrs) {
    g.fillStyle(0x4f8a2a, 1);
    g.fillCircle(-5.6, -1, 0.9);
    g.fillCircle(-4, -2, 0.8);
    g.fillCircle(-7, 0.2, 0.7);
  }
  if (m.gear.back === 'pouch') {
    g.fillStyle(0x8a5cc4, 1);
    g.fillEllipse(-3.8, -7, 5.4, 7.8);
    g.fillStyle(0x8fd3ff, 1);
    g.fillTriangle(-5.4, -10.4, -2.2, -10.4, -3.8, -8);
    g.fillCircle(-3.8, -5, 0.8);
  } else if (m.gear.back === 'gourdpack') {
    g.fillStyle(0xd9b25f, 1);
    g.fillEllipse(-3.8, -7, 5, 7.4);
    g.fillStyle(0xb38a3a, 1);
    g.fillEllipse(-3.8, -11, 2, 1.6);
    g.fillStyle(0xd23c4a, 1);
    for (let i = 0; i < items; i++) g.fillCircle(-4.6 + (i % 2) * 1.6, -11.6 - Math.floor(i / 2) * 1.2, 0.8);
  } else if (role === 'Forager') {
    g.fillStyle(0x5d9b3a, 1);
    g.fillEllipse(-3.5, -7, 4, 6.2);
    g.lineStyle(0.6, 0x3d6b25, 1);
    g.lineBetween(-3.5, -10, -3.5, -4);
    g.fillStyle(0xd23c4a, 1);
    for (let i = 0; i < items; i++) g.fillCircle(-4.2 + (i % 2) * 1.5, -10 - Math.floor(i / 2) * 1.3, 0.85);
  }
  if (role === 'Sentry') {
    g.fillStyle(0xe5632a, 1);
    g.fillRect(-1.6, -10.5, 5.2, 1.6);
    g.fillTriangle(-1.6, -10.5, -4, -8.2, -1.6, -9);
  }
  if (m.gear.eyes === 'goggles') {
    g.lineStyle(0.6, 0x5a3a1a, 1);
    g.lineBetween(-0.8, -13.4, 2, -13.3);
    g.fillStyle(0xffb000, 0.95);
    g.fillCircle(2.6, -13.2, 1.35);
    g.fillStyle(0xfff0b0, 1);
    g.fillCircle(2.9, -13.6, 0.4);
  }
  if (m.gear.eyes === 'monocle') {
    g.lineStyle(0.7, 0x8b5a2b, 1);
    g.strokeCircle(2.7, -13.2, 1.3);
    g.lineStyle(0.4, 0xd9b25f, 1);
    g.lineBetween(2.2, -12, 1.4, -8.5);
  }
  if (m.gear.head === 'crown') {
    const cols = [0xffe14d, 0xff8ac6, 0xffffff, 0x8fd3ff, 0xff8ac6];
    g.lineStyle(0.7, 0x5d9b3a, 1);
    g.strokeEllipse(1, -14.8, 6.8, 2.2);
    cols.forEach((c, i) => {
      g.fillStyle(c, 1);
      g.fillCircle(-2 + i * 1.5, -15.4 - (i % 2) * 0.5, 0.75);
    });
    return;
  }
  if (m.gear.head === 'sunhat') {
    g.fillStyle(0xe8c66a, 1);
    g.fillEllipse(1.2, -14.6, 10.5, 2.2);
    g.fillEllipse(1.2, -15.8, 5.2, 3);
    g.fillStyle(0xd23c4a, 1);
    g.fillRect(-1.3, -15.2, 5, 0.8);
    return;
  }
  if (m.gear.head === 'helmet') {
    g.fillStyle(0x8b5a2b, 1);
    g.fillEllipse(1, -15, 6.6, 3.4);
    g.lineStyle(0.4, 0x5e3a18, 1);
    g.lineBetween(-1.5, -15.2, 3.5, -15.2);
    g.lineBetween(-0.5, -16.2, 2.5, -16.2);
    g.fillStyle(0x5e3a18, 1);
    g.fillRect(0.7, -17.6, 0.8, 1.4);
    return;
  }
  if (role === 'Digger') {
    g.fillStyle(0xd4a017, 1);
    g.fillEllipse(1, -14.8, 6.2, 2.8);
    g.fillStyle(0x8a6510, 1);
    g.fillRect(-2.2, -13.8, 6.8, 0.9);
    g.fillRect(0.7, -16.6, 0.8, 1.2);
  }
}

function signature(m: Meerkat): string {
  const s = m.status;
  return `${m.role}|${m.pup}|${m.pack.items}|${m.gear.head}|${m.gear.eyes}|${m.gear.back}|${s.dusty}|${s.burrs}`;
}

export class MeerkatView {
  readonly root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Container;
  private acc: Phaser.GameObjects.Graphics;
  private fx: Phaser.GameObjects.Graphics;
  private bubble: Phaser.GameObjects.Text;
  private label: Phaser.GameObjects.Text;
  private sig = '';

  constructor(scene: Phaser.Scene, m: Meerkat) {
    this.root = scene.add.container(0, 0).setDepth(6);
    this.body = scene.add.container(0, 0);
    const g = scene.add.graphics();
    drawMeerkat(g, PALETTES[m.palette]);
    this.acc = scene.add.graphics();
    this.body.add([g, this.acc]);
    this.fx = scene.add.graphics();
    this.bubble = scene.add
      .text(0, -18, '', { fontFamily: FONT, fontSize: '9px', color: '#ffffff', stroke: '#2b1d14', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setResolution(4);
    this.label = scene.add
      .text(0, 3, m.name, { fontFamily: FONT, fontSize: '7px', color: '#fff7e6', stroke: '#2b1d14', strokeThickness: 2 })
      .setOrigin(0.5, 0)
      .setResolution(4);
    this.root.add([this.body, this.fx, this.bubble, this.label]);
  }

  update(m: Meerkat, time: number, offsetY: number, showName: boolean, sweaty: boolean, swimming = false, alpha = false): void {
    this.root.setPosition(m.x * S, (m.y + 0.5) * S + offsetY);
    this.root.setScale(m.pup ? 0.62 : 1);
    const sig = signature(m);
    if (sig !== this.sig) {
      this.sig = sig;
      drawAccessory(this.acc, m);
    }
    const b = this.body;
    b.scaleX = m.facing;
    b.scaleY = 1;
    b.rotation = 0;
    b.x = 0;
    b.y = 0;
    const fx = this.fx;
    fx.clear();
    let bubble = m.noticeTimer > 0 ? m.notice : '';

    switch (m.state) {
      case 'Walking':
      case 'Fleeing':
      case 'Rallying':
      case 'Startled': {
        const fast = m.state !== 'Walking';
        b.y = -Math.abs(Math.sin(time * (fast ? 0.03 : 0.02))) * 1.6;
        if (m.path.length === 0) b.y = 0;
        break;
      }
      case 'Following':
      case 'Led':
        b.y = -Math.abs(Math.sin(time * 0.025)) * 1.6;
        break;
      case 'Playing':
        b.y = -Math.abs(Math.sin(time * 0.012)) * 6;
        b.rotation = Math.sin(time * 0.006) * 0.3;
        break;
      case 'Fainting':
        b.rotation = -(Math.PI / 2.4) * m.facing;
        b.y = -2;
        break;
      case 'Stretching':
        b.rotation = (Math.PI / 2) * m.facing;
        b.y = -3;
        b.scaleX = m.facing * 1.25;
        if (!bubble && Math.floor(time / 900) % 2 === 0) bubble = '~';
        break;
      case 'Ouch':
        b.y = -Math.abs(Math.sin(time * 0.02)) * 5;
        b.rotation = Math.sin(time * 0.02) * 0.3;
        if (!bubble) bubble = 'ouch!';
        break;
      case 'Flipping':
        b.rotation = Math.sin(time * 0.03) * 0.2;
        b.scaleY = 1.12;
        break;
      case 'Sleeping':
      case 'Napping':
        b.rotation = (Math.PI / 2) * m.facing;
        b.y = -3.5;
        b.scaleY = 1 + Math.sin(time * 0.003) * 0.04;
        if (!bubble) bubble = 'z'.repeat(1 + (Math.floor(time / 600) % 3));
        break;
      case 'Digging':
      case 'Building':
        b.rotation = Math.sin(time * 0.03) * 0.25 * m.facing;
        if (Math.floor(time / 120) % 2 === 0) {
          fx.fillStyle(0xc8914a, 1);
          fx.fillCircle(m.facing * 7, -3 - (time % 240) / 60, 1);
          fx.fillCircle(m.facing * 5, -6 + (time % 240) / 80, 0.8);
        }
        break;
      case 'Gathering':
        b.rotation = 0.25 * m.facing + Math.sin(time * 0.02) * 0.08;
        break;
      case 'Posted':
      case 'Huddling':
        b.scaleY = 1.1;
        break;
      case 'Mobbing':
        if (m.kicking) {
          b.rotation = Math.sin(time * 0.05) * 0.35;
          fx.fillStyle(0xe6b977, 0.9);
          for (let k = 0; k < 4; k++) {
            const t = ((time / 300 + k / 4) % 1);
            fx.fillCircle(-m.facing * (4 + t * 8), -1 - t * 7 + t * t * 5, 1.2 * (1 - t) + 0.3);
          }
        } else {
          b.scaleY = 1.18;
          b.scaleX = m.facing * 1.12;
        }
        break;
      case 'Held':
        b.rotation = Math.sin(time * 0.006) * 0.35;
        b.y = 0;
        break;
      case 'Dizzy': {
        b.rotation = Math.sin(time * 0.01) * 0.15;
        fx.fillStyle(0xffe14d, 1);
        for (let k = 0; k < 3; k++) {
          const a = time * 0.006 + (k * Math.PI * 2) / 3;
          fx.fillCircle(Math.cos(a) * 5, -16 + Math.sin(a) * 1.5, 1.2);
        }
        break;
      }
    }
    if (m.leap > 0) b.y -= Math.sin(((0.6 - m.leap) / 0.6) * Math.PI) * 12;
    if (m.status.chilly && m.state !== 'Sleeping') {
      b.x = Math.sin(time * 0.08) * 0.5;
      fx.fillStyle(0xbfe6ff, 0.9);
      fx.fillCircle(-5, -14 - ((time / 40) % 6), 0.7);
      fx.fillCircle(5, -12 - ((time / 50 + 3) % 6), 0.6);
    }
    if (sweaty) {
      const t = (time / 500) % 1;
      fx.fillStyle(0x7fd0ff, 1 - t);
      fx.fillCircle(m.facing * 3, -15 + t * 6, 0.9);
      fx.fillCircle(-m.facing * 2, -13 + ((t + 0.5) % 1) * 6, 0.7);
    }
    if (swimming && m.state !== 'Sleeping') {
      b.y += 3 + Math.sin(time * 0.004) * 0.8;
      fx.fillStyle(0xe8a33c, 1);
      fx.fillEllipse(0, -3 + b.y - 3, 12, 4);
      fx.fillStyle(0xffd27a, 1);
      fx.fillEllipse(0, -3.6 + b.y - 3, 9, 2);
      fx.lineStyle(0.6, 0xffffff, 0.7);
      fx.strokeEllipse(0, 0, 16 + Math.sin(time * 0.003) * 2, 3);
    }
    if (m.status.groomed > 0 && Math.floor(time / 400) % 3 === 0) {
      fx.fillStyle(0xfff6a0, 1);
      fx.fillCircle(4 * Math.cos(time * 0.003), -9 + 4 * Math.sin(time * 0.004), 0.8);
    }

    if (alpha) {
      fx.lineStyle(0.8, 0xffe14d, 0.9);
      fx.strokeEllipse(0, 0.5, 13, 3.5);
      fx.fillStyle(0xffe14d, 1);
      fx.fillTriangle(-1.5, -22, 1.5, -22, 0, -19.5);
    }
    if (m.warning > 0) {
      fx.fillStyle(0x000000, 0.5);
      fx.fillRect(-6, -21, 12, 2.5);
      fx.fillStyle(0xff5a3c, 1);
      fx.fillRect(-6, -21, 12 * Math.min(1, m.warning), 2.5);
    }
    if (this.bubble.text !== bubble) this.bubble.setText(bubble);
    this.label.setVisible(showName || m.state === 'Held');
  }

  destroy(): void {
    this.root.destroy();
  }
}
