// Gameplay tunables. Everything balance-related lives here so it can be tweaked in one place.
export const CFG = {
  TILE: 16,
  W: 96,
  H: 48,
  /** First ground row. Row SURFACE_Y - 1 is the walkable desert surface. */
  SURFACE_Y: 10,
  SAND_DEPTH: 12,
  ENTRANCE_X: 24,

  START_MEERKATS: 3,
  MAX_MEERKATS: 6,
  RECRUIT_MORALE: 50,

  /** Real seconds per in-game day at 1x speed. */
  DAY_LENGTH: 240,
  /** Clock multiplier while the whole colony is asleep. */
  NIGHT_FAST: 4,
  START_FRAC: 0.03,

  SPEED_TUNNEL: 3,
  SPEED_SURFACE: 4,
  SPEED_SPRINT: 6,

  DIG_SAND: 1.2,
  DIG_CLAY: 2.6,
  BUILD_PERCH: 6,

  BACKPACK_SLOTS: 4,
  START_FOOD: 6,
  BASE_FOOD_CAP: 10,
  CELLAR_FOOD_CAP: 30,
  UNLOAD_TIME: 1.5,
  QUICK_DROP_MULT: 0.6,
  QUICK_DROP_RANGE: 3,

  HUDDLE_TIME: 4,
  DEN_CAPACITY: 3,

  STAMINA_DRAIN: 0.3,
  NAP_BELOW: 15,
  NAP_UNTIL: 60,

  /** Days per season. The spec says 10; shortened so playtests see every season. */
  SEASON_DAYS: 5,
  GEM_CHANCE_SAND: 0.03,
  GEM_CHANCE_CLAY: 0.08,
  /** Golden Sun heatwave window, 12 PM to 3 PM, as fractions of the day. */
  HEAT_START: 0.25,
  HEAT_END: 0.375,
  DOWNPOUR_LEN: 20,
  HABOOB_LEN: 25,
  HABOOB_RADAR_MULT: 0.35,
  SWEATY_MULT: 0.7,
  DUSTY_MULT: 0.9,
  BURR_MULT: 0.9,
  CHILLY_MULT: 0.6,
  GROOMED_MULT: 1.1,
  BURR_CHANCE: 0.05,
  SNIFF_COOLDOWN: 30,
  SNIFF_RADIUS: 18,
  SNIFF_FX: 3,
  MINIGAME_SECONDS: 15,

  SENTRY_RADIUS: 22,
  PERCH_RADIUS_MULT: 1.3,
  /** Seconds a sentry needs to fill its warning meter. */
  WARN_FILL: 1.0,
  RELAY_BASE: 0.25,
  RELAY_SPEED: 30,

  EAGLE: {
    circle: 4,
    shadow: 4,
    swoop: 0.6,
    dizzy: 5,
    track: 1.5,
    diveTrack: 14,
    approach: 25,
    catchRadius: 1.6,
    /** Fraction of the shadow phase after which nearby meerkats notice on their own. */
    selfNotice: 0.8,
    noticeRadius: 5,
    minGap: 35,
    maxGap: 65,
    firstDelay: 50,
  },

  COBRA: {
    trigger: 1.5,
    rallyRadius: 40,
    rallyWindow: 8,
    mobNeeded: 3,
    mobTime: 2.5,
    sneezeTime: 1.2,
    coilTime: 6,
    avoid: 4,
    minGap: 50,
    maxGap: 90,
    firstDay: 2,
    firstDelay: 30,
  },
};

export const SY = CFG.SURFACE_Y;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
