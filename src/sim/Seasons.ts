import { CFG } from '../config';

export type SeasonId = 'rains' | 'sun' | 'dust' | 'dry';
export type Weather = 'clear' | 'downpour' | 'heatwave' | 'haboob';

export interface SeasonDef {
  id: SeasonId;
  name: string;
  short: string;
  icon: string;
  /** Dig speed multiplier (soil state). */
  dig: number;
  berryRegrow: number;
  rootRegrow: number;
  grassRegrow: number;
  intro: string;
}

export const SEASONS: SeasonDef[] = [
  {
    id: 'rains',
    name: 'Emerald Rains',
    short: 'Rains',
    icon: '🌧️',
    dig: 1.25,
    berryRegrow: 1.6,
    rootRegrow: 1,
    grassRegrow: 1.5,
    intro: 'Soft soil (+25% digging) and berries galore. Flash downpours refill the bushes!',
  },
  {
    id: 'sun',
    name: 'Golden Sun',
    short: 'Sun',
    icon: '☀️',
    dig: 1,
    berryRegrow: 0.6,
    rootRegrow: 1.2,
    grassRegrow: 1,
    intro: 'Tsamma melons ripen far out in the dunes. Midday heatwaves make meerkats Sweaty: craft Sun Hats!',
  },
  {
    id: 'dust',
    name: 'Dust Winds',
    short: 'Dust',
    icon: '🌪️',
    dig: 1,
    berryRegrow: 0.3,
    rootRegrow: 0.6,
    grassRegrow: 0.8,
    intro: 'Food is scarce but gems glint in the sand. Haboobs blind Sentries unless they wear Amber Goggles.',
  },
  {
    id: 'dry',
    name: 'The Long Dry',
    short: 'Dry',
    icon: '❄️',
    dig: 0.7,
    berryRegrow: 0,
    rootRegrow: 0.25,
    grassRegrow: 0.3,
    intro: 'Hard soil (−30% digging) and the bushes are bare. Ration your pantry and 👃 Sniff for buried grubs!',
  },
];

export interface SeasonInfo {
  def: SeasonDef;
  index: number;
  dayInSeason: number;
  year: number;
}

export function seasonOf(day: number): SeasonInfo {
  const d = day - 1;
  const index = Math.floor(d / CFG.SEASON_DAYS) % SEASONS.length;
  return {
    def: SEASONS[index],
    index,
    dayInSeason: (d % CFG.SEASON_DAYS) + 1,
    year: Math.floor(d / (CFG.SEASON_DAYS * SEASONS.length)) + 1,
  };
}

export const WEATHER_LABEL: Record<Weather, string> = {
  clear: '',
  downpour: '⛈️ Downpour',
  heatwave: '🥵 Heatwave',
  haboob: '🌪️ Haboob',
};
