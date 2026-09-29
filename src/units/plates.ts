import * as THREE from "three";

/**
 * Armour plates, and how a unit is assembled from them.
 *
 * The rule from the design is that a unit is built from plates rather than
 * from surfaces: chunky, flat-shaded, bevelled at the edges, with a thin dark
 * gap between them, and **every plate exactly one paint colour**. That last
 * part is what makes the tricolour read as paint rather than as shading, and
 * it is why colour is baked per plate at build time instead of being decided
 * per vertex or per fragment later.
 *
 * The bevel is not decoration. A plain box reads as a box at any size; a box
 * whose edges are cut catches the key light along every rim, and that rim is
 * what separates one plate from the next when both are the same white. The
 * gaps do the rest — plates are placed a little apart rather than flush, and
 * the dark behind them is the line you see.
 *
 * Everything merges into one geometry per unit, so a whole unit is one draw
 * call however many plates it is made of.
 */

export interface PlateSpec {
  /** Half-extents before bevelling. */
  size: [number, number, number];
  position: [number, number, number];
  /** Radians, applied in Y then X then Z. Omit for axis-aligned. */
  rotation?: [number, number, number];
  colour: number;
  /** How deeply the edges are cut, as a fraction of the smallest half-extent. */
  bevel?: number;
}

/**
 * One bevelled plate.
 *
 * Built by hand rather than with ExtrudeGeometry, which bevels only the two
 * extruded faces and leaves the profile's own corners square — so a plate
 * would have cut edges on two sides and hard ones on the other four, which is
 * immediately visible on something this chunky.
 *
 * This is the same shape a 3D modeller would call a chamfered box: the eight
 * corners of a cube pulled in along each axis by the bevel, giving six face
 * quads, twelve edge quads and eight corner triangles. Flat-shaded, every one
 * of those catches the light separately.
 */
export function bevelledBox(
  halfX: number,
  halfY: number,
  halfZ: number,
  bevelFraction = 0.22,
): THREE.BufferGeometry {
  const b = Math.min(halfX, halfY, halfZ) * THREE.MathUtils.clamp(bevelFraction, 0, 0.49);

  // The eight corners, each pulled in by the bevel on all three axes, plus the
  // three "shoulder" points around each. Rather than enumerate 24 vertices by
  // hand, sweep the sign combinations: for each corner, emit the three points
  // that replace it.
  const positions: number[] = [];
  const indices: number[] = [];

  /** Index of the vertex at a corner, on the face whose axis is `axis`. */
  const corner = (sx: number, sy: number, sz: number, axis: 0 | 1 | 2): number => {
    const x = sx * (halfX - (axis === 0 ? 0 : b));
    const y = sy * (halfY - (axis === 1 ? 0 : b));
    const z = sz * (halfZ - (axis === 2 ? 0 : b));
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };

  // Each corner contributes three vertices, one per face it touches.
  const at = new Map<string, [number, number, number]>();
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        at.set(`${sx},${sy},${sz}`, [
          corner(sx, sy, sz, 0),
          corner(sx, sy, sz, 1),
          corner(sx, sy, sz, 2),
        ]);
      }
    }
  }

  const v = (sx: number, sy: number, sz: number, axis: 0 | 1 | 2): number =>
    at.get(`${sx},${sy},${sz}`)![axis];

  const quad = (a: number, c: number, d: number, e: number): void => {
    indices.push(a, c, d, a, d, e);
  };

  // --- the six faces -------------------------------------------------------
  for (const s of [1, -1]) {
    // X faces, wound so the normal points along s.
    if (s === 1) quad(v(s, -1, -1, 0), v(s, 1, -1, 0), v(s, 1, 1, 0), v(s, -1, 1, 0));
    else quad(v(s, -1, -1, 0), v(s, -1, 1, 0), v(s, 1, 1, 0), v(s, 1, -1, 0));

    if (s === 1) quad(v(-1, s, -1, 1), v(-1, s, 1, 1), v(1, s, 1, 1), v(1, s, -1, 1));
    else quad(v(-1, s, -1, 1), v(1, s, -1, 1), v(1, s, 1, 1), v(-1, s, 1, 1));

    if (s === 1) quad(v(-1, -1, s, 2), v(1, -1, s, 2), v(1, 1, s, 2), v(-1, 1, s, 2));
    else quad(v(-1, -1, s, 2), v(-1, 1, s, 2), v(1, 1, s, 2), v(1, -1, s, 2));
  }

  // --- the twelve edge quads ------------------------------------------------
  // Each edge of the original box becomes a flat strip joining the two faces
  // that met there. Winding follows the two signs that are fixed along it.
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const flip = sy * sz > 0;
      const a = v(-1, sy, sz, 1), c = v(1, sy, sz, 1);
      const d = v(1, sy, sz, 2), e = v(-1, sy, sz, 2);
      if (flip) quad(a, c, d, e);
      else quad(a, e, d, c);
    }
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const flip = sx * sz < 0;
      const a = v(sx, -1, sz, 0), c = v(sx, 1, sz, 0);
      const d = v(sx, 1, sz, 2), e = v(sx, -1, sz, 2);
      if (flip) quad(a, c, d, e);
      else quad(a, e, d, c);
    }
  }

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const flip = sx * sy > 0;
      const a = v(sx, sy, -1, 0), c = v(sx, sy, 1, 0);
      const d = v(sx, sy, 1, 1), e = v(sx, sy, -1, 1);
      if (flip) quad(a, c, d, e);
      else quad(a, e, d, c);
    }
  }

  // --- the eight corner triangles ------------------------------------------
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const a = v(sx, sy, sz, 0);
        const c = v(sx, sy, sz, 1);
        const d = v(sx, sy, sz, 2);
        // The handedness of the corner decides which way round the triangle
        // goes; the product of the three signs is exactly that handedness.
        if (sx * sy * sz > 0) indices.push(a, c, d);
        else indices.push(a, d, c);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Assemble a list of plates into one geometry, colour baked in.
 *
 * Non-indexed on the way out, so every face owns its corners and flat shading
 * has per-face normals to work with — the same reason Currents' animals are
 * built that way, arrived at for the same reason.
 */
export function buildUnit(plates: readonly PlateSpec[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const colours: number[] = [];

  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const tint = new THREE.Color();
  const vertex = new THREE.Vector3();

  for (const plate of plates) {
    const geometry = bevelledBox(
      plate.size[0],
      plate.size[1],
      plate.size[2],
      plate.bevel ?? 0.22,
    ).toNonIndexed();

    const [rx, ry, rz] = plate.rotation ?? [0, 0, 0];
    euler.set(rx, ry, rz, "YXZ");
    matrix.makeRotationFromEuler(euler);
    matrix.setPosition(plate.position[0], plate.position[1], plate.position[2]);

    const source = geometry.getAttribute("position") as THREE.BufferAttribute;
    tint.setHex(plate.colour);

    for (let i = 0; i < source.count; i++) {
      vertex.set(source.getX(i), source.getY(i), source.getZ(i)).applyMatrix4(matrix);
      positions.push(vertex.x, vertex.y, vertex.z);
      colours.push(tint.r, tint.g, tint.b);
    }

    geometry.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  merged.computeVertexNormals();
  return merged;
}

/**
 * The material every unit's plates share.
 *
 * Lambert and flat-shaded, and nothing else. No texture maps, no normal maps,
 * no specular — that is the whole material model the design allows, and it is
 * enough because the form is doing the work.
 */
export function plateMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}

/**
 * An engine bell's glow.
 *
 * Additive and unlit, because it is light rather than a lit surface. It sits
 * just behind the plate it belongs to, so the plate occludes it from the front
 * and it only shows from behind — which is where the design wants the gold and
 * the thrust to be readable from.
 */
export function engineGlow(radius: number, length: number): THREE.Mesh {
  // A cone rather than a sphere: thrust has a direction, and a round bloom
  // behind a unit reads as a light bulb rather than as an engine.
  const geometry = new THREE.ConeGeometry(radius, length, 6, 1, true);
  // Point it backwards along -Z and put its wide end at the bell.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -length / 2);

  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}
