import type { Grid } from './Grid';

export interface BfsResult {
  start: number;
  /** Steps from start, or -1 if unreachable. */
  dist: Int32Array;
  prev: Int32Array;
}

/**
 * Uniform-cost breadth-first search over walkable tiles (4-directional).
 * The grid is small (~4.6k cells) so a full flood is cheap, and one flood
 * answers "nearest X" queries as well as single paths.
 */
export function bfs(g: Grid, start: number, maxDist = 1e9): BfsResult {
  const n = g.w * g.h;
  const dist = new Int32Array(n).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  dist[start] = 0;
  q[tail++] = start;
  while (head < tail) {
    const i = q[head++];
    const d = dist[i];
    if (d >= maxDist) continue;
    const x = i % g.w;
    const y = (i / g.w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = k === 0 ? x + 1 : k === 1 ? x - 1 : x;
      const ny = k === 2 ? y + 1 : k === 3 ? y - 1 : y;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const j = ny * g.w + nx;
      if (dist[j] >= 0 || !g.walkableAt(j)) continue;
      dist[j] = d + 1;
      prev[j] = i;
      q[tail++] = j;
    }
  }
  return { start, dist, prev };
}

/** Path from the BFS start (exclusive) to target (inclusive), or null if unreachable. */
export function pathFrom(r: BfsResult, target: number): number[] | null {
  if (r.dist[target] < 0) return null;
  const path: number[] = [];
  let c = target;
  while (c !== r.start) {
    path.push(c);
    c = r.prev[c];
    if (c < 0) return null;
  }
  return path.reverse();
}

export function findPath(g: Grid, from: number, to: number): number[] | null {
  if (from === to) return [];
  return pathFrom(bfs(g, from), to);
}
