import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { MiniGameScene } from './scenes/MiniGameScene';
import { PageantScene } from './scenes/PageantScene';
import { lockLandscape } from './platform';

lockLandscape();

// Chrome on iPad keeps laying the page out at whatever size the tab started with, even after the
// device rotates (and across reloads), so innerWidth/innerHeight and CSS sizes go stale. The window's
// outer size does follow rotation, so on touch devices size the game container from that, minus the
// browser toolbar height measured at startup (when inner and outer agree on the orientation).
const appEl = document.getElementById('app')!;
const touch = navigator.maxTouchPoints > 0;
const sameShape = (outerWidth > outerHeight) === (innerWidth > innerHeight);
const toolbarH = touch && sameShape ? Math.max(0, Math.min(300, outerHeight - innerHeight)) : 0;
function fitApp(): void {
  let w = innerWidth;
  let h = innerHeight;
  if (touch && outerWidth > 0 && outerHeight > 0) {
    w = outerWidth;
    h = outerHeight - toolbarH;
  }
  appEl.style.width = `${w}px`;
  appEl.style.height = `${h}px`;
}
fitApp();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1a1410',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  render: { antialias: true },
  input: { activePointers: 3, gamepad: true },
  disableContextMenu: true,
  scene: [BootScene, GameScene, HudScene, MiniGameScene, PageantScene],
});

// iPad/iPhone browsers report the new viewport size late (or not at all) on rotation, which left the
// canvas and cameras stuck at the old portrait size with black filling the rest. Re-measure a few
// times after any rotation or viewport change, and force every scene's main camera to the new size.
const remeasure = () => {
  for (const ms of [50, 250, 600, 1200]) setTimeout(() => { fitApp(); game.scale.getParentBounds(); game.scale.refresh(); }, ms);
};
window.addEventListener('orientationchange', remeasure);
window.addEventListener('resize', remeasure);
window.visualViewport?.addEventListener('resize', remeasure);
screen.orientation?.addEventListener?.('change', remeasure);

game.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => {
  for (const s of game.scene.getScenes(false)) s.cameras?.main?.setSize(size.width, size.height);
});

// Add ?debug to the URL to show what size the browser, page, canvas and cameras think they are.
if (new URLSearchParams(location.search).has('debug')) {
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99;pointer-events:none;' +
    'background:rgba(200,0,0,.85);color:#fff;font:bold 16px/1.4 monospace;padding:10px 14px;white-space:pre;border-radius:8px;';
  document.body.appendChild(box);
  const app = appEl;
  setInterval(() => {
    const r = (el: Element) => { const b = el.getBoundingClientRect(); return `${Math.round(b.width)}x${Math.round(b.height)}`; };
    const vv = window.visualViewport;
    const cams = game.scene
      .getScenes(true)
      .map((s) => `${s.scene.key}: ${s.cameras.main.width}x${s.cameras.main.height}`)
      .join('\n');
    box.textContent = [
      `inner     ${innerWidth}x${innerHeight}`,
      `outer     ${outerWidth}x${outerHeight}  toolbar ${toolbarH}`,
      `client    ${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`,
      `visualVP  ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} scale ${vv.scale.toFixed(2)}` : '-'}`,
      `screen    ${screen.width}x${screen.height} ${screen.orientation?.type ?? ''}`,
      `dpr       ${devicePixelRatio}`,
      `#app      ${r(app)}`,
      `canvas    ${game.canvas.width}x${game.canvas.height} css ${r(game.canvas)}`,
      `game      ${game.scale.width}x${game.scale.height} parent ${game.scale.parentSize.width}x${game.scale.parentSize.height}`,
      cams,
    ].join('\n');
  }, 500);
}
