import * as THREE from "three";
import { FLIGHT } from "../core/config";
import { mulberry32 } from "../core/rng";
import type { Pilot, SteerCommand } from "./pilot";

/**
 * Flying itself, when you let go.
 *
 * Two separate ideas, and the second one was missing at first.
 *
 * **It must not settle into a circle.** Left alone this has to stay
 * interesting indefinitely, and a circle is the natural resting state of any
 * naive version — pick a random heading offset, ease toward it, repeat — since
 * the easing never quite arrives, the offset never fully spends, and the thing
 * orbits forever. So the heading is a sum of slow sine waves at unrelated
 * periods rather than a target chased with a spring. Sines cannot wind up.
 *
 * **It must pick up where you left it.** The waves describe a *deviation* from
 * a heading, not a heading. That distinction is the whole of this file's
 * second half, and getting it wrong is not subtle: when the waves gave an
 * absolute heading, letting go of the stick handed control to an autopilot that
 * immediately steered back to whatever bearing its sines happened to be asking
 * for — so every manual turn quietly undid itself a few seconds after the
 * button came up. You could fly wherever you liked and the sector would put you
 * back.
 *
 * So the baseline is re-read from the pilot on every frame they are flying, and
 * the deviation is measured from where the waves stood at that moment. The
 * instant control comes back, the commanded heading *is* the current heading,
 * and it drifts on from there.
 */
export class Autopilot {
  private readonly phase: number[];

  /** The heading control was handed back at. */
  private baseYaw = 0;
  private basePitch = 0;
  /** Where the waves stood at that moment, so there is no step on handover. */
  private baseWaveYaw = 0;
  private baseWavePitch = 0;

  constructor(seed: number) {
    const rng = mulberry32(seed ^ 0x4155);
    // Each wave starts somewhere different, so two sectors with the same seed
    // for other purposes do not fly identically.
    this.phase = [rng(), rng(), rng(), rng()].map((v) => v * Math.PI * 2);

    /*
      Start the deviation from where the waves already are.

      Without this the baseline is zero while the waves are not, so the very
      first command is the full wave value — up to a hundred and ninety degrees
      away — and the ship leaves the launch bay hauling itself round at the
      autopilot's maximum rate to reach a heading nobody asked for. It settles
      after a few seconds and so it reads as a one-off lurch at startup rather
      than as a bug, which is exactly why it survived.
    */
    const opening = this.wave(0);
    this.baseWaveYaw = opening.yaw;
    this.baseWavePitch = opening.pitch;
  }

  /**
   * How far off the baseline the waves are asking to be, at time `t`.
   *
   * Periods chosen not to share a common multiple, so their sum does not
   * repeat within any session anybody will sit through.
   *
   * **Amplitude decides where it can go; frequency decides how fast it gets
   * there.** That separation is the whole design, and the two have been set
   * wrongly in both directions already.
   *
   * The first version swung far and fast, which read as the ship disagreeing
   * with the pilot. The fix cut the amplitudes to a fifth — and cut the wrong
   * thing. It made the turns gentle, but it also fenced the heading into a
   * forty-degree cone it could never leave, so left alone the ship flew in
   * very nearly a straight line for ever and explored nothing.
   *
   * These sum to about two hundred degrees, which is more than half a circle:
   * given long enough the nose can come to point anywhere at all, so the
   * sector genuinely opens up rather than unrolling along one corridor. And
   * because each amplitude is paired with a very low frequency, the fastest
   * the heading can swing is under two degrees a second — slower than the
   * arrow keys by a factor of six, and slow enough that watching it happen is
   * not the same as noticing it happen.
   *
   * The constraint that forced the amplitudes down in the first place is met
   * elsewhere now: steering hands the pilot the stick and keeps it there, so
   * a heading they chose is held exactly until they ask for the autopilot
   * back. This no longer has to be timid in order to be polite.
   */
  private wave(t: number): { yaw: number; pitch: number } {
    return {
      yaw:
        Math.sin(t * 0.021 + this.phase[0]!) * 0.7 +
        Math.sin(t * 0.0083 + this.phase[1]!) * 1.2 +
        Math.sin(t * 0.0037 + this.phase[2]!) * 1.7,
      // Pitch stays small. There is nothing generated far above or below the
      // lane, so a nose that wanders vertically the way the heading does would
      // spend the session climbing out of the sector.
      pitch:
        Math.sin(t * 0.017 + this.phase[3]!) * 0.12 +
        Math.sin(t * 0.0061 + this.phase[0]!) * 0.09,
    };
  }

  /**
   * Take the pilot's heading as the new baseline.
   *
   * Called on every frame the pilot is flying rather than once on release, so
   * there is no handover edge to detect and no way to miss one. A frame where
   * the button came up and went down again between samples still leaves the
   * baseline correct.
   */
  hold(elapsed: number, pilot: Pilot): void {
    const wave = this.wave(elapsed);
    this.baseYaw = pilot.yaw;
    this.basePitch = pilot.pitch;
    this.baseWaveYaw = wave.yaw;
    this.baseWavePitch = wave.pitch;
  }

  update(elapsed: number, pilot: Pilot, turnScale: number): SteerCommand {
    const wave = this.wave(elapsed);

    const yaw = this.baseYaw + (wave.yaw - this.baseWaveYaw);
    let pitch = this.basePitch + (wave.pitch - this.baseWavePitch);

    // The gentle pull back toward the lane. Proportional to how far off it is,
    // and weak enough that it never reads as a correction — but it is the one
    // thing here that is allowed to override where you pointed, because the
    // debris fields are not generated a kilometre above the lane.
    pitch -= THREE.MathUtils.clamp(pilot.position.y / 900, -0.22, 0.22);

    return {
      yaw,
      pitch: THREE.MathUtils.clamp(pitch, -FLIGHT.maxPitch, FLIGHT.maxPitch),
      // Deliberately slower than the pilot's own rate. The autopilot is not
      // trying to be you; it is trying to be restful.
      turnRate: FLIGHT.turnRate * turnScale * 0.4,
    };
  }
}
