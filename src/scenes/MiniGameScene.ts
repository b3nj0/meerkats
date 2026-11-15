import Phaser from 'phaser';
import { CFG } from '../config';
import { BurrBrush } from '../minigames/BurrBrush';
import { HorizonSpotter } from '../minigames/HorizonSpotter';
import { TrailMixSort } from '../minigames/TrailMixSort';
import { WaterPolo } from '../minigames/WaterPolo';
import { FeastFrenzy } from '../minigames/FeastFrenzy';
import { TumbleTag } from '../minigames/TumbleTag';
import { WeaversKnot } from '../minigames/WeaversKnot';
import { ShadowPuppets } from '../minigames/ShadowPuppets';
import { PrismAlignment } from '../minigames/PrismAlignment';
import type { MiniGame } from '../minigames/types';
import { FONT } from '../render/MeerkatView';
import { playSfx } from '../render/Sfx';
import { ROOM_DEFS, type Room } from '../sim/Rooms';
import type { World } from '../sim/World';
import { Button } from '../ui/Button';
import type { GameScene } from './GameScene';

export interface MiniGameInit {
  roomId: number;
  packId?: number;
}

/** Hosts a 15-second room mini-game on top of the paused colony. */
export class MiniGameScene extends Phaser.Scene {
  private gs!: GameScene;
  private world!: World;
  private room!: Room;
  private game_!: MiniGame;
  private wasPaused = false;
  private timeLeft = CFG.MINIGAME_SECONDS;
  private state: 'intro' | 'play' | 'done' = 'intro';
  private timerG!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private bar!: Phaser.Geom.Rectangle;
  private introT = 1.2;
  private countdown!: Phaser.GameObjects.Text;
  private packId?: number;

  constructor() {
    super('MiniGame');
  }

  init(data: MiniGameInit): void {
    this.gs = this.scene.get('Game') as GameScene;
    this.world = this.gs.world;
    this.room = this.world.rooms.find((r) => r.id === data.roomId)!;
    this.packId = data.packId;
    this.timeLeft = CFG.MINIGAME_SECONDS;
    this.state = 'intro';
    this.introT = 1.2;
  }

  create(): void {
    this.wasPaused = this.gs.paused;
    this.gs.paused = true;
    const W = this.scale.width;
    const H = this.scale.height;
    this.add.rectangle(0, 0, W, H, 0x120c08, 0.7).setOrigin(0).setInteractive();
    const pw = Math.min(W - 16, 820);
    const ph = Math.min(H - 16, 520);
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    const g = this.add.graphics();
    g.fillStyle(0x2b1d14, 1);
    g.fillRoundedRect(px, py, pw, ph, 16);
    g.lineStyle(3, 0xf2a541, 1);
    g.strokeRoundedRect(px, py, pw, ph, 16);

    const compact = ph < 420;
    const header = compact ? 50 : 62;
    const area = new Phaser.Geom.Rectangle(px + 10, py + header, pw - 20, ph - header - 10);
    const kind = ROOM_DEFS[this.room.type].miniGame!;
    const target = kind === 'brush' ? this.world.brushTarget() : undefined;
    const ctx = { scene: this, area, target, packId: this.packId };
    const make: Record<typeof kind, () => MiniGame> = {
      spotter: () => new HorizonSpotter(ctx),
      sort: () => new TrailMixSort(ctx),
      brush: () => new BurrBrush(ctx),
      polo: () => new WaterPolo(ctx),
      feast: () => new FeastFrenzy(ctx),
      tumble: () => new TumbleTag(ctx),
      weave: () => new WeaversKnot(ctx),
      puppets: () => new ShadowPuppets(ctx),
      prism: () => new PrismAlignment(ctx),
    };
    this.game_ = make[kind]();

    this.add
      .text(px + 16, py + 10, this.game_.title, { fontFamily: FONT, fontSize: compact ? '16px' : '20px', color: '#fff7e6', fontStyle: 'bold' })
      .setResolution(2);
    this.add
      .text(px + 16, py + (compact ? 30 : 36), this.game_.instructions, { fontFamily: FONT, fontSize: compact ? '11px' : '13px', color: '#e8d6b8' })
      .setResolution(2);
    this.scoreText = this.add
      .text(px + pw - 16, py + 10, '', { fontFamily: FONT, fontSize: compact ? '13px' : '15px', color: '#ffd36b' })
      .setOrigin(1, 0)
      .setResolution(2);
    this.bar = new Phaser.Geom.Rectangle(px + pw - 196, py + (compact ? 32 : 38), 180, 10);
    this.timerG = this.add.graphics();
    this.countdown = this.add
      .text(W / 2, H / 2, 'Ready…', { fontFamily: FONT, fontSize: '42px', color: '#fff7e6', stroke: '#2b1d14', strokeThickness: 8 })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(10);
  }

  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1);
    if (this.state === 'intro') {
      this.introT -= dt;
      if (this.introT <= 0) {
        this.state = 'play';
        this.countdown.setText('Go!');
        this.tweens.add({ targets: this.countdown, alpha: 0, scale: 1.6, duration: 450 });
        playSfx('pop');
      }
    } else if (this.state === 'play') {
      this.timeLeft -= dt;
      this.game_.update(dt, time);
      if (this.timeLeft <= 0 || this.game_.finished()) this.finish();
    }
    this.scoreText.setText(this.game_.scoreLabel());
    const f = Math.max(0, this.timeLeft / CFG.MINIGAME_SECONDS);
    const g = this.timerG;
    g.clear();
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(this.bar.x, this.bar.y, this.bar.width, this.bar.height, 5);
    g.fillStyle(f < 0.25 ? 0xe5442e : 0x8fd36b, 1);
    g.fillRoundedRect(this.bar.x, this.bar.y, Math.max(4, this.bar.width * f), this.bar.height, 5);
  }

  private finish(): void {
    this.state = 'done';
    const result = this.game_.result();
    const summary = this.world.applyMiniGame(this.room, result);
    playSfx(result.perfect ? 'success' : 'join');
    const W = this.scale.width;
    const H = this.scale.height;
    const cw = Math.min(W - 40, 440);
    const ch = 220;
    const cx = W / 2;
    const cy = H / 2;
    const card = this.add.graphics().setDepth(20);
    card.fillStyle(0x3b2a1e, 0.98);
    card.fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 16);
    card.lineStyle(3, result.perfect ? 0xffe14d : 0xf2a541, 1);
    card.strokeRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 16);
    const head = result.perfect ? '🌟 Perfect! 🌟' : this.timeLeft <= 0 ? '⏰ Time!' : 'Nice work!';
    this.add
      .text(cx, cy - ch / 2 + 18, head, { fontFamily: FONT, fontSize: '26px', color: result.perfect ? '#ffe14d' : '#fff7e6', fontStyle: 'bold' })
      .setOrigin(0.5, 0)
      .setResolution(2)
      .setDepth(21);
    this.add
      .text(cx, cy - ch / 2 + 60, `${this.game_.scoreLabel()}\n\n${summary}${result.perfect ? '\n(Perfect doubles the reward!)' : ''}`, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#fff7e6',
        align: 'center',
        wordWrap: { width: cw - 30 },
      })
      .setOrigin(0.5, 0)
      .setResolution(2)
      .setDepth(21);
    const done = new Button(this, 'Back to the burrow', 190, 40, () => this.close(), { color: 0x5d8a3a, fontSize: 15 });
    done.setPosition(cx, cy + ch / 2 - 30).setDepth(22);
  }

  private close(): void {
    this.game_.destroy();
    this.gs.paused = this.wasPaused;
    this.scene.stop();
  }
}
