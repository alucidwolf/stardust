import * as THREE from "three";
import { FLIGHT } from "../core/config";
import { mulberry32 } from "../core/rng";
import type { Pilot, SteerCommand } from "./pilot";

/**
 * Flying itself, when you let go.
 *
 * The rule inherited from Currents' wander is that left alone this has to stay
 * interesting indefinitely, and the failure it guards against is a unit that
 * settles into a circle. A constant turn is the natural resting state of any
 * naive version — pick a random heading offset, ease toward it, repeat — and
 * because the easing never quite arrives, the offset never fully spends and
 * the thing orbits forever.
 *
 * So the heading is a sum of slow sine waves at unrelated periods rather than
 * a target chased with a spring. Sines cannot wind up, the periods are chosen
 * not to share a common multiple within any session anybody will sit through,
 * and the result drifts without ever settling.
 *
 * On top of that, a long slow bias toward the plane you started in, so a
 * session that runs for hours does not end up somewhere the debris fields are
 * not generated.
 */
export class Autopilot {
  private readonly phase: number[];

  constructor(seed: number) {
    const rng = mulberry32(seed ^ 0x4155);
    // Each wave starts somewhere different, so two sectors with the same seed
    // for other purposes do not fly identically.
    this.phase = [rng(), rng(), rng(), rng()].map((v) => v * Math.PI * 2);
  }

  update(elapsed: number, pilot: Pilot, turnScale: number): SteerCommand {
    // Four periods, none a simple multiple of another.
    const yaw =
      Math.sin(elapsed * 0.041 + this.phase[0]!) * 1.5 +
      Math.sin(elapsed * 0.017 + this.phase[1]!) * 2.4;

    let pitch =
      Math.sin(elapsed * 0.029 + this.phase[2]!) * 0.16 +
      Math.sin(elapsed * 0.011 + this.phase[3]!) * 0.1;

    // The gentle pull back toward the lane. Proportional to how far off it is,
    // and weak enough that it never reads as a correction.
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
