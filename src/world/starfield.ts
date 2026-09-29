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
 * A plain star: a soft round point that falls off to nothing at its edge.
 *
 * The far field used three.js's stock point material, which draws points as
 * **squares** when it has no texture to stamp. At two pixels a square is a
 * pixel, and a sky full of them reads as noise rather than as stars — which is
 * most of what "pixelated" meant.
 *
 * A round falloff costs one length and one smoothstep and gives a point that
 * looks like a light instead of a sample.
 */
const FAR_VERTEX = /* glsl */ `
attribute float aSize;
varying vec3 vTint;

void main() {
  vTint = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_PointSize = aSize;
}
`;

const FAR_FRAGMENT = /* glsl */ `
varying vec3 vTint;

void main() {
  // Distance from the centre of the sprite, 0 at the middle, 1 at the edge.
  float d = length( gl_PointCoord - 0.5 ) * 2.0;

  // A small solid core inside a soft halo. Two stops rather than one, because
  // a single smoothstep across the whole sprite gives a fuzzy ball with no
  // centre — and what makes a point read as a star is that it has one.
  float core = 1.0 - smoothstep( 0.0, 0.55, d );
  float halo = ( 1.0 - smoothstep( 0.25, 1.0, d ) ) * 0.42;

  float alpha = clamp( core + halo, 0.0, 1.0 );
  if ( alpha < 0.01 ) discard;

  gl_FragColor = vec4( vTint, alpha );
}
`;

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

  /*
    Two crossed tapers, pulled in from what they were.

    The arms used to reach right across the sprite and were drawn additively on
    top of each other, which is what made the glow harsh — a bright cross with
    a hot centre, at every size, at every distance. Steeper tapers keep the
    four-point shape while confining it to the middle of the sprite, and the
    core is dimmer than the arms rather than brighter, so the centre stops
    blooming.
  */
  float cross = max( 1.0 - p.x * 9.0 - p.y * 0.85, 1.0 - p.y * 9.0 - p.x * 0.85 );
  float core = ( 1.0 - smoothstep( 0.0, 0.3, length( p ) ) ) * 0.6;

  float alpha = clamp( max( cross, core ), 0.0, 1.0 ) * vFade;
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

  float d = -view.z;

  /*
    Brightness falls away with distance, which it did not before.

    There was a fade in very close and a fade out at the far end, and between
    the two — which is nearly all of the volume — every glint burned at exactly
    the same brightness whether it was twenty units away or a hundred and fifty.
    A field of equally bright lights at unequal distances has no depth in it at
    all; the eye reads the whole layer as one sheet of lamps.

    An inverse falloff, softened so the nearest do not blow out, is what turns
    the layer back into a volume.
  */
  float falloff = 1.0 / ( 1.0 + pow( d / 46.0, 1.5 ) );

  // Still faded out at the very near and very far ends: one to stop a glint
  // filling the screen as it passes, the other to stop it arriving abruptly.
  vFade = aBright * falloff
        * smoothstep( 0.0, 14.0, d )
        * ( 1.0 - smoothstep( 190.0, 300.0, d ) );
}
`;

export class Starfield {
  readonly far: THREE.Points;
  readonly near: THREE.Points;

  private readonly farMaterial: THREE.ShaderMaterial;
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

    /*
      Sizes vary, and only a few are large.

      Every star being the same size was the other half of the flat look: a
      sky of identical dots reads as a texture, and what makes one read as a
      field of stars at different magnitudes is that most are barely there and
      a handful are not.
    */
    const farSizes = new Float32Array(SECTOR.farStars);
    for (let i = 0; i < SECTOR.farStars; i++) {
      farSizes[i] = 1.5 + Math.pow(rng(), 3.1) * 3.4;
    }

    const farGeometry = new THREE.BufferGeometry();
    farGeometry.setAttribute("position", new THREE.BufferAttribute(farPositions, 3));
    farGeometry.setAttribute("color", new THREE.BufferAttribute(farColors, 3));
    farGeometry.setAttribute("aSize", new THREE.BufferAttribute(farSizes, 1));

    this.farMaterial = new THREE.ShaderMaterial({
      vertexShader: FAR_VERTEX,
      fragmentShader: FAR_FRAGMENT,
      transparent: true,
      // `vertexColors` is what puts the `color` attribute in reach of the
      // shader as the built-in `color` varying source.
      vertexColors: true,
      // The sky writes no depth. It is drawn into its own scene before
      // anything solid, which is what keeps it behind the ship — see the
      // diorama pass, where that ordering is the whole point.
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
