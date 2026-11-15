import Phaser from 'phaser';
import { makeTileset } from '../render/tiles';
import { loadWorld } from '../save';
import { World } from '../sim/World';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    makeTileset(this);
    const params = new URLSearchParams(location.search);
    const param = params.get('seed');
    // Resume the saved burrow unless a fresh map was asked for.
    const saved = param || params.has('new') ? null : loadWorld();
    const seed = param ? Number(param) || 1 : Math.floor(Math.random() * 1e6);
    const world = saved ?? new World({ seed });
    this.registry.set('world', world);
    this.registry.set('resumed', !!saved);
    // Handy for poking at the sim (and scenes) from devtools.
    Object.assign(window as object, { world, game: this.game });
    this.scene.start('Game');
  }
}
