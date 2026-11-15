export type GearSlot = 'head' | 'eyes' | 'back';
export type GearKind = 'sunhat' | 'helmet' | 'goggles' | 'gourdpack';

export interface GearDef {
  kind: GearKind;
  name: string;
  icon: string;
  slot: GearSlot;
  grass: number;
  gems: number;
  blurb: string;
}

export const GEAR: Record<GearKind, GearDef> = {
  sunhat: { kind: 'sunhat', name: 'Woven Sun Hat', icon: '👒', slot: 'head', grass: 4, gems: 0, blurb: 'No heatwave Sweaty' },
  helmet: { kind: 'helmet', name: 'Acorn-Cap Helmet', icon: '🌰', slot: 'head', grass: 2, gems: 1, blurb: '+25% digging speed' },
  goggles: { kind: 'goggles', name: 'Amber-Lens Goggles', icon: '🥽', slot: 'eyes', grass: 1, gems: 2, blurb: 'Sees through haboobs, never Dusty' },
  gourdpack: { kind: 'gourdpack', name: 'Hollowed Gourd Pack', icon: '🎒', slot: 'back', grass: 3, gems: 2, blurb: 'Carries 6 items instead of 4' },
};

export const GEAR_KINDS = Object.keys(GEAR) as GearKind[];
export const SLOTS: GearSlot[] = ['head', 'eyes', 'back'];
export const SLOT_LABEL: Record<GearSlot, string> = { head: 'Head', eyes: 'Eyes', back: 'Back' };
