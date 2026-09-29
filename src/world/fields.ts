import * as THREE from "three";
import { FIELD, PALETTE } from "../core/config";
import { randRange, regionRng } from "../core/rng";
import type { Rng } from "../core/rng";

/**
 * Everything drifting in the sector: debris, and the rare thing worth flying to.
 *
 * Space is built in regions, the way Currents built the seabed in chunks — a
 * cube of side `regionSize`, generated from a hash of its own coordinates, so
 * a region rebuilds identically whether you reach it in ten seconds or ten
 * minutes, and from any direction. Regions within `regionRadius` of you are
 * live; the rest are disposed.
 *
 * The distribution rule is inherited and is the important one. Currents'
 * landmarks exist because an endlessly generated world has a characteristic
 * failure: everywhere is equally interesting, which means nowhere is. So
 * debris comes in **clusters with empty space between them**, not sprinkled
 * evenly, and a landmark turns up in roughly one region in nine. Coming over a
 * rise and finding one should be an event rather than scenery.
 */

/** What a region can be built around, beyond ordinary rock. */
type LandmarkKind =
  | "planet"
  | "ring"
  | "gate"
  | "yard"
  | "blackhole"
  | "giant"
  | "comet"
  | "hulk"
  | "crystals";

/**
 * The ordinary landmarks: something to come across.
 *
 * Roughly one region in nine carries one of these.
 */
const LANDMARKS: readonly LandmarkKind[] = ["planet", "ring", "gate", "yard"];

/**
 * The rare ones: something to remember.
 *
 * Rolled separately and far less often, because rarity is the entire mechanism
 * by which any of these is impressive. A ringed giant you meet every other
 * region is scenery; one you meet twice an hour is an event. The rule is
 * inherited from Currents' wrecks and it is the one rule here that cannot be
 * relaxed without the whole idea failing quietly.
 */
const WONDERS: readonly LandmarkKind[] = ["blackhole", "giant", "comet", "hulk", "crystals"];

/**
 * Rock colour: warm on one side of the palette, cool on the other.
 *
 * Both, mixed per rock rather than per cluster, because a field of uniformly
 * warm rocks reads as one object that happens to be in pieces.
 */
const ROCK_WARM = new THREE.Color(PALETTE.planetRust);
const ROCK_COOL = new THREE.Color(0x4a566b);

interface Merged {
  positions: number[];
  colours: number[];
}

function emit(
  into: Merged,
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  colour: THREE.Color,
): void {
  // Icosahedra arrive non-indexed already, and asking again is both wasted
  // work and a warning per rock — of which there are tens of thousands.
  const flat = geometry.getIndex() ? geometry.toNonIndexed() : geometry;
  const position = flat.getAttribute("position") as THREE.BufferAttribute;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    vertex.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(matrix);
    into.positions.push(vertex.x, vertex.y, vertex.z);
    into.colours.push(colour.r, colour.g, colour.b);
  }

  if (flat !== geometry) flat.dispose();
  geometry.dispose();
}

function finish(merged: Merged): THREE.BufferGeometry | null {
  if (merged.positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(merged.positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(merged.colours, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * An accretion disc that is not a flat donut.
 *
 * A ring of one flat colour reads as a paper cut-out with a hole in it, and
 * that is exactly what the first version looked like. What gives a disc depth
 * is that its brightness is a **function of radius** — blazing where the
 * matter is fastest and hottest at the inner edge, falling away outward — and
 * that it has a hot *side*, because a perfectly even annulus has no volume for
 * the eye to find.
 *
 * Radius and angle are recovered from the position in the vertex stage rather
 * than read from UVs, because a ring's UVs are laid out for a texture and say
 * very little about where on the ring a fragment actually is.
 */
function accretionMaterial(hotAngle: number, strength: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying float vRadius;
      varying float vAngle;
      void main() {
        vRadius = length( position.xy );
        vAngle = atan( position.y, position.x );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uInner;
      uniform float uOuter;
      uniform float uHot;
      uniform float uStrength;
      uniform float uTime;
      varying float vRadius;
      varying float vAngle;

      void main() {
        float t = clamp( ( vRadius - uInner ) / max( uOuter - uInner, 1e-4 ), 0.0, 1.0 );

        // Steep: most of the light is in the first fifth of the disc, which is
        // where the sense of a well rather than a washer comes from.
        float radial = pow( 1.0 - t, 2.6 );

        // One hot side, turning slowly. Not a flicker and not a pulse — it is
        // the disc having a near and a far limb.
        float side = 0.62 + 0.38 * cos( vAngle - uHot - uTime * 0.05 );

        // Hot gold at the inner edge cooling to rust outward, which is the one
        // place in this sector warm colour is allowed to run the show.
        vec3 colour = mix( vec3( 0.72, 0.42, 0.18 ), vec3( 1.0, 0.94, 0.78 ), radial );

        float alpha = radial * side * uStrength;
        if ( alpha < 0.004 ) discard;
        gl_FragColor = vec4( colour, alpha );
      }
    `,
    uniforms: {
      uInner: { value: 0 },
      uOuter: { value: 1 },
      uHot: { value: hotAngle },
      uStrength: { value: strength },
      uTime: { value: 0 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Everything random about one boulder, drawn but not yet built.
 *
 * Split from the geometry on purpose. A region generated for its landmark
 * alone still has to take every draw a near one would, or the generator ends
 * up at a different point in its sequence and the same region comes out
 * holding a different landmark depending on how you approached it. But it must
 * not *build* the rocks — there are tens of thousands of them across the
 * landmark radius, and making each one only to throw it away was costing more
 * than the geometry it was avoiding.
 */
interface RockSpec {
  detail: number;
  scale: [number, number, number];
  turn: [number, number, number];
}

function rockSpec(rng: Rng): RockSpec {
  return {
    detail: rng() < 0.25 ? 1 : 0,
    scale: [randRange(rng, 0.6, 1.3), randRange(rng, 0.5, 1.2), randRange(rng, 0.6, 1.3)],
    turn: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
  };
}

/**
 * One boulder.
 *
 * An icosahedron squashed unevenly and turned at random, so every rock is a
 * different chunky gem cut from the same stone. Detail 0 keeps the facets big
 * enough to count, which is the whole look.
 */
function rock(spec: RockSpec, radius: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, spec.detail);
  geometry.scale(spec.scale[0], spec.scale[1], spec.scale[2]);
  geometry.rotateX(spec.turn[0]);
  geometry.rotateY(spec.turn[1]);
  geometry.rotateZ(spec.turn[2]);
  return geometry;
}

/**
 * A live region of space.
 *
 * Everything static merges into one mesh; a landmark that needs to move or
 * glow keeps its own object so it can be animated.
 */
/**
 * How much of a region is built.
 *
 * Landmarks are streamed from much further out than debris, so most live
 * regions are `landmark` only — the rocks in them are too small to see from
 * that range and far too many to build for nothing.
 */
type Detail = "full" | "landmark";

class Region {
  readonly group = new THREE.Group();
  readonly landmark: LandmarkKind | null;
  /** Set for landmarks with a part that turns. */
  private spinner: THREE.Object3D | null = null;
  private spinRate = 0;
  private discs: THREE.Mesh[] = [];
  private halo: THREE.Mesh | null = null;

  /**
   * Everything belonging to the landmark, which fades in as you approach.
   *
   * Kept apart from the debris mesh for exactly that reason: they share a
   * region but not a distance at which they should become visible.
   */
  private readonly fading: THREE.Material[] = [];
  private readonly landmarkGroup = new THREE.Group();
  /** How far in the fade has got, so anything animating opacity can respect it. */
  private fadeLevel = 0;
  /** Where the landmark is, for measuring that distance. */
  private readonly landmarkAt = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    sectorSeed: number,
    readonly rx: number,
    readonly ry: number,
    readonly rz: number,
    readonly detail: Detail,
  ) {
    const rng = regionRng(sectorSeed, rx * 73856093 ^ ry, rz);
    const size = FIELD.regionSize;
    const origin = new THREE.Vector3(rx * size, ry * size, rz * size);

    const merged: Merged = { positions: [], colours: [] };
    const landmarkMerged: Merged = { positions: [], colours: [] };
    const matrix = new THREE.Matrix4();
    const tint = new THREE.Color();
    const at = new THREE.Vector3();

    // --- debris, in clusters -------------------------------------------------
    // Fractional counts resolved by chance, so "1.7 clusters" means most
    // regions get one or two and some get none. A fixed count per region is
    // how a field ends up looking like wallpaper.
    let clusters = Math.floor(FIELD.clustersPerRegion);
    if (rng() < FIELD.clustersPerRegion - clusters) clusters++;

    for (let c = 0; c < clusters; c++) {
      const centre = new THREE.Vector3(
        origin.x + randRange(rng, 0, size),
        origin.y + randRange(rng, -size * 0.35, size * 0.35),
        origin.z + randRange(rng, 0, size),
      );
      const spread = randRange(rng, 18, 70);
      const [minRocks, maxRocks] = FIELD.rocksPerCluster;
      const count = Math.floor(randRange(rng, minRocks, maxRocks));

      for (let i = 0; i < count; i++) {
        // Cube-rooted radius so rocks fill the cluster's volume rather than
        // bunching on its shell.
        const r = spread * Math.cbrt(rng());
        const u = rng() * 2 - 1;
        const theta = rng() * Math.PI * 2;
        const ring = Math.sqrt(Math.max(0, 1 - u * u));

        at.set(
          centre.x + Math.cos(theta) * ring * r,
          centre.y + u * r * 0.7,
          centre.z + Math.sin(theta) * ring * r,
        );

        matrix.makeTranslation(at.x, at.y, at.z);
        tint.copy(ROCK_COOL).lerp(ROCK_WARM, Math.pow(rng(), 1.6));
        // Most rocks are small. The occasional big one is what gives a cluster
        // a scale to read the rest against.
        const radius = randRange(rng, 0.8, 3.2) * (rng() < 0.08 ? 3.4 : 1);
        const spec = rockSpec(rng);

        /*
          Every draw above happens whatever the detail level, and only the
          geometry is skipped.

          That is not tidiness — the whole sector depends on it. A region is
          generated from a hash of its own coordinates, so it must come out
          identical however you arrive at it. Skipping the draws for a distant
          region would leave the generator at a different point in its sequence
          by the time it reached the landmark, and the same region would then
          hold a different landmark, somewhere else, depending on whether you
          had happened to pass nearby before.
        */
        if (this.detail === "full") emit(merged, rock(spec, radius), matrix, tint);
      }
    }

    // --- the rare thing ------------------------------------------------------
    this.landmark = rng() < FIELD.wonderChance
      ? WONDERS[Math.floor(rng() * WONDERS.length)]!
      : rng() < FIELD.landmarkChance
        ? LANDMARKS[Math.floor(rng() * LANDMARKS.length)]!
        : null;

    if (this.landmark) {
      const where = new THREE.Vector3(
        origin.x + randRange(rng, size * 0.2, size * 0.8),
        origin.y + randRange(rng, -size * 0.25, size * 0.25),
        origin.z + randRange(rng, size * 0.2, size * 0.8),
      );
      this.buildLandmark(this.landmark, rng, where, landmarkMerged, matrix, tint);
    }

    const geometry = finish(merged);
    if (geometry) {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      );
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }

    const landmarkGeometry = finish(landmarkMerged);
    if (landmarkGeometry) {
      const material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(landmarkGeometry, material);
      mesh.frustumCulled = false;
      this.landmarkGroup.add(mesh);
      material.userData.peak = 1;
      this.fading.push(material);
    }

    /*
      Collect every material the landmark owns, whichever way it was built,
      and remember what each was *meant* to look like before dimming it.

      That last part matters more than it sounds. These do not all start at
      full strength — a planetary ring sits at a fifth, a comet tail at a
      fifth, the crystals vary per shard — so fading them by setting an opacity
      would quietly promote every one of them to solid on arrival. The fade is
      a multiplier on what each already was, not a value of its own.

      And the accretion disc is a shader, whose `opacity` is a property nothing
      reads. It fades on the uniform its own shader actually multiplies by.
    */
    this.landmarkGroup.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!m || this.fading.includes(m)) continue;

        const shader = m as THREE.ShaderMaterial;
        if (shader.isShaderMaterial && shader.uniforms.uStrength) {
          m.userData.peak = shader.uniforms.uStrength.value;
          shader.uniforms.uStrength.value = 0;
        } else {
          m.userData.peak = m.opacity;
          m.transparent = true;
          m.opacity = 0;
        }

        this.fading.push(m);
      }
    });

    if (this.landmarkGroup.children.length > 0) this.group.add(this.landmarkGroup);

    /*
      Where the landmark actually is, measured rather than assumed.

      The obvious anchor is the point the region picked for it, and that point
      is wrong for exactly the landmarks this fade exists for. A planet is
      slung four to six hundred units above or below the lane so that it is
      scenery you pass rather than an obstacle; a gas giant further still. Timing
      the fade against the anchor faded them in against a place they were not,
      so a planet could be solid at eighteen hundred when it was supposed to be
      halfway through appearing — which is the original complaint, in miniature,
      surviving its own fix.

      Measured once, here, over whatever the landmark turned out to be built
      from: merged geometry carrying world coordinates, positioned groups, or
      both.
    */
    if (this.landmark) {
      this.landmarkGroup.updateMatrixWorld(true);
      new THREE.Box3().setFromObject(this.landmarkGroup).getCenter(this.landmarkAt);
    }

    // Hidden until it is close enough to be worth fading in at all.
    this.landmarkGroup.visible = false;

    // Most regions are empty sky and have nothing in them at all. Reaching out
    // six regions for the landmarks means several hundred are live at once, and
    // an empty group is still a node the renderer walks every frame.
    if (this.group.children.length > 0) scene.add(this.group);
  }

  private buildLandmark(
    kind: LandmarkKind,
    rng: Rng,
    where: THREE.Vector3,
    merged: Merged,
    matrix: THREE.Matrix4,
    tint: THREE.Color,
  ): void {
    switch (kind) {
      case "planet": {
        // Deliberately enormous and deliberately far below or above the lane
        // you fly in, so it is scenery you pass rather than an obstacle. Low
        // detail: it is a shape on the horizon, not a place.
        const radius = randRange(rng, 120, 260);
        const centre = where.clone().setY(where.y + (rng() < 0.5 ? -1 : 1) * randRange(rng, 320, 520));
        matrix.makeTranslation(centre.x, centre.y, centre.z);
        tint.copy(ROCK_WARM).lerp(ROCK_COOL, rng() * 0.5);
        emit(merged, new THREE.IcosahedronGeometry(radius, 2), matrix, tint);
        break;
      }

      case "ring": {
        // A derelict station ring: a torus built from few enough segments that
        // it reads as plated rather than smooth, tipped over at an angle no
        // working station would hold.
        const group = new THREE.Group();
        const geometry = new THREE.TorusGeometry(randRange(rng, 44, 78), 5.5, 5, 14);
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshLambertMaterial({ color: 0x8a93a6, flatShading: true }),
        );
        mesh.frustumCulled = false;
        group.add(mesh);
        group.position.copy(where);
        group.rotation.set(randRange(rng, 0.4, 1.2), rng() * Math.PI, randRange(rng, -0.5, 0.5));
        this.landmarkGroup.add(group);
        // It still turns, very slowly. Whatever it was for, nobody stopped it.
        this.spinner = mesh;
        this.spinRate = randRange(rng, 0.01, 0.03);
        break;
      }

      case "gate": {
        // A frame standing in nothing, made of four heavy bars. What it was a
        // gate to is not stated anywhere, and should not be.
        const half = randRange(rng, 38, 62);
        const bar = 4.5;
        const parts: Array<[number, number, number, number, number, number]> = [
          [0, half, 0, half + bar, bar, bar],
          [0, -half, 0, half + bar, bar, bar],
          [half, 0, 0, bar, half, bar],
          [-half, 0, 0, bar, half, bar],
        ];
        for (const [x, y, z, sx, sy, sz] of parts) {
          matrix.makeTranslation(where.x + x, where.y + y, where.z + z);
          tint.setHex(0x6f7890);
          emit(merged, new THREE.BoxGeometry(sx * 2, sy * 2, sz * 2), matrix, tint);
        }
        // One gold marker on a corner, the only bright thing on it.
        matrix.makeTranslation(where.x - half, where.y + half, where.z);
        tint.setHex(0xf0b440);
        emit(merged, new THREE.OctahedronGeometry(3.4, 0), matrix, tint);
        break;
      }

      case "yard": {
        // A drifting container yard: boxes at every angle, tumbling slowly
        // apart. Nobody is coming back for them.
        const count = Math.floor(randRange(rng, 14, 30));
        for (let i = 0; i < count; i++) {
          const at = new THREE.Vector3(
            where.x + randRange(rng, -55, 55),
            where.y + randRange(rng, -28, 28),
            where.z + randRange(rng, -55, 55),
          );
          const euler = new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
          matrix.makeRotationFromEuler(euler);
          matrix.setPosition(at.x, at.y, at.z);
          // Mostly drab, with the occasional one that still has its paint.
          if (rng() < 0.18) tint.setHex(rng() < 0.5 ? 0xc23434 : 0xf0b440);
          else tint.setHex(0x5a6479).lerp(ROCK_COOL, rng() * 0.6);
          emit(
            merged,
            new THREE.BoxGeometry(randRange(rng, 6, 11), randRange(rng, 4, 7), randRange(rng, 4, 7)),
            matrix,
            tint,
          );
        }
        break;
      }

      case "blackhole": {
        /*
          The one thing out here that is not lit: a sphere of pure black, with
          light falling around it.

          The first version was a flat ring of one flat colour, and it looked
          like a flat ring of one flat colour — a paper donut with a hole
          punched in it. Three things fix that, none of them a distortion
          shader: the design allows one lens flare per scene at most and the
          logo already spent it.

          The disc's brightness is a *function of radius* now, blazing at the
          inner edge and falling away outward, which is where a disc gets its
          sense of depth from. It has a hot side, because a uniform annulus has
          no volume. And there are two of them at slightly different angles, so
          the silhouette is never a clean ellipse from any direction.
        */
        const group = new THREE.Group();
        const radius = randRange(rng, 14, 26);

        const core = new THREE.Mesh(
          new THREE.IcosahedronGeometry(radius, 3),
          // Basic and unlit, so no light can ever fall on it. A Lambert sphere
          // would catch the key star and stop being a hole.
          new THREE.MeshBasicMaterial({ color: 0x000000 }),
        );
        core.frustumCulled = false;
        group.add(core);

        const discs: THREE.Mesh[] = [];
        for (let i = 0; i < 2; i++) {
          const inner = radius * 1.28;
          const outer = radius * (3.2 + i * 0.7);
          const material = accretionMaterial(rng() * Math.PI * 2, i === 0 ? 1 : 0.55);
          material.uniforms.uInner!.value = inner;
          material.uniforms.uOuter!.value = outer;
          const disc = new THREE.Mesh(
            new THREE.RingGeometry(inner, outer, 72, 3),
            material,
          );
          disc.frustumCulled = false;
          // The second is tipped off the first, so the pair never resolves into
          // one clean plane however you come at it.
          if (i === 1) disc.rotation.set(randRange(rng, 0.12, 0.3), 0, randRange(rng, -0.4, 0.4));
          group.add(disc);
          discs.push(disc);
        }

        // The photon ring: a thin, very bright edge hugging the horizon. This
        // is the detail that makes the black read as a hole with something
        // behind it rather than as a dark sphere.
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(radius * 1.01, radius * 1.16, 64, 1),
          new THREE.MeshBasicMaterial({
            color: 0xfff0cf,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        halo.frustumCulled = false;
        group.add(halo);
        this.halo = halo;

        group.position.copy(where);
        group.rotation.set(randRange(rng, 0.5, 1.1), rng() * Math.PI, 0);
        this.landmarkGroup.add(group);

        this.spinner = discs[0]!;
        this.spinRate = randRange(rng, 0.05, 0.11);
        this.discs = discs;
        break;
      }

      case "giant": {
        /*
          A ringed gas giant, and the most spectacular thing in the sector.

          Enormous, far off the lane, and tipped over — a ring system seen
          exactly edge-on is a line, and seen exactly face-on is the flat donut
          this whole pass exists to get rid of. Somewhere in between is where it
          reads as an object with a plane through it.
        */
        const group = new THREE.Group();
        const radius = randRange(rng, 150, 280);
        const centre = where
          .clone()
          .setY(where.y + (rng() < 0.5 ? -1 : 1) * randRange(rng, 380, 620));

        const bodyColour = new THREE.Color(PALETTE.planetRust).lerp(
          new THREE.Color(0xd9b06a),
          rng() * 0.7,
        );
        const body = new THREE.Mesh(
          new THREE.IcosahedronGeometry(radius, 3),
          new THREE.MeshLambertMaterial({ color: bodyColour, flatShading: true }),
        );
        body.frustumCulled = false;
        group.add(body);

        // Three bands rather than one sheet, with gaps between them, because a
        // single annulus is exactly the flat donut.
        for (let i = 0; i < 3; i++) {
          const inner = radius * (1.4 + i * 0.42);
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(inner, inner + radius * (0.16 + rng() * 0.2), 96, 1),
            new THREE.MeshBasicMaterial({
              color: new THREE.Color(0xc9b489).lerp(bodyColour, rng() * 0.5),
              transparent: true,
              opacity: 0.16 + rng() * 0.16,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          );
          ring.frustumCulled = false;
          group.add(ring);
        }

        group.position.copy(centre);
        // Tipped well off both edge-on and face-on.
        group.rotation.set(randRange(rng, 0.5, 1.0), rng() * Math.PI, randRange(rng, -0.3, 0.3));
        this.landmarkGroup.add(group);
        break;
      }

      case "comet": {
        // A bright nucleus with a long tail, and the tail points the way a
        // comet's does: away from the sector's star, not backward along its
        // path. Built as a taper rather than a cylinder so it thins out.
        const group = new THREE.Group();
        const head = new THREE.Mesh(
          new THREE.IcosahedronGeometry(randRange(rng, 3, 6), 1),
          new THREE.MeshBasicMaterial({ color: 0xdfeeff }),
        );
        head.frustumCulled = false;
        group.add(head);

        const length = randRange(rng, 120, 240);
        const tail = new THREE.Mesh(
          new THREE.ConeGeometry(randRange(rng, 7, 14), length, 7, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xa8d8ff,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        tail.frustumCulled = false;
        // Wide end at the head, tapering away behind it.
        tail.rotation.x = Math.PI / 2;
        tail.position.z = -length / 2;
        group.add(tail);

        group.position.copy(where);
        group.lookAt(where.clone().add(new THREE.Vector3(0.45, -0.62, -0.64)));
        this.landmarkGroup.add(group);
        break;
      }

      case "hulk": {
        // A capital ship that stopped being one. Far bigger than anything else
        // out here, broken into pieces that drifted apart and stayed that way.
        const pieces = Math.floor(randRange(rng, 3, 6));
        let along = 0;
        for (let i = 0; i < pieces; i++) {
          const length = randRange(rng, 24, 52);
          const height = randRange(rng, 9, 16);
          const width = randRange(rng, 11, 19);

          const euler = new THREE.Euler(
            randRange(rng, -0.25, 0.25),
            randRange(rng, -0.3, 0.3),
            randRange(rng, -0.35, 0.35),
          );
          matrix.makeRotationFromEuler(euler);
          // Drifted apart along the hull's own line, with gaps where the breaks
          // are — a ship in pieces, not a ship with seams.
          matrix.setPosition(
            where.x + along + randRange(rng, -6, 6),
            where.y + randRange(rng, -7, 7),
            where.z + randRange(rng, -9, 9),
          );
          tint.setHex(0x59637a).lerp(ROCK_COOL, rng() * 0.5);
          emit(merged, new THREE.BoxGeometry(length, height, width), matrix, tint);
          along += length + randRange(rng, 8, 26);

          // One rib of exposed frame at most breaks, which is what says this
          // was torn rather than parked.
          if (rng() < 0.6) {
            matrix.setPosition(
              where.x + along - randRange(rng, 6, 14),
              where.y + randRange(rng, -5, 5),
              where.z + randRange(rng, -7, 7),
            );
            tint.setHex(0x7d879b);
            emit(merged, new THREE.BoxGeometry(2.2, height * 1.3, width * 1.15), matrix, tint);
          }
        }
        break;
      }

      case "crystals": {
        // A shoal of glowing shards. The only thing in the sector that makes
        // its own light other than the star and the nebula, and it is rare
        // enough to stay a surprise.
        const colour = rng() < 0.5 ? 0x8fd8ff : 0xc9a3ff;
        const count = Math.floor(randRange(rng, 18, 40));
        const group = new THREE.Group();

        for (let i = 0; i < count; i++) {
          const shard = new THREE.Mesh(
            new THREE.OctahedronGeometry(randRange(rng, 1.6, 6.5), 0),
            new THREE.MeshBasicMaterial({
              color: colour,
              transparent: true,
              opacity: 0.32 + rng() * 0.4,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          shard.frustumCulled = false;
          shard.scale.set(1, randRange(rng, 1.8, 4.5), 1);
          shard.position.set(
            randRange(rng, -60, 60),
            randRange(rng, -30, 30),
            randRange(rng, -60, 60),
          );
          shard.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
          group.add(shard);
        }

        group.position.copy(where);
        this.landmarkGroup.add(group);
        this.spinner = group;
        this.spinRate = randRange(rng, 0.008, 0.02);
        break;
      }
    }
  }

  /**
   * Bring the landmark up out of the dark, or leave it there.
   *
   * Returns nothing and costs almost nothing when there is no landmark, which
   * is most regions.
   */
  fade(at: THREE.Vector3): void {
    if (!this.landmark) return;

    const distance = this.landmarkAt.distanceTo(at);
    // 0 at fadeStart, 1 at fadeFull. Smoothstepped so it arrives and settles
    // rather than ramping linearly and then stopping dead.
    const t = THREE.MathUtils.clamp(
      (FIELD.fadeStart - distance) / (FIELD.fadeStart - FIELD.fadeFull),
      0,
      1,
    );
    const eased = t * t * (3 - 2 * t);

    // Not drawn at all until there is something to draw. A fully transparent
    // object still costs a draw call and still sorts against everything else.
    this.landmarkGroup.visible = eased > 0.002;
    this.fadeLevel = eased;
    if (!this.landmarkGroup.visible) return;

    for (const material of this.fading) {
      const peak = (material.userData.peak as number | undefined) ?? 1;
      const shader = material as THREE.ShaderMaterial;
      if (shader.isShaderMaterial && shader.uniforms.uStrength) {
        shader.uniforms.uStrength.value = eased * peak;
      } else {
        material.opacity = eased * peak;
      }
    }
  }

  update(dt: number, elapsed: number): void {
    if (this.spinner) this.spinner.rotation.z += this.spinRate * dt;

    // The discs turn at different rates, which is what stops the pair reading
    // as one rigid object with a seam in it.
    for (let i = 0; i < this.discs.length; i++) {
      const disc = this.discs[i]!;
      disc.rotation.z += this.spinRate * (i === 0 ? 1 : -0.62) * dt;
      const material = disc.material as THREE.ShaderMaterial;
      material.uniforms.uTime!.value = elapsed;
    }

    if (this.halo) {
      // Breathes very slightly rather than sitting flat. Slow enough to be
      // felt rather than watched, and never a pulse anyone could count.
      //
      // Multiplied by the fade, because this writes opacity every frame and
      // would otherwise hand the photon ring its full brightness the instant a
      // region loaded, however far away it was.
      const material = this.halo.material as THREE.MeshBasicMaterial;
      material.opacity = (0.74 + Math.sin(elapsed * 0.31) * 0.12) * this.fadeLevel;
    }
  }

  dispose(scene: THREE.Scene): void {
    this.group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        m?.dispose();
      }
    });
    scene.remove(this.group);
  }
}

/** Keeps the regions around you live, and the rest disposed. */
export class Fields {
  private readonly live = new Map<string, Region>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sectorSeed: number,
  ) {}

  /** Which landmarks are currently within reach, for the readout to name. */
  readonly nearby: LandmarkKind[] = [];

  /**
   * Two radii, because the two things are seen from very different distances.
   *
   * A three-unit rock is invisible past a few hundred units, so debris is only
   * built close in. A planet two hundred and eighty units across is visible
   * from thousands, and building it only when you are already close is how one
   * comes to simply appear in the middle distance, filling a quarter of the sky
   * on the frame it was created. Landmarks therefore reach much further out and
   * fade in over the approach.
   *
   * A region that was built for its landmark alone and later comes within the
   * debris radius is rebuilt at full detail. That is a real cost and a rare
   * one — it happens once per region, at a boundary you cross at sixteen units
   * a second — and the alternative is either building every rock for a hundred
   * and fifty regions or never having debris at all.
   */
  update(dt: number, elapsed: number, at: THREE.Vector3): void {
    const size = FIELD.regionSize;
    const cx = Math.floor(at.x / size);
    const cy = Math.floor(at.y / size);
    const cz = Math.floor(at.z / size);

    const near = FIELD.regionRadius;
    const far = FIELD.landmarkRadius;

    const wanted = new Set<string>();
    for (let x = cx - far; x <= cx + far; x++) {
      // Vertically the sector is much thinner than it is wide: there is no
      // reason to generate anything a kilometre above the lane nobody flies in.
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let z = cz - far; z <= cz + far; z++) {
          const key = `${x},${y},${z}`;
          wanted.add(key);

          const close =
            Math.abs(x - cx) <= near && Math.abs(z - cz) <= near;
          const detail: Detail = close ? "full" : "landmark";

          const existing = this.live.get(key);
          if (existing && existing.detail === detail) continue;

          // Either new, or built at the wrong detail because the pilot has
          // come close enough for its debris to matter.
          existing?.dispose(this.scene);
          this.live.set(
            key,
            new Region(this.scene, this.sectorSeed, x, y, z, detail),
          );
        }
      }
    }

    for (const [key, region] of this.live) {
      if (wanted.has(key)) {
        region.update(dt, elapsed);
        region.fade(at);
      } else {
        region.dispose(this.scene);
        this.live.delete(key);
      }
    }

    this.nearby.length = 0;
    for (const region of this.live.values()) {
      if (region.landmark) this.nearby.push(region.landmark);
    }
  }

  get liveCount(): number {
    return this.live.size;
  }

  dispose(): void {
    for (const region of this.live.values()) region.dispose(this.scene);
    this.live.clear();
  }
}
