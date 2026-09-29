import * as THREE from "three";
import { FLIGHT } from "../core/config";
import type { SteerCommand } from "../flight/pilot";

/**
 * The arrow keys, as maths.
 *
 * This lives in its own file so that its signs can be tested against which way
 * the unit actually ends up going on screen, rather than against which way a
 * number went. Currents learned that the hard way and then wrote it down, and
 * Stardust reproduced the same bug anyway:
 *
 * `forward` is `(sin yaw, ·, cos yaw)`, so a larger yaw swings toward **+X**.
 * Screen right is `cross(forward, up)`, which at yaw zero is **−X**. A larger
 * yaw therefore turns the unit *left*, and a right arrow that adds to yaw
 * sends you the wrong way.
 *
 * It is worth being clear about why this survived a check that existed
 * specifically to catch it. The keys originally ran at the full pointer turn
 * rate, so six seconds of holding one swung the unit through nearly three
 * hundred degrees — most of a circle. The test measured net displacement
 * against screen right, and a unit that has come most of the way round a
 * circle is displaced in a direction that has very little to do with which way
 * it first turned. The measurement was reading a lap, not a turn, and it
 * happened to come out positive. Slowing the keys to a trim shortened the arc
 * to sixty-five degrees, and the sign that had been wrong all along became the
 * only thing the number could be describing.
 *
 * The cursor never had this problem, in either project, because it derives its
 * heading from a world-space direction and is correct by construction whichever
 * way the signs run.
 */
export function trimCommand(
  yaw: number,
  pitch: number,
  /** Eased arrow axis: +1 is right, −1 is left. */
  steerX: number,
  /** Eased arrow axis: +1 is up, −1 is down. */
  steerY: number,
  turnScale: number,
): SteerCommand {
  return {
    // Subtracted, not added. See above.
    yaw: yaw - steerX * 0.9,
    pitch: THREE.MathUtils.clamp(
      pitch + steerY * 0.6,
      -FLIGHT.maxPitch,
      FLIGHT.maxPitch,
    ),
    turnRate: FLIGHT.trimRate * turnScale,
  };
}
