import Phaser from 'phaser';
import { CFG, SY, clamp } from '../config';
import { FONT } from '../render/MeerkatView';
import { isMuted, playSfx, setMuted } from '../render/Sfx';
import { GEAR, GEAR_KINDS, SLOTS, SLOT_LABEL } from '../sim/Gear';
import { MASTERY_PERKS, PALETTES, QUIRKS, ROLES, TRAITS, type Meerkat, type Role } from '../sim/Meerkat';
import { clearSave, savedAt } from '../save';
import { safeInsets } from '../platform';
import { eagleGroundX } from '../sim/predators/Eagle';
import { MINIGAME_NAMES, ROOM_DEFS, SYNERGIES, THEMES, THEME_ORDER, WONDERS, type Room, type RoomType } from '../sim/Rooms';
import { RES_ICON, type Visitor } from '../sim/Neighbors';
import { RIBBON_LABEL, scorePageant } from '../sim/Pageant';
import { WEATHER_LABEL } from '../sim/Seasons';
import { FEAST_COST, type Tone, type World } from '../sim/World';
import { Button } from '../ui/Button';
import type { GameScene, Tool } from './GameScene';

const S = CFG.TILE;
const TOP_H = 40;
/** Height of the extra stats row the top bar grows when the screen is too narrow for one row. */
const ROW2_H = 26;

interface ToolDef {
  key: string;
  icon: string;
  label: string;
  tool: Tool | 'build' | 'sniff';
  hint: string;
}

const TOOLS: ToolDef[] = [
  { key: 'pan', icon: '✋', label: 'Look', tool: 'pan', hint: 'Drag to look around · pinch / scroll to zoom · drag a meerkat to give it a job · tap a room to use it' },
  { key: 'dig', icon: '⛏️', label: 'Dig', tool: 'dig', hint: 'Drag across the dirt to mark tunnels. Diggers carve them out.' },
  { key: 'bolt', icon: '🕳️', label: 'Bolt-hole', tool: 'bolt', hint: 'Tap the ground to dig an emergency hidey-hole for foragers' },
  { key: 'build', icon: '🏠', label: 'Build', tool: 'build', hint: '' },
  { key: 'erase', icon: '✖️', label: 'Cancel', tool: 'erase', hint: 'Drag over marked tiles or unfinished rooms to cancel them' },
  { key: 'sniff', icon: '👃', label: 'Sniff', tool: 'sniff', hint: '' },
];
const ROOM_ORDER: RoomType[] = ['cellar', 'den', 'perch', 'workshop', 'parlor', 'playroom', 'amphitheater', 'lagoon', 'conservatory', 'banquet'];

const ROLE_ICON: Record<Role, string> = { Sentry: '🔭', Forager: '🍓', Digger: '⛏️' };
const PHASE_ICON = { Morning: '🌅', Afternoon: '☀️', Dusk: '🌇', Night: '🌙' };

function activity(m: Meerkat): string {
  if (m.pup && m.state === 'Walking' && m.intent === 'follow') return 'shadowing mentor';
  if (m.state === 'Walking') {
    switch (m.intent) {
      case 'gather': return 'heading out';
      case 'unload': return 'hauling snacks';
      case 'dig': case 'build': return 'off to work';
      case 'post': return 'to the lookout';
      case 'sleep': return 'off to bed';
      case 'huddle': return 'off to sunbathe';
      default: return 'pottering';
    }
  }
  const map: Record<string, string> = {
    Idle: 'thinking', Waiting: 'pottering', Digging: 'digging', Building: 'building', Gathering: 'foraging',
    Unloading: 'unpacking', Posted: 'on watch', Sleeping: 'asleep', Napping: 'napping', Huddling: 'sunbathing',
    Fleeing: 'diving for cover!', Hiding: 'hiding', Rallying: 'rallying!', Mobbing: 'sand-kicking',
    Startled: 'eek!', Dizzy: 'dizzy 💫', Held: 'wheee!', Fainting: 'swooning 😱', Stretching: 'stretching 🌞',
    Ouch: 'ouch ouch ouch!', Flipping: 'tail-dodging', Playing: 'playing', Following: 'following the Alpha', Led: 'Alpha (🎮)',
  };
  return map[m.state] ?? m.state;
}

function statusIcons(w: World, m: Meerkat): string {
  const s = m.status;
  return [
    w.isSweaty(m) ? '🥵' : '',
    s.chilly ? '🥶' : '',
    s.dusty ? '🟤' : '',
    s.burrs ? '🌵' : '',
    s.groomed > 0 ? '✨' : '',
  ].join('');
}

interface Toast {
  text: Phaser.GameObjects.Text;
  life: number;
}

export class HudScene extends Phaser.Scene {
  private gs!: GameScene;
  private world!: World;
  private topBar!: Phaser.GameObjects.Graphics;
  private dayText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private speedBtns: Button[] = [];
  private muteBtn!: Button;
  private trophyBtn!: Button;
  private toolBtns: Button[] = [];
  private alarmBtn!: Button;
  private buildBtns: Button[] = [];
  private buildOpen = false;
  private hint!: Phaser.GameObjects.Text;
  private rosterBtns: Button[] = [];
  private rosterFocus: Button[] = [];
  private rosterToggle!: Button;
  private rosterOpen = true;
  private goals!: Phaser.GameObjects.Text;
  private goalsOpen = true;
  private toasts: Toast[] = [];
  private edge!: Phaser.GameObjects.Graphics;
  private edgeIcons: Phaser.GameObjects.Text[] = [];
  private panels: Phaser.Geom.Rectangle[] = [];
  private compact = false;
  private twoRow = false;
  private topH = TOP_H;
  private sniffShown = false;
  private modal: Phaser.GameObjects.Container | null = null;
  private modalRefresh: (() => void) | null = null;
  private saveBtn!: Button;
  private border!: Phaser.GameObjects.Graphics;
  private inset = { top: 0, right: 0, bottom: 0, left: 0 };

  constructor() {
    super('Hud');
  }

  create(): void {
    this.gs = this.scene.get('Game') as GameScene;
    this.world = this.gs.world;
    this.topBar = this.add.graphics();
    const txt = (size: number) =>
      this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, color: '#fff7e6' }).setResolution(2);
    this.dayText = txt(15).setOrigin(0, 0.5);
    this.statsText = txt(15).setOrigin(0, 0.5);

    const speeds: [string, () => void][] = [
      ['⏸', () => this.gs.togglePause()],
      ['1×', () => this.gs.setSpeed(1)],
      ['2×', () => this.gs.setSpeed(2)],
      ['3×', () => this.gs.setSpeed(3)],
    ];
    this.speedBtns = speeds.map(([l, fn]) => new Button(this, l, 38, 30, fn, { fontSize: 14 }));
    this.trophyBtn = new Button(this, '🏆', 38, 30, () => this.openBurrow(), { fontSize: 15 });
    this.saveBtn = new Button(this, '💾', 38, 30, () => this.openSave(), { fontSize: 15 });
    this.border = this.add.graphics().setDepth(40);
    this.muteBtn = new Button(this, '🔊', 38, 30, () => {
      setMuted(!isMuted());
      this.muteBtn.setLabel(isMuted() ? '🔇' : '🔊');
    });

    this.toolBtns = TOOLS.map(
      (t) => new Button(this, `${t.icon}\n${t.label}`, 64, 52, () => this.onTool(t), { fontSize: 13 }),
    );
    this.buildBtns = ROOM_ORDER.map((type) => {
      return new Button(this, '', 96, 46, () => {
        const d = ROOM_DEFS[type];
        if (!this.world.blueprintUnlocked(type)) {
          this.toast(`📜 ${d.icon} ${d.name} blueprint needs ${d.unlock} ⭐ Prestige (you have ${this.world.prestige}). Build an Amphitheater or win pageant ribbons!`, 'warn');
          return;
        }
        this.gs.setTool('room', type);
        this.buildOpen = false;
        this.layout();
      }, { fontSize: 12, color: 0x4a3626 });
    });
    this.alarmBtn = new Button(this, '📯\nAlarm', 72, 52, () => this.world.soundAlarm(), { color: 0xb8402e, fontSize: 13 });
    this.hint = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#fff7e6',
        backgroundColor: '#2b1d14cc',
        padding: { x: 8, y: 4 },
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setResolution(2);

    this.rosterToggle = new Button(this, '🐾 Mob ▾', 110, 26, () => {
      this.rosterOpen = !this.rosterOpen;
      this.layout();
    }, { fontSize: 12 });

    this.goals = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#fff7e6',
        backgroundColor: '#2b1d14d9',
        padding: { x: 10, y: 8 },
        lineSpacing: 3,
      })
      .setOrigin(1, 0)
      .setResolution(2)
      .setInteractive({ useHandCursor: true });
    this.goals.on('pointerdown', (_p: unknown, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation();
      this.goalsOpen = !this.goalsOpen;
    });

    this.edge = this.add.graphics();
    for (let i = 0; i < 3; i++) this.edgeIcons.push(this.add.text(0, 0, '', { fontSize: '16px' }).setOrigin(0.5).setVisible(false));

    this.scale.on('resize', () => this.layout());
    this.layout();
    if (this.registry.get('resumed')) this.toast(`🐾 Welcome back to Sunburst Hollow! Day ${this.world.clock.day}, right where you left off.`, 'good');
    else this.toast('Welcome to Sunburst Hollow! 🌞 Dig a Root Cellar, a Snuggle Den and a Lookout Perch.', 'good');
  }

  private onTool(t: ToolDef): void {
    if (t.tool === 'build') {
      this.buildOpen = !this.buildOpen;
      this.layout();
      return;
    }
    if (t.tool === 'sniff') {
      this.world.sniff();
      return;
    }
    this.buildOpen = false;
    this.gs.setTool(t.tool);
    this.layout();
  }

  isOverUI(x: number, y: number): boolean {
    if (this.modal) return true;
    if (this.panels.some((r) => r.contains(x, y))) return true;
    const all = [
      ...this.speedBtns, this.muteBtn, this.trophyBtn, this.saveBtn, ...this.toolBtns, this.alarmBtn, this.rosterToggle,
      ...this.rosterBtns, ...this.rosterFocus, ...this.buildBtns,
    ];
    if (all.some((b) => b.contains(x, y))) return true;
    return this.goals.visible && this.goals.getBounds().contains(x, y);
  }

  toast(text: string, tone: Tone = 'info'): void {
    const color = tone === 'warn' ? '#ffd36b' : tone === 'good' ? '#b8f28c' : '#fff7e6';
    const t = this.add
      .text(this.scale.width / 2, 0, text, {
        fontFamily: FONT,
        fontSize: this.compact ? '12px' : '14px',
        color,
        backgroundColor: '#2b1d14e6',
        padding: { x: 12, y: 6 },
        align: 'center',
        wordWrap: { width: Math.min(560, this.scale.width - 40) },
      })
      .setOrigin(0.5, 0)
      .setResolution(2);
    this.toasts.unshift({ text: t, life: 5 });
    while (this.toasts.length > 4) this.toasts.pop()!.text.destroy();
  }

  // ---------------------------------------------------------------- rooms, crafting, meerkat card

  /** A built room was tapped in the world. */
  openRoom(room: Room): void {
    const w = this.world;
    const def = ROOM_DEFS[room.type];
    this.openModal(`${def.icon} ${def.name}`, (c, width, top) => {
      c.add(this.add.text(0, top - 6, def.blurb, { fontFamily: FONT, fontSize: '12px', color: '#e8d6b8', wordWrap: { width } }).setResolution(2));
      let y = top + 30;
      const syns = w.activeSynergies().filter((s) => s.a === room || s.b === room);
      const possible = SYNERGIES.filter((d) => d.a === room.type || d.b === room.type);
      if (possible.length) {
        const lines = possible.map((d) => `${syns.some((s) => s.def.id === d.id) ? '✨' : '⬜'} ${d.name}: ${d.blurb}`);
        const t = this.add.text(0, y, lines.join('\n'), { fontFamily: FONT, fontSize: '12px', color: '#ffe9a8', wordWrap: { width } }).setResolution(2);
        c.add(t);
        y += t.height + 10;
      }
      if (room.type !== 'perch') {
        c.add(this.add.text(0, y, 'Theme (matching themes impress the pageant judges)', { fontFamily: FONT, fontSize: '12px', color: '#ffd36b' }).setResolution(2));
        y += 20;
        const bw = (width - 12) / 3;
        THEME_ORDER.forEach((t, i) => {
          const th = THEMES[t];
          const ok = w.themeAvailable(t);
          const b = new Button(this, `${ok ? th.icon : '🔒'} ${th.name}`, bw, 34, () => {
            if (!w.setTheme(room, t)) this.toast('🔒 Crystal Cavern unlocks with a Bronze pageant ribbon.');
            this.modalRefresh?.();
          }, { fontSize: 11, color: ok ? 0x4a3626 : 0x352820 });
          b.setSelected(room.theme === t).setPosition(i * (bw + 6) + bw / 2, y + 17);
          c.add(b);
        });
        y += 44;
      }
      if (room.type === 'playroom') {
        const pups = w.pups;
        const lines = pups.length
          ? pups.map((p) => `🍼 ${p.name}: ${Math.round(p.growth * 100)}% grown · ${w.meerkatById(p.mentorId) ? `shadowing ${w.meerkatById(p.mentorId)!.name}` : 'no mentor yet'}`)
          : [`No pups yet. They arrive on mornings when morale is ${CFG.PUP.morale}+ (now ${Math.round(w.morale)}).`];
        lines.push('Drag an adult onto a pup (or use the pup’s card) to make it a mentor. Mentored pups grow faster and may inherit the mentor’s trait.');
        const t = this.add.text(0, y, lines.join('\n'), { fontFamily: FONT, fontSize: '12px', color: '#fff7e6', wordWrap: { width } }).setResolution(2);
        c.add(t);
        y += t.height + 10;
      }
      if (room.type === 'banquet') {
        const ok = w.canPlay(room);
        c.add(this.add.text(0, y, ok.ok ? `Host a formal feast (${FEAST_COST} 🍓) for:` : `Feast Frenzy: ${ok.reason}`, { fontFamily: FONT, fontSize: '12px', color: '#ffd36b' }).setResolution(2));
        y += 20;
        const bw = (width - 8) / 2;
        w.neighbors.forEach((n, i) => {
          const b = new Button(this, `${n.partner ? '🤝' : '🐾'} ${n.name}\n${'♥'.repeat(Math.max(1, Math.round(n.relation / 20)))}`, bw, 44, () => {
            if (!w.startFeast(room, n.id)) {
              this.toast(`Can't host a feast: ${w.canPlay(room).reason ?? 'not now'}`, 'warn');
              return;
            }
            this.closeModal();
            this.scene.launch('MiniGame', { roomId: room.id, packId: n.id });
            this.scene.bringToTop('MiniGame');
          }, { fontSize: 12, color: ok.ok ? 0x5d8a3a : 0x4a3a2e });
          b.setPosition(i * (bw + 8) + bw / 2, y + 22);
          c.add(b);
        });
        y += 54;
      } else if (def.miniGame) {
        const ok = w.canPlay(room);
        const b = new Button(this, ok.ok ? `▶ Play ${MINIGAME_NAMES[def.miniGame]}` : `${MINIGAME_NAMES[def.miniGame]}: ${ok.reason}`, width, 40, () => {
          if (!w.canPlay(room).ok) return;
          this.closeModal();
          this.scene.launch('MiniGame', { roomId: room.id });
          this.scene.bringToTop('MiniGame');
        }, { fontSize: 13, color: ok.ok ? 0x5d8a3a : 0x4a3a2e });
        b.setPosition(width / 2, y + 20);
        c.add(b);
        y += 50;
      }
      if (room.type === 'workshop') {
        const b = new Button(this, '🧵 Open the crafting bench', width, 40, () => this.openCraft(), { fontSize: 13, color: 0x5d8a3a });
        b.setPosition(width / 2, y + 20);
        c.add(b);
        y += 50;
      }
      return y;
    });
  }

  openTrade(v: Visitor): void {
    const w = this.world;
    const pack = w.neighborOf(v);
    const o = v.offer;
    this.openModal(`🐾 ${v.name} of the ${pack.name}`, (c, width, top) => {
      const hearts = '♥'.repeat(Math.max(1, Math.round(pack.relation / 20)));
      const t = this.add
        .text(0, top - 6, `"Greetings, neighbour! Fancy a swap?"\n\nThey offer  ${o.give.amt} ${RES_ICON[o.give.res]}\nfor your  ${o.want.amt} ${RES_ICON[o.want.res]}\n\nFriendship ${hearts}  (trading makes their offers kinder)`, {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#fff7e6',
          wordWrap: { width },
        })
        .setResolution(2);
      c.add(t);
      const y = top + t.height + 8;
      const bw = (width - 10) / 2;
      const yes = new Button(this, '🤝 Deal!', bw, 40, () => {
        if (w.acceptTrade(v)) this.closeModal();
      }, { fontSize: 14, color: 0x5d8a3a });
      yes.setPosition(bw / 2, y + 20);
      const no = new Button(this, 'No thanks', bw, 40, () => {
        w.declineTrade(v);
        this.closeModal();
      }, { fontSize: 14 });
      no.setPosition(bw + 10 + bw / 2, y + 20);
      c.add([yes, no]);
      return y + 48;
    });
  }

  /** Pageant preview, prestige & blueprints, synergies, and neighbours. */
  openBurrow(): void {
    const w = this.world;
    this.openModal('🏆 Burrow & Pageant', (c, width, top) => {
      const s = w.season;
      const left = CFG.SEASON_DAYS - s.dayInSeason;
      const when = left === 0 ? (['Dusk', 'Night'].includes(w.clock.phase) ? 'just happened, next one ends next season' : 'TODAY at dusk!') : `in ${left} day${left > 1 ? 's' : ''} (dusk of day ${w.clock.day + left})`;
      const sc = scorePageant(w);
      const lines: string[] = [`Next pageant: ${when}`, `If the Elders judged now: ${sc.total}/20 · ${RIBBON_LABEL[sc.ribbon]}`];
      for (const cat of sc.categories) lines.push(`${cat.icon} ${'★'.repeat(cat.stars)}${'☆'.repeat(5 - cat.stars)}  ${cat.name}: ${cat.notes.join(', ')}`);
      lines.push('');
      lines.push(`⭐ Prestige ${w.prestige}  (Amphitheater +2 a night, ribbons +3 to +8)`);
      for (const t of WONDERS) {
        const d = ROOM_DEFS[t];
        lines.push(`${w.blueprintUnlocked(t) ? '📜' : '🔒'} ${d.icon} ${d.name}: ${w.blueprintUnlocked(t) ? 'unlocked' : `needs ${d.unlock} ⭐`}`);
      }
      lines.push('');
      const active = w.activeSynergies();
      for (const d of SYNERGIES) lines.push(`${active.some((a) => a.def.id === d.id) ? '✨' : '⬜'} ${d.name}: ${d.blurb}`);
      lines.push('');
      for (const n of w.neighbors) {
        lines.push(`${n.partner ? '🤝' : '🐾'} ${n.name}  ${'♥'.repeat(Math.max(1, Math.round(n.relation / 20)))}${n.partner ? '  · trading partner' : ''}${n.last ? `  · last pageant ${n.last.total}★` : ''}`);
      }
      if (w.trinkets) lines.push(`🐚 ${w.trinkets} shiny pebbles & shells on display`);
      const t = this.add.text(0, top - 6, lines.join('\n'), { fontFamily: FONT, fontSize: this.compact ? '11px' : '12px', color: '#fff7e6', wordWrap: { width }, lineSpacing: 2 }).setResolution(2);
      c.add(t);
      return top + t.height;
    }, 600);
  }

  openSave(): void {
    let confirm = false;
    this.openModal('💾 Your burrow', (c, width, top) => {
      const at = savedAt();
      const t = this.add
        .text(0, top - 6, `Sunburst Hollow saves itself every ${CFG.AUTOSAVE} seconds and whenever you leave.\n${at ? `Last saved ${new Date(at).toLocaleTimeString()}.` : 'Not saved yet.'}`, {
          fontFamily: FONT, fontSize: '13px', color: '#e8d6b8', wordWrap: { width },
        })
        .setResolution(2);
      c.add(t);
      const y = top + t.height + 8;
      const bw = (width - 10) / 2;
      const save = new Button(this, '💾 Save now', bw, 40, () => {
        this.toast(this.gs.save() ? '💾 Burrow saved!' : 'Could not save (storage is blocked in this browser).', 'good');
        this.modalRefresh?.();
      }, { fontSize: 14, color: 0x5d8a3a });
      save.setPosition(bw / 2, y + 20);
      const fresh = new Button(this, confirm ? 'Tap again: erase & restart' : '🌱 Start a new burrow', bw, 40, () => {
        if (!confirm) {
          confirm = true;
          this.modalRefresh?.();
          return;
        }
        clearSave();
        location.href = `${location.pathname}?new`;
      }, { fontSize: 13, color: confirm ? 0xb8402e : 0x4a3626 });
      fresh.setPosition(bw + 10 + bw / 2, y + 20);
      c.add([save, fresh]);
      return y + 48;
    });
  }

  private closeModal(): void {
    this.modal?.destroy(true);
    this.modal = null;
    this.modalRefresh = null;
  }

  /** Opens a centred card; build() fills it and returns its content height. */
  private openModal(title: string, build: (c: Phaser.GameObjects.Container, w: number, top: number) => number, maxW = 480): void {
    const render = () => {
      this.modal?.destroy(true);
      const W = this.scale.width;
      const H = this.scale.height;
      const c = this.add.container(0, 0).setDepth(50);
      const dim = this.add.rectangle(0, 0, W, H, 0x120c08, 0.55).setOrigin(0).setInteractive();
      dim.on('pointerdown', () => this.closeModal());
      c.add(dim);
      const cw = Math.min(W - 24, maxW);
      const content = this.add.container(0, 0);
      const h = build(content, cw - 32, 52) + 16;
      const ch = Math.min(H - 24, h);
      const x = (W - cw) / 2;
      const y = Math.max(12, (H - ch) / 2);
      const bg = this.add.graphics();
      bg.fillStyle(0x2b1d14, 0.98);
      bg.fillRoundedRect(x, y, cw, ch, 14);
      bg.lineStyle(3, 0xf2a541, 1);
      bg.strokeRoundedRect(x, y, cw, ch, 14);
      const block = this.add.zone(x, y, cw, ch).setOrigin(0).setInteractive();
      c.add([block, bg]);
      c.add(
        this.add.text(x + 16, y + 14, title, { fontFamily: FONT, fontSize: '18px', color: '#fff7e6', fontStyle: 'bold' }).setResolution(2),
      );
      const close = new Button(this, '✕', 34, 30, () => this.closeModal(), { fontSize: 14 });
      close.setPosition(x + cw - 26, y + 24);
      c.add(close);
      content.setPosition(x + 16, y);
      c.add(content);
      this.modal = c;
    };
    this.modalRefresh = render;
    render();
  }

  openCraft(): void {
    const w = this.world;
    this.openModal('🧵 Tinkering Workshop', (c, width, top) => {
      const hasShop = w.builtRooms('workshop').length > 0;
      const head = hasShop
        ? `You have 🌾 ${w.materials.grass} grass and 💎 ${w.materials.gems} gems.\nForagers gather grass tufts; gems turn up while digging and in Dust Winds.`
        : '🔒 Build a Tinkering Workshop (🏠 Build) to craft gear.';
      c.add(this.add.text(0, top, head, { fontFamily: FONT, fontSize: '12px', color: '#e8d6b8', wordWrap: { width } }).setResolution(2));
      let y = top + 46;
      for (const k of GEAR_KINDS) {
        const g = GEAR[k];
        const can = w.canCraft(k).ok;
        c.add(
          this.add
            .text(0, y, `${g.icon} ${g.name}  (spare: ${w.gearStock[k]})\n${g.grass} 🌾  ${g.gems} 💎  ·  ${g.blurb}`, {
              fontFamily: FONT,
              fontSize: '13px',
              color: can ? '#fff7e6' : '#a89880',
              wordWrap: { width: width - 100 },
            })
            .setResolution(2),
        );
        const b = new Button(this, 'Craft', 84, 34, () => {
          if (w.craft(k)) this.modalRefresh?.();
        }, { fontSize: 13, color: can ? 0x5d8a3a : 0x4a3a2e });
        b.setPosition(width - 42, y + 17);
        c.add(b);
        y += 50;
      }
      c.add(this.add.text(0, y, 'Tap a meerkat in the 🐾 Mob list to put gear on.', { fontFamily: FONT, fontSize: '12px', color: '#e8d6b8' }).setResolution(2));
      return y + 24;
    });
  }

  openMeerkat(m: Meerkat): void {
    const w = this.world;
    this.openModal(`${m.name}`, (c, width, top) => {
      const pal = PALETTES[m.palette].name;
      const tr = TRAITS[m.trait];
      const qu = QUIRKS[m.quirk];
      const st: string[] = [];
      if (w.isSweaty(m)) st.push('🥵 Sweaty');
      if (m.status.chilly) st.push('🥶 Chilly');
      if (m.status.dusty) st.push('🟤 Dusty');
      if (m.status.burrs) st.push('🌵 Burr-tangled');
      if (m.status.groomed > 0) st.push('✨ Groomed');
      c.add(
        this.add
          .text(0, top - 6, `${m.pup ? '🍼 Pup · ' : ''}${pal} coat · ${activity(m)} · stamina ${Math.round(m.stamina)}\n${st.length ? st.join('  ') : 'Feeling fine'}\n${tr.icon} ${tr.name}: ${tr.blurb}\n${qu.icon} ${qu.name}: ${qu.blurb}`, {
            fontFamily: FONT,
            fontSize: '12px',
            color: '#e8d6b8',
            wordWrap: { width },
          })
          .setResolution(2),
      );
      let y = top + 78;
      if (!m.pup) {
        const rows = ROLES.map((r) => {
          const st = w.stars(m, r);
          const perks = MASTERY_PERKS[r].filter((_, i) => (r === 'Digger' ? [2, 4, 2] : r === 'Forager' ? [2, 3, 5] : [2, 4, 5])[i] <= st);
          return `${ROLE_ICON[r]} ${'★'.repeat(st)}${'☆'.repeat(5 - st)} ${r}${perks.length ? `: ${perks.join(' · ')}` : ''}`;
        });
        const t = this.add.text(0, y - 2, `Role Mastery\n${rows.join('\n')}`, { fontFamily: FONT, fontSize: '11px', color: '#ffe9a8', wordWrap: { width }, lineSpacing: 1 }).setResolution(2);
        c.add(t);
        y += t.height + 18;
      }
      if (m.pup) {
        const mentor = w.meerkatById(m.mentorId);
        c.add(this.add.text(0, y, `Growing up: ${Math.round(m.growth * 100)}%${w.hasSynergy('youth') ? '  (✨ Inspired Youth: 2× mentorship)' : ''}`, { fontFamily: FONT, fontSize: '13px', color: '#ffd36b' }).setResolution(2));
        y += 26;
        const b = new Button(this, `Mentor: ${mentor ? `${mentor.name} (${TRAITS[mentor.trait].icon} ${TRAITS[mentor.trait].name})` : '— none —'}  ▸`, width, 36, () => {
          const adults = w.adults;
          const i = adults.findIndex((a) => a.id === m.mentorId);
          w.setMentor(m, i + 1 < adults.length ? adults[i + 1] : null);
          this.modalRefresh?.();
        }, { fontSize: 13, align: 'left' });
        b.setPosition(width / 2, y + 12);
        const focus = new Button(this, '◎ Show me', 120, 32, () => {
          this.gs.focusOn(m);
          this.closeModal();
        }, { fontSize: 13 });
        focus.setPosition(60, y + 58);
        c.add([b, focus]);
        return y + 78;
      }
      c.add(this.add.text(0, y, 'Job', { fontFamily: FONT, fontSize: '13px', color: '#ffd36b' }).setResolution(2));
      const bw = Math.min(120, (width - 60) / 3);
      ROLES.forEach((r, i) => {
        const b = new Button(this, `${ROLE_ICON[r]} ${r}`, bw, 34, () => {
          w.setRole(m, r);
          this.modalRefresh?.();
        }, { fontSize: 13 });
        b.setSelected(m.role === r).setPosition(60 + i * (bw + 6) + bw / 2, y + 9);
        c.add(b);
      });
      y += 48;
      for (const slot of SLOTS) {
        c.add(this.add.text(0, y, SLOT_LABEL[slot], { fontFamily: FONT, fontSize: '13px', color: '#ffd36b' }).setResolution(2));
        const cur = m.gear[slot];
        const spare = GEAR_KINDS.filter((k) => GEAR[k].slot === slot).reduce((n, k) => n + w.gearStock[k], 0);
        const label = cur ? `${GEAR[cur].icon} ${GEAR[cur].name}  ▸` : `— nothing —  ▸${spare ? `  (${spare} spare)` : ''}`;
        const b = new Button(this, label, width - 60, 34, () => {
          w.cycleGear(m, slot);
          playSfx('pop');
          this.modalRefresh?.();
        }, { fontSize: 13, align: 'left' });
        b.setPosition(60 + (width - 60) / 2, y + 9);
        c.add(b);
        y += 42;
      }
      const focus = new Button(this, '◎ Show me', 120, 32, () => {
        this.gs.focusOn(m);
        this.closeModal();
      }, { fontSize: 13 });
      focus.setPosition(60, y + 14);
      const craft = new Button(this, '🧵 Workshop', 130, 32, () => this.openCraft(), { fontSize: 13 });
      craft.setPosition(200, y + 14);
      c.add([focus, craft]);
      return y + 34;
    });
  }

  // ---------------------------------------------------------------- layout

  private layout(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.compact = W < 720 || H < 480;
    // Keep clear of the notch / Dynamic Island and the home bar on iPhone.
    const ins = (this.inset = safeInsets());

    this.topBar.clear();
    this.topBar.fillStyle(0x2b1d14, 0.88);
    this.topBar.fillRect(0, 0, W, this.topH);
    if (this.twoRow) {
      this.topBar.fillStyle(0xffe6b0, 0.12);
      this.topBar.fillRect(0, TOP_H, W, 1);
    }
    this.dayText.setFontSize(this.compact ? 12 : 15).setPosition(12 + ins.left, TOP_H / 2);
    this.statsText.setFontSize(this.compact ? 12 : 15);
    let x = W - 8 - 19 - ins.right;
    this.muteBtn.setPosition(x, TOP_H / 2);
    for (let i = this.speedBtns.length - 1; i >= 0; i--) {
      x -= 42;
      this.speedBtns[i].setPosition(x, TOP_H / 2);
    }
    this.trophyBtn.setPosition(x - 48, TOP_H / 2);
    this.saveBtn.setPosition(x - 90, TOP_H / 2);

    // toolbar (Sniff only appears in the lean seasons)
    this.sniffShown = this.world.canSniff;
    const visible = this.toolBtns.filter((_, i) => TOOLS[i].tool !== 'sniff' || this.sniffShown);
    this.toolBtns.forEach((b, i) => b.setVisible(TOOLS[i].tool !== 'sniff' || this.sniffShown));
    const n = visible.length;
    const gap = 6;
    const alarmW = this.compact ? 60 : 76;
    const bw = clamp((W - 24 - alarmW - gap * n) / n, 40, 72);
    const bh = this.compact ? 46 : 54;
    const total = n * bw + (n - 1) * gap + gap * 2 + alarmW;
    let bx = (W - total) / 2 + bw / 2;
    const by = H - bh / 2 - 8 - Math.min(ins.bottom, 20);
    visible.forEach((b) => {
      b.resize(bw, bh).setFontSize(this.compact ? 11 : 13).setPosition(bx, by);
      bx += bw + gap;
    });
    this.alarmBtn.resize(alarmW, bh).setFontSize(this.compact ? 11 : 13).setPosition(bx - bw / 2 + gap + alarmW / 2, by);

    // build picker pops up above the toolbar
    const nb = this.buildBtns.length;
    const cols = W >= nb * 100 + 40 ? nb : Math.ceil(nb / 2);
    const rows = Math.ceil(nb / cols);
    const pbw = clamp((W - 24 - gap * (cols - 1)) / cols, 60, 104);
    const pbh = this.compact ? 42 : 46;
    const pTop = H - bh - 16 - Math.min(ins.bottom, 20) - rows * (pbh + gap);
    this.buildBtns.forEach((b, i) => {
      const cx = (W - (cols * pbw + (cols - 1) * gap)) / 2 + pbw / 2 + (i % cols) * (pbw + gap);
      const cy = pTop + pbh / 2 + Math.floor(i / cols) * (pbh + gap);
      b.resize(pbw, pbh).setFontSize(this.compact ? 10 : 12).setPosition(cx, cy).setVisible(this.buildOpen);
    });
    const py = pTop + pbh / 2;
    this.hint.setPosition(W / 2, (this.buildOpen ? py - pbh / 2 : H - bh) - 10).setFontSize(this.compact ? 10 : 12);
    this.hint.setWordWrapWidth(Math.min(600, W - 30));

    this.panels = [new Phaser.Geom.Rectangle(0, 0, W, this.topH)];
    this.layoutRoster();
  }

  private layoutRoster(): void {
    const ms = this.world.meerkats;
    while (this.rosterBtns.length < ms.length) {
      const i = this.rosterBtns.length;
      this.rosterBtns.push(
        new Button(this, '', 170, 34, () => {
          const m = this.world.meerkats[i];
          if (m) this.openMeerkat(m);
        }, { fontSize: 12, align: 'left' }),
      );
      this.rosterFocus.push(new Button(this, '◎', 30, 34, () => this.gs.focusOn(this.world.meerkats[i]), { fontSize: 14 }));
    }
    const rowW = this.compact ? 156 : 186;
    const L = 8 + this.inset.left;
    this.rosterToggle.setPosition(L + 55, this.topH + 18).setLabel(`🐾 Mob (${ms.length}) ${this.rosterOpen ? '▾' : '▸'}`);
    const rowH = this.compact ? 32 : 36;
    this.rosterBtns.forEach((b, i) => {
      const y = this.topH + 48 + i * (rowH + 4);
      b.resize(rowW, rowH).setPosition(L + 34 + rowW / 2, y).setVisible(this.rosterOpen);
      this.rosterFocus[i].resize(30, rowH).setPosition(L + 15, y).setVisible(this.rosterOpen);
    });
  }

  // ---------------------------------------------------------------- frame

  update(time: number, deltaMs: number): void {
    const w = this.world;
    const dt = deltaMs / 1000;
    const W = this.scale.width;
    const H = this.scale.height;

    if (this.sniffShown !== w.canSniff) this.layout();

    const phase = w.clock.phase;
    const s = w.season;
    const weather = WEATHER_LABEL[w.weather] || (w.frost ? '🥶 Frost' : '');
    const season = `${s.def.icon} ${this.compact ? s.def.short : s.def.name} ${s.dayInSeason}/${CFG.SEASON_DAYS}`;
    this.dayText.setText(
      `${PHASE_ICON[phase]} Day ${w.clock.day} ${this.compact ? '' : `· ${phase} `}${w.clock.timeLabel}${w.nightFast ? ' ⏩' : ''}   ${season}${weather ? `  ${weather}` : ''}`,
    );
    this.statsText.setText(`🍓 ${w.food}/${w.foodCap}  🌾 ${w.materials.grass}  💎 ${w.materials.gems}  ⭐ ${w.prestige}  😊 ${Math.round(w.morale)}`);
    // Food, grass and gems must always be visible: if they don't fit beside the day line
    // (iPad portrait, narrow windows), the top bar grows a second row for them.
    const statsX = this.dayText.x + this.dayText.width + (this.compact ? 10 : 22);
    const room = this.saveBtn.x - 24 - statsX;
    const sw = this.statsText.width;
    const wantTwoRow = this.twoRow ? room < sw + 40 : room < sw;
    if (wantTwoRow !== this.twoRow) {
      this.twoRow = wantTwoRow;
      this.topH = wantTwoRow ? TOP_H + ROW2_H : TOP_H;
      this.layout();
    }
    if (this.twoRow) this.statsText.setPosition(this.dayText.x, TOP_H + ROW2_H / 2);
    else this.statsText.setPosition(statsX, TOP_H / 2);

    const sp = this.gs.paused && !this.scene.isActive('MiniGame') ? 0 : this.gs.speed;
    this.speedBtns.forEach((b, i) => b.setSelected(i === sp));
    TOOLS.forEach((t, i) => {
      const sel =
        t.tool === 'build'
          ? this.buildOpen || this.gs.tool === 'room'
          : t.tool === 'sniff'
            ? !!w.sniffFx
            : !this.buildOpen && this.gs.tool === t.tool;
      this.toolBtns[i].setSelected(sel);
      if (t.tool === 'sniff') this.toolBtns[i].setLabel(w.sniffCooldown > 0 ? `👃\n${Math.ceil(w.sniffCooldown)}s` : '👃\nSniff');
      if (t.tool === 'build') {
        const icon = this.gs.tool === 'room' ? ROOM_DEFS[this.gs.roomType].icon : '🏠';
        this.toolBtns[i].setLabel(`${icon}\nBuild ▴`);
      }
    });
    if (this.buildOpen) {
      this.buildBtns.forEach((b, i) => {
        const t = ROOM_ORDER[i];
        const d = ROOM_DEFS[t];
        const short = d.name.replace(/^(Tinkering|Lookout|Snuggle|Storytelling|Aquifer|Crystal|Pups'|Grand) /, '');
        const cost = w.blueprintUnlocked(t)
          ? [d.cost ? `${d.cost}🍓` : '', d.gems ? `${d.gems}💎` : ''].filter(Boolean).join(' ') || 'free'
          : `🔒 ${d.unlock}⭐`;
        b.setLabel(`${d.icon} ${short}\n${cost}`).setSelected(this.gs.tool === 'room' && this.gs.roomType === t);
      });
    }
    let hint = '';
    if (this.buildOpen) hint = 'Pick a room to build. Tier 3 rooms need ⭐ Prestige blueprints. Neighbouring rooms can form ✨ synergies!';
    else if (this.gs.tool === 'room') {
      const d = ROOM_DEFS[this.gs.roomType];
      hint = `${d.icon} ${d.name}${d.cost ? ` · costs ${d.cost} 🍓` : ''}: ${d.blurb}`;
    } else hint = TOOLS.find((t) => t.tool === this.gs.tool)?.hint ?? '';
    if (this.hint.text !== hint) this.hint.setText(hint);
    this.alarmBtn.setSelected(w.dangerTimer > 0);

    if (this.rosterBtns.length !== w.meerkats.length) this.layoutRoster();
    w.meerkats.forEach((m, i) => {
      const gear = [m.gear.head, m.gear.eyes, m.gear.back].filter(Boolean).map((k) => GEAR[k!].icon).join('');
      const job = m.pup ? `🍼 Pup ${Math.round(m.growth * 100)}%` : `${ROLE_ICON[m.role]} ${m.role} ${w.stars(m)}★`;
      this.rosterBtns[i].setLabel(`${m.id === w.alphaId ? '🎮' : ''}${m.name}  ${job} ${gear}\n${activity(m)} ${statusIcons(w, m)}`);
    });

    // goals: show what's next
    const has = (t: RoomType) => w.builtRooms(t).length > 0;
    const goals: [boolean, string][] = [
      [w.stats.dug > 0, 'Dig a tunnel (⛏️ Dig)'],
      [has('cellar'), 'Build a Root Cellar'],
      [has('den'), 'Build a Snuggle Den'],
      [has('perch'), 'Build a Lookout Perch'],
      [w.stats.boltHoles > 0, 'Dig a bolt-hole near far bushes'],
      [w.stats.eaglesEvaded > 0, 'Dodge an eagle'],
      [w.stats.mobs > 0, 'Shoo a cobra with 3+ meerkats'],
      [w.stats.miniGames > 0, 'Tap a ▶ room to play its mini-game'],
      [has('workshop'), 'Build a Tinkering Workshop'],
      [w.stats.crafted > 0, 'Craft an accessory'],
      [has('parlor'), 'Build a Sun-Parlor'],
      [w.stats.sniffs > 0, 'Sniff out buried grubs (Golden Sun)'],
      [w.stats.seasons >= 4, 'Reach the Long Dry'],
      [has('amphitheater'), 'Build a Storytelling Amphitheater'],
      [w.stats.trades > 0, 'Trade with a visiting neighbour'],
      [w.activeSynergies().some((x) => x.def.id !== 'quickdrop'), 'Activate a ✨ room synergy'],
      [has('lagoon') || has('conservatory'), 'Build a Tier 3 wonder room'],
      [w.stats.bestRibbon !== 'none', 'Win a pageant ribbon'],
      [w.stats.bestRibbon === 'gold', 'Win the Gold Sunburst Trophy'],
      [has('playroom'), "Build a Pups' Playroom"],
      [w.pups.some((p) => p.mentorId != null) || w.stats.pups > 0, 'Give a pup a mentor (drag an adult onto it)'],
      [w.stats.pups > 0, 'Raise a pup to adulthood'],
      [w.stats.decoys > 0, 'Toss a decoy gourd at a jackal'],
      [w.stats.flips > 0, 'Tail-Dodge & Flip a scorpion'],
      [w.stats.honey > 0, 'Distract a honey badger with honeycomb'],
      [has('banquet'), 'Build the Grand Banquet Hall'],
      [w.neighbors.some((n) => n.partner), 'Win over a permanent trading partner at a feast'],
    ];
    const done = goals.filter((g) => g[0]).length;
    const todo = goals.filter((g) => !g[0]).slice(0, this.compact ? 4 : 6);
    const goalText = this.goalsOpen
      ? `🎯 Goals ${done}/${goals.length}  (tap to hide)\n` + todo.map(([, s]) => `⬜ ${s}`).join('\n') + (todo.length ? '' : '🏆 All done!')
      : `🎯 Goals ${done}/${goals.length} ▸`;
    if (this.goals.text !== goalText) this.goals.setText(goalText);
    this.goals.setPosition(W - 8, this.topH + 8).setFontSize(this.compact ? 10 : 12);

    let ty = this.topH + 8;
    for (const t of [...this.toasts]) {
      t.life -= dt;
      if (t.life <= 0) {
        t.text.destroy();
        this.toasts.splice(this.toasts.indexOf(t), 1);
        continue;
      }
      t.text.setAlpha(Math.min(1, t.life / 0.6)).setPosition(W / 2, ty);
      ty += t.text.height + 4;
    }

    this.drawEdgeAlerts(time, W, H);
  }

  /** Split-awareness cue: pulse an arrow at the screen edge toward off-screen threats. */
  private drawEdgeAlerts(time: number, W: number, H: number): void {
    const w = this.world;
    const cam = this.gs.cameras.main;
    const view = cam.worldView;
    const threats: { x: number; y: number; icon: string }[] = [];
    for (const e of w.eagles) if (e.alerted || e.selfNoticed) threats.push({ x: eagleGroundX(e) * S, y: (SY - 1) * S, icon: '🦅' });
    for (const c of w.cobras) if (c.state === 'ambush' || c.state === 'mob') threats.push({ x: (c.x + 0.5) * S, y: (SY - 1) * S, icon: '🐍' });
    for (const j of w.jackals) if (j.alerted || j.state === 'chase' || j.state === 'barking') threats.push({ x: j.x * S, y: (SY - 1) * S, icon: '🐺' });
    for (const b of w.badgers) if ((b.alerted || b.noticed) && b.state !== 'leaving') threats.push({ x: b.x * S, y: (SY - 1) * S, icon: '🦡' });
    // Deep Double-Bark: a yellow screen border while a spotted jackal prowls (spec 6).
    this.border.clear();
    if (w.jackals.some((j) => j.alerted && (j.state === 'patrol' || j.state === 'chase'))) {
      this.border.lineStyle(6, 0xffd23f, 0.5 + 0.35 * Math.sin(time * 0.008));
      this.border.strokeRect(3, 3, W - 6, H - 6);
    }
    this.edge.clear();
    this.edgeIcons.forEach((t) => t.setVisible(false));
    const top = this.topH + 24;
    const bottom = H - 90;
    threats.slice(0, 3).forEach((t, i) => {
      const sx = (t.x - view.x) * cam.zoom;
      const sy = (t.y - view.y) * cam.zoom;
      if (sx >= 0 && sx <= W && sy >= top && sy <= bottom) return;
      const ix = clamp(sx, 28, W - 28);
      const iy = clamp(sy, top + 10, bottom);
      const a = Math.atan2(sy - iy, sx - ix);
      const pulse = 0.55 + 0.45 * Math.sin(time * 0.012);
      this.edge.fillStyle(0xe5442e, pulse);
      this.edge.fillCircle(ix, iy, 18);
      this.edge.fillStyle(0xffffff, pulse);
      this.edge.fillTriangle(
        ix + Math.cos(a) * 26, iy + Math.sin(a) * 26,
        ix + Math.cos(a + 0.5) * 17, iy + Math.sin(a + 0.5) * 17,
        ix + Math.cos(a - 0.5) * 17, iy + Math.sin(a - 0.5) * 17,
      );
      this.edgeIcons[i].setText(t.icon).setPosition(ix, iy).setVisible(true);
    });
  }
}
