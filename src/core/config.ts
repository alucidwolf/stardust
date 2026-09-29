/**
 * Every tunable in one place. If a magic number matters, it lives here.
 *
 * Colour values are the scene half of `design-system/tokens.json`. The design
 * system records them for reference; this file is where they are edited.
 */

export const SECTOR = {
  /** The far field sits on a sphere this far out, and never gets closer. */
  skyRadius: 900,
  /** Dense background stars. */
  farStars: 2600,
  /** Sparse foreground glints that parallax past. */
  nearStars: 150,
  /** How far the near glints spread around the camera. */
  nearRadius: 220,
  /** Drifting stardust in the volume immediately around you. */
  motes: 900,
  moteRadius: 46,
  /**
   * How strongly the nebula shows.
   *
   * It has to carry itself now. It used to be helped along by the grade's lift
   * on dark areas, and once the sky went to near-black that lift went with it —
   * leaving the nebula as a barely-there smudge. Since the stars and the nebula
   * are the only light in this sector, a nebula you have to look for is not
   * doing its job.
   */
  nebulaStrength: 1.45,
} as const;

export const PALETTE = {
  /**
   * The sky, and the darkest token in the set.
   *
   * Still the sector's own blue, just far enough down that nothing reads it as
   * blue on its own — so everything brighter than it is something actually
   * there rather than the background having an opinion.
   */
  void: 0x070a14,
  void2: 0x0c1120,
  starCool: 0xcfe3ff,
  starWarm: 0xfff1d6,
  nebulaViolet: 0x3a2f6b,
  nebulaTeal: 0x1e5a6e,
  planetRust: 0xb5532f,
  thrust: 0x8fd8ff,
  signal: 0x5ec8ff,
} as const;

export const RENDER = {
  /** Retina pixel counts buy little on flat-shaded plates and cost fill rate. */
  maxPixelRatio: 1.75,
  /** A long frame (tab switch, GC pause) must not teleport anything. */
  maxDelta: 0.05,
} as const;

export const CAMERA = {
  fov: 52,
  /**
   * A near plane kept well off zero, and a far plane kept well in.
   *
   * These two together decide how much depth precision there is, and getting
   * the ratio wrong is not a subtle problem: at 0.4 against 2000, a surface
   * several hundred units short of the far plane still rounded past it and was
   * clipped away with no warning at all. Nothing in this sector needs to be
   * drawn closer than a metre, and everything meant to look distant follows the
   * camera instead of actually being far away.
   */
  near: 1,
  far: 1600,
  /** How far behind the unit the camera sits until anything moves it. */
  distance: 26,
  minDistance: 9,
  maxDistance: 70,
  height: 5.5,
  /** How lazily the camera trails the unit through a turn. */
  follow: 2.6,
  /** Seconds to swing back behind the unit when asked. */
  recenter: 1.1,
} as const;

export const FLIGHT = {
  /** Units per second at a cruise. Slow on purpose: nobody here is in a hurry. */
  cruiseSpeed: 16,
  /** How much faster the autopilot's long glides run at their fastest. */
  speedBreathAmount: 0.08,
  speedBreathPeriod: 19,
  /** Radians per second the pilot may turn at, before a unit's own scaling. */
  turnRate: 0.85,
  /**
   * Radians per second the arrow keys may trim the course at.
   *
   * Deliberately a fifth of the pointer's rate, and it is a different control
   * rather than a slower version of the same one. The cursor says "go over
   * there" and should get there; the keys say "a little more to the left", and
   * at the full rate they did not read that way at all — holding one for four
   * seconds swung the ship nearly two hundred degrees, which is a pirouette,
   * not a correction.
   *
   * About eleven degrees a second: enough to come about if you hold it long
   * enough, slow enough that a tap is a nudge.
   */
  trimRate: 0.19,
  /** How far past level the nose may go. Nothing here loops. */
  maxPitch: 0.62,
  /** Roll is derived from yaw rate, never integrated. */
  bankStrength: 2.9,
  maxBank: 0.85,
  /** How quickly the eased arrow-key axes catch up with the keys themselves. */
  keySteerResponse: 3.2,
  /**
   * Cruise multiplier while Shift is held.
   *
   * Modest on purpose. This is a drift, and the pleasure of a boost here is
   * the engines lighting up and the stars stretching, not arriving sooner.
   */
  boostScale: 1.85,
  /**
   * How quickly the boost comes in and goes out, as a fraction per second.
   *
   * Eased rather than switched, and out faster than in: leaning on it should
   * build, and letting go should feel like easing off a throttle rather than
   * hitting a wall.
   */
  boostAttack: 1.6,
  boostRelease: 2.4,
} as const;

export const POINTER = {
  /** Seconds a button must be held before its gesture takes effect. */
  holdDelay: 0.2,
  /** Radians of orbit per pixel dragged. */
  orbitPerPixel: 0.0055,
  /** Zoom per wheel notch. */
  zoomPerNotch: 0.055,
} as const;

/** The armour paint, shared by every unit. */
export const PAINT = {
  white: 0xd8dbe6,
  navy: 0x33436e,
  red: 0xc23434,
  gold: 0xf0b440,
  /** The thin dark line between plates. */
  gap: 0x11172a,
} as const;

export const FIELD = {
  /** Side of one region of space, in units. Debris is clustered inside these. */
  regionSize: 420,
  /** Regions kept live in each direction around the pilot. */
  regionRadius: 2,
  /** Roughly how many clusters a region holds. Most regions are empty sky. */
  clustersPerRegion: 1.7,
  rocksPerCluster: [6, 22] as [number, number],
  /** Roughly one region in this many carries an ordinary landmark. */
  landmarkChance: 1 / 9,
  /**
   * And one in this many carries something worth remembering.
   *
   * Rolled separately and far rarer, because rarity is the entire mechanism by
   * which any of them is impressive. A ringed giant you meet every other
   * region is scenery; one you meet twice an hour is an event.
   */
  wonderChance: 1 / 34,
} as const;

/**
 * The diorama pass, carried over from Currents unchanged in structure.
 *
 * The shallow depth of field is what makes chunky forms read as a model on a
 * table rather than as a cheap scene, and it matters more here than it did
 * underwater: space has no haze of its own to tell the eye how far away
 * anything is.
 */
export const DIORAMA = {
  /** Metres either side of the focus that stay sharp. */
  focusRange: 6,
  nearFalloff: 14,
  farFalloff: 150,
  maxNearBlur: 0.85,
  maxFarBlur: 0.55,
  blurRadius: 1.8,
  /** Warm the light, cool the dark. Never a warm key against a cool ambient. */
  warmHighlights: [0.05, 0.032, 0.006] as [number, number, number],
  /**
   * Almost nothing, and the reason is the background.
   *
   * The grade adds this to the darkest parts of the image in linear light, and
   * sRGB encoding expands small linear values enormously on the way out — the
   * 0.038 this started at is about 0.21 once encoded. Underwater that never
   * showed, because the darkest thing on screen was still lit water. Out here
   * the darkest thing is empty space, so the same number stopped being a tint
   * in the shadows and became the colour of the sky.
   *
   * What is left is a whisper of blue in the deepest shadow, so that black
   * still reads as *space* rather than as a hole in the canvas. Everything
   * brighter than that is a star or the nebula putting it there.
   */
  coolShadows: [0.0, 0.0008, 0.003] as [number, number, number],
  saturation: 1.06,
  vignette: 0.34,
} as const;
