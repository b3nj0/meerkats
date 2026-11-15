import Phaser from 'phaser';
import { makeTileset } from '../render/tiles';
import { World } from '../sim/World';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    makeTileset(this);
    const param = new URLSearchParams(location.search).get('seed');
    const seed = param ? Number(param) || 1 : Math.floor(Math.random() * 1e6);
    const world = new World({ seed });
    this.registry.set('world', world);
    // Handy for poking at the sim (and scenes) from devtools.
    Object.assign(window as object, { world, game: this.game });
    this.scene.start('Game');
  }
}
