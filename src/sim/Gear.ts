export type GearSlot = 'head' | 'eyes' | 'back';
export type GearKind = 'sunhat' | 'helmet' | 'crown' | 'goggles' | 'monocle' | 'gourdpack' | 'pouch';

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
  crown: { kind: 'crown', name: 'Wildflower Crown', icon: '🌼', slot: 'head', grass: 3, gems: 1, blurb: '+1 Colony Spirit star at the pageant (2+ crowns)' },
  goggles: { kind: 'goggles', name: 'Amber-Lens Goggles', icon: '🥽', slot: 'eyes', grass: 1, gems: 2, blurb: 'Sees through haboobs, never Dusty' },
  monocle: { kind: 'monocle', name: 'Carved Wood Monocle', icon: '🧐', slot: 'eyes', grass: 2, gems: 2, blurb: 'Scout diplomacy: neighbours offer better trades' },
  gourdpack: { kind: 'gourdpack', name: 'Hollowed Gourd Pack', icon: '🎒', slot: 'back', grass: 3, gems: 2, blurb: 'Carries 6 items instead of 4' },
  pouch: { kind: 'pouch', name: 'Crystal-Trimmed Pouch', icon: '👝', slot: 'back', grass: 4, gems: 5, blurb: 'Carries 8 items' },
};

export const GEAR_KINDS = Object.keys(GEAR) as GearKind[];
export const SLOTS: GearSlot[] = ['head', 'eyes', 'back'];
export const SLOT_LABEL: Record<GearSlot, string> = { head: 'Head', eyes: 'Eyes', back: 'Back' };
