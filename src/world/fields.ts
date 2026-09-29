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
type LandmarkKind = "planet" | "ring" | "gate" | "yard" | "blackhole";

const LANDMARKS: readonly LandmarkKind[] = ["planet", "ring", "gate", "yard", "blackhole"];

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
  const flat = geometry.toNonIndexed();
  const position = flat.getAttribute("position") as THREE.BufferAttribute;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    vertex.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(matrix);
    into.positions.push(vertex.x, vertex.y, vertex.z);
    into.colours.push(colour.r, colour.g, colour.b);
  }

  flat.dispose();
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
 * One boulder.
 *
 * An icosahedron squashed unevenly and turned at random, so every rock is a
 * different chunky gem cut from the same stone. Detail 0 keeps the facets big
 * enough to count, which is the whole look.
 */
function rock(rng: Rng, radius: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, rng() < 0.25 ? 1 : 0);
  geometry.scale(randRange(rng, 0.6, 1.3), randRange(rng, 0.5, 1.2), randRange(rng, 0.6, 1.3));
  geometry.rotateX(rng() * Math.PI);
  geometry.rotateY(rng() * Math.PI);
  geometry.rotateZ(rng() * Math.PI);
  return geometry;
}

/**
 * A live region of space.
 *
 * Everything static merges into one mesh; a landmark that needs to move or
 * glow keeps its own object so it can be animated.
 */
class Region {
  readonly group = new THREE.Group();
  readonly landmark: LandmarkKind | null;
  /** Set for landmarks with a part that turns. */
  private spinner: THREE.Object3D | null = null;
  private spinRate = 0;
  private disc: THREE.Mesh | null = null;

  constructor(
    scene: THREE.Scene,
    sectorSeed: number,
    readonly rx: number,
    readonly ry: number,
    readonly rz: number,
  ) {
    const rng = regionRng(sectorSeed, rx * 73856093 ^ ry, rz);
    const size = FIELD.regionSize;
    const origin = new THREE.Vector3(rx * size, ry * size, rz * size);

    const merged: Merged = { positions: [], colours: [] };
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
        emit(merged, rock(rng, radius), matrix, tint);
      }
    }

    // --- the rare thing ------------------------------------------------------
    this.landmark = rng() < FIELD.landmarkChance
      ? LANDMARKS[Math.floor(rng() * LANDMARKS.length)]!
      : null;

    if (this.landmark) {
      const where = new THREE.Vector3(
        origin.x + randRange(rng, size * 0.2, size * 0.8),
        origin.y + randRange(rng, -size * 0.25, size * 0.25),
        origin.z + randRange(rng, size * 0.2, size * 0.8),
      );
      this.buildLandmark(this.landmark, rng, where, merged, matrix, tint);
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

    scene.add(this.group);
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
        this.group.add(group);
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
        // The one thing out here that is not lit: a sphere of pure black with
        // a bright disc around it. No lens flare and no distortion shader —
        // the design allows one flare per scene at most, and the logo already
        // spent it. What sells this is the hole being genuinely black against a
        // sky that never is.
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

        const disc = new THREE.Mesh(
          new THREE.RingGeometry(radius * 1.35, radius * 3.1, 48, 1),
          new THREE.MeshBasicMaterial({
            color: 0xffd9a0,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        disc.frustumCulled = false;
        group.add(disc);

        group.position.copy(where);
        group.rotation.set(randRange(rng, 0.5, 1.1), rng() * Math.PI, 0);
        this.group.add(group);

        this.spinner = disc;
        this.spinRate = randRange(rng, 0.05, 0.11);
        this.disc = disc;
        break;
      }
    }
  }

  update(dt: number, elapsed: number): void {
    if (this.spinner) this.spinner.rotation.z += this.spinRate * dt;
    if (this.disc) {
      // The disc breathes very slightly rather than sitting flat. Slow enough
      // that it is felt rather than watched, and never a pulse you can count.
      const material = this.disc.material as THREE.MeshBasicMaterial;
      material.opacity = 0.42 + Math.sin(elapsed * 0.31) * 0.08;
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

  update(dt: number, elapsed: number, at: THREE.Vector3): void {
    const size = FIELD.regionSize;
    const cx = Math.floor(at.x / size);
    const cy = Math.floor(at.y / size);
    const cz = Math.floor(at.z / size);
    const radius = FIELD.regionRadius;

    const wanted = new Set<string>();
    for (let x = cx - radius; x <= cx + radius; x++) {
      // Vertically the sector is much thinner than it is wide: there is no
      // reason to generate debris a kilometre above the lane nobody flies in.
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let z = cz - radius; z <= cz + radius; z++) {
          const key = `${x},${y},${z}`;
          wanted.add(key);
          if (!this.live.has(key)) {
            this.live.set(key, new Region(this.scene, this.sectorSeed, x, y, z));
          }
        }
      }
    }

    for (const [key, region] of this.live) {
      if (wanted.has(key)) {
        region.update(dt, elapsed);
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
