import { CFG } from '../../config';
import type { Meerkat } from '../Meerkat';
import type { World } from '../World';

export type ScorpionState = 'hidden' | 'revealed' | 'flipped';

/** Thick-Tailed Scorpion: guards buried treasure under a flat rock. */
export interface Scorpion {
  id: number;
  x: number;
  nodeId: number;
  state: ScorpionState;
  /** Tail-Dodge & Flip progress in seconds. */
  t: number;
}

export function spawnScorpion(w: World, nodeId: number, x: number): Scorpion {
  const s: Scorpion = { id: w.newId(), x, nodeId, state: 'hidden', t: 0 };
  w.scorpions.push(s);
  return s;
}

export function flipTeam(w: World, s: Scorpion): Meerkat[] {
  return w.meerkats.filter((m) => m.targetId === s.id && m.state === 'Flipping');
}

function pinch(w: World, s: Scorpion, m: Meerkat): void {
  w.interrupt(m);
  m.state = 'Ouch';
  m.timer = CFG.SCORPION.ouch;
  m.notice = '😖';
  m.noticeTimer = 1.5;
  s.state = 'revealed';
  w.sfx('ouch');
  w.toast(`🦂 Ouch! A scorpion under the flat rock pinched ${m.name}'s tail! Tap it to Tail-Dodge & Flip it with ${CFG.SCORPION.flipNeeded} meerkats.`, 'warn');
}

export function updateScorpion(w: World, s: Scorpion, dt: number): void {
  if (s.state === 'flipped') return;
  for (const m of w.meerkats) {
    if (m.state === 'Gathering' && m.nodeId === s.nodeId) pinch(w, s, m);
  }
  const team = flipTeam(w, s);
  const solo = team.some((m) => m.role === 'Forager' && w.stars(m, 'Forager') >= 5);
  if (team.length >= CFG.SCORPION.flipNeeded || (solo && team.length > 0)) {
    s.t += dt;
    for (const m of team) m.kicking = true;
    if (s.t >= CFG.SCORPION.flipTime) {
      s.state = 'flipped';
      w.stats.flips++;
      for (const m of team) w.interrupt(m);
      w.addMorale(3);
      w.sfx('success');
      w.toast('🥥 Tail-Dodge & Flip! One meerkat baited the claws with a stick while the other flipped a coconut shell over the scorpion. The treasure is safe to dig!', 'good');
    }
  } else s.t = 0;
}
