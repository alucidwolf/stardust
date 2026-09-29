/**
 * Headless check that nothing large ever simply appears.
 *
 * A planet is two hundred and eighty units across. Built at the edge of the
 * streaming radius it came into existence already close enough to fill a
 * quarter of the sky, on one frame, out of nothing — and because it happened
 * only when a region happened to hold one, it looked like a glitch rather than
 * like a rule.
 *
 * The fix is two things, and this checks both. Landmarks are generated from far
 * beyond the debris radius, so one exists long before you could see it. And it
 * fades up over the approach, so the moment it is created is not the moment it
 * appears.
 *
 * The measurement is deliberately of what reaches the screen rather than of
 * the numbers that were supposed to put it there: it walks the actual scene
 * graph, finds everything that is being drawn, and asks how visible it is and
 * how far away. A check on the fade constants would have passed the original
 * bug, because the original bug was that nothing consulted them.
 *
 * Run with:  npm run verify:approach
 */

import * as THREE from "three";
import { FIELD } from "../src/core/config";
import { Fields } from "../src/world/fields";

const failures: string[] = [];
let passed = 0;
function check(condition: boolean, name: string): void {
  if (condition) passed++;
  else failures.push(name);
}

/**
 * How far up its own fade a material has come, 0 to 1.
 *
 * Divided by what the material was meant to reach, because these do not all
 * end at full strength — a planetary ring settles at a fifth — and measuring
 * raw opacity would call a finished ring a third-faded one.
 */
function level(material: THREE.Material): number | null {
  const peak = material.userData.peak as number | undefined;
  if (peak === undefined) return null;

  const shader = material as THREE.ShaderMaterial;
  const value =
    shader.isShaderMaterial && shader.uniforms.uStrength
      ? (shader.uniforms.uStrength.value as number)
      : material.opacity;

  return peak > 0 ? value / peak : 0;
}

const scene = new THREE.Scene();
const fields = new Fields(scene, 20250929);

const at = new THREE.Vector3();
const heading = new THREE.Vector3(0.35, 0.04, -0.94).normalize();
const world = new THREE.Vector3();

/** The worst case seen anywhere on the flight. */
let brightestFarAway = 0;
let brightestFarAwayAt = 0;
let bestLevel = 0;
let landmarksMet = 0;

/**
 * The biggest step any one material took between two samples.
 *
 * This is the direct statement of the complaint: a pop is a material going
 * from nothing to everything between one frame and the next. Distance
 * thresholds cannot express it, because a landmark is not a point — a gas
 * giant's outer ring sits seven hundred units from the giant's own centre, so
 * parts of a large object are always at different distances and always will
 * be. What must never happen is that the *brightness* lurches.
 *
 * Materials seen in only one of the two samples are skipped. That is the
 * region-rebuild case: crossing into the debris radius rebuilds a region at
 * full detail and its landmark gets new materials. The fade is applied to
 * every live region in the same pass that creates them, so the replacement
 * opens at exactly the level its predecessor held, and there is nothing to see.
 */
let worstStep = 0;
let previous = new Map<string, number>();

/**
 * How crowded the sky gets.
 *
 * The complaint this answers is that too much was in view at once — a dozen
 * planets around you reads as a solar system, not as deep space. Density is
 * therefore set by how many should be visible at a time, which is a few, and
 * the check measures exactly that rather than the chance per region that was
 * supposed to produce it.
 */
let mostAtOnce = 0;
let mostPlanetsAtOnce = 0;
let totalSeen = 0;
let samples = 0;

/** The big round ones, which are what dominates a view when there are many. */
const BIG = new Set(["planet", "giant"]);

const seenRegions = new Set<string>();

// Twelve minutes of flying in a straight line, which crosses a good many
// regions and meets a fair number of landmarks.
const DT = 1 / 60;
const speed = 16;
const minutes = 12;

for (let i = 0; i < (minutes * 60) / DT; i++) {
  at.addScaledVector(heading, speed * DT);
  fields.update(DT, i * DT, at);

  // Only look every half second. The answer cannot change quickly — that is
  // the entire property being tested — and walking the scene graph sixty times
  // a second for twelve simulated minutes is a waste of everybody's time.
  if (i % 30 !== 0) continue;

  /*
    The renderer does this every frame; nothing here has.

    Without it every group still carries an identity world matrix, so a
    landmark that lives on a positioned group measures as though it sat at the
    origin — which reported one as eleven and a half thousand units away, that
    being exactly how far the flight had travelled from the origin by then. The
    number was measuring the pilot, not the landmark.
  */
  scene.updateMatrixWorld(true);

  const current = new Map<string, number>();

  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    // A hidden ancestor hides this too, and `visible` on the mesh alone does
    // not say so.
    for (let p = mesh.parent; p; p = p.parent) if (!p.visible) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const shown = level(material);
      // Debris has no peak recorded: it does not fade and is not the subject.
      if (shown === null) continue;

      /*
        Where the landmark actually is, which is not where its mesh sits.

        The merged landmark mesh has world coordinates baked into its vertex
        buffer and a transform of identity, so its object position is the
        origin — and measuring from that reported a planet as eleven thousand
        units away while it filled the screen. The geometry's own bounding
        sphere is the only thing here that knows where the shape is.
      */
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      world.copy(mesh.geometry.boundingSphere!.center).applyMatrix4(mesh.matrixWorld);
      const distance = world.distanceTo(at);

      current.set(material.uuid, shown);

      if (shown > 0.02) {
        bestLevel = Math.max(bestLevel, shown);

        if (distance > FIELD.fadeStart + 60 && shown > brightestFarAway) {
          brightestFarAway = shown;
          brightestFarAwayAt = distance;
        }
      }
    }
  });

  {
    /*
      Counted by how far up its fade each one has come, not by whether it is
      switched on.

      A landmark two thousand four hundred units away at one percent is
      technically in the scene and is not in any sense in view. Counting those
      says the sky is crowded when what is actually out there is one planet and
      six rumours of planets, which would have had the density tuned against a
      number nobody can see.
    */
    let showing = 0;
    let planets = 0;

    scene.traverse((node) => {
      if (node.name !== "landmark" || !node.visible) return;
      for (let p = node.parent; p; p = p.parent) if (!p.visible) return;

      // How far up the fade this landmark has come, from any part of it.
      let shown = 0;
      node.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m) continue;
          const value = level(m);
          if (value !== null) shown = Math.max(shown, value);
        }
      });

      if (shown < 0.5) return;
      showing++;
      if (BIG.has(node.userData.kind as string)) planets++;
    });

    mostAtOnce = Math.max(mostAtOnce, showing);
    mostPlanetsAtOnce = Math.max(mostPlanetsAtOnce, planets);
    totalSeen += showing;
    samples++;
  }

  for (const [id, shown] of current) {
    const before = previous.get(id);
    if (before === undefined) continue;
    worstStep = Math.max(worstStep, Math.abs(shown - before));
  }
  previous = current;

  for (const kind of fields.nearby) seenRegions.add(kind);
  landmarksMet = seenRegions.size;
}

check(
  brightestFarAway < 0.05,
  `nothing is visible before its fade begins (worst ${(brightestFarAway * 100).toFixed(1)}% at ${brightestFarAwayAt.toFixed(0)})`,
);
// Half a second per sample, and the fade is meant to take the better part of a
// minute, so an honest step is under a hundredth. A pop is a whole one.
check(
  worstStep < 0.05,
  `nothing lurches into view (worst step ${(worstStep * 100).toFixed(1)}% in half a second)`,
);
check(bestLevel > 0.9, `landmarks do finish arriving (best ${(bestLevel * 100).toFixed(0)}%)`);
check(landmarksMet > 1, `the flight met something to measure (${landmarksMet} kinds)`);

const averageInView = totalSeen / Math.max(samples, 1);

check(mostAtOnce <= 6, `the sky never gets crowded (at most ${mostAtOnce} clearly in view)`);
check(
  mostPlanetsAtOnce <= 2,
  `and never turns into a solar system (at most ${mostPlanetsAtOnce} planets clearly in view)`,
);
// The other way round is just as wrong: an empty sector is not restful, it is
// nothing. There has to be something out there to come across.
check(
  averageInView > 0.8,
  `but there is still something to find (${averageInView.toFixed(1)} clearly in view on average)`,
);

console.log(`  clearly in view            ${averageInView.toFixed(1)} average, ${mostAtOnce} at most`);
console.log(`  planets clearly in view    ${mostPlanetsAtOnce} at most`);
console.log(`  brightest beyond the fade  ${(brightestFarAway * 100).toFixed(1)}%`);
console.log(`  worst brightness step      ${(worstStep * 100).toFixed(1)}% per half second`);
console.log(`  reaches                    ${(bestLevel * 100).toFixed(0)}% up close`);
console.log(`  kinds of landmark met      ${landmarksMet}`);

// And the reach itself: a landmark has to exist long before it is drawn, or
// there is nothing for the fade to happen during.
{
  /*
    The distance a landmark is *guaranteed* to be generated at, which is what
    has to clear the fade — not the streaming radius, which is only where the
    furthest one might be.

    A region enters the live set the moment the pilot crosses into the region
    `landmarkRadius` before it. At that instant the pilot is at the near edge of
    their own region and the new region's near face is `landmarkRadius` regions
    ahead, with its landmark at least a fifth of a region further in. Anything
    closer than that already existed.
  */
  const guaranteed =
    FIELD.landmarkRadius * FIELD.regionSize + 0.2 * FIELD.regionSize;
  check(
    guaranteed > FIELD.fadeStart,
    `landmarks exist before they start to show (guaranteed by ${guaranteed}, shows from ${FIELD.fadeStart})`,
  );
  check(
    FIELD.fadeStart > FIELD.fadeFull,
    "the fade runs from far to near",
  );
  // At cruise, how long the approach lasts. Short enough and it is still a pop.
  const seconds = (FIELD.fadeStart - FIELD.fadeFull) / speed;
  check(seconds > 25, `the approach takes its time (${seconds.toFixed(0)}s at cruise)`);
  console.log(`  approach lasts             ${seconds.toFixed(0)}s at cruise`);
  console.log(`  exists by                  ${guaranteed}, shows from ${FIELD.fadeStart}`);
}

fields.dispose();

if (failures.length > 0) {
  console.error(`\nApproach check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\n${passed} approach checks passed. Nothing large arrives without warning.`);
