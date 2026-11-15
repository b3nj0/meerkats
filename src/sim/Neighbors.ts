export type Res = 'food' | 'grass' | 'gems';
export const RES_ICON: Record<Res, string> = { food: '🍓', grass: '🌾', gems: '💎' };
/** Rough worth of one unit, used to keep trades fair-ish. */
export const RES_VALUE: Record<Res, number> = { food: 1, grass: 1.5, gems: 3 };

export interface NeighborPack {
  id: number;
  name: string;
  side: -1 | 1;
  /** 0..100: grows as you trade. Better relations, better deals. */
  relation: number;
  color: number;
  last: { total: number; tier: string } | null;
  /** Won over at a Grand Banquet feast: sends gifts every morning. */
  partner: boolean;
}

export interface TradeOffer {
  give: { res: Res; amt: number };
  want: { res: Res; amt: number };
}

export interface Visitor {
  id: number;
  packId: number;
  name: string;
  palette: number;
  x: number;
  state: 'arriving' | 'waiting' | 'leaving';
  t: number;
  dir: 1 | -1;
  offer: TradeOffer;
}

export function makeNeighbors(): NeighborPack[] {
  return [
    { id: 1, name: 'Dune Ridge Mob', side: -1, relation: 20, color: 0x4a90d9, last: null, partner: false },
    { id: 2, name: 'Acacia Hollow Mob', side: 1, relation: 20, color: 0x9b59b6, last: null, partner: false },
  ];
}

export const VISITOR_NAMES = ['Kofi', 'Naledi', 'Tau', 'Amara', 'Sipho', 'Lerato', 'Jabu', 'Zola'];
