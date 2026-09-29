import * as THREE from "three";
import { CAMERA, POINTER } from "../core/config";
import { angleDelta } from "../flight/pilot";
import type { Pilot } from "../flight/pilot";
import type { Input } from "./input";

/**
 * The camera, which belongs behind your unit.
 *
 * It sits behind and a little above, and it trails: through a turn it swings
 * round late rather than staying welded in place, which is most of what makes
 * a turn feel like the unit moved rather than the world did.
 *
 * A drag moves it and it stays where it is put — orbiting is for looking at
 * your unit, and a camera that crept back to centre would be fighting you. The
 * right button brings it back behind, on the press rather than after the hold,
 * because reaching for the steering button is exactly the moment you want to
 * see where you are going, and the swing costs nothing if the press turns out
 * to be a click that never steers.
 *
 * There is no seabed here and no surface, so unlike Currents' rig this one has
 * nothing to avoid. What it does have is a unit whose size varies a great deal
 * — a freighter is not an interceptor — so the distance has a floor per unit
 * rather than one number for all of them.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  /** Orbit relative to the unit's own heading, so it trails through turns. */
  private orbitYaw = 0;
  private orbitPitch = 0.16;
  private distance: number = CAMERA.distance;

  /** Seconds left of the swing back behind the unit; 0 when not swinging. */
  private recentering = 0;
  private recenterFrom = 0;

  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      aspect,
      CAMERA.near,
      CAMERA.far,
    );
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** A floor on the distance, so a big unit is not framed from inside it. */
  ensureRoomFor(viewDistance: number): void {
    this.distance = Math.max(this.distance, viewDistance);
  }

  /** Put it straight behind, with no swing. For the opening frame. */
  snapBehind(): void {
    this.orbitYaw = 0;
    this.recentering = 0;
  }

  update(dt: number, input: Input, pilot: Pilot): void {
    // --- The pilot's own input ----------------------------------------------
    if (input.dragX !== 0 || input.dragY !== 0) {
      this.orbitYaw -= input.dragX * POINTER.orbitPerPixel;
      this.orbitPitch = THREE.MathUtils.clamp(
        this.orbitPitch + input.dragY * POINTER.orbitPerPixel,
        -0.9,
        1.05,
      );
      // A drag is a decision. It cancels a swing already under way rather than
      // fighting it for the next second.
      this.recentering = 0;
    }

    if (input.wheel !== 0) {
      this.distance = THREE.MathUtils.clamp(
        this.distance * (1 + Math.sign(input.wheel) * POINTER.zoomPerNotch),
        CAMERA.minDistance,
        CAMERA.maxDistance,
      );
    }

    if (input.recenter && Math.abs(this.orbitYaw) > 1e-3) {
      this.recentering = CAMERA.recenter;
      this.recenterFrom = this.orbitYaw;
    }

    // --- The swing back ------------------------------------------------------
    if (this.recentering > 0) {
      this.recentering = Math.max(0, this.recentering - dt);
      const t = 1 - this.recentering / CAMERA.recenter;
      // Eased, and toward zero rather than by a step, so it arrives rather than
      // stops. Whole turns wound up by a long drag unwind with it.
      const eased = t * t * (3 - 2 * t);
      this.orbitYaw = this.recenterFrom * (1 - eased);
      if (this.recentering === 0) this.orbitYaw = 0;
    }

    // --- Where it wants to be ------------------------------------------------
    // Behind the unit, in the unit's own frame, so it follows the heading.
    const yaw = pilot.yaw + this.orbitYaw;
    const pitch = THREE.MathUtils.clamp(pilot.pitch * 0.45 + this.orbitPitch, -0.95, 1.1);

    const cp = Math.cos(pitch);
    this.offset.set(
      -Math.sin(yaw) * cp,
      Math.sin(pitch),
      -Math.cos(yaw) * cp,
    );

    this.desired
      .copy(pilot.position)
      .addScaledVector(this.offset, this.distance)
      .addScaledVector(UP, CAMERA.height * 0.18);

    // Trailing rather than welded. Framerate-independent easing: the same
    // fraction of the remaining gap per second however many frames there are.
    const follow = 1 - Math.exp(-CAMERA.follow * dt);
    this.camera.position.lerp(this.desired, follow);

    // Look slightly ahead of the unit rather than at it, so the unit sits a
    // little low in frame and there is sky in front of where you are going.
    pilot.forward(this.lookAt).multiplyScalar(this.distance * 0.22).add(pilot.position);
    this.camera.lookAt(this.lookAt);

    // Roll the camera a fraction of the unit's bank. The full amount is
    // nauseating and none of it makes a turn feel weightless.
    this.camera.rotateZ(pilot.roll * 0.16);
  }

  /** How far the camera is from the unit, for the depth of field's focus. */
  focusDistance(pilot: Pilot): number {
    return this.camera.position.distanceTo(pilot.position);
  }

  /** True once the camera is roughly behind the unit again. */
  get isBehind(): boolean {
    return Math.abs(angleDelta(this.orbitYaw, 0)) < 0.08;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
