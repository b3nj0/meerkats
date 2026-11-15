import type { SfxName } from '../sim/World';

// Tiny WebAudio synth: alarm calls are a core gameplay cue, so they need sound even without assets.
let ctx: AudioContext | null = null;
let muted = false;

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function isMuted(): boolean {
  return muted;
}
export function setMuted(v: boolean): void {
  muted = v;
}

function beep(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.1, slide?: number): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(start: number, dur: number, vol: number): void {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(ctx.currentTime + start);
}

export function playSfx(name: SfxName): void {
  if (!ctx || muted) return;
  switch (name) {
    case 'whistle': // Sky-Whistle: high peep-peep!
      beep(1900, 0, 0.12, 'sine', 0.12, 2400);
      beep(1900, 0.18, 0.12, 'sine', 0.12, 2400);
      break;
    case 'chirp': // Recruitment chirp: chuk-chuk-chuk!
      for (let k = 0; k < 3; k++) beep(720, k * 0.13, 0.06, 'square', 0.05, 520);
      break;
    case 'horn':
      beep(196, 0, 0.7, 'sawtooth', 0.07, 247);
      beep(294, 0.05, 0.6, 'triangle', 0.05);
      break;
    case 'snatch':
      beep(900, 0, 0.4, 'triangle', 0.1, 180);
      break;
    case 'success':
      [523, 659, 784, 1046].forEach((f, k) => beep(f, k * 0.09, 0.14, 'triangle', 0.09));
      break;
    case 'join':
      beep(660, 0, 0.12, 'sine', 0.08);
      beep(880, 0.12, 0.18, 'sine', 0.08);
      break;
    case 'sneeze':
      beep(500, 0, 0.12, 'sine', 0.05, 700);
      noise(0.16, 0.3, 0.4);
      break;
    case 'build':
      beep(330, 0, 0.1, 'square', 0.04);
      beep(495, 0.1, 0.16, 'square', 0.04);
      break;
    case 'leap':
      beep(400, 0, 0.18, 'sine', 0.08, 1100);
      break;
    case 'pop':
      beep(820, 0, 0.05, 'sine', 0.05);
      break;
    case 'sniff':
      for (let k = 0; k < 3; k++) beep(300 + k * 60, k * 0.12, 0.08, 'triangle', 0.05, 520 + k * 60);
      break;
    case 'gem':
      beep(1320, 0, 0.08, 'sine', 0.07);
      beep(1760, 0.07, 0.14, 'sine', 0.07);
      break;
    case 'bark': // Deep Double-Bark: low woof-woof!
      beep(170, 0, 0.16, 'sawtooth', 0.09, 120);
      beep(170, 0.24, 0.18, 'sawtooth', 0.09, 110);
      break;
    case 'hum': // Sustained Siren Hum
      beep(330, 0, 1.4, 'triangle', 0.07, 349);
      beep(165, 0, 1.4, 'sine', 0.05);
      break;
    case 'click': // Claw-Snap Click
      for (let k = 0; k < 4; k++) noise(k * 0.07, 0.03, 0.5);
      break;
    case 'ouch':
      beep(700, 0, 0.12, 'square', 0.05, 1100);
      beep(1100, 0.14, 0.2, 'square', 0.05, 600);
      break;
    case 'thud':
      beep(90, 0, 0.3, 'sine', 0.15, 50);
      noise(0, 0.2, 0.3);
      break;
    case 'splash':
      noise(0, 0.35, 0.35);
      break;
    case 'munch':
      for (let k = 0; k < 4; k++) beep(260 + (k % 2) * 40, k * 0.12, 0.06, 'square', 0.04);
      break;
    case 'error':
      beep(200, 0, 0.15, 'square', 0.04, 150);
      break;
  }
}
