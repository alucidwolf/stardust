/**
 * Headless check of the sky.
 *
 * Two things here are easy to get wrong and nearly impossible to catch by
 * looking, which is exactly what makes them worth a check.
 *
 * **Even coverage.** The obvious way to scatter points over a sphere is to
 * pick a latitude and a longitude at random. That is wrong, and wrong in a way
 * that looks plausible in a screenshot: equal steps of latitude cover less
 * area near the poles, so the points crowd into two dense caps with a sparse
 * band around the equator. You only notice by flying up, looking straight
 * ahead, and realising the sky has a lid on it. The fix is to distribute the
 * *height* uniformly instead, and the test below is the one that tells the two
 * apart — so it ends by generating the bad version deliberately and confirming
 * it still fails. A test that cannot fail is not a test.
 *
 * **Wrapping.** The near glints and the stardust both hold a constant density
 * around the camera out of a fixed number of points, by folding anything that
 * falls too far behind around to the far side. If that arithmetic is wrong the
 * field quietly empties as you fly, and it empties slowly enough that nobody
 * catches it in a short session.
 *
 * Run with:  npm run verify:starfield
 */

import * as THREE from "three";
import { SECTOR } from "../src/core/config";
import { Motes } from "../src/world/motes";
import { Starfield } from "../src/world/starfield";

const failures: string[] = [];
let passed = 0;
function check(condition: boolean, name: string): void {
  if (condition) passed++;
  else failures.push(name);
}

function positionsOf(points: THREE.Points): Float32Array {
  return (points.geometry.getAttribute("position") as THREE.BufferAttribute)
    .array as Float32Array;
}

/**
 * How lumpy a set of heights is, over equal-area bands.
 *
 * Slicing a sphere at evenly spaced heights gives bands of equal area, so an
 * even scattering puts the same number of points in each. The measure is the
 * worst band's departure from the expected share: 0 is perfect, and the naive
 * latitude sampling lands far above anything a fair one reaches.
 */
function bandImbalance(heights: number[], radius: number, bands = 10): number {
  const counts = new Array<number>(bands).fill(0);
  for (const y of heights) {
    const u = Math.max(-1, Math.min(1, y / radius));
    const band = Math.min(bands - 1, Math.floor(((u + 1) / 2) * bands));
    counts[band] = (counts[band] ?? 0) + 1;
  }
  const expected = heights.length / bands;
  return Math.max(...counts.map((n) => Math.abs(n - expected) / expected));
}

// -- the far field -----------------------------------------------------------

const scene = new THREE.Scene();
const field = new Starfield(scene, 12345);

const far = positionsOf(field.far);
check(far.length === SECTOR.farStars * 3, "the far field has the stars it says it has");

{
  let onShell = 0;
  const heights: number[] = [];
  for (let i = 0; i < SECTOR.farStars; i++) {
    const x = far[i * 3]!;
    const y = far[i * 3 + 1]!;
    const z = far[i * 3 + 2]!;
    const r = Math.hypot(x, y, z);
    if (Math.abs(r - SECTOR.skyRadius) < 0.5) onShell++;
    heights.push(y);
  }

  check(onShell === SECTOR.farStars, "every far star sits on the sky shell");

  const imbalance = bandImbalance(heights, SECTOR.skyRadius);
  check(imbalance < 0.25, `far stars cover the sphere evenly (imbalance ${imbalance.toFixed(3)})`);
  console.log(`  far field       ${SECTOR.farStars} stars, worst band off by ${(imbalance * 100).toFixed(1)}%`);
}

// -- the same seed builds the same sky ---------------------------------------

{
  const again = new Starfield(new THREE.Scene(), 12345);
  const other = new Starfield(new THREE.Scene(), 999);

  const a = positionsOf(again.far);
  const b = positionsOf(other.far);

  let identical = true;
  let differs = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== far[i]) identical = false;
    if (b[i] !== far[i]) differs = true;
  }

  check(identical, "the same seed rebuilds the same sky");
  check(differs, "a different seed is a different sky");

  again.dispose();
  other.dispose();
}

// -- wrapping ----------------------------------------------------------------

/** Is every point still within `radius` of the camera, on every axis? */
function allWithin(values: Float32Array, camera: THREE.Vector3, radius: number): boolean {
  for (let i = 0; i < values.length; i += 3) {
    if (Math.abs(values[i]! - camera.x) > radius + 1e-3) return false;
    if (Math.abs(values[i + 1]! - camera.y) > radius + 1e-3) return false;
    if (Math.abs(values[i + 2]! - camera.z) > radius + 1e-3) return false;
  }
  return true;
}

{
  const camera = new THREE.Vector3();
  const near = positionsOf(field.near);

  // Fly a long way, in a direction that is not aligned with any axis, so the
  // wrap has to work on all three at once and in both directions.
  let held = true;
  for (let step = 0; step < 400; step++) {
    camera.add(new THREE.Vector3(3.1, -1.7, 4.3));
    field.update(camera);
    if (!allWithin(near, camera, SECTOR.nearRadius)) held = false;
  }

  check(held, "near glints stay wrapped around the camera however far it flies");
  check(
    field.far.position.distanceTo(camera) < 1e-6,
    "the far field stays centred on the camera, so it can never be reached",
  );
  console.log(`  near layer      ${SECTOR.nearStars} glints held after 400 steps`);
}

{
  const moteScene = new THREE.Scene();
  const camera = new THREE.Vector3();
  const motes = new Motes(moteScene, 4242, camera);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  let held = true;

  for (let step = 0; step < 300; step++) {
    camera.add(new THREE.Vector3(-2.3, 1.1, 3.7));
    motes.update(1 / 60, step / 60, camera);

    for (let i = 0; i < motes.mesh.count; i++) {
      motes.mesh.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      if (
        Math.abs(position.x - camera.x) > SECTOR.moteRadius + 1e-2 ||
        Math.abs(position.y - camera.y) > SECTOR.moteRadius + 1e-2 ||
        Math.abs(position.z - camera.z) > SECTOR.moteRadius + 1e-2
      ) {
        held = false;
      }
    }
  }

  check(held, "stardust stays wrapped around the camera however far it flies");

  // Scale is read back out of the matrices each frame rather than stored, so a
  // mote that lost its size would be a silent failure. Confirm it kept one.
  motes.mesh.getMatrixAt(0, matrix);
  const scale = new THREE.Vector3().setFromMatrixScale(matrix);
  check(scale.x > 0.01 && scale.x < 0.2, "stardust keeps its size across updates");
  console.log(`  stardust        ${motes.mesh.count} motes held after 300 steps`);

  motes.dispose();
}

// -- the measure itself ------------------------------------------------------

{
  // The naive sampling this exists to catch: latitude picked directly, which
  // crowds both poles. If the imbalance measure above passes this, it is not
  // measuring anything.
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const bad: number[] = [];
  for (let i = 0; i < SECTOR.farStars; i++) {
    const latitude = (random() - 0.5) * Math.PI;
    bad.push(Math.sin(latitude) * SECTOR.skyRadius);
  }

  const imbalance = bandImbalance(bad, SECTOR.skyRadius);
  check(imbalance > 0.25, `the evenness measure rejects pole-crowded sampling (${imbalance.toFixed(3)})`);
  console.log(`  self-test       naive sampling off by ${(imbalance * 100).toFixed(1)}%, correctly rejected`);
}

field.dispose();

if (failures.length > 0) {
  console.error(`Starfield check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\n${passed} starfield checks passed. The sky is even, and it stays with you.`);
