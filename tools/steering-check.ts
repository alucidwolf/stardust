/**
 * Headless check that every control goes the way it looks.
 *
 * This exists because of a bug Currents shipped and then wrote down, and the
 * write-up is worth repeating because the trap is still here.
 *
 * Left and right shipped inverted. The change had been checked — by holding
 * right and watching the yaw number go up, which it did — but nobody asked
 * what a larger yaw does *on screen*. `forward` is `(sin yaw, ·, cos yaw)`, so
 * a larger yaw swings toward +X, while screen right is `cross(forward, up)`,
 * which is −X. A larger yaw turns you *left*.
 *
 * So this deliberately never looks at yaw. It presses each key, steps the real
 * pilot, and asks which way the unit actually moved relative to where the
 * screen's right and up were pointing at the start. Yaw is the number that
 * lied, so yaw is not allowed to testify.
 *
 * It also checks the autopilot, for the failure that version has: a naive
 * wander settles into a circle, because the offset it eases toward never quite
 * arrives and so never quite spends. A unit that flies in a slow permanent
 * left-hand circle looks fine for thirty seconds and absurd after five minutes.
 *
 * Run with:  npm run verify:steering
 */

import * as THREE from "three";
import { CAMERA, FLIGHT } from "../src/core/config";
import { CameraRig } from "../src/control/cameraRig";
import type { Input } from "../src/control/input";
import { trimCommand } from "../src/control/steering";
import { Autopilot } from "../src/flight/autopilot";
import { Pilot } from "../src/flight/pilot";
import { UNITS } from "../src/units/units";

const failures: string[] = [];
let passed = 0;
function check(condition: boolean, name: string): void {
  if (condition) passed++;
  else failures.push(name);
}

const DT = 1 / 60;

/** Declared up here rather than beside its use: `fly` runs before the bottom
 * of this file is reached, and a `const` is not hoisted into life, only into
 * scope. */
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A pilot with their hands off everything.
 *
 * The camera rig reads input whether or not there is any, so the autopilot
 * case needs something to read. Everything is zero and nothing is held, which
 * is precisely the state being tested.
 */
function stubInput(): Input {
  return {
    dragX: 0,
    dragY: 0,
    wheel: 0,
    steering: false,
    recenter: false,
    steerX: 0,
    steerY: 0,
    keySteering: false,
    boosting: false,
    ndcX: 0,
    ndcY: 0,
    idleTime: 0,
    consume() {},
    tick() {},
    setSteeringEnabled() {},
    dispose() {},
  };
}

/**
 * Fly with a fixed steering intent and report where it went, in screen terms.
 *
 * `axis` is the arrow-key axis: +1 right, -1 left on X; +1 up, -1 down on Y.
 */
function fly(steerX: number, steerY: number, seconds: number) {
  const pilot = new Pilot();

  // The screen's right and up at the moment the key goes down. Everything is
  // measured against these, never against yaw.
  const forward0 = pilot.forward(new THREE.Vector3()).clone();
  const right0 = new THREE.Vector3().crossVectors(forward0, UP).normalize();
  const up0 = new THREE.Vector3().crossVectors(right0, forward0).normalize();
  const start = pilot.position.clone();

  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    // The very function main.ts calls, not a copy of it. A copy is how the
    // signs drift apart again: the test would go on proving something true
    // about a formula nothing ships.
    pilot.update(i * DT, i * DT, trimCommand(pilot.yaw, pilot.pitch, steerX, steerY, 1));
  }

  const travelled = pilot.position.clone().sub(start);
  return {
    pilot,
    right: travelled.dot(right0),
    up: travelled.dot(up0),
    ahead: travelled.dot(forward0),
  };
}

console.log("the arrow keys");
{
  const seconds = 6;

  const right = fly(1, 0, seconds);
  const left = fly(-1, 0, seconds);
  const up = fly(0, 1, seconds);
  const down = fly(0, -1, seconds);

  check(right.right > 3, `right arrow goes right (${right.right.toFixed(1)}m)`);
  check(left.right < -3, `left arrow goes left (${left.right.toFixed(1)}m)`);
  check(up.up > 3, `up arrow climbs (${up.up.toFixed(1)}m)`);
  check(down.up < -3, `down arrow dives (${down.up.toFixed(1)}m)`);

  // Two keys drifting the same way would pass the tests above if the bands
  // were loose enough, so require them to be genuine mirrors of each other.
  const symmetry = Math.abs(right.right + left.right) / Math.abs(right.right);
  check(symmetry < 0.1, `left and right mirror each other (off by ${(symmetry * 100).toFixed(1)}%)`);

  console.log(`  right arrow   ${right.right.toFixed(1)}m to screen right`);
  console.log(`  left arrow    ${left.right.toFixed(1)}m to screen right`);
  console.log(`  up arrow      ${up.up.toFixed(1)}m up`);
  console.log(`  down arrow    ${down.up.toFixed(1)}m up`);

  // Nothing loops. Pitch is clamped well short of vertical and must stay there
  // however long the key is held.
  const long = fly(0, 1, 60);
  check(
    Math.abs(long.pilot.pitch) <= FLIGHT.maxPitch + 1e-6,
    `a minute of up never passes the pitch limit (${long.pilot.pitch.toFixed(3)})`,
  );

  // Banking follows turn rate, so it must appear in a turn and be gone out of
  // one. A roll that integrated would still be leaning a minute later.
  check(Math.abs(right.pilot.roll) > 0.05, "a turn banks the unit");
  const straight = fly(0, 0, 8);
  check(Math.abs(straight.pilot.roll) < 0.02, "flying straight levels the wings");
}

console.log("\nthe autopilot");
{
  // Twenty minutes, sampled. Long enough that a circle would have closed many
  // times over.
  const pilot = new Pilot();
  const autopilot = new Autopilot(20250928);
  const headings: THREE.Vector3[] = [];
  const start = pilot.position.clone();

  const steps = Math.round((20 * 60) / DT);
  for (let i = 0; i < steps; i++) {
    const t = i * DT;
    pilot.update(DT, t, autopilot.update(t, pilot, 1));
    if (i % 600 === 0) headings.push(pilot.forward(new THREE.Vector3()).clone());
  }

  // The real test, and the one that catches the failure this design exists to
  // avoid: does the heading *wind up*?
  //
  // A naive wander eases toward a target it never quite reaches, so the
  // remaining error never fully spends and the unit turns the same way
  // forever. That shows as yaw accumulating monotonically — thousands of
  // degrees in one direction — while the unit traces a slow permanent circle.
  //
  // Displacement is deliberately *not* the measure. A wanderer is a random
  // walk, and a random walk's displacement grows as the square root of the
  // distance flown, so a perfectly healthy drift covers only a few percent of
  // the ground it travels. Testing that number would have failed a good
  // autopilot and passed a circling one that happened to have a wide radius.
  let netYaw = 0;
  let reversals = 0;
  let lastSign = 0;
  {
    const probe = new Pilot();
    const probeAuto = new Autopilot(20250928);
    let previous = probe.yaw;
    for (let i = 0; i < steps; i++) {
      const t = i * DT;
      probe.update(DT, t, probeAuto.update(t, probe, 1));
      const step = probe.yaw - previous;
      previous = probe.yaw;
      netYaw += step;
      const sign = Math.sign(step);
      if (sign !== 0 && lastSign !== 0 && sign !== lastSign) reversals++;
      if (sign !== 0) lastSign = sign;
    }
  }

  const turns = Math.abs(netYaw) / (Math.PI * 2);
  check(turns < 6, `the heading never winds up (${turns.toFixed(1)} net turns in twenty minutes)`);

  // The threshold follows from the design rather than from taste, and it has
  // to be recomputed whenever the waves change — which is the whole reason to
  // write the arithmetic down rather than just the number.
  //
  // The three heading waves now run at periods of about five, thirteen and
  // twenty-eight minutes. Over twenty minutes the fastest turns over about
  // four times, and the slower two mostly bias which way it is going rather
  // than reversing it, so half a dozen changes of direction is what this
  // design produces and does not indicate anything wrong.
  //
  // What the check is really asking is whether the heading ever changes its
  // mind at all. A unit circling has one sign for twenty minutes flat.
  check(reversals > 3, `it turns both ways (${reversals} reversals)`);

  // And it should still actually get somewhere, rather than being pinned.
  const displacement = pilot.position.distanceTo(start);
  check(displacement > 400, `it does not stay put (${displacement.toFixed(0)} from the start)`);

  // And it should actually turn — a unit that never deviates is not wandering
  // either, it is just pointed.
  let spread = 0;
  for (const a of headings) for (const b of headings) spread = Math.max(spread, a.angleTo(b));
  check(spread > 0.6, `it changes its mind along the way (${THREE.MathUtils.radToDeg(spread).toFixed(0)}° spread)`);

  // The lane bias: over that long it should not have wandered off into
  // nothing vertically, because the debris fields are not generated up there.
  check(
    Math.abs(pilot.position.y) < 1200,
    `it stays in the lane (${pilot.position.y.toFixed(0)} off centre)`,
  );

  /*
    And it has to actually explore.

    This is the other half of the same design, and it has been wrong in both
    directions. A wander that swings far and fast reads as the ship
    disagreeing with the pilot; a wander cut back until it is gentle can end up
    fenced into a narrow cone it never leaves, flying very nearly straight for
    ever. The second is harder to notice, because for the first minute it looks
    exactly like calm.

    So: over twenty minutes the nose has to have pointed somewhere genuinely
    different from where it started, and it has to have covered a wide arc on
    the way. Neither number is about speed — the rate is tested separately,
    below.
  */
  const furthest = headings.reduce(
    (worst, h) => Math.max(worst, headings[0]!.angleTo(h)),
    0,
  );
  check(
    furthest > 1.4,
    `it goes somewhere new (${THREE.MathUtils.radToDeg(furthest).toFixed(0)}° from the opening heading at its furthest)`,
  );
  check(
    spread > 2.0,
    `it covers a wide arc (${THREE.MathUtils.radToDeg(spread).toFixed(0)}° spread)`,
  );

  // Gently, though. However far it goes, it may never get there quickly.
  let fastest = 0;
  {
    const probe = new Pilot();
    const probeAuto = new Autopilot(20250928);
    let previous = probe.yaw;
    for (let i = 0; i < steps; i++) {
      const t = i * DT;
      probe.update(DT, t, probeAuto.update(t, probe, 1));
      fastest = Math.max(fastest, Math.abs(probe.yaw - previous) / DT);
      previous = probe.yaw;
    }
  }
  const fastestDeg = THREE.MathUtils.radToDeg(fastest);
  check(fastestDeg < 4, `and never hurries (peak ${fastestDeg.toFixed(1)}°/s)`);

  console.log(`  net turn       ${turns.toFixed(1)} turns, ${reversals} reversals`);
  console.log(`  heading spread ${THREE.MathUtils.radToDeg(spread).toFixed(0)}°`);
  console.log(`  furthest from opening heading ${THREE.MathUtils.radToDeg(furthest).toFixed(0)}°`);
  console.log(`  peak turn rate ${fastestDeg.toFixed(1)}°/s`);
  console.log(`  displacement   ${displacement.toFixed(0)}`);
  console.log(`  drift off lane ${pilot.position.y.toFixed(0)}`);
}

console.log("\nletting go");
{
  /*
    The heading you steered to has to survive the handover.

    This is a regression test for a real bug. The autopilot's waves originally
    described an absolute heading rather than a deviation, so releasing the
    stick handed control to something that immediately steered back to whatever
    bearing its sines were asking for. Every manual turn quietly undid itself a
    few seconds after the button came up, and the ship went back where it
    started — which is not a subtle fault, but is easy to miss in a five-second
    test because it takes a while to unwind.

    So: fly by hand for long enough to be somewhere genuinely different, let
    go, and ask where the heading is half a minute later.
  */
  const pilot = new Pilot();
  const autopilot = new Autopilot(20250928);

  const startHeading = pilot.forward(new THREE.Vector3()).clone();

  // Six seconds of holding right.
  const steerSteps = Math.round(6 / DT);
  for (let i = 0; i < steerSteps; i++) {
    const t = i * DT;
    autopilot.hold(t, pilot);
    pilot.update(DT, t, {
      yaw: pilot.yaw + 0.9,
      pitch: 0,
      turnRate: FLIGHT.trimRate,
    });
  }

  const steeredHeading = pilot.forward(new THREE.Vector3()).clone();
  const turnedBy = startHeading.angleTo(steeredHeading);
  check(turnedBy > 0.5, `steering actually changed the heading (${THREE.MathUtils.radToDeg(turnedBy).toFixed(0)}°)`);

  // Let go, and give it thirty seconds to misbehave.
  const t0 = steerSteps * DT;

  /*
    The invariant is continuity at the handover, not distance from the start.

    An earlier version of this asserted that thirty seconds later the ship was
    still far from the heading it began on. That was a fair test of the bug it
    was written for — an autopilot which steered straight back to its own
    bearing the instant the button came up — but it is the wrong invariant now
    the autopilot is meant to explore. A wander that can eventually point
    anywhere will sometimes wander back past where it started, and failing it
    for that would be failing it for working.

    What must be true is that nothing *jumps*. If the baseline is wrong, the
    error shows up immediately and enormously, because the commanded heading is
    somewhere else entirely and the pilot hauls toward it at its rate limit. One
    second is long enough to catch that and far too short for honest drift to
    account for it.
  */
  const oneSecond = new THREE.Vector3();
  for (let i = 0; i < 1 / DT; i++) {
    const t = t0 + i * DT;
    pilot.update(DT, t, autopilot.update(t, pilot, 1));
  }
  pilot.forward(oneSecond);
  const jump = oneSecond.angleTo(steeredHeading);
  check(
    jump < 0.12,
    `the handover moves nothing (${THREE.MathUtils.radToDeg(jump).toFixed(1)}° in the first second)`,
  );

  // Then the rest of the half minute, drifting as it is meant to.
  for (let i = 0; i < 29 / DT; i++) {
    const t = t0 + 1 + i * DT;
    pilot.update(DT, t, autopilot.update(t, pilot, 1));
  }

  const after = pilot.forward(new THREE.Vector3());
  const driftedFromSteered = after.angleTo(steeredHeading);

  // Gently, and from where it was left. Wide enough to be exploring, narrow
  // enough that the turn you just made is still recognisably the one you made.
  check(
    driftedFromSteered < 1.2,
    `it drifts from where it was left rather than leaping (${THREE.MathUtils.radToDeg(driftedFromSteered).toFixed(0)}° in thirty seconds)`,
  );

  console.log(`  steered to     ${THREE.MathUtils.radToDeg(turnedBy).toFixed(0)}° off the start`);
  console.log(`  first second   ${THREE.MathUtils.radToDeg(jump).toFixed(1)}° — no jump at the handover`);
  console.log(`  thirty seconds later, ${THREE.MathUtils.radToDeg(driftedFromSteered).toFixed(0)}° from where it was left`);
}

console.log("\nthe units, on the arrow keys");
{
  /*
    Each unit's turn scale has to actually reach it — a scale nothing reads is
    a number in a table pretending to be a design decision — and the keys have
    to stay a trim rather than becoming a spin.

    The ceiling is the point of this one. The arrows used to run at the
    pointer's full rate, and four seconds of holding one swung the lightest
    unit through nearly three hundred degrees. That is a pirouette, and it is
    not what an arrow key is for: it adjusts a course, it does not replace it.
  */
  for (const unit of UNITS) {
    const pilot = new Pilot();
    for (let i = 0; i < 240; i++) {
      pilot.update(DT, i * DT, trimCommand(pilot.yaw, pilot.pitch, 1, 0, unit.turnScale));
    }
    const turned = THREE.MathUtils.radToDeg(Math.abs(pilot.yaw));
    check(turned > 8, `${unit.name} answers the arrow keys (${turned.toFixed(0)}°)`);
    check(turned < 90, `${unit.name} trims rather than spinning (${turned.toFixed(0)}°)`);
    console.log(`  ${unit.name.padEnd(12)} ${turned.toFixed(0)}° in four seconds`);
  }
}

console.log("\nthe camera, through a long wander");
{
  /*
    The camera has to stay behind the ship while the autopilot explores.

    It trails on purpose — it swings round late through a turn, which is most
    of what makes a turn feel like the ship moved rather than the world did —
    and a trail is a lag, so the faster and more often the heading changes the
    further behind it falls. That is fine at a gentle drift and would not be at
    any speed; this check is what says which one the autopilot is.

    Measured as the angle between where the ship is pointing and the line from
    the camera to the ship. Zero is directly behind. It is allowed to lag, but
    it may never swing round to the side, and it must never end up in front.
  */
  const pilot = new Pilot();
  const autopilot = new Autopilot(20250928);
  const rig = new CameraRig(16 / 9);
  const input = stubInput();
  rig.snapBehind();

  const toShip = new THREE.Vector3();
  const facing = new THREE.Vector3();
  let worstAngle = 0;
  let worstDistance = 0;
  let closest = Infinity;

  const minutes = 8;
  for (let i = 0; i < (minutes * 60) / DT; i++) {
    const t = i * DT;
    pilot.update(DT, t, autopilot.update(t, pilot, 1));
    rig.update(DT, input, pilot);

    // Skip the first second: the rig starts at the origin and flies to its
    // station, and that one approach is not what this is measuring.
    if (t < 1) continue;

    toShip.copy(pilot.position).sub(rig.camera.position);
    const distance = toShip.length();
    toShip.normalize();
    pilot.forward(facing);

    // Angle between the ship's heading and the direction from camera to ship.
    worstAngle = Math.max(worstAngle, facing.angleTo(toShip));
    worstDistance = Math.max(worstDistance, distance);
    closest = Math.min(closest, distance);
  }

  const worstDeg = THREE.MathUtils.radToDeg(worstAngle);
  check(worstDeg < 45, `the camera stays behind the ship (worst ${worstDeg.toFixed(0)}° off)`);
  check(closest > 6, `and never gets inside it (closest ${closest.toFixed(1)})`);
  check(
    worstDistance < CAMERA.maxDistance,
    `and never falls behind (furthest ${worstDistance.toFixed(1)})`,
  );

  console.log(`  worst off-axis ${worstDeg.toFixed(0)}° over ${minutes} minutes`);
  console.log(`  distance       ${closest.toFixed(1)} to ${worstDistance.toFixed(1)}`);
}

console.log("\nthe boost");
{
  /*
    Shift has to actually move the ship, ease rather than switch, and let go.

    The easing is not decoration: everything that reacts to the boost — the
    engines, the binders, the speed streaks — reads the same continuous number,
    so a boost that snapped between 0 and 1 would make all of them change state
    on a single frame. Nothing in this design is allowed to do that.
  */
  const cruise = new Pilot();
  const pushed = new Pilot();
  const level = { yaw: 0, pitch: 0, turnRate: 0 };

  const seconds = 8;
  for (let i = 0; i < seconds / DT; i++) {
    cruise.update(DT, i * DT, level, false);
    pushed.update(DT, i * DT, level, true);
  }

  const gain = pushed.position.length() / cruise.position.length();
  check(gain > 1.5, `boosting covers more ground (${gain.toFixed(2)}x over eight seconds)`);
  check(gain < FLIGHT.boostScale + 0.02, `and no more than it promises (${gain.toFixed(2)}x, cap ${FLIGHT.boostScale})`);
  check(pushed.boost > 0.97, `it reaches full boost when held (${pushed.boost.toFixed(3)})`);

  // Eased in. A single frame of holding must not arrive at full thrust.
  const nudged = new Pilot();
  nudged.update(DT, 0, level, true);
  check(nudged.boost < 0.2, `one frame of Shift is not full thrust (${nudged.boost.toFixed(3)})`);

  // And it lets go. A boost that never quite returns to zero leaves the
  // engines lit and the streaks drawn for the rest of the session.
  for (let i = 0; i < 4 / DT; i++) pushed.update(DT, i * DT, level, false);
  check(pushed.boost === 0, `it returns to exactly zero on release (${pushed.boost})`);

  console.log(`  gain          ${gain.toFixed(2)}x over eight seconds`);
  console.log(`  release       back to ${pushed.boost} after four seconds`);
}

console.log("\nhow fast each one actually goes");
{
  /*
    Measured as ground covered, never as the number in the table.

    The speed scales used to be applied by each caller that wanted them — the
    readout multiplied by one, the engine glow multiplied by one — and the line
    that advances the position did not. All four units flew exactly the same
    distance while the instruments confidently reported four different speeds.

    A check on `unit.speedScale` would have passed that happily, because the
    data was never wrong; only the behaviour was missing. So this one flies
    each unit in a straight line and measures where it got to.
  */
  const flown = new Map<string, number>();

  for (const unit of UNITS) {
    const pilot = new Pilot();
    pilot.speedScale = unit.speedScale;
    const seconds = 10;
    for (let i = 0; i < seconds / DT; i++) {
      pilot.update(DT, i * DT, { yaw: 0, pitch: 0, turnRate: 0 });
    }
    const distance = pilot.position.length();
    flown.set(unit.id, distance);

    // Within a few percent of cruise × scale × time. The slow breath on speed
    // is the only thing allowed to move it.
    const expected = FLIGHT.cruiseSpeed * unit.speedScale * seconds;
    const off = Math.abs(distance - expected) / expected;
    check(off < 0.1, `${unit.name} flies at its own speed (${distance.toFixed(0)}, expected about ${expected.toFixed(0)})`);
    console.log(`  ${unit.name.padEnd(12)} ${distance.toFixed(0)} in ten seconds  (scale ${unit.speedScale})`);
  }

  // And the fleet has to actually differ in the air, not just on paper.
  const distances = [...flown.values()].sort((a, b) => a - b);
  const range = distances[distances.length - 1]! / distances[0]!;
  check(range > 1.6, `the fastest really outruns the slowest (${range.toFixed(2)}x)`);
  console.log(`  spread        ${range.toFixed(2)}x fastest over slowest`);
}

if (failures.length > 0) {
  console.error(`\nSteering check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\n${passed} steering checks passed. Every control goes the way it looks.`);
