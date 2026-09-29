import * as THREE from "three";
import { PAINT, PALETTE } from "../core/config";
import { buildUnit, engineGlow, plateMaterial } from "./plates";
import type { PlateSpec } from "./plates";

/**
 * The four units.
 *
 * Each is one merged geometry plus a handful of engine glows, so a whole unit
 * is two draw calls whatever it is made of. The names and codes are original
 * and so are the shapes: the language is late-90s mecha — armour plates,
 * tricolour paint, gold vents — and the language is all that is borrowed.
 *
 * Every one is built to the same recipe:
 *
 * - **Plates, not surfaces.** Chunky, bevelled, flat-shaded, with a thin dark
 *   gap between them, and each plate exactly one colour.
 * - **The tricolour.** Mostly white, navy on the core, red on one or two
 *   blocks, gold on vents and one crest — roughly 55 / 25 / 12 / 8 by area.
 * - **One silhouette idea.** A wing binder, a shield, a tail boom, a hauling
 *   frame. That shape is exaggerated and everything else stays compact, which
 *   is what makes a unit recognisable as a shadow at distance.
 * - **Gold where the camera is.** The camera lives behind, so the vents and
 *   thrusters that carry the gold go on the back.
 * - **Thrust is the animation.** Engines pulse softly. Nothing fires, nothing
 *   fights and nothing explodes.
 */

export interface UnitRig {
  root: THREE.Group;
  /**
   * `rate` scales with cruise speed and `effort` is how hard you are turning,
   * so a unit can lean into its own manoeuvres without knowing about input.
   */
  update(elapsed: number, rate: number, effort: number): void;
  dispose(): void;
}

export interface UnitDef {
  id: string;
  name: string;
  /** The system code, in the shape the design system asks for. */
  code: string;
  blurb: string;
  /** Multiplier on cruise speed. */
  speedScale: number;
  /** Multiplier on turn rate. A freighter does not pivot. */
  turnScale: number;
  /** How far back the camera should sit to frame it. */
  viewDistance: number;
  build(): UnitRig;
}

/** Release every buffer and material hanging off a rig. */
function disposeTree(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material | THREE.BufferGeometry>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry && !seen.has(mesh.geometry)) {
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material && !seen.has(material)) {
        seen.add(material);
        material.dispose();
      }
    }
  });
}

interface EngineSpec {
  position: [number, number, number];
  radius: number;
  length: number;
}

/**
 * How many engine bells actually cast light.
 *
 * Fixed across the fleet, and deliberately not "one per engine". three.js
 * compiles a material against the number of lights in the scene, so a unit that
 * brought a different count with it would recompile every material in the
 * sector on the frame you swapped to it. Two is what the narrowest unit has, so
 * two is what every unit lights with, whatever it is carrying.
 */
const LIT_ENGINES = 2;

/**
 * Wrap a plate list and some engines into a rig.
 *
 * `animate` is where a unit's own moving parts go — a binder that opens, a
 * shoulder that shifts. It is given the same numbers the engines get, so the
 * whole unit reacts to one idea of how hard it is working.
 */
function rig(
  plates: readonly PlateSpec[],
  engines: readonly EngineSpec[],
  animate?: (elapsed: number, rate: number, effort: number, root: THREE.Group) => void,
): UnitRig {
  const root = new THREE.Group();

  const body = new THREE.Mesh(buildUnit(plates), plateMaterial());
  body.frustumCulled = false;
  root.add(body);

  const glows: THREE.Mesh[] = [];
  for (const engine of engines) {
    const glow = engineGlow(engine.radius, engine.length);
    glow.position.set(...engine.position);
    root.add(glow);
    glows.push(glow);
  }

  /*
    The engines light the hull, because the camera is looking at the dark side.

    The key is the sector's star and it is somewhere out in the sky; the camera
    sits behind the unit. Measured against a surface pointed straight at the
    camera the star came in at minus a third — it is *behind* everything you can
    see — leaving the back of the unit lit by the nebula fill and a little
    ambient and nothing else. Half the hull was sitting at a sixth of its own
    paint value, which is why it read as one dark shape rather than as plates.

    These are not a cheat to brighten it. The bells are already the brightest
    thing on screen from this angle, and a thruster that glows without throwing
    any light was the actual mistake. They are short-range and they rise and
    fall with the same breath the glow does, so what they mostly do is pick out
    the vents, the rear armour and the gaps between plates — the detail the
    design puts back there precisely because this is the side you see.
  */
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < LIT_ENGINES; i++) {
    const engine = engines[Math.min(i, engines.length - 1)]!;
    /*
      Reaches the unit and stops, and falls off gently along the way.

      Square falloff put the engine housings a few tenths from the source and
      blew eight per cent of the hull past white while the far end of the unit
      stayed dark — brighter overall, but no more readable, and clipped. A
      linear falloff spreads the same light along a five-unit hull: swept
      against the square version it held the median at three quarters of the
      way up while cutting the blown-out fraction to well under one per cent.

      Set well back behind the bell, down the plume, rather than at the nozzle.
      At one unit the gold rims sat close enough to the source to pin a channel
      across nearly seven per cent of the hull — flat yellow squares with their
      own bevels burned off. At one point eight that falls to a hundredth of a
      per cent for a five per cent loss of median brightness, which is no trade
      at all. Short-ranged either way, so it lights the unit rather than giving
      the sector a headlight.
    */
    const light = new THREE.PointLight(PALETTE.thrust, 0, 14, 1);
    light.position.set(engine.position[0], engine.position[1], engine.position[2] - 1.8);
    root.add(light);
    lights.push(light);
  }

  const thrust = new THREE.Color(PALETTE.thrust);
  const signal = new THREE.Color(PALETTE.signal);
  const tint = new THREE.Color();
  /**
   * The colour the bells actually *cast*, as opposed to the colour they look.
   *
   * A plume is blue at its edges and white at its core, and it is the core that
   * does the lighting. Lit with the raw thrust blue the hull came back at a
   * blue-over-red ratio of 1.86 when the white paint's own ratio is 1.06 — so
   * the tricolour stopped reading as white, navy and red and started reading as
   * three blues. Pulled most of the way to the star's own white it lands at
   * about 1.16: still cool, still obviously the engines doing it, and the paint
   * is still the paint.
   */
  const cast = new THREE.Color();
  const core = new THREE.Color(PALETTE.starWarm);

  return {
    root,
    update(elapsed, rate, effort) {
      // A slow breath, lifted by how hard the unit is working. Deliberately
      // never a flicker and never a loop you can count: the design forbids
      // anything that pulses at you, and an engine that strobes is the first
      // thing that would.
      const breath = 0.5 + 0.5 * Math.sin(elapsed * 1.15);
      const level = 0.34 + breath * 0.16 + effort * 0.34 + (rate - 1) * 0.25;

      tint.copy(thrust).lerp(signal, THREE.MathUtils.clamp(effort * 0.8, 0, 1));

      for (const glow of glows) {
        const material = glow.material as THREE.MeshBasicMaterial;
        material.color.copy(tint);
        material.opacity = THREE.MathUtils.clamp(level, 0.12, 0.95);
        // The bell stretches with thrust rather than brightening alone, so the
        // change reads at a glance from behind.
        glow.scale.z = 0.75 + level * 0.9;
      }

      cast.copy(tint).lerp(core, 0.6);
      for (const light of lights) {
        light.color.copy(cast);
        // Floored well above nothing: the point of these is that the hull is
        // readable, and a unit coasting must not go back to being a silhouette.
        light.intensity = 2.6 + THREE.MathUtils.clamp(level, 0, 1) * 3.4;
      }

      animate?.(elapsed, rate, effort, root);
    },
    dispose() {
      disposeTree(root);
    },
  };
}

// -- Wayfarer ----------------------------------------------------------------

/**
 * A light mech with folded wing binders that open when it pushes.
 *
 * The binders are the whole silhouette, so they are oversized and they are the
 * one thing that moves: closed they read as a backpack, open they double the
 * unit's width. Everything else is deliberately compact.
 */
const wayfarer: UnitDef = {
  id: "wayfarer",
  name: "Wayfarer",
  code: "XR-7",
  blurb: "Light on its feet. Happiest on a long glide.",
  speedScale: 1.06,
  turnScale: 1.0,
  viewDistance: 20,
  build() {
    const plates: PlateSpec[] = [
      // Core: navy, because the chest is the core on every unit here.
      { size: [1.1, 1.3, 0.85], position: [0, 0.2, 0.1], colour: PAINT.navy },
      // Chest plates either side, white.
      { size: [0.55, 1.0, 0.7], position: [1.25, 0.25, 0.05], colour: PAINT.white },
      { size: [0.55, 1.0, 0.7], position: [-1.25, 0.25, 0.05], colour: PAINT.white },
      // Head: small, low, with a gold sensor band facing forward.
      { size: [0.42, 0.34, 0.42], position: [0, 1.7, 0.1], colour: PAINT.white },
      { size: [0.3, 0.1, 0.12], position: [0, 1.74, 0.48], colour: PAINT.gold },
      // Waist in red — one of the two red blocks.
      { size: [0.95, 0.4, 0.75], position: [0, -1.05, 0.05], colour: PAINT.red },
      // Legs, short and stubby. Toy proportions, not anatomy.
      { size: [0.44, 0.9, 0.52], position: [0.62, -2.0, 0], colour: PAINT.white },
      { size: [0.44, 0.9, 0.52], position: [-0.62, -2.0, 0], colour: PAINT.white },
      { size: [0.5, 0.3, 0.62], position: [0.62, -2.95, 0.06], colour: PAINT.navy },
      { size: [0.5, 0.3, 0.62], position: [-0.62, -2.95, 0.06], colour: PAINT.navy },
      // Arms, tucked in.
      { size: [0.34, 0.85, 0.38], position: [1.95, -0.3, 0], colour: PAINT.white },
      { size: [0.34, 0.85, 0.38], position: [-1.95, -0.3, 0], colour: PAINT.white },
      // The binder roots, which the moving halves hang off.
      { size: [0.4, 0.75, 0.3], position: [0.95, 0.75, -0.85], colour: PAINT.white },
      { size: [0.4, 0.75, 0.3], position: [-0.95, 0.75, -0.85], colour: PAINT.white },
      // Back vents, gold, facing the camera — which on this unit is the only
      // place gold can go, because everything else about it is front-facing.
      { size: [0.26, 0.14, 0.14], position: [0.42, 0.9, -0.82], colour: PAINT.gold },
      { size: [0.26, 0.14, 0.14], position: [-0.42, 0.9, -0.82], colour: PAINT.gold },
      { size: [0.3, 0.16, 0.12], position: [0, -0.5, -0.86], colour: PAINT.gold },
      // Thruster rims, where the glow comes out.
      { size: [0.3, 0.12, 0.12], position: [0.62, -1.05, -0.62], colour: PAINT.gold },
      { size: [0.3, 0.12, 0.12], position: [-0.62, -1.05, -0.62], colour: PAINT.gold },

      // -- detail -----------------------------------------------------------
      // All of it on the back and the top, because that is where the camera
      // is. Detail on the chest would be modelling for a view nobody has.

      // Backpack, filling the space between the binder roots, with louvres cut
      // into the face that looks straight down the camera.
      { size: [0.55, 0.6, 0.22], position: [0, 0.85, -0.95], colour: PAINT.navy },
      ...[1.15, 0.95, 0.75].map((y): PlateSpec => ({
        size: [0.4, 0.045, 0.06],
        position: [0, y, -1.19],
        colour: PAINT.gold,
      })),
      // Shoulder verniers: the attitude thrusters, on top where they show.
      { size: [0.22, 0.16, 0.3], position: [1.25, 1.36, -0.1], colour: PAINT.navy },
      { size: [0.22, 0.16, 0.3], position: [-1.25, 1.36, -0.1], colour: PAINT.navy },
      { size: [0.16, 0.09, 0.05], position: [1.25, 1.4, -0.46], colour: PAINT.gold },
      { size: [0.16, 0.09, 0.05], position: [-1.25, 1.4, -0.46], colour: PAINT.gold },
      // Seams across the backs of the chest plates. A plate this size reads as
      // one slab until something crosses it.
      { size: [0.5, 0.06, 0.04], position: [1.25, 0.55, -0.69], colour: PAINT.navy },
      { size: [0.5, 0.06, 0.04], position: [-1.25, 0.55, -0.69], colour: PAINT.navy },
      // Calf plates and heels, which is most of what you see of the legs from
      // behind.
      { size: [0.3, 0.45, 0.06], position: [0.62, -1.9, -0.58], colour: PAINT.navy },
      { size: [0.3, 0.45, 0.06], position: [-0.62, -1.9, -0.58], colour: PAINT.navy },
      { size: [0.18, 0.18, 0.12], position: [0.62, -2.9, -0.64], colour: PAINT.navy },
      { size: [0.18, 0.18, 0.12], position: [-0.62, -2.9, -0.64], colour: PAINT.navy },
      // Hip skirts, canted out. A straight waist and a straight leg give a
      // straight silhouette edge, and the cant is what breaks it.
      { size: [0.1, 0.5, 0.45], position: [1.02, -1.3, 0], rotation: [0, 0, 0.3], colour: PAINT.white },
      { size: [0.1, 0.5, 0.45], position: [-1.02, -1.3, 0], rotation: [0, 0, -0.3], colour: PAINT.white },
      // One antenna, on one side only. A pair would read as ears.
      { size: [0.045, 0.55, 0.045], position: [-1.15, 2.05, -0.85], colour: PAINT.white },
    ];

    const unit = rig(
      plates,
      [
        { position: [0.62, -1.1, -0.7], radius: 0.34, length: 2.1 },
        { position: [-0.62, -1.1, -0.7], radius: 0.34, length: 2.1 },
      ],
      (elapsed, rate, effort, root) => {
        // Binders open with effort and with speed, and ease rather than snap.
        const open = THREE.MathUtils.clamp(effort * 0.8 + (rate - 1) * 1.2, 0, 1);
        const idle = Math.sin(elapsed * 0.5) * 0.03;
        for (const binder of root.userData.binders as THREE.Mesh[]) {
          const side = binder.userData.side as number;
          binder.rotation.z = side * (0.12 + open * 0.85 + idle);
          binder.rotation.y = side * open * -0.25;
        }
      },
    );

    // The binders are separate meshes because they move; everything that does
    // not move stayed in the merged body above.
    const binders: THREE.Mesh[] = [];
    for (const side of [1, -1]) {
      const binder = new THREE.Mesh(
        buildUnit([
          { size: [0.26, 1.9, 0.5], position: [side * 0.3, -1.3, 0], colour: PAINT.white },
          { size: [0.2, 0.7, 0.34], position: [side * 0.34, -2.9, 0], colour: PAINT.red },
          // Gold vent on the inboard face, where the camera behind can see it.
          { size: [0.12, 0.5, 0.16], position: [side * 0.08, -1.2, -0.3], colour: PAINT.gold },
        ]),
        plateMaterial(),
      );
      binder.position.set(side * 0.95, 1.2, -0.85);
      binder.userData.side = side;
      binder.frustumCulled = false;
      unit.root.add(binder);
      binders.push(binder);
    }
    unit.root.userData.binders = binders;

    return unit;
  },
};

// -- Bastion -----------------------------------------------------------------

/**
 * A heavy mech built around one enormous shield plate.
 *
 * The shield is the silhouette and it is deliberately absurd — wider than the
 * unit is tall. It does not open, deploy or do anything at all; it is a slab
 * of armour bolted to an arm, and the unit turns like something carrying one.
 */
const bastion: UnitDef = {
  id: "bastion",
  name: "Bastion",
  code: "HV-2",
  blurb: "Built like a cathedral. Turns like one too.",
  speedScale: 0.76,
  turnScale: 0.52,
  viewDistance: 30,
  build() {
    const plates: PlateSpec[] = [
      // A deep navy core, wide and slab-sided.
      { size: [1.5, 1.7, 1.15], position: [0, 0.3, 0], colour: PAINT.navy },
      { size: [0.8, 1.3, 0.95], position: [1.8, 0.4, 0], colour: PAINT.white },
      { size: [0.8, 1.3, 0.95], position: [-1.8, 0.4, 0], colour: PAINT.white },
      // Head, sunk between the shoulders where a heavy unit's would be.
      { size: [0.5, 0.4, 0.5], position: [0, 2.2, 0.15], colour: PAINT.white },
      { size: [0.34, 0.12, 0.14], position: [0, 2.26, 0.6], colour: PAINT.gold },
      // Shoulder blocks, oversized.
      { size: [0.9, 0.7, 1.0], position: [2.5, 1.35, 0], colour: PAINT.white },
      { size: [0.9, 0.7, 1.0], position: [-2.5, 1.35, 0], colour: PAINT.red },
      // Waist and hips.
      { size: [1.3, 0.55, 1.0], position: [0, -1.45, 0], colour: PAINT.red },
      // Legs: short, thick, planted.
      { size: [0.68, 1.15, 0.8], position: [0.85, -2.7, 0], colour: PAINT.white },
      { size: [0.68, 1.15, 0.8], position: [-0.85, -2.7, 0], colour: PAINT.white },
      { size: [0.78, 0.38, 0.95], position: [0.85, -3.95, 0.1], colour: PAINT.navy },
      { size: [0.78, 0.38, 0.95], position: [-0.85, -3.95, 0.1], colour: PAINT.navy },
      // The shield arm, and the shield: the one shape that matters.
      { size: [0.45, 1.0, 0.5], position: [-3.2, 0.1, 0], colour: PAINT.navy },
      { size: [0.32, 3.4, 2.3], position: [-4.0, -0.3, 0], colour: PAINT.white, bevel: 0.12 },
      { size: [0.16, 2.9, 0.42], position: [-4.4, -0.3, 0], colour: PAINT.navy, bevel: 0.3 },
      { size: [0.14, 0.7, 0.7], position: [-4.45, 1.5, 0], colour: PAINT.gold, bevel: 0.3 },
      // Free arm, kept short so the shield reads as the wide side.
      { size: [0.42, 1.1, 0.5], position: [2.9, -0.2, 0], colour: PAINT.white },
      // Back vents, gold, facing the camera.
      { size: [0.5, 0.22, 0.2], position: [0.7, 1.0, -1.2], colour: PAINT.gold },
      { size: [0.5, 0.22, 0.2], position: [-0.7, 1.0, -1.2], colour: PAINT.gold },

      // -- detail -------------------------------------------------------------

      /*
        Bracing across the shield.

        The shield is the largest single surface in the fleet by a long way, and
        one vertical rib was not enough to stop it reading as a blank slab —
        which at distance made the unit's whole silhouette idea look like a
        mistake rather than a choice. Two bands crossing the rib turn it into
        something built, and the red one near the top is the only place on this
        unit where red lands anywhere near the eye.
      */
      { size: [0.09, 0.16, 1.9], position: [-4.38, 1.9, 0], colour: PAINT.navy },
      { size: [0.09, 0.16, 1.9], position: [-4.38, -2.3, 0], colour: PAINT.navy },
      { size: [0.09, 0.2, 1.9], position: [-4.38, 2.62, 0], colour: PAINT.red },
      // Bolt blocks at the shield's corners, where a slab this size would be
      // carrying its load.
      ...[
        [2.9, 2.05], [2.9, -2.05], [-3.5, 2.05], [-3.5, -2.05],
      ].map(([y, z]): PlateSpec => ({
        size: [0.1, 0.16, 0.16],
        position: [-4.36, y!, z!],
        colour: PAINT.navy,
      })),

      // Shoulder louvres, on top of the blocks where they catch the key.
      ...[-0.55, -0.2].flatMap((z): PlateSpec[] => [
        { size: [0.6, 0.05, 0.1], position: [2.5, 2.09, z], colour: PAINT.gold },
        { size: [0.6, 0.05, 0.1], position: [-2.5, 2.09, z], colour: PAINT.gold },
      ]),

      // Radiator panels either side of the spine thruster, gold-edged along
      // the bottom. This is the face the camera spends all its time looking at.
      { size: [0.42, 0.9, 0.12], position: [1.0, 0.0, -1.3], colour: PAINT.navy },
      { size: [0.42, 0.9, 0.12], position: [-1.0, 0.0, -1.3], colour: PAINT.navy },
      { size: [0.42, 0.05, 0.06], position: [1.0, -0.93, -1.36], colour: PAINT.gold },
      { size: [0.42, 0.05, 0.06], position: [-1.0, -0.93, -1.36], colour: PAINT.gold },

      // Hip skirts, canted out, and calf plates. Between them they break the
      // straight run from waist to foot that made the legs read as two posts.
      { size: [0.12, 0.62, 0.7], position: [1.45, -1.9, 0], rotation: [0, 0, 0.26], colour: PAINT.white },
      { size: [0.12, 0.62, 0.7], position: [-1.45, -1.9, 0], rotation: [0, 0, -0.26], colour: PAINT.white },
      { size: [0.42, 0.5, 0.08], position: [0.85, -2.6, -0.88], colour: PAINT.navy },
      { size: [0.42, 0.5, 0.08], position: [-0.85, -2.6, -0.88], colour: PAINT.navy },

      // A forearm band on the free arm, and a crest on the head — one small
      // vertical on a unit that is otherwise all horizontals.
      { size: [0.44, 0.12, 0.52], position: [2.9, -0.9, 0], colour: PAINT.navy },
      { size: [0.06, 0.22, 0.3], position: [0, 2.78, 0.1], colour: PAINT.gold },
    ];

    return rig(plates, [
      { position: [0.8, -1.5, -0.95], radius: 0.46, length: 2.4 },
      { position: [-0.8, -1.5, -0.95], radius: 0.46, length: 2.4 },
      { position: [0, 0.6, -1.25], radius: 0.36, length: 1.8 },
    ]);
  },
};

// -- Swordtail ---------------------------------------------------------------

/**
 * An interceptor that is mostly tail boom.
 *
 * The boom runs a long way behind the cockpit and carries the engines out at
 * its end, which is what makes the bank read: the far end of a long object
 * sweeps visibly when the near end barely moves. It is the quickest unit here
 * and the only one that feels sharp.
 */
const swordtail: UnitDef = {
  id: "swordtail",
  name: "Swordtail",
  code: "SW-4",
  blurb: "All boom and bad manners. Turns on a coin.",
  speedScale: 1.34,
  turnScale: 1.5,
  viewDistance: 22,
  build() {
    const plates: PlateSpec[] = [
      // Cockpit: a narrow navy wedge at the front.
      { size: [0.62, 0.46, 1.5], position: [0, 0, 2.2], colour: PAINT.navy, bevel: 0.35 },
      { size: [0.4, 0.28, 0.6], position: [0, 0.18, 3.5], colour: PAINT.gold, bevel: 0.4 },
      // Fuselage, white, running back.
      { size: [0.75, 0.55, 1.6], position: [0, 0, 0.6], colour: PAINT.white },
      // The boom: long, thin, blade-like. The silhouette.
      { size: [0.3, 0.42, 3.2], position: [0, 0, -2.6], colour: PAINT.white, bevel: 0.3 },
      { size: [0.16, 0.9, 2.2], position: [0, 0.6, -3.4], colour: PAINT.red, bevel: 0.25 },
      // Wings: short, swept, carrying the engines outboard.
      { size: [1.7, 0.16, 0.7], position: [1.5, -0.05, -0.6], rotation: [0, -0.22, -0.1], colour: PAINT.white },
      { size: [1.7, 0.16, 0.7], position: [-1.5, -0.05, -0.6], rotation: [0, 0.22, 0.1], colour: PAINT.white },
      { size: [0.45, 0.14, 0.3], position: [2.9, -0.05, -0.9], colour: PAINT.red },
      { size: [0.45, 0.14, 0.3], position: [-2.9, -0.05, -0.9], colour: PAINT.red },
      // Engine housings at the boom's end, with gold rims facing back.
      { size: [0.38, 0.38, 0.8], position: [0.72, 0, -4.6], colour: PAINT.navy },
      { size: [0.38, 0.38, 0.8], position: [-0.72, 0, -4.6], colour: PAINT.navy },
      { size: [0.3, 0.3, 0.16], position: [0.72, 0, -5.45], colour: PAINT.gold, bevel: 0.4 },
      { size: [0.3, 0.3, 0.16], position: [-0.72, 0, -5.45], colour: PAINT.gold, bevel: 0.4 },

      // -- detail -------------------------------------------------------------

      // Spine strips either side of the fin. A three-unit boom with nothing
      // running along it has no length to read; two lines give it one.
      { size: [0.07, 0.05, 2.6], position: [0.2, 0.45, -2.6], colour: PAINT.navy },
      { size: [0.07, 0.05, 2.6], position: [-0.2, 0.45, -2.6], colour: PAINT.navy },
      // A white cap along the top of the fin, so the tallest edge on the unit
      // is not the same red as the block under it.
      { size: [0.13, 0.1, 1.6], position: [0, 1.56, -3.6], colour: PAINT.white },

      // Canards at the cockpit. The wings are all the way aft, which left the
      // front third a bare tube — and on the quickest unit in the fleet the
      // nose is what you watch.
      { size: [0.55, 0.07, 0.3], position: [1.0, 0.05, 2.1], rotation: [0, 0, -0.12], colour: PAINT.white },
      { size: [0.55, 0.07, 0.3], position: [-1.0, 0.05, 2.1], rotation: [0, 0, 0.12], colour: PAINT.white },

      // Wing-root intakes, with a gold lip at the back of each.
      { size: [0.26, 0.2, 0.5], position: [0.85, 0.1, -0.5], colour: PAINT.navy },
      { size: [0.26, 0.2, 0.5], position: [-0.85, 0.1, -0.5], colour: PAINT.navy },
      { size: [0.2, 0.1, 0.06], position: [0.85, 0.12, -1.02], colour: PAINT.gold },
      { size: [0.2, 0.1, 0.06], position: [-0.85, 0.12, -1.02], colour: PAINT.gold },

      // Fences out on the wings, matching each wing's own cant so they stand
      // off it square rather than leaning.
      { size: [0.05, 0.22, 0.4], position: [2.0, 0.12, -0.72], rotation: [0, -0.22, -0.1], colour: PAINT.white },
      { size: [0.05, 0.22, 0.4], position: [-2.0, 0.12, -0.72], rotation: [0, 0.22, 0.1], colour: PAINT.white },

      // Louvres on top of the engine housings.
      ...[-4.35, -4.05].flatMap((z): PlateSpec[] => [
        { size: [0.3, 0.04, 0.1], position: [0.72, 0.42, z], colour: PAINT.gold },
        { size: [0.3, 0.04, 0.1], position: [-0.72, 0.42, z], colour: PAINT.gold },
      ]),
    ];

    return rig(
      plates,
      [
        { position: [0.72, 0, -5.5], radius: 0.3, length: 2.6 },
        { position: [-0.72, 0, -5.5], radius: 0.3, length: 2.6 },
      ],
      (_elapsed, _rate, effort, root) => {
        // The boom flexes a little against a hard turn. Small — it is armour,
        // not rubber — but it is what sells the whole unit as quick.
        root.rotation.z = -effort * 0.06;
      },
    );
  },
};

// -- Old Tuesday -------------------------------------------------------------

/**
 * A freighter that has been working for a very long time.
 *
 * The hauling frame is the silhouette: an open cage with containers slung in
 * it, deliberately asymmetric, because a tidy freighter is a new freighter.
 * One container is a different colour from the rest — a replacement nobody
 * repainted — and that single mismatched block does more for the character of
 * this unit than any amount of surface detail would.
 */
const oldTuesday: UnitDef = {
  id: "old-tuesday",
  name: "Old Tuesday",
  code: "FR-9",
  blurb: "Slow, patched, and still going. Named after the day it broke down.",
  speedScale: 0.68,
  turnScale: 0.6,
  viewDistance: 34,
  build() {
    const plates: PlateSpec[] = [
      // Cab, forward and high, navy with a gold band.
      { size: [1.1, 0.85, 1.3], position: [0, 1.0, 3.4], colour: PAINT.navy },
      { size: [0.8, 0.22, 0.2], position: [0, 1.3, 4.6], colour: PAINT.gold },
      { size: [1.0, 0.5, 0.6], position: [0, 0.0, 3.9], colour: PAINT.white },
      // The spine the frame hangs from.
      { size: [0.5, 0.5, 4.4], position: [0, 0.9, -1.0], colour: PAINT.white },
      // Frame ribs: an open cage, four of them, uneven spacing.
      ...[1.6, -0.2, -1.9, -3.4].map((z): PlateSpec => ({
        size: [2.1, 0.16, 0.18],
        position: [0, 1.5, z],
        colour: PAINT.white,
      })),
      ...[1.6, -0.2, -1.9, -3.4].flatMap((z): PlateSpec[] => [
        { size: [0.16, 1.5, 0.18], position: [2.0, 0.1, z], colour: PAINT.white },
        { size: [0.16, 1.5, 0.18], position: [-2.0, 0.1, z], colour: PAINT.white },
      ]),
      // Containers slung in the frame. Deliberately not symmetric.
      { size: [0.8, 0.7, 1.5], position: [1.0, -0.4, 0.7], colour: PAINT.navy },
      { size: [0.8, 0.7, 1.5], position: [-1.0, -0.4, 0.7], colour: PAINT.navy },
      { size: [0.8, 0.7, 1.3], position: [1.0, -0.4, -2.4], colour: PAINT.navy },
      // The replacement. Red, and nobody repainted it.
      { size: [0.8, 0.7, 1.3], position: [-1.0, -0.4, -2.4], colour: PAINT.red },
      // Engine block at the back, wide and slow.
      { size: [1.5, 0.9, 0.9], position: [0, 0.6, -4.6], colour: PAINT.white },
      { size: [0.45, 0.45, 0.2], position: [0.85, 0.6, -5.5], colour: PAINT.gold, bevel: 0.35 },
      { size: [0.45, 0.45, 0.2], position: [-0.85, 0.6, -5.5], colour: PAINT.gold, bevel: 0.35 },
      // A patch plate, off-square, over the port side of the engine block.
      { size: [0.06, 0.5, 0.6], position: [-1.55, 0.7, -4.5], rotation: [0, 0, 0.18], colour: PAINT.red, bevel: 0.1 },

      // -- detail -------------------------------------------------------------

      /*
        Cross-bracing in the frame, which is what an open cage is mostly made of.

        Four ribs and eight uprights gave a row of rectangles, and a rectangle
        carries no load — the frame read as a drawing of a frame. A diagonal in
        each bay, alternating direction down the length, is the single change
        that makes it look like it could hold a container up.

        The angles are worked out rather than chosen: each strut has to reach
        corner to corner of its own bay, and the bays are unevenly spaced, so no
        two are the same. Half-length and tilt are the diagonal of that bay.
      */
      ...([
        [0.7, 1.5, 0.927],
        [-1.05, 1.47, -0.954],
        [-2.65, 1.415, 1.012],
      ] as const).flatMap(([z, half, tilt]): PlateSpec[] => [
        { size: [0.08, 0.07, half], position: [2.0, 0.1, z], rotation: [tilt, 0, 0], colour: PAINT.white },
        { size: [0.08, 0.07, half], position: [-2.0, 0.1, z], rotation: [tilt, 0, 0], colour: PAINT.white },
      ]),

      // Straps over the containers. Cargo nobody has tied down is cargo that
      // would not still be aboard.
      ...([
        [1.0, 1.5], [1.0, -0.1], [-1.0, 1.5], [-1.0, -0.1],
        [1.0, -1.6], [1.0, -3.2], [-1.0, -1.6], [-1.0, -3.2],
      ] as const).map(([x, z]): PlateSpec => ({
        size: [0.84, 0.74, 0.06],
        position: [x, -0.4, z],
        colour: PAINT.white,
      })),

      // Radiator fins along the top of the engine block, and a pair of stacks
      // in front of them.
      ...[-4.2, -4.6, -5.0].map((z): PlateSpec => ({
        size: [1.3, 0.06, 0.1],
        position: [0, 1.54, z],
        colour: PAINT.navy,
      })),
      { size: [0.12, 0.3, 0.12], position: [0.5, 1.75, -3.9], colour: PAINT.navy },
      { size: [0.12, 0.3, 0.12], position: [-0.5, 1.75, -3.9], colour: PAINT.navy },

      // A beacon on the cab roof and a mast beside it, both off-centre. This
      // is the unit whose whole character is that nothing on it is square.
      { size: [0.1, 0.12, 0.1], position: [0.5, 1.95, 3.4], colour: PAINT.gold },
      { size: [0.05, 0.4, 0.05], position: [-1.0, 2.2, 3.2], colour: PAINT.white },

      // And a second patch, on the other side, at a different angle again.
      { size: [0.05, 0.35, 0.45], position: [1.55, 0.4, -4.7], rotation: [0, 0, -0.12], colour: PAINT.red, bevel: 0.1 },
    ];

    return rig(plates, [
      { position: [0.85, 0.6, -5.6], radius: 0.42, length: 2.2 },
      { position: [-0.85, 0.6, -5.6], radius: 0.42, length: 2.2 },
    ]);
  },
};

export const UNITS: readonly UnitDef[] = [wayfarer, bastion, swordtail, oldTuesday];

export function unitById(id: string): UnitDef {
  return UNITS.find((unit) => unit.id === id) ?? UNITS[0]!;
}
