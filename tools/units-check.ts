/**
 * Headless check that the units are solid, and painted to the rule.
 *
 * Two things, both of which are invisible right up until they are embarrassing.
 *
 * **Solidity.** Back faces are culled, so a hole in a plate is not a missing
 * patch of armour — it is a window straight through the unit and out the other
 * side. The bevelled box every plate is built from is wound by hand: six face
 * quads, twelve edge quads and eight corner triangles, each of which has to be
 * wound the right way round, and the handedness flips with the signs of the
 * corner. Get one wrong and you have a plate that looks perfect from every
 * angle except one. So: count edges used by exactly one triangle, which a
 * closed surface has none of, and check the signed volume is positive, which
 * says the surface is wound outward rather than inside out.
 *
 * **The paint.** The design gives a ratio — roughly 55 white, 25 navy, 12 red,
 * 8 gold — and it is the thing that makes four different silhouettes read as
 * one fleet. It is also the easiest thing in the project to drift: every plate
 * added to a unit changes it a little, and nobody notices until one unit has
 * quietly become mostly navy. Measured by area rather than by plate count,
 * because a ratio of plate counts would say a unit was mostly gold when its
 * gold is four vents the size of a thumbnail.
 *
 * Run with:  npm run verify:units
 */

import * as THREE from "three";
import { PAINT } from "../src/core/config";
import { bevelledBox } from "../src/units/plates";
import { UNITS } from "../src/units/units";

const failures: string[] = [];
let passed = 0;
function check(condition: boolean, name: string): void {
  if (condition) passed++;
  else failures.push(name);
}

/**
 * The triangle list, whichever form the geometry arrives in.
 *
 * A unit's merged geometry is non-indexed so that flat shading has per-face
 * normals. Welding by position below is what lets a synthetic index still tell
 * the truth about the topology.
 */
function triangleIndex(geometry: THREE.BufferGeometry): ArrayLike<number> {
  const index = geometry.getIndex();
  if (index) return index.array;
  const count = geometry.getAttribute("position").count;
  const synthetic = new Uint32Array(count);
  for (let i = 0; i < count; i++) synthetic[i] = i;
  return synthetic;
}

/** Edges belonging to exactly one triangle — the rim of a hole. */
function openEdges(geometry: THREE.BufferGeometry): number {
  const idx = triangleIndex(geometry);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;

  // Key on welded position rather than vertex id. Merged plates duplicate
  // vertices at identical coordinates, and two triangles meeting there are a
  // closed seam, not two rims. Quantised to integer ticks rather than
  // formatted, because a value like -6e-17 renders as "-0.0000" and would fail
  // to weld against "0.0000".
  const tick = (v: number) => {
    const r = Math.round(v * 1e4);
    return r === 0 ? 0 : r;
  };

  const weld = new Map<string, number>();
  const canonical = new Int32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const key = `${tick(position.getX(i))}_${tick(position.getY(i))}_${tick(position.getZ(i))}`;
    let id = weld.get(key);
    if (id === undefined) weld.set(key, (id = i));
    canonical[i] = id;
  }

  const counts = new Map<string, number>();
  const bump = (a: number, b: number) => {
    const x = canonical[a]!;
    const y = canonical[b]!;
    if (x === y) return;
    const key = x < y ? `${x}:${y}` : `${y}:${x}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  for (let i = 0; i < idx.length; i += 3) {
    const a = canonical[idx[i]!]!;
    const b = canonical[idx[i + 1]!]!;
    const c = canonical[idx[i + 2]!]!;
    if (a === b || b === c || c === a) continue;
    bump(a, b);
    bump(b, c);
    bump(c, a);
  }

  let open = 0;
  for (const n of counts.values()) if (n === 1) open++;
  return open;
}

/**
 * Volume enclosed by the surface, signed by its winding.
 *
 * Each triangle contributes the signed volume of the tetrahedron it forms with
 * the origin. Wound outward these sum to the real volume; wound inward, to its
 * negative.
 */
function signedVolume(geometry: THREE.BufferGeometry): number {
  const idx = triangleIndex(geometry);
  const p = geometry.getAttribute("position") as THREE.BufferAttribute;
  let total = 0;

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i]!;
    const b = idx[i + 1]!;
    const c = idx[i + 2]!;
    total +=
      p.getX(a) * (p.getY(b) * p.getZ(c) - p.getZ(b) * p.getY(c)) -
      p.getY(a) * (p.getX(b) * p.getZ(c) - p.getZ(b) * p.getX(c)) +
      p.getZ(a) * (p.getX(b) * p.getY(c) - p.getY(b) * p.getX(c));
  }

  return total / 6;
}

/** Total area of the faces painted each colour. */
function paintByArea(geometry: THREE.BufferGeometry): Map<string, number> {
  const p = geometry.getAttribute("position") as THREE.BufferAttribute;
  const c = geometry.getAttribute("color") as THREE.BufferAttribute;

  const named = new Map<string, THREE.Color>([
    ["white", new THREE.Color(PAINT.white)],
    ["navy", new THREE.Color(PAINT.navy)],
    ["red", new THREE.Color(PAINT.red)],
    ["gold", new THREE.Color(PAINT.gold)],
  ]);

  const areas = new Map<string, number>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const cc = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  for (let i = 0; i + 2 < p.count; i += 3) {
    a.set(p.getX(i), p.getY(i), p.getZ(i));
    b.set(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1));
    cc.set(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    const area = ab.subVectors(b, a).cross(ac.subVectors(cc, a)).length() * 0.5;

    // Every vertex of a face carries the same colour, so one is enough.
    let best = "other";
    let bestDistance = Infinity;
    for (const [name, colour] of named) {
      const d =
        Math.abs(colour.r - c.getX(i)) +
        Math.abs(colour.g - c.getY(i)) +
        Math.abs(colour.b - c.getZ(i));
      if (d < bestDistance) {
        bestDistance = d;
        best = name;
      }
    }

    areas.set(best, (areas.get(best) ?? 0) + area);
  }

  return areas;
}

// -- the plate itself --------------------------------------------------------

console.log("the bevelled box");
{
  // Several shapes, because the winding of the corner triangles depends on the
  // handedness of each corner and a cube would not show a sign error that only
  // appears when the extents differ.
  const shapes: Array<[string, THREE.BufferGeometry]> = [
    ["cube", bevelledBox(1, 1, 1)],
    ["slab", bevelledBox(2.5, 0.3, 1.4)],
    ["post", bevelledBox(0.25, 3, 0.25)],
    ["blade", bevelledBox(0.16, 0.9, 2.2, 0.4)],
    ["barely cut", bevelledBox(1, 1, 1, 0.02)],
  ];

  for (const [name, geometry] of shapes) {
    const open = openEdges(geometry);
    const volume = signedVolume(geometry);

    // Volume is translation-invariant for a coherently wound closed surface.
    // If shifting it changes the answer, some faces disagree with their
    // neighbours about which way is out.
    const moved = geometry.clone();
    moved.translate(13, 29, 17);
    const coherent = Math.abs(signedVolume(moved) - volume) < Math.abs(volume) * 1e-3 + 1e-6;

    const ok = open === 0 && volume > 0 && coherent;
    check(ok, `${name} is closed and faces outward`);
    console.log(
      ok
        ? `  ${name.padEnd(12)} solid, ${volume.toFixed(4)}`
        : `  ${name.padEnd(12)} FAIL — ${open} open edge(s), volume ${volume.toFixed(4)}${coherent ? "" : ", faces disagree on which way is out"}`,
    );

    geometry.dispose();
    moved.dispose();
  }
}

// -- the units ---------------------------------------------------------------

console.log("\nunits");
for (const unit of UNITS) {
  const rig = unit.build();
  const mesh = rig.root.children.find((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh;
  const geometry = mesh.geometry;

  const open = openEdges(geometry);
  const volume = signedVolume(geometry);
  check(open === 0, `${unit.name} has no holes`);
  check(volume > 0, `${unit.name} is wound outward`);

  const areas = paintByArea(geometry);
  const total = [...areas.values()].reduce((sum, v) => sum + v, 0);
  const share = (name: string) => (100 * (areas.get(name) ?? 0)) / total;

  const white = share("white");
  const navy = share("navy");
  const red = share("red");
  const gold = share("gold");

  // Generous bands. This is a check against drift, not a straitjacket: a unit
  // is allowed its own character, it is just not allowed to stop being part of
  // the same fleet. Gold has the tightest ceiling because it is the accent —
  // the moment there is a lot of it, it is not an accent any more.
  check(white > 34 && white < 72, `${unit.name} is mostly white (${white.toFixed(0)}%)`);
  check(navy > 8 && navy < 42, `${unit.name} has navy on its core (${navy.toFixed(0)}%)`);
  check(red > 1.5 && red < 26, `${unit.name} has red on a block or two (${red.toFixed(0)}%)`);
  check(gold > 0.4 && gold < 15, `${unit.name} keeps gold an accent (${gold.toFixed(1)}%)`);

  console.log(
    `  ${unit.name.padEnd(12)} ${unit.code.padEnd(6)} solid ${volume.toFixed(1).padStart(7)}` +
      `   white ${white.toFixed(0).padStart(2)}%  navy ${navy.toFixed(0).padStart(2)}%` +
      `  red ${red.toFixed(0).padStart(2)}%  gold ${gold.toFixed(1).padStart(4)}%`,
  );

  rig.dispose();
}

// -- the fleet ---------------------------------------------------------------

console.log("");
{
  const ids = new Set(UNITS.map((u) => u.id));
  check(ids.size === UNITS.length, "every unit has its own id");

  const codes = new Set(UNITS.map((u) => u.code));
  check(codes.size === UNITS.length, "every unit has its own code");
  check(
    UNITS.every((u) => /^[A-Z]{2}-\d$/.test(u.code)),
    "every code follows the UNIT XX-N format",
  );

  // The four are meant to feel different. If two of them fly the same, the
  // choice is decoration.
  //
  // This checks the design data only, and that distinction once mattered: the
  // speed scales were right here and reached nothing that moved, so every unit
  // flew identically while this check passed. Whether they *reach* the flight
  // is measured in verify:steering, by distance covered rather than by reading
  // the numbers back.
  const speeds = UNITS.map((u) => u.speedScale).sort((a, b) => a - b);
  const turns = UNITS.map((u) => u.turnScale).sort((a, b) => a - b);
  check(speeds[speeds.length - 1]! / speeds[0]! > 1.6, "the fastest is clearly faster than the slowest");
  check(turns[turns.length - 1]! / turns[0]! > 2, "the nimblest turns clearly harder than the heaviest");
}

if (failures.length > 0) {
  console.error(`\nUnit check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`${passed} unit checks passed. Every plate is closed, and the fleet is one fleet.`);
