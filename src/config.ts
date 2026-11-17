// Gameplay tunables. Everything balance-related lives here so it can be tweaked in one place.
export const CFG = {
  TILE: 16,
  W: 96,
  /** 64 rows: sky, then four strata down to the First Burrow at the bottom. */
  H: 64,
  /** First ground row. Row SURFACE_Y - 1 is the walkable desert surface. */
  SURFACE_Y: 10,
  SAND_DEPTH: 12,
  /** Depth (rows below the surface) where Ironstone and then the Crystal Deep begin. */
  STONE_DEPTH: 24,
  CRYSTAL_DEPTH: 38,
  /** Rows below the surface that are visible from the start; deeper soil is dark until dug near. */
  FOG_FREE: 8,
  REVEAL_RADIUS: 3,
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
  DIG_STONE: 4,
  DIG_CRYSTAL: 5,
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
  GEM_CHANCE_STONE: 0.12,
  GEM_CHANCE_CRYSTAL: 0.25,
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

  PUP: {
    /** Colony morale needed for a pup to be born in the Playroom each morning. */
    morale: 70,
    perPlayroom: 2,
    birthChance: 0.6,
    /** Days of awake time for an unmentored pup to grow up. */
    days: 4,
    /** Growth bonus while shadowing a mentor (doubled by Inspired Youth). */
    mentorBonus: 1,
    /** A pup inherits its mentor's Skill Trait if at least this much of its growth was mentored. */
    inherit: 0.4,
    followRange: 3,
  },

  JACKAL: {
    firstDay: 3,
    firstDelay: 40,
    minGap: 90,
    maxGap: 150,
    patrol: 2.4,
    chase: 4.6,
    sight: 9,
    /** How long a jackal barks at a hole it chased a meerkat into (spec: 20s). */
    block: 20,
    decoyCost: 1,
  },

  SCORPION: {
    ouch: 4,
    flipTime: 1.5,
    flipNeeded: 2,
  },

  BADGER: {
    /** Late game only: from this season number on (1 = Emerald Rains). */
    fromSeason: 3,
    minGap: 140,
    maxGap: 220,
    speed: 2,
    notice: 7,
    /** Seconds of Digger work to repair a bulldozed bolt-hole (spec: 10s). */
    repair: 10,
    honeyTime: 12,
  },

  /** Seconds of role work needed for 2, 3, 4 and 5 Role Mastery stars. */
  MASTERY: [90, 240, 480, 800],

  /** Seconds between browser autosaves. */
  AUTOSAVE: 30,
};

export const SY = CFG.SURFACE_Y;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
