import * as THREE from "three";
import { PALETTE, SECTOR } from "../core/config";
import { mulberry32 } from "../core/rng";

/**
 * One nebula per sector, built as a body rather than as a picture of one.
 *
 * The first version was a single camera-facing plane with two smooth
 * elliptical falloffs on it, and it looked exactly like what it was: a flat
 * disc with a soft edge, pasted on the sky. Two things gave it away.
 *
 * **Smooth falloffs have no structure.** A real cloud is lumpy at every scale;
 * anything whose brightness is a clean function of distance-from-centre reads
 * as an airbrush no matter how carefully the ellipse is shaped. So the shape
 * is now fractal noise — several octaves of value noise summed — and the
 * elliptical falloff only decides where the cloud *ends*, not what is inside
 * it.
 *
 * **One plane is one plane.** Structure at a single depth cannot look like a
 * volume, because every part of it is the same distance away and turns with
 * the camera in lockstep. So there are four layers at different distances,
 * scales and rotations, each with its own noise offset and its own tint
 * between the sector's two nebula colours. They hold station relative to one
 * another, so turning your head moves them across each other exactly as parts
 * of one cloud at different depths would.
 *
 * It is still never allowed to fill the screen. A nebula you can turn away
 * from is a landmark; one that is always there is weather.
 */

/** How far out the body sits, as a fraction of the star shell's radius. */
const NEBULA_DISTANCE = 0.35;
/** Its width, as a multiple of that distance — so this sets the angle it covers. */
const NEBULA_SPREAD = 1.42;
/** Layers through the depth of the cloud. */
const LAYERS = 4;

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
uniform vec2 uOffset;
uniform float uScale;
varying vec2 vUv;

/* A cheap value-noise hash. Deterministic, and the same lattice every frame. */
float hash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

/* Value noise: hash the lattice corners and interpolate with a smooth curve. */
float noise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( hash( i + vec2( 0.0, 0.0 ) ), hash( i + vec2( 1.0, 0.0 ) ), u.x ),
    mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), u.x ),
    u.y
  );
}

/*
  Five octaves, each half the amplitude and a little over twice the frequency.

  Five is where it stops being worth it at this size on screen: the sixth
  octave's features land inside a pixel. The 2.03 rather than a clean 2.0 keeps
  the octaves from lining their lattices up, which otherwise leaves a faint
  grid showing through the cloud.
*/
float fbm( vec2 p ) {
  float sum = 0.0;
  float amplitude = 0.5;
  for ( int i = 0; i < 5; i++ ) {
    sum += noise( p ) * amplitude;
    p *= 2.03;
    amplitude *= 0.5;
  }
  return sum;
}

void main() {
  // Centred and sheared, so the body is an angled lens rather than a circle.
  vec2 p = vUv - 0.5;
  p.x += p.y * uLean;

  // Where the cloud ends. This is the only smooth part, and it only ever
  // removes light at the edges — it never decides how bright the middle is.
  float extent = 1.0 - smoothstep( 0.06, 0.46, length( p * vec2( 1.0, 1.9 ) ) );
  if ( extent <= 0.001 ) discard;

  // What the cloud is made of. Warped: the noise is sampled at a position that
  // is itself displaced by noise, which is what turns round blobs into the
  // curled, wispy shapes a cloud actually has.
  vec2 q = p * uScale + uOffset;
  vec2 warp = vec2( fbm( q + vec2( 1.7, 9.2 ) ), fbm( q + vec2( 8.3, 2.8 ) ) );
  float body = fbm( q + warp * 1.6 );

  // Lift the floor so the thin parts vanish rather than greying the whole
  // field, and square it so the dense parts carry the colour.
  body = smoothstep( 0.34, 0.92, body );

  float alpha = body * extent * uOpacity;

  // Break the contours. A gradient this shallow crosses one step of 8-bit over
  // hundreds of pixels, and every step shows as a ring without this.
  alpha += ( hash( gl_FragCoord.xy ) - 0.5 ) * ( 2.0 / 255.0 );

  gl_FragColor = vec4( uColor, max( alpha, 0.0 ) );
}
`;

export class Nebula {
  readonly group = new THREE.Group();

  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly offset: THREE.Vector3;
  private readonly lookTarget = new THREE.Vector3();

  constructor(scene: THREE.Scene, seed: number) {
    const rng = mulberry32(seed ^ 0x4e45);

    // Teal or violet, never both as the dominant colour: two coloured bodies in
    // one sky is a nightmare to light against, and neither would read as the
    // sector's own. The other one is allowed in only as a tint on some layers.
    const dominant = rng() < 0.5 ? PALETTE.nebulaViolet : PALETTE.nebulaTeal;
    const other = dominant === PALETTE.nebulaViolet
      ? PALETTE.nebulaTeal
      : PALETTE.nebulaViolet;

    const base = new THREE.Color(dominant);
    const accent = new THREE.Color(other);

    const distance = SECTOR.skyRadius * NEBULA_DISTANCE;
    const lean = rng() * 1.2 - 0.6;

    for (let i = 0; i < LAYERS; i++) {
      const depth = i / (LAYERS - 1);

      // Further layers are larger and fainter, so the cloud has a front and a
      // back rather than being four copies of one thing.
      const size = distance * NEBULA_SPREAD * (1 + depth * 0.45);
      const geometry = new THREE.PlaneGeometry(size, size);

      const tint = base.clone().lerp(accent, rng() * 0.35 * depth);

      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uColor: { value: tint },
          uLean: { value: lean + (rng() - 0.5) * 0.3 },
          uOpacity: { value: SECTOR.nebulaStrength * (1 - depth * 0.45) },
          // Each layer looks at a different part of the same noise field, so
          // they are the same kind of cloud without being the same cloud.
          uOffset: { value: new THREE.Vector2(rng() * 40, rng() * 40) },
          uScale: { value: 3.4 + rng() * 2.2 + depth * 1.6 },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      // Behind everything, back layers first, so the stars shine through the
      // whole cloud rather than being occluded by its nearest sheet.
      mesh.renderOrder = -10 + i;
      // Offset each layer through the depth of the cloud and turn it a little,
      // so no two overlap exactly and the structure reads as parallax.
      mesh.position.set(
        (rng() - 0.5) * distance * 0.22,
        (rng() - 0.5) * distance * 0.14,
        -depth * distance * 0.3,
      );
      mesh.rotation.z = (rng() - 0.5) * 0.8;

      this.group.add(mesh);
      this.materials.push(material);
    }

    /*
      Off to one side and a little above or below the line you fly, so it is
      something you come across rather than something you stare at — but within
      the arc you can actually see from a standing start.

      A bearing drawn from the whole circle reads well in principle and fails in
      practice: two thirds of the time the sector's one light source spends the
      entire flight behind your shoulder, and since it is also what tints the
      fill light, the sector loses its colour without ever showing you why.
      Measured over a long drift it lit not one pixel.

      Forward is -Z, so the arc is centred there and wide enough that no two
      seeds put it in the same place.
    */
    const bearing = -Math.PI / 2 + (rng() - 0.5) * 2.2;
    const pitch = (rng() - 0.5) * 0.7;
    this.offset = new THREE.Vector3(
      Math.cos(bearing) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.sin(bearing) * Math.cos(pitch) * distance,
    );

    scene.add(this.group);
  }

  /**
   * The nebula is part of the sky, so it travels with the camera.
   *
   * The whole group turns to face, rather than each layer facing individually:
   * that is what keeps the layers' relative positions fixed, so they slide
   * across one another as you turn instead of all pivoting in place.
   */
  update(cameraPosition: THREE.Vector3): void {
    this.group.position.copy(cameraPosition).add(this.offset);
    this.lookTarget.copy(cameraPosition);
    this.group.lookAt(this.lookTarget);
  }

  /** The direction the nebula lies in, for the cool fill light to come from. */
  get direction(): THREE.Vector3 {
    return this.offset;
  }

  dispose(): void {
    this.group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const material of this.materials) material.dispose();
  }
}
