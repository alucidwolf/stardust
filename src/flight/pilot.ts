import * as THREE from "three";
import { FLIGHT } from "../core/config";

const TWO_PI = Math.PI * 2;

/** Shortest signed angular difference from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

export interface SteerCommand {
  yaw: number;
  pitch: number;
  /** Radians per second this command is allowed to turn at. */
  turnRate: number;
}

/**
 * Where you are and which way you are pointing.
 *
 * Heading is yaw and pitch rather than a quaternion, for the same reasons it
 * was in Currents: both steering sources naturally produce a direction, rate
 * limiting is trivial on scalars, and gimbal lock is unreachable because pitch
 * is clamped well short of vertical. Roll is presentation only — derived from
 * how hard you are turning, never integrated, so it can never wind up.
 *
 * What is gone from the Currents version is every hard clamp. There is no
 * seabed to skim and no surface to break, so the pilot goes where it is
 * pointed. The pitch limit stays, because a unit that can loop is a flight
 * model, and this is a drift.
 */
export class Pilot {
  readonly position = new THREE.Vector3();
  readonly object = new THREE.Group();

  yaw = 0;
  pitch = 0;
  roll = 0;

  /**
   * The current unit's cruise multiplier.
   *
   * It lives here, on the one thing that actually moves, and `speed` below is
   * the finished number with it already in. That is deliberate: it used to be
   * applied by each caller that wanted it — the readout multiplied by it, the
   * engine glow multiplied by it — and the one place that mattered, the line
   * that advances the position, did not. Every unit flew at exactly the same
   * speed while the instruments confidently reported four different ones.
   *
   * One number, read by everybody, is the only arrangement where they cannot
   * disagree.
   */
  speedScale = 1;

  speed: number = FLIGHT.cruiseSpeed;

  /** How hard it is turning right now, for the engines and the speed streaks. */
  turnEffort = 0;

  constructor() {
    this.object.position.copy(this.position);
  }

  /** Unit heading vector. Allocates nothing. */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  update(dt: number, elapsed: number, command: SteerCommand): void {
    // --- Turn toward the commanded heading, rate limited ---------------------
    const maxTurn = command.turnRate * dt;

    const yawError = angleDelta(this.yaw, command.yaw);
    const yawStep = THREE.MathUtils.clamp(yawError, -maxTurn, maxTurn);
    this.yaw += yawStep;

    const pitchError = command.pitch - this.pitch;
    const pitchStep = THREE.MathUtils.clamp(pitchError, -maxTurn, maxTurn);
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + pitchStep,
      -FLIGHT.maxPitch,
      FLIGHT.maxPitch,
    );

    // --- Bank into the turn --------------------------------------------------
    // Roll follows yaw *rate*, so a unit leans while turning and levels the
    // moment it stops. Eased, or a sharp input makes it twitch.
    const yawRate = dt > 0 ? yawStep / dt : 0;
    const targetRoll = THREE.MathUtils.clamp(
      -yawRate * FLIGHT.bankStrength,
      -FLIGHT.maxBank,
      FLIGHT.maxBank,
    );
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 3.4);

    // Effort is what the engines and the speed streaks read, and it eases down
    // rather than cutting out, so a streak does not vanish mid-frame.
    const effort = Math.min(1, Math.abs(yawRate) / Math.max(command.turnRate, 1e-3));
    this.turnEffort += (effort - this.turnEffort) * Math.min(1, dt * 2.6);

    // --- Cruise --------------------------------------------------------------
    // A slow sine on speed keeps long stretches from looking metronomic.
    const breath = Math.sin((elapsed / FLIGHT.speedBreathPeriod) * TWO_PI);
    this.speed =
      FLIGHT.cruiseSpeed * this.speedScale * (1 + breath * FLIGHT.speedBreathAmount);

    this.position.addScaledVector(this.forward(SCRATCH), this.speed * dt);

    // --- Present -------------------------------------------------------------
    this.object.position.copy(this.position);
    // Yaw, then pitch, then roll, applied in that order so the bank happens
    // around the unit's own nose-to-tail line rather than around the world's.
    this.object.rotation.set(0, 0, 0);
    this.object.rotateY(this.yaw);
    this.object.rotateX(-this.pitch);
    this.object.rotateZ(this.roll);
  }
}

const SCRATCH = new THREE.Vector3();
