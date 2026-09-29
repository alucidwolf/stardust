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
  }

  /**
   * How far off the baseline the waves are asking to be, at time `t`.
   *
   * Four periods, none a simple multiple of another, so their sum does not
   * repeat within any session anybody will sit through.
   *
   * The amplitudes are small and deliberately so. They started five times
   * larger, from a version where the autopilot was the only thing flying and
   * a heading nobody had chosen could swing as far as it liked. Once letting
   * go of the stick meant *keeping* the heading you had just set, a wander
   * that wide stopped reading as drift and started reading as the ship
   * disagreeing with you — better than steering back to the start, but only
   * just. A turn should still be there half a minute later.
   *
   * Together these swing the heading about forty degrees either side over the
   * course of several minutes, at well under a degree a second.
   */
  private wave(t: number): { yaw: number; pitch: number } {
    return {
      yaw:
        Math.sin(t * 0.035 + this.phase[0]!) * 0.22 +
        Math.sin(t * 0.0075 + this.phase[1]!) * 0.5,
      pitch:
        Math.sin(t * 0.029 + this.phase[2]!) * 0.1 +
        Math.sin(t * 0.011 + this.phase[3]!) * 0.07,
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
