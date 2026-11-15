export type JobKind = 'dig' | 'build';

export interface Job {
  id: number;
  kind: JobKind;
  cell: number;
  /** Seconds of work remaining. */
  work: number;
  total: number;
  roomId: number | null;
  /** Dig job that produces a bolt-hole instead of a plain tunnel. */
  bolt: boolean;
  claimedBy: number | null;
}

export class JobQueue {
  private nextId = 1;
  readonly all = new Map<number, Job>();
  private byCell = new Map<number, number>();

  add(kind: JobKind, cell: number, work: number, opts: { roomId?: number; bolt?: boolean } = {}): Job | null {
    if (this.byCell.has(cell)) return null;
    const job: Job = {
      id: this.nextId++,
      kind,
      cell,
      work,
      total: work,
      roomId: opts.roomId ?? null,
      bolt: opts.bolt ?? false,
      claimedBy: null,
    };
    this.all.set(job.id, job);
    this.byCell.set(cell, job.id);
    return job;
  }

  get(id: number): Job | undefined {
    return this.all.get(id);
  }
  at(cell: number): Job | undefined {
    const id = this.byCell.get(cell);
    return id === undefined ? undefined : this.all.get(id);
  }
  remove(id: number): void {
    const j = this.all.get(id);
    if (!j) return;
    this.all.delete(id);
    this.byCell.delete(j.cell);
  }
  releaseBy(meerkatId: number): void {
    for (const j of this.all.values()) if (j.claimedBy === meerkatId) j.claimedBy = null;
  }
  values(): IterableIterator<Job> {
    return this.all.values();
  }
  get size(): number {
    return this.all.size;
  }

  snapshot(): { nextId: number; jobs: Job[] } {
    return { nextId: this.nextId, jobs: [...this.all.values()].map((j) => ({ ...j })) };
  }
  restore(s: { nextId: number; jobs: Job[] }): void {
    this.all.clear();
    this.byCell.clear();
    for (const j of s.jobs) {
      this.all.set(j.id, { ...j });
      this.byCell.set(j.cell, j.id);
    }
    this.nextId = s.nextId;
  }
}
