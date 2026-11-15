export type NodeType = 'berry' | 'root' | 'spill' | 'melon' | 'grass' | 'gem' | 'grub';
export type Yield = 'food' | 'grass' | 'gem';

export interface ResourceNode {
  id: number;
  type: NodeType;
  yield: Yield;
  /** Surface column. */
  x: number;
  stock: number;
  max: number;
  /** Food per item (food nodes only). */
  value: number;
  gatherTime: number;
  regrow: number;
  regrowTimer: number;
  /** Seconds until a spill disappears (Infinity for everything else). */
  ttl: number;
  /** Buried until a Sniff reveals it. */
  hidden: boolean;
}

const DEFS: Record<NodeType, { max: number; value: number; gatherTime: number; regrow: number; yield: Yield }> = {
  berry: { max: 5, value: 1, gatherTime: 0.8, regrow: 25, yield: 'food' },
  root: { max: 3, value: 2, gatherTime: 1.6, regrow: 45, yield: 'food' },
  spill: { max: 8, value: 1, gatherTime: 0.4, regrow: Infinity, yield: 'food' },
  melon: { max: 2, value: 3, gatherTime: 2.0, regrow: Infinity, yield: 'food' },
  grub: { max: 3, value: 2, gatherTime: 1.2, regrow: Infinity, yield: 'food' },
  grass: { max: 4, value: 0, gatherTime: 1.0, regrow: 35, yield: 'grass' },
  gem: { max: 2, value: 0, gatherTime: 2.5, regrow: Infinity, yield: 'gem' },
};

export function makeNode(id: number, type: NodeType, x: number): ResourceNode {
  const d = DEFS[type];
  return {
    id,
    type,
    yield: d.yield,
    x,
    stock: d.max,
    max: d.max,
    value: d.value,
    gatherTime: d.gatherTime,
    regrow: d.regrow,
    regrowTimer: d.regrow,
    ttl: Infinity,
    hidden: false,
  };
}

/** How much a forager wants one item from this node. */
export function nodeWorth(n: ResourceNode): number {
  return n.yield === 'food' ? n.value : n.yield === 'grass' ? 1 : 3;
}
