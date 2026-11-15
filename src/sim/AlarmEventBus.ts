export type AlertType = 'eagle' | 'cobra' | 'evacuate';

export interface PredatorAlert {
  type: AlertType;
  /** Origin of the call, in tile units. */
  x: number;
  y: number;
  /** Listeners farther than this from the origin never hear it. */
  radius: number;
  /** Relayed calls reach listeners after a distance-based delay; local calls are instant. */
  relay: boolean;
  /** Meerkat that made the call (it does not hear itself). */
  sourceId?: number;
  predatorId?: number;
}

export interface AlertListener {
  id: number;
  pos(): { x: number; y: number };
  onAlert(a: PredatorAlert): void;
}

interface Pending {
  at: number;
  id: number;
  alert: PredatorAlert;
}

/** Pub/sub dispatcher that propagates predator alerts through the colony with a relay delay. */
export class AlarmEventBus {
  time = 0;
  private listeners = new Map<number, AlertListener>();
  private pending: Pending[] = [];
  private observers: ((a: PredatorAlert) => void)[] = [];

  constructor(
    public relayBase: number,
    public relaySpeed: number,
  ) {}

  subscribe(l: AlertListener): void {
    this.listeners.set(l.id, l);
  }
  unsubscribe(id: number): void {
    this.listeners.delete(id);
  }
  /** Observers see every alert the moment it is published (used for UI/audio). */
  observe(fn: (a: PredatorAlert) => void): void {
    this.observers.push(fn);
  }

  publish(a: PredatorAlert): void {
    for (const fn of this.observers) fn(a);
    for (const l of this.listeners.values()) {
      if (l.id === a.sourceId) continue;
      const p = l.pos();
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      if (d > a.radius) continue;
      const delay = a.relay ? this.relayBase + d / this.relaySpeed : 0;
      this.pending.push({ at: this.time + delay, id: l.id, alert: a });
    }
    this.pending.sort((p, q) => p.at - q.at);
  }

  tick(dt: number): void {
    this.time += dt;
    while (this.pending.length && this.pending[0].at <= this.time) {
      const e = this.pending.shift()!;
      this.listeners.get(e.id)?.onAlert(e.alert);
    }
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}
