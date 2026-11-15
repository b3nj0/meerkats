export type Phase = 'Morning' | 'Afternoon' | 'Dusk' | 'Night';

/** Phase end points as a fraction of the day. */
export const PHASE_ENDS: [Phase, number][] = [
  ['Morning', 0.2],
  ['Afternoon', 0.65],
  ['Dusk', 0.8],
  ['Night', 1],
];

export function phaseAt(frac: number): Phase {
  for (const [p, end] of PHASE_ENDS) if (frac < end) return p;
  return 'Night';
}

export interface ClockTick {
  phaseChanged: Phase | null;
  newDay: boolean;
}

export class Clock {
  t: number;
  day = 1;

  constructor(
    public length: number,
    startFrac = 0,
  ) {
    this.t = startFrac * length;
  }

  get frac(): number {
    return this.t / this.length;
  }
  get phase(): Phase {
    return phaseAt(this.frac);
  }

  tick(dt: number): ClockTick {
    const before = this.phase;
    this.t += dt;
    let newDay = false;
    if (this.t >= this.length) {
      this.t -= this.length;
      this.day++;
      newDay = true;
    }
    const after = this.phase;
    return { phaseChanged: after !== before ? after : null, newDay };
  }

  /** Jump to just before the next phase boundary (debug helper). */
  skipToNextPhase(): void {
    const f = this.frac;
    const end = PHASE_ENDS.find(([, e]) => f < e)?.[1] ?? 1;
    this.t = end * this.length - 0.001;
  }

  /** In-game clock where the day starts at 06:00. */
  get timeLabel(): string {
    const h = (6 + this.frac * 24) % 24;
    const hh = Math.floor(h);
    const mm = Math.floor(((h - hh) * 60) / 10) * 10;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}
