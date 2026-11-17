import Phaser from 'phaser';
import { CFG, SY, clamp } from '../config';
import { GridRenderer } from '../render/GridRenderer';
import { MeerkatView } from '../render/MeerkatView';
import { playSfx, unlockAudio } from '../render/Sfx';
import { SkyRenderer, nightness } from '../render/SkyRenderer';
import { WeatherRenderer } from '../render/WeatherRenderer';
import {
  cobraLabel, drawBadger, drawBlocked, drawCobra, drawDiscoveries, drawEagle, drawJackal, drawJobs, drawNodes, drawRoom, drawScorpion, drawSynergies, drawVisitor,
  makeLabel, predatorLabel,
} from '../render/WorldDraw';
import { saveWorld } from '../save';
import { haptic } from '../platform';
import type { Jackal } from '../sim/predators/Jackal';
import type { Scorpion } from '../sim/predators/Scorpion';
import type { Badger } from '../sim/predators/Badger';
import type { Visitor } from '../sim/Neighbors';
import type { Meerkat } from '../sim/Meerkat';
import type { Cobra } from '../sim/predators/Cobra';
import { DISCOVERY_DEFS } from '../sim/Strata';
import { ROOM_DEFS, roomContains, type Room, type RoomType } from '../sim/Rooms';
import type { World } from '../sim/World';
import type { HudScene } from './HudScene';

const S = CFG.TILE;
const STEP = 1 / 30;
const MAX_ZOOM = 4.5;

export type Tool = 'pan' | 'dig' | 'bolt' | 'erase' | 'room';
type Mode = 'none' | 'pan' | 'paint' | 'hold' | 'ghost' | 'pinch';

export const DEBUG = import.meta.env.DEV || location.search.includes('debug');

export class GameScene extends Phaser.Scene {
  world!: World;
  speed = 1;
  paused = false;
  tool: Tool = 'pan';
  roomType: RoomType = 'cellar';

  private acc = 0;
  private gridR!: GridRenderer;
  private sky!: SkyRenderer;
  private weatherR!: WeatherRenderer;
  private downAt = { x: 0, y: 0, moved: 0 };
  private roomGfx!: Phaser.GameObjects.Graphics;
  private nodeGfx!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private predGfx!: Phaser.GameObjects.Graphics;
  private nightGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private views = new Map<number, MeerkatView>();
  private roomLabels = new Map<number, Phaser.GameObjects.Text>();
  private cobraLabels = new Map<number, Phaser.GameObjects.Text>();
  private ghostLabel!: Phaser.GameObjects.Text;

  private mode: Mode = 'none';
  private held: Meerkat | null = null;
  private last = { x: 0, y: 0 };
  private lastCell: [number, number] | null = null;
  private pinch = { dist: 1, zoom: 1, mx: 0, my: 0 };
  private ghost: { x: number; y: number; ok: boolean; reason?: string } | null = null;
  private minZoom = 0.5;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private predLabels = new Map<number, Phaser.GameObjects.Text>();
  private findLabels = new Map<number, Phaser.GameObjects.Text>();
  private saveT: number = CFG.AUTOSAVE;
  /** Real-time camera follow of the gamepad Alpha. */
  private padActive = false;

  constructor() {
    super('Game');
  }

  get hud(): HudScene | null {
    return this.scene.isActive('Hud') ? (this.scene.get('Hud') as HudScene) : null;
  }

  create(): void {
    this.world = this.registry.get('world');
    this.sky = new SkyRenderer(this);
    this.gridR = new GridRenderer(this, this.world.grid);
    this.roomGfx = this.add.graphics().setDepth(3);
    this.nodeGfx = this.add.graphics().setDepth(4);
    this.overlay = this.add.graphics().setDepth(5);
    this.predGfx = this.add.graphics().setDepth(7);
    this.nightGfx = this.add.graphics().setDepth(8);
    this.fxGfx = this.add.graphics().setDepth(9);
    this.ghostLabel = makeLabel(this, 7);
    this.weatherR = new WeatherRenderer(this);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, CFG.W * S, CFG.H * S);
    cam.setBackgroundColor('#1a1410');
    this.fitZoom();
    cam.setZoom(clamp(Math.min(this.scale.width, this.scale.height) / 300, Math.max(this.minZoom, 1.4), 2.4));
    cam.centerOn((CFG.ENTRANCE_X + 6) * S, (SY + 2) * S);
    this.scale.on('resize', () => this.fitZoom());

    this.setupInput();
    this.setupGamepad();
    this.scene.launch('Hud');
    const persist = () => this.save();
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && persist());
  }

  save(): boolean {
    this.saveT = CFG.AUTOSAVE;
    return saveWorld(this.world);
  }

  // ---------------------------------------------------------------- gamepad (spec 2.2)

  private setupGamepad(): void {
    const gp = this.input.gamepad;
    if (!gp) return;
    gp.on('connected', () => {
      this.hud?.toast('🎮 Controller connected! Left stick: lead the Alpha · A: Squad Whistle · B: dive into a hole · X: forage · Y: next Alpha · LB: scatter · RB: rally', 'good');
    });
    gp.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      if (this.scene.isActive('MiniGame') || this.scene.isActive('Pageant')) return;
      const w = this.world;
      this.padActive = true;
      switch (button.index) {
        case 0: w.squadWhistle(); break;
        case 1: w.setLeadStick(0, 1); this.time.delayedCall(80, () => w.setLeadStick(0, 0)); break;
        case 2: if (!w.leaderGather()) playSfx('error'); break;
        case 3: { const m = w.nextAlpha(); if (m) this.focusOn(m); break; }
        case 4: w.soundAlarm(); break;
        case 5: w.leaderRally(); break;
        case 9: this.togglePause(); break;
      }
    });
  }

  private pollGamepad(dt: number): void {
    const gp = this.input.gamepad;
    const pad = gp && gp.total ? gp.getPad(0) : null;
    if (!pad) return;
    const dz = (v: number) => (Math.abs(v) < 0.25 ? 0 : v);
    let x = dz(pad.leftStick.x);
    let y = dz(pad.leftStick.y);
    if (pad.left) x = -1;
    if (pad.right) x = 1;
    if (pad.up) y = -1;
    if (pad.down) y = 1;
    this.world.setLeadStick(x, y);
    if (x || y) this.padActive = true;
    const cam = this.cameras.main;
    const rx = dz(pad.rightStick.x);
    const ry = dz(pad.rightStick.y);
    if (rx || ry) {
      this.padActive = false; // manual look-around
      cam.scrollX += (rx * 600 * dt) / cam.zoom;
      cam.scrollY += (ry * 600 * dt) / cam.zoom;
    }
    const zoom = pad.R2 - pad.L2;
    if (Math.abs(zoom) > 0.1) this.zoomAt(cam.width / 2, cam.height / 2, cam.zoom * (1 + zoom * dt * 1.5));
    const a = this.world.alpha;
    if (this.padActive && a && a.state === 'Led') {
      cam.scrollX += (a.x * S - (cam.scrollX + cam.width / 2)) * Math.min(1, dt * 4);
      cam.scrollY += (a.y * S - (cam.scrollY + cam.height / 2)) * Math.min(1, dt * 4);
    }
  }

  private fitZoom(): void {
    this.minZoom = Math.max(this.scale.width / (CFG.W * S), this.scale.height / (CFG.H * S));
    const cam = this.cameras.main;
    if (cam.zoom < this.minZoom) cam.setZoom(this.minZoom);
  }

  // ---------------------------------------------------------------- tools & controls

  setTool(tool: Tool, room?: RoomType): void {
    this.tool = tool;
    if (room) this.roomType = room;
    this.ghost = null;
  }
  setSpeed(s: number): void {
    this.speed = s;
    this.paused = false;
  }
  togglePause(): void {
    this.paused = !this.paused;
  }
  focusOn(m: Meerkat): void {
    this.cameras.main.pan(m.x * S, m.y * S, 400, 'Sine.easeInOut');
  }

  // ---------------------------------------------------------------- input

  private setupInput(): void {
    this.input.addPointer(2);
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('wheel', (p: Phaser.Input.Pointer, _g: unknown, _dx: number, dy: number) => {
      this.zoomAt(p.x, p.y, this.cameras.main.zoom * (dy > 0 ? 0.9 : 1.1));
    });

    const kb = this.input.keyboard!;
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    kb.on('keydown-SPACE', () => this.world.soundAlarm());
    kb.on('keydown-ONE', () => this.setSpeed(1));
    kb.on('keydown-TWO', () => this.setSpeed(2));
    kb.on('keydown-THREE', () => this.setSpeed(3));
    kb.on('keydown-P', () => this.togglePause());
    kb.on('keydown-ESC', () => this.setTool('pan'));
    if (DEBUG) {
      kb.on('keydown-E', () => this.world.debugEagle());
      kb.on('keydown-C', () => this.world.debugCobra());
      kb.on('keydown-N', () => this.world.debugSkipPhase());
      kb.on('keydown-X', () => this.world.debugNextSeason());
      kb.on('keydown-M', () => this.world.debugGiveMaterials());
      kb.on('keydown-G', () => this.world.debugPageant());
      kb.on('keydown-V', () => this.world.spawnVisitor());
      kb.on('keydown-J', () => this.world.debugJackal());
      kb.on('keydown-B', () => this.world.debugBadger());
      kb.on('keydown-K', () => this.world.debugScorpion());
      kb.on('keydown-U', () => this.world.debugPup());
      kb.on('keydown-R', () => this.world.debugRevealDeep());
      kb.on('keydown-L', () => this.world.debugChronicle());
    }
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,Q,Z') as Record<string, Phaser.Input.Keyboard.Key>;
  }

  private touches(): Phaser.Input.Pointer[] {
    return [this.input.pointer1, this.input.pointer2].filter((p) => p && p.isDown);
  }

  private worldPt(p: { x: number; y: number }): Phaser.Math.Vector2 {
    return this.cameras.main.getWorldPoint(p.x, p.y);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    unlockAudio();
    if (this.scene.isActive('MiniGame') || this.scene.isActive('Pageant') || this.hud?.isOverUI(p.x, p.y)) return;
    this.downAt = { x: p.x, y: p.y, moved: 0 };
    const t = this.touches();
    if (t.length >= 2) {
      this.endGesture(false);
      this.startPinch(t[0], t[1]);
      return;
    }
    this.last = { x: p.x, y: p.y };
    if (p.rightButtonDown() || p.middleButtonDown()) {
      this.mode = 'pan';
      return;
    }
    const wp = this.worldPt(p);
    const m = this.hitMeerkat(wp.x, wp.y);
    if (m) {
      this.held = m;
      this.world.pickUp(m);
      this.world.holdAt(m, wp.x / S, wp.y / S);
      this.mode = 'hold';
      playSfx('pop');
      return;
    }
    const v = this.hitVisitor(wp.x, wp.y);
    if (v) {
      this.hud?.openTrade(v);
      this.mode = 'none';
      return;
    }
    const c = this.hitCobra(wp.x, wp.y);
    if (c && this.world.rallyAt(c)) {
      this.mode = 'none';
      return;
    }
    if (this.hitThreat(wp.x, wp.y)) {
      this.mode = 'none';
      return;
    }
    switch (this.tool) {
      case 'pan':
        this.mode = 'pan';
        break;
      case 'dig':
      case 'erase':
        this.mode = 'paint';
        this.lastCell = null;
        this.paintAt(wp.x, wp.y);
        break;
      case 'bolt':
        if (!this.world.queueBoltHole(Math.floor(wp.x / S))) playSfx('error');
        this.mode = 'pan';
        break;
      case 'room':
        this.mode = 'ghost';
        this.updateGhost(wp.x, wp.y);
        break;
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const cam = this.cameras.main;
    if (this.mode === 'pinch') {
      const t = this.touches();
      if (t.length >= 2) this.updatePinch(t[0], t[1]);
      return;
    }
    const wp = this.worldPt(p);
    // A missed pointerup (e.g. released over the HUD or outside the window) must not keep painting.
    if (!p.isDown && this.mode !== 'none') {
      this.endGesture(this.mode === 'hold', p);
      return;
    }
    switch (this.mode) {
      case 'pan':
        if (!p.isDown) return;
        this.downAt.moved += Math.hypot(p.x - this.last.x, p.y - this.last.y);
        cam.scrollX -= (p.x - this.last.x) / cam.zoom;
        cam.scrollY -= (p.y - this.last.y) / cam.zoom;
        this.last = { x: p.x, y: p.y };
        break;
      case 'paint':
        this.paintAt(wp.x, wp.y);
        break;
      case 'hold':
        if (this.held) this.world.holdAt(this.held, wp.x / S, wp.y / S);
        break;
      case 'ghost':
        this.updateGhost(wp.x, wp.y);
        break;
      case 'none':
        if (this.tool === 'room' && !p.isDown && !this.hud?.isOverUI(p.x, p.y)) this.updateGhost(wp.x, wp.y);
        break;
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.mode === 'pinch') {
      if (this.touches().length === 0) this.mode = 'none';
      return;
    }
    const wasPanTap = this.mode === 'pan' && this.downAt.moved < 8 && !p.rightButtonReleased();
    this.endGesture(true, p);
    if (wasPanTap) {
      const wp = this.worldPt(p);
      const room = this.hitRoom(wp.x, wp.y);
      if (room) this.hud?.openRoom(room);
    }
  }

  private hitRoom(wx: number, wy: number): Room | null {
    const cx = Math.floor(wx / S);
    const cy = Math.floor(wy / S);
    for (const r of this.world.rooms) {
      if (!r.built) continue;
      if (r.type === 'perch') {
        if (cx >= r.x && cx < r.x + r.w && wy > SY * S - 40 && wy < SY * S + 4) return r;
      } else if (roomContains(r, cx, cy)) return r;
    }
    return null;
  }

  private endGesture(commit: boolean, p?: Phaser.Input.Pointer): void {
    if (this.mode === 'hold' && this.held) {
      const wp = p ? this.worldPt(p) : { x: this.held.x * S, y: this.held.y * S };
      this.world.drop(this.held, wp.x / S, wp.y / S);
      this.held = null;
    } else if (this.mode === 'ghost' && commit && this.ghost) {
      if (this.ghost.ok && this.world.placeRoom(this.roomType, this.ghost.x, this.ghost.y)) {
        playSfx('build');
        this.setTool('pan');
      } else if (!this.ghost.ok) {
        this.world.toast(`Can't build here: ${this.ghost.reason}`, 'warn');
        playSfx('error');
      }
    }
    this.mode = 'none';
  }

  private startPinch(a: Phaser.Input.Pointer, b: Phaser.Input.Pointer): void {
    this.mode = 'pinch';
    this.pinch = {
      dist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: this.cameras.main.zoom,
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  }

  private updatePinch(a: Phaser.Input.Pointer, b: Phaser.Input.Pointer): void {
    const cam = this.cameras.main;
    const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    this.zoomAt(mx, my, (this.pinch.zoom * d) / this.pinch.dist);
    cam.scrollX -= (mx - this.pinch.mx) / cam.zoom;
    cam.scrollY -= (my - this.pinch.my) / cam.zoom;
    this.pinch.mx = mx;
    this.pinch.my = my;
  }

  private zoomAt(px: number, py: number, z: number): void {
    const cam = this.cameras.main;
    z = clamp(z, this.minZoom, MAX_ZOOM);
    const hw = cam.width / 2;
    const hh = cam.height / 2;
    const wx = cam.scrollX + hw + (px - hw) / cam.zoom;
    const wy = cam.scrollY + hh + (py - hh) / cam.zoom;
    cam.setZoom(z);
    cam.scrollX = wx - hw - (px - hw) / z;
    cam.scrollY = wy - hh - (py - hh) / z;
  }

  private paintAt(wx: number, wy: number): void {
    const cx = Math.floor(wx / S);
    const cy = Math.floor(wy / S);
    const apply = (x: number, y: number) =>
      this.tool === 'erase' ? this.world.cancelAt(x, y) : this.world.queueDig(x, y);
    if (!this.lastCell) apply(cx, cy);
    else {
      // Bresenham so fast drags don't leave gaps.
      let [x0, y0] = this.lastCell;
      const dx = Math.abs(cx - x0);
      const dy = -Math.abs(cy - y0);
      const sx = x0 < cx ? 1 : -1;
      const sy = y0 < cy ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        apply(x0, y0);
        if (x0 === cx && y0 === cy) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
    }
    this.lastCell = [cx, cy];
  }

  private updateGhost(wx: number, wy: number): void {
    const def = ROOM_DEFS[this.roomType];
    const cx = Math.floor(wx / S);
    const cy = Math.floor(wy / S);
    const x = cx - Math.floor(def.w / 2);
    const y = def.surface ? SY - 1 : cy - Math.floor(def.h / 2);
    const r = this.world.canPlaceRoom(this.roomType, x, y);
    this.ghost = { x, y, ok: r.ok, reason: r.reason };
  }

  private viewOffset(m: Meerkat): number {
    return this.world.isOnPerch(m) ? -12 : 0;
  }

  private hitMeerkat(wx: number, wy: number): Meerkat | null {
    const slop = this.cameras.main.zoom < 2 ? 4 : 2;
    let best: Meerkat | null = null;
    let bd = Infinity;
    for (const m of this.world.meerkats) {
      const mx = m.x * S;
      const footY = (m.y + 0.5) * S + this.viewOffset(m);
      if (Math.abs(wx - mx) > 7 + slop || wy < footY - 16 - slop || wy > footY + 2 + slop) continue;
      const d = Math.hypot(wx - mx, wy - (footY - 7));
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  private hitVisitor(wx: number, wy: number): Visitor | null {
    return (
      this.world.visitors.find(
        (v) => v.state !== 'leaving' && Math.abs(wx - v.x * S) < 12 && wy > SY * S - 30 && wy < SY * S + 4,
      ) ?? null
    );
  }

  private hitCobra(wx: number, wy: number): Cobra | null {
    return (
      this.world.cobras.find(
        (c) => c.revealed && Math.abs(wx - (c.x + 0.5) * S) < 14 && wy > SY * S - 24 && wy < SY * S + 6,
      ) ?? null
    );
  }

  /** Tap counter-plays: decoy a jackal, flip a scorpion, honeycomb a badger. */
  private hitThreat(wx: number, wy: number): boolean {
    if (wy < SY * S - 30 || wy > SY * S + 8) return false;
    const w = this.world;
    const near = (x: number, r = 14) => Math.abs(wx - x * S) < r;
    const j = w.jackals.find((k) => k.state !== 'leaving' && k.state !== 'decoy' && near(k.x, 16));
    if (j) return w.tossDecoy(j);
    const sc = w.scorpions.find((k) => k.state === 'revealed' && near(k.x + 0.5));
    if (sc) return w.flipScorpion(sc);
    const b = w.badgers.find((k) => k.state === 'walking' && near(k.x, 16));
    if (b) return w.dropHoneycomb(b);
    return false;
  }

  // ---------------------------------------------------------------- frame

  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1);
    if (!this.paused) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= STEP && n < 12) {
        this.world.tick(STEP);
        this.acc -= STEP;
        n++;
      }
      if (n >= 12) this.acc = 0;
    }
    this.keyPan(dt);
    this.pollGamepad(dt);
    if ((this.saveT -= dt) <= 0) this.save();
    for (const e of this.world.drainEvents()) {
      if (e.kind === 'toast') this.hud?.toast(e.text, e.tone);
      else if (e.kind === 'sfx') {
        playSfx(e.name);
        if (['whistle', 'bark', 'hum', 'horn', 'chirp'].includes(e.name)) haptic('alarm');
        else if (e.name === 'snatch' || e.name === 'ouch' || e.name === 'thud') haptic('bump');
      }
      else if (e.kind === 'pageant') {
        this.scene.launch('Pageant', { result: e.result });
        this.scene.bringToTop('Pageant');
      }
    }
    this.draw(time, dt);
  }

  private keyPan(dt: number): void {
    const k = this.keys;
    const cam = this.cameras.main;
    const v = (700 * dt) / cam.zoom;
    if (k.A.isDown || k.LEFT.isDown) cam.scrollX -= v;
    if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += v;
    if (k.W.isDown || k.UP.isDown) cam.scrollY -= v;
    if (k.S.isDown || k.DOWN.isDown) cam.scrollY += v;
    if (k.Q.isDown) this.zoomAt(cam.width / 2, cam.height / 2, cam.zoom * (1 + dt * 1.5));
    if (k.Z.isDown) this.zoomAt(cam.width / 2, cam.height / 2, cam.zoom * (1 - dt * 1.5));
  }

  private draw(time: number, dt: number): void {
    const w = this.world;
    this.gridR.update();
    this.sky.update(w.clock.frac);

    // rooms + labels
    this.roomGfx.clear();
    const seen = new Set<number>();
    for (const r of w.rooms) {
      drawRoom(this.roomGfx, w, r, time);
      seen.add(r.id);
      let lbl = this.roomLabels.get(r.id);
      if (!lbl) {
        lbl = makeLabel(this, 6);
        this.roomLabels.set(r.id, lbl);
      }
      const def = ROOM_DEFS[r.type];
      const badge = r.built && (def.miniGame ? (w.canPlay(r).ok ? ' ▶ tap to play' : '') : r.type === 'workshop' ? ' · tap to craft' : '');
      const text = r.built ? `${def.name}${badge}` : `${def.name} · ${r.type === 'perch' ? 'building' : 'digging'}`;
      if (lbl.text !== text) lbl.setText(text);
      const lx = (r.x + r.w / 2) * S;
      const ly = r.type === 'perch' ? SY * S - (r.built ? 38 : 22) : r.y * S - 1;
      lbl.setPosition(lx, ly);
    }
    for (const [id, lbl] of this.roomLabels) if (!seen.has(id)) (lbl.destroy(), this.roomLabels.delete(id));

    drawSynergies(this.roomGfx, w, time);
    drawDiscoveries(this.roomGfx, w, time);
    for (const d of w.discoveries) {
      const show = d.found || d.hinted;
      let lbl = this.findLabels.get(d.id);
      if (!show) continue;
      if (!lbl) {
        lbl = makeLabel(this, 6);
        this.findLabels.set(d.id, lbl);
      }
      const def = DISCOVERY_DEFS[d.kind];
      const text = d.found ? `${def.icon} ${d.kind === 'fossil' ? `Fossil: ${d.name}` : def.name}` : `🗺️ ${def.name}?`;
      if (lbl.text !== text) lbl.setText(text);
      lbl.setPosition((d.x + 0.5) * S, (d.y - (d.kind === 'ruin' ? 1.4 : 0.6)) * S);
    }
    this.nodeGfx.clear();
    drawNodes(this.nodeGfx, w, time);
    for (const v of w.visitors) drawVisitor(this.nodeGfx, w, v, time);
    this.overlay.clear();
    drawJobs(this.overlay, w);

    // predators
    this.predGfx.clear();
    for (const e of w.eagles) drawEagle(this.predGfx, w, e, time);
    const cseen = new Set<number>();
    for (const c of w.cobras) {
      drawCobra(this.predGfx, c, time);
      cseen.add(c.id);
      let lbl = this.cobraLabels.get(c.id);
      if (!lbl) {
        lbl = makeLabel(this, 7);
        this.cobraLabels.set(c.id, lbl);
      }
      const text = cobraLabel(w, c);
      if (lbl.text !== text) lbl.setText(text);
      lbl.setPosition((c.x + 0.5) * S, SY * S - 22);
    }
    for (const [id, lbl] of this.cobraLabels) if (!cseen.has(id)) (lbl.destroy(), this.cobraLabels.delete(id));
    drawBlocked(this.predGfx, w, time);
    const pseen = new Set<number>();
    const label = (kind: 'jackal' | 'scorpion' | 'badger', p: Jackal | Scorpion | Badger, x: number) => {
      pseen.add(p.id);
      let lbl = this.predLabels.get(p.id);
      if (!lbl) {
        lbl = makeLabel(this, 7);
        this.predLabels.set(p.id, lbl);
      }
      const text = predatorLabel(kind, p, w);
      if (lbl.text !== text) lbl.setText(text);
      lbl.setPosition(x * S, SY * S - 24);
    };
    for (const s of w.scorpions) (drawScorpion(this.predGfx, w, s, time), label('scorpion', s, s.x + 0.5));
    for (const j of w.jackals) (drawJackal(this.predGfx, j, time), label('jackal', j, j.x));
    for (const b of w.badgers) (drawBadger(this.predGfx, b, time), label('badger', b, b.x));
    for (const [id, lbl] of this.predLabels) if (!pseen.has(id)) (lbl.destroy(), this.predLabels.delete(id));

    // meerkats
    const showNames = this.cameras.main.zoom >= 2.6;
    const mseen = new Set<number>();
    for (const m of w.meerkats) {
      let v = this.views.get(m.id);
      if (!v) {
        v = new MeerkatView(this, m);
        this.views.set(m.id, v);
      }
      const cell = w.cellOf(m);
      const room = w.rooms.find((r) => r.id === w.grid.roomAt[cell]);
      v.update(m, time, this.viewOffset(m), showNames, w.isSweaty(m), room?.type === 'lagoon' && room.built, m.id === w.alphaId && m.state === 'Led');
      v.root.setDepth(m.state === 'Held' ? 11 : 6);
      mseen.add(m.id);
    }
    for (const [id, v] of this.views) if (!mseen.has(id)) (v.destroy(), this.views.delete(id));

    // night
    const n = nightness(w.clock.frac);
    this.nightGfx.clear();
    if (n > 0) {
      this.nightGfx.fillStyle(0x0a0f2a, n);
      this.nightGfx.fillRect(0, 0, CFG.W * S, SY * S);
      this.nightGfx.fillStyle(0x0a0f2a, n * 0.35);
      this.nightGfx.fillRect(0, SY * S, CFG.W * S, (CFG.H - SY) * S);
    }

    this.weatherR.update(w, time, dt);

    // fx: radar, den glow, ghost
    const fx = this.fxGfx;
    fx.clear();
    for (const m of w.meerkats) {
      if (m.radar <= 0) continue;
      const cx = m.x * S;
      const r = m.radar * S;
      const gy = SY * S;
      fx.fillStyle(0xffe066, 0.22);
      fx.fillRect(cx - r, gy - 2, r * 2, 3);
      fx.lineStyle(1, 0xffe066, 0.6);
      fx.lineBetween(cx - r, gy - 10, cx - r, gy);
      fx.lineBetween(cx + r, gy - 10, cx + r, gy);
      const sweep = ((time / 1500) % 2) - 1;
      fx.fillStyle(0xffe066, 0.5);
      fx.fillCircle(cx + sweep * r, gy - 1, 1.5);
    }
    if (n > 0.2) {
      for (const r of w.builtRooms('den')) {
        for (let k = 0; k < 4; k++) {
          fx.fillStyle(0xffb347, n * 0.35);
          fx.fillCircle((r.x * S) + 8 + k * 18, r.y * S + 9, 5);
        }
      }
    }
    const showGhost = this.tool === 'room' && this.ghost && this.mode !== 'hold';
    if (showGhost && this.ghost) {
      const def = ROOM_DEFS[this.roomType];
      const color = this.ghost.ok ? 0x7cff7c : 0xff6b6b;
      const gx = this.ghost.x * S;
      const gy = def.surface ? SY * S - 14 : this.ghost.y * S;
      const gh = def.surface ? 14 : def.h * S;
      fx.fillStyle(color, 0.25);
      fx.fillRect(gx, gy, def.w * S, gh);
      fx.lineStyle(1.5, color, 0.9);
      fx.strokeRect(gx, gy, def.w * S, gh);
      const txt = this.ghost.ok ? `${def.name}${def.cost ? ` (${def.cost}🍓)` : ''}` : this.ghost.reason ?? '';
      if (this.ghostLabel.text !== txt) this.ghostLabel.setText(txt);
      this.ghostLabel.setPosition(gx + (def.w * S) / 2, gy - 2).setVisible(true);
    } else this.ghostLabel.setVisible(false);
  }
}
