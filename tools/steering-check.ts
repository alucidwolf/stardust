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
import { FLIGHT } from "../src/core/config";
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
    // The same shape main.ts uses for the keys: a heading offset from where
    // the unit is now, rate limited by the pilot itself.
    pilot.update(i * DT, i * DT, {
      yaw: pilot.yaw + steerX * 0.9,
      pitch: THREE.MathUtils.clamp(
        pilot.pitch + steerY * 0.6,
        -FLIGHT.maxPitch,
        FLIGHT.maxPitch,
      ),
      turnRate: FLIGHT.turnRate,
    });
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

  // The threshold follows from the design rather than from taste. The faster
  // of the two heading waves has a period of about two and a half minutes, so
  // twenty minutes is roughly eight cycles and sixteen changes of direction.
  // Anything above about six proves it is oscillating rather than committed;
  // demanding far more would only be demanding a twitchier autopilot than the
  // one that was wanted.
  check(reversals > 6, `it turns both ways (${reversals} reversals)`);

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

  console.log(`  net turn       ${turns.toFixed(1)} turns, ${reversals} reversals`);
  console.log(`  heading spread ${THREE.MathUtils.radToDeg(spread).toFixed(0)}°`);
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
      turnRate: FLIGHT.turnRate,
    });
  }

  const steeredHeading = pilot.forward(new THREE.Vector3()).clone();
  const turnedBy = startHeading.angleTo(steeredHeading);
  check(turnedBy > 0.5, `steering actually changed the heading (${THREE.MathUtils.radToDeg(turnedBy).toFixed(0)}°)`);

  // Let go, and give it thirty seconds to misbehave.
  const t0 = steerSteps * DT;
  const coastSteps = Math.round(30 / DT);
  for (let i = 0; i < coastSteps; i++) {
    const t = t0 + i * DT;
    pilot.update(DT, t, autopilot.update(t, pilot, 1));
  }

  const after = pilot.forward(new THREE.Vector3());
  const driftedFromSteered = after.angleTo(steeredHeading);
  const backToStart = after.angleTo(startHeading);

  // It is allowed to wander — that is the whole point of it — but it must
  // wander from where it was left, not back to where it began.
  check(
    backToStart > turnedBy * 0.6,
    `it does not creep back to the original heading (${THREE.MathUtils.radToDeg(backToStart).toFixed(0)}° away, was ${THREE.MathUtils.radToDeg(turnedBy).toFixed(0)}°)`,
  );
  check(
    driftedFromSteered < 1.2,
    `it holds roughly the heading it was given (${THREE.MathUtils.radToDeg(driftedFromSteered).toFixed(0)}° of drift in thirty seconds)`,
  );

  console.log(`  steered to     ${THREE.MathUtils.radToDeg(turnedBy).toFixed(0)}° off the start`);
  console.log(`  thirty seconds later, ${THREE.MathUtils.radToDeg(driftedFromSteered).toFixed(0)}° from where it was left`);
  console.log(`  and still      ${THREE.MathUtils.radToDeg(backToStart).toFixed(0)}° off the start`);
}

console.log("\nthe units");
{
  // Each unit's turn scale has to actually reach it. A scale nothing reads is
  // a number in a table pretending to be a design decision.
  for (const unit of UNITS) {
    const pilot = new Pilot();
    for (let i = 0; i < 240; i++) {
      pilot.update(DT, i * DT, {
        yaw: pilot.yaw + 0.9,
        pitch: 0,
        turnRate: FLIGHT.turnRate * unit.turnScale,
      });
    }
    const turned = Math.abs(pilot.yaw);
    check(turned > 0.2, `${unit.name} turns when asked`);
    console.log(`  ${unit.name.padEnd(12)} ${THREE.MathUtils.radToDeg(turned).toFixed(0)}° in four seconds`);
  }
}

if (failures.length > 0) {
  console.error(`\nSteering check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\n${passed} steering checks passed. Every control goes the way it looks.`);
