import * as THREE from "three";
import { PALETTE } from "../core/config";
import { mulberry32 } from "../core/rng";

/**
 * Speed lines: short streaks aligned with where you are going.
 *
 * The design asks for these, and is specific about when: "only a few, and only
 * while you're turning or boosting". Both halves matter. A few, because a
 * screenful of them is a warp tunnel and this is a drift; and only under
 * effort, because streaks that are always there stop being a signal and become
 * the texture of space itself.
 *
 * They are line segments rather than stretched quads. A streak is one pixel
 * wide by definition — it is a light smeared by motion — and a quad wide enough
 * to see the width of is no longer a streak.
 *
 * Every streak lives in a shell around the camera and is respawned rather than
 * moved: one that leaves the shell is put back on the far side at a fresh
 * angle. Nothing here is simulated, because a streak's whole life is shorter
 * than the time it would take to notice it had one.
 */

/** As many as can be on screen at once. */
const COUNT = 42;

export class Streaks {
  readonly lines: THREE.LineSegments;

  private readonly material: THREE.LineBasicMaterial;
  private readonly positions: Float32Array;
  private readonly seeds: Float32Array;
  private readonly rng: () => number;

  /** Radius of the shell streaks are drawn in, around the camera. */
  private readonly radius = 34;

  constructor(scene: THREE.Scene, seed: number) {
    this.rng = mulberry32(seed ^ 0x5354);

    // Two ends per streak.
    this.positions = new Float32Array(COUNT * 6);
    this.seeds = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) this.place(i);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));

    this.material = new THREE.LineBasicMaterial({
      color: PALETTE.starCool,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.lines = new THREE.LineSegments(geometry, this.material);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  /** Put streak `i` somewhere on the shell, pointing nowhere in particular yet. */
  private place(i: number): void {
    const u = this.rng() * 2 - 1;
    const theta = this.rng() * Math.PI * 2;
    const ring = Math.sqrt(Math.max(0, 1 - u * u));
    // Spread through the shell's thickness rather than on its surface, so they
    // do not all arrive at once.
    const r = this.radius * (0.35 + this.rng() * 0.65);

    this.seeds[i * 3] = Math.cos(theta) * ring * r;
    this.seeds[i * 3 + 1] = u * r * 0.8;
    this.seeds[i * 3 + 2] = Math.sin(theta) * ring * r;
  }

  /**
   * `effort` is how hard the pilot is working — turning, boosting, or both.
   *
   * The streaks trail *backwards* along the direction of travel, which is the
   * only orientation that reads as speed: a streak across the direction of
   * travel reads as rain.
   */
  update(
    cameraPosition: THREE.Vector3,
    heading: THREE.Vector3,
    effort: number,
    dt: number,
  ): void {
    // Eased, so they arrive and leave rather than switching on. Below a
    // threshold they are not drawn at all, which is what keeps them an event.
    const target = Math.max(0, effort - 0.12) * 0.5;
    this.material.opacity += (target - this.material.opacity) * Math.min(1, dt * 3.2);

    if (this.material.opacity < 0.004) {
      this.lines.visible = false;
      return;
    }
    this.lines.visible = true;

    // Longer the harder you are pushing, which is the part that actually reads
    // as acceleration — more streaks would just read as more weather.
    const length = 3 + effort * 16;

    for (let i = 0; i < COUNT; i++) {
      const x = cameraPosition.x + this.seeds[i * 3]!;
      const y = cameraPosition.y + this.seeds[i * 3 + 1]!;
      const z = cameraPosition.z + this.seeds[i * 3 + 2]!;

      this.positions[i * 6] = x;
      this.positions[i * 6 + 1] = y;
      this.positions[i * 6 + 2] = z;
      this.positions[i * 6 + 3] = x - heading.x * length;
      this.positions[i * 6 + 4] = y - heading.y * length;
      this.positions[i * 6 + 5] = z - heading.z * length;
    }

    (this.lines.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate =
      true;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.material.dispose();
  }
}
