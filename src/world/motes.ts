import * as THREE from "three";
import { PALETTE, SECTOR } from "../core/config";
import { mulberry32 } from "../core/rng";

/**
 * Stardust: the fine particulate drifting through the volume around you.
 *
 * This is the app's namesake and is treated as such — in quiet moments it
 * should be the brightest thing on screen. It is also the only thing that
 * gives a sense of *motion* before there is anything to fly past: stars are
 * effectively fixed, debris is not built yet, and without motes at close range
 * a moving camera in space looks like a still image.
 *
 * Tiny octahedra rather than round points, so each one catches the key light
 * on a facet and the field glitters as you turn rather than sitting there as a
 * flat spray of dots. One instanced mesh for the lot.
 *
 * They wrap around the camera the same way the near glints do, which keeps the
 * density constant out of a fixed count with nothing allocated per frame.
 */
export class Motes {
  readonly mesh: THREE.InstancedMesh;

  private readonly drift: Float32Array;
  private readonly spin: Float32Array;
  private readonly offsets: Float32Array;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();
  private readonly material: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, seed: number, origin: THREE.Vector3) {
    const rng = mulberry32(seed ^ 0x6d74);
    const count = SECTOR.motes;

    // Radius 1 and scaled per instance: one geometry, every size.
    const geometry = new THREE.OctahedronGeometry(1, 0);

    // Basic rather than lambert, on purpose. A mote is smaller than a pixel at
    // any honest distance, so lighting it is spending a normal to compute a
    // colour nobody can resolve; what reads is that it is bright and that it
    // moves. Flat and additive is both cheaper and clearer.
    this.material = new THREE.MeshBasicMaterial({
      color: PALETTE.starWarm,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.InstancedMesh(geometry, this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.offsets = new Float32Array(count * 3);
    this.drift = new Float32Array(count * 3);
    this.spin = new Float32Array(count);

    const radius = SECTOR.moteRadius;

    for (let i = 0; i < count; i++) {
      this.offsets[i * 3] = origin.x + (rng() * 2 - 1) * radius;
      this.offsets[i * 3 + 1] = origin.y + (rng() * 2 - 1) * radius;
      this.offsets[i * 3 + 2] = origin.z + (rng() * 2 - 1) * radius;

      // A slow shared-ish drift with per-mote variation, so the field moves as
      // a body of dust rather than as a thousand independent specks.
      this.drift[i * 3] = (rng() * 2 - 1) * 0.35;
      this.drift[i * 3 + 1] = (rng() * 2 - 1) * 0.12;
      this.drift[i * 3 + 2] = (rng() * 2 - 1) * 0.35;

      this.spin[i] = rng() * Math.PI * 2;

      const size = 0.018 + Math.pow(rng(), 2.4) * 0.075;
      this.scale.setScalar(size);
      this.position.set(
        this.offsets[i * 3]!,
        this.offsets[i * 3 + 1]!,
        this.offsets[i * 3 + 2]!,
      );
      this.euler.set(this.spin[i]!, this.spin[i]! * 1.7, 0);
      this.quaternion.setFromEuler(this.euler);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  /**
   * Drift, turn, and wrap around the camera.
   *
   * Scale is read back out of the existing matrix rather than stored a second
   * time: it never changes after construction, and one array that can disagree
   * with the matrices is one array too many.
   */
  update(dt: number, elapsed: number, cameraPosition: THREE.Vector3): void {
    const count = this.mesh.count;
    const radius = SECTOR.moteRadius;
    const diameter = radius * 2;

    for (let i = 0; i < count; i++) {
      for (const axis of [0, 1, 2] as const) {
        const index = i * 3 + axis;
        let value = this.offsets[index]! + this.drift[index]! * dt;

        const relative = value - cameraPosition.getComponent(axis);
        if (relative > radius) value -= diameter;
        else if (relative < -radius) value += diameter;

        this.offsets[index] = value;
      }

      this.mesh.getMatrixAt(i, this.matrix);
      this.matrix.decompose(this.position, this.quaternion, this.scale);

      this.position.set(
        this.offsets[i * 3]!,
        this.offsets[i * 3 + 1]!,
        this.offsets[i * 3 + 2]!,
      );

      // Slow, and each on its own phase. A whole field turning in step would
      // pulse, and nothing here is allowed to pulse.
      const angle = this.spin[i]! + elapsed * 0.22;
      this.euler.set(angle, angle * 1.7, 0);
      this.quaternion.setFromEuler(this.euler);

      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
