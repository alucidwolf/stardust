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
  /** Space is deep blue, never black. */
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
  near: 0.4,
  far: 2000,
  /** How far behind the unit the camera sits until anything moves it. */
  distance: 26,
  height: 5.5,
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
