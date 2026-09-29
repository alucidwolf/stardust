import * as THREE from "three";
import { PALETTE, SECTOR } from "../core/config";
import { mulberry32 } from "../core/rng";

/**
 * One soft nebula body per sector.
 *
 * Deliberately one, and deliberately not everywhere. The rule is that a nebula
 * must never fill the screen: it is a coloured region of the sky you can turn
 * toward or away from, which makes it a landmark. A full-screen wash would make
 * it weather instead, and would flatten every other colour decision in the
 * scene against it.
 *
 * It is a single large plane on the inside of the sky shell, facing the
 * camera's centre, with the shape painted in the fragment stage from a couple
 * of overlapping falloffs. No texture, for the same reason the glints have
 * none: the shape is soft and enormous, so a texture would be a large download
 * to express a gradient.
 *
 * Which of the two nebula colours a sector gets, where it sits and which way
 * it leans all come from the seed, so a sector's sky is part of its identity
 * rather than decoration laid on top.
 */

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uLean;
uniform float uOpacity;
varying vec2 vUv;

/**
 * A hash, used to dither the output by well under one step of 8-bit colour.
 *
 * Without it this body shows concentric rings. The gradient is enormous and
 * very shallow — hundreds of pixels to cross a single step of 8-bit blue — so
 * each step lands as a visible contour, and additive blending onto a near-black
 * sky makes every one of them legible. Scattering pixels either side of the
 * boundary by a fraction of a step turns the rings into noise below the
 * threshold of anything anyone can see.
 */
float hash( vec2 p ) {
  return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

void main() {
  // Centred coordinates, sheared, so the body is an angled lens rather than a
  // circle. A circular nebula reads as a lens flare or a planet.
  vec2 p = vUv - 0.5;
  p.x += p.y * uLean;

  // Two offset falloffs of different sizes. Their sum is lopsided and has a
  // denser core off to one side, which is most of what stops it reading as an
  // airbrushed ellipse.
  float a = 1.0 - smoothstep( 0.04, 0.46, length( p * vec2( 1.0, 2.1 ) ) );
  float b = 1.0 - smoothstep( 0.02, 0.30, length( ( p - vec2( 0.09, -0.05 ) ) * vec2( 1.35, 2.6 ) ) );

  float body = clamp( a * 0.72 + b * 0.55, 0.0, 1.0 );
  // Squared, so the edge falls away slowly and the core carries the colour.
  // A linear edge on something this large shows as a visible boundary.
  float alpha = body * body * uOpacity;

  // Break the contours. Two steps of 8-bit is enough to scatter the boundary
  // and still far too little to read as grain.
  alpha += ( hash( gl_FragCoord.xy ) - 0.5 ) * ( 2.0 / 255.0 );

  gl_FragColor = vec4( uColor, max( alpha, 0.0 ) );
}
`;

export class Nebula {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, seed: number) {
    const rng = mulberry32(seed ^ 0x4e45);

    // Teal or violet, never both: two coloured bodies in one sky is a
    // nightmare to light against, and neither would read as the sector's own.
    const color = new THREE.Color(rng() < 0.5 ? PALETTE.nebulaViolet : PALETTE.nebulaTeal);

    // Big enough to be a region of sky, nowhere near big enough to be all of
    // it. Placed on the shell just inside the far stars.
    const size = SECTOR.skyRadius * 1.15;
    const geometry = new THREE.PlaneGeometry(size, size);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uColor: { value: color },
        uLean: { value: rng() * 1.2 - 0.6 },
        uOpacity: { value: 0.5 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    // Behind everything, and behind the stars, so its own stars shine through
    // it rather than being washed out by it.
    this.mesh.renderOrder = -3;

    // Somewhere off to one side and a little above or below the plane you fly
    // in, so it is something you come across rather than something you are
    // always looking at.
    const bearing = rng() * Math.PI * 2;
    const pitch = (rng() - 0.5) * 0.7;
    const distance = SECTOR.skyRadius * 0.82;
    this.offset = new THREE.Vector3(
      Math.cos(bearing) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.sin(bearing) * Math.cos(pitch) * distance,
    );

    scene.add(this.mesh);
  }

  private readonly offset: THREE.Vector3;
  private readonly lookTarget = new THREE.Vector3();

  /** The nebula is part of the sky, so it travels with the camera. */
  update(cameraPosition: THREE.Vector3): void {
    this.mesh.position.copy(cameraPosition).add(this.offset);
    this.lookTarget.copy(cameraPosition);
    this.mesh.lookAt(this.lookTarget);
  }

  /** The direction the nebula lies in, for the cool fill light to come from. */
  get direction(): THREE.Vector3 {
    return this.offset;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
