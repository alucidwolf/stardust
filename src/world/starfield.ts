import * as THREE from "three";
import { PALETTE, SECTOR } from "../core/config";
import { mulberry32 } from "../core/rng";

/**
 * The stars, in two layers that do different jobs.
 *
 * **The far field** is a dense shell of cool points pinned to the camera. It
 * never gets closer and never parallaxes, because it is meant to be
 * unreachably distant — moving it would immediately tell you how big the
 * sector really is. It is drawn first, with depth writing off, so everything
 * else in the scene sits in front of it without needing to be sorted.
 *
 * **The near layer** is a hundred and fifty warm four-point glints scattered
 * through the volume you are actually flying in. These *do* parallax, and they
 * are the only reason the far field reads as far: a still background behind
 * sliding foreground points is the whole depth cue, and either layer alone
 * gives none of it.
 *
 * Both are one draw call. The far field is a `Points` cloud, and the glints
 * share a single instanced quad, because a four-point star is two triangles
 * and there is no version of this worth a mesh each.
 */

/**
 * The star shape: a four-point glint, drawn in the fragment stage.
 *
 * A sprite would need a texture, and a texture would need loading, decoding
 * and a decision about resolution — for a shape that is two crossed tapers. It
 * is cheaper and sharper to state it as maths.
 */
const GLINT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vFade;

void main() {
  vec2 p = abs( gl_PointCoord - 0.5 ) * 2.0;

  // Two crossed tapers: bright along each axis, falling away fast off it.
  float cross = max( 1.0 - p.x * 5.5 - p.y * 0.55, 1.0 - p.y * 5.5 - p.x * 0.55 );
  // A small core so the centre does not read as a hole where the arms meet.
  float core = 1.0 - smoothstep( 0.0, 0.42, length( p ) );

  float alpha = clamp( max( cross, core * 0.85 ), 0.0, 1.0 ) * vFade;
  if ( alpha < 0.01 ) discard;

  gl_FragColor = vec4( uColor, alpha );
}
`;

const GLINT_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aBright;
varying float vFade;

void main() {
  vec4 view = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * view;

  // Perspective sizing, then a floor: a glint that shrinks to nothing as you
  // pass it twinkles as the rasteriser drops it, and nothing here may flicker.
  gl_PointSize = max( aSize * ( 220.0 / max( -view.z, 1.0 ) ), 1.5 );

  // Fade in from the far clip rather than popping into existence, and fade out
  // again very close to the camera, where a glint would be a blinding square.
  float d = -view.z;
  vFade = aBright * smoothstep( 0.0, 14.0, d ) * ( 1.0 - smoothstep( 160.0, 240.0, d ) );
}
`;

export class Starfield {
  readonly far: THREE.Points;
  readonly near: THREE.Points;

  private readonly farMaterial: THREE.PointsMaterial;
  private readonly nearMaterial: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, seed: number) {
    const rng = mulberry32(seed ^ 0x5741);

    // -- far field ----------------------------------------------------------

    const farPositions = new Float32Array(SECTOR.farStars * 3);
    const farColors = new Float32Array(SECTOR.farStars * 3);
    const cool = new THREE.Color(PALETTE.starCool);
    const warm = new THREE.Color(PALETTE.starWarm);
    const tint = new THREE.Color();

    for (let i = 0; i < SECTOR.farStars; i++) {
      // Even over the sphere, not even in the angles: sampling latitude
      // directly crowds both poles, and a sky with two bald patches and two
      // dense caps is immediately readable as a mistake.
      const u = rng() * 2 - 1;
      const theta = rng() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - u * u));

      farPositions[i * 3] = Math.cos(theta) * r * SECTOR.skyRadius;
      farPositions[i * 3 + 1] = u * SECTOR.skyRadius;
      farPositions[i * 3 + 2] = Math.sin(theta) * r * SECTOR.skyRadius;

      // Mostly cool, a few warm. Uniform colour reads as a texture rather than
      // as stars, and the occasional warm one is what stops that.
      tint.copy(cool).lerp(warm, Math.pow(rng(), 3));
      // Brightness varies far more than colour does.
      const level = 0.28 + Math.pow(rng(), 2.2) * 0.72;
      farColors[i * 3] = tint.r * level;
      farColors[i * 3 + 1] = tint.g * level;
      farColors[i * 3 + 2] = tint.b * level;
    }

    const farGeometry = new THREE.BufferGeometry();
    farGeometry.setAttribute("position", new THREE.BufferAttribute(farPositions, 3));
    farGeometry.setAttribute("color", new THREE.BufferAttribute(farColors, 3));

    this.farMaterial = new THREE.PointsMaterial({
      size: 1.9,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      // Behind everything, and never occluding anything: the far field is the
      // inside of the sky, not an object in the sector.
      depthWrite: false,
      depthTest: false,
    });

    this.far = new THREE.Points(farGeometry, this.farMaterial);
    this.far.frustumCulled = false;
    this.far.renderOrder = -2;
    scene.add(this.far);

    // -- near glints --------------------------------------------------------

    const nearPositions = new Float32Array(SECTOR.nearStars * 3);
    const sizes = new Float32Array(SECTOR.nearStars);
    const bright = new Float32Array(SECTOR.nearStars);

    for (let i = 0; i < SECTOR.nearStars; i++) {
      const u = rng() * 2 - 1;
      const theta = rng() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - u * u));
      // Cube-rooted radius spreads them evenly through the volume instead of
      // bunching them all against the outer shell.
      const radius = SECTOR.nearRadius * Math.cbrt(0.08 + rng() * 0.92);

      nearPositions[i * 3] = Math.cos(theta) * r * radius;
      nearPositions[i * 3 + 1] = u * radius * 0.7;
      nearPositions[i * 3 + 2] = Math.sin(theta) * r * radius;

      sizes[i] = 2.4 + rng() * 5.2;
      bright[i] = 0.45 + rng() * 0.55;
    }

    const nearGeometry = new THREE.BufferGeometry();
    nearGeometry.setAttribute("position", new THREE.BufferAttribute(nearPositions, 3));
    nearGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    nearGeometry.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));

    this.nearMaterial = new THREE.ShaderMaterial({
      vertexShader: GLINT_VERTEX,
      fragmentShader: GLINT_FRAGMENT,
      uniforms: { uColor: { value: new THREE.Color(PALETTE.starWarm) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.near = new THREE.Points(nearGeometry, this.nearMaterial);
    this.near.frustumCulled = false;
    this.near.renderOrder = -1;
    scene.add(this.near);
  }

  /**
   * Keep the far field centred on the camera, and wrap the near layer around it.
   *
   * The far field simply follows, so it can never be approached. The near
   * glints wrap: any that fall more than a radius behind are folded back to
   * the far side, which keeps a constant density around you out of a fixed
   * number of points and with no allocation. Wrapping on a whole diameter
   * rather than to a random new spot means a glint you just passed does not
   * reappear in front of you in the same second.
   */
  update(cameraPosition: THREE.Vector3): void {
    this.far.position.copy(cameraPosition);

    const position = this.near.geometry.getAttribute("position") as THREE.BufferAttribute;
    const span = SECTOR.nearRadius;
    const diameter = span * 2;
    let moved = false;

    for (let i = 0; i < position.count; i++) {
      for (const axis of [0, 1, 2] as const) {
        const value = position.getComponent(i, axis) - cameraPosition.getComponent(axis);
        if (value > span) {
          position.setComponent(i, axis, position.getComponent(i, axis) - diameter);
          moved = true;
        } else if (value < -span) {
          position.setComponent(i, axis, position.getComponent(i, axis) + diameter);
          moved = true;
        }
      }
    }

    if (moved) position.needsUpdate = true;
  }

  dispose(): void {
    this.far.geometry.dispose();
    this.near.geometry.dispose();
    this.farMaterial.dispose();
    this.nearMaterial.dispose();
  }
}
