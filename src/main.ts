import * as THREE from "three";
import "./styles.css";

import { CAMERA, PALETTE, RENDER } from "./core/config";
import { createLoop } from "./core/loop";
import { formatSeed, resolveSectorSeed, sectorCode } from "./core/rng";
import { Diorama } from "./render/diorama";
import { Motes } from "./world/motes";
import { Nebula } from "./world/nebula";
import { Starfield } from "./world/starfield";
import { TitleCard } from "./ui/titleCard";

const canvas = document.getElementById("scene") as HTMLCanvasElement;

// -- renderer ----------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
/*
  Near enough to black, and deliberately so.

  This is the darkest token in the set rather than a colour invented for the
  purpose, so the sky is still the sector's own blue — just far enough down
  that nothing reads it as blue on its own. Every visible thing in an empty
  patch of sky is therefore something that is actually there: a star, the
  nebula, or stardust catching the light.
*/
scene.background = new THREE.Color(PALETTE.void);

const diorama = new Diorama(renderer);
diorama.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());

const camera = new THREE.PerspectiveCamera(
  CAMERA.fov,
  window.innerWidth / window.innerHeight,
  CAMERA.near,
  CAMERA.far,
);

// -- sector ------------------------------------------------------------------

const sectorSeed = resolveSectorSeed(location.hash);
const sector = sectorCode(sectorSeed);

const starfield = new Starfield(scene, sectorSeed);
const nebula = new Nebula(scene, sectorSeed);

/**
 * Where the camera is, before there is a unit to sit behind.
 *
 * This is a placeholder with a known end date. Phase 3 puts a unit here and
 * the camera goes behind it; until then the camera *is* the subject, and it
 * drifts forward slowly so the near glints and the stardust have something to
 * parallax against. A still camera in space looks like a photograph.
 */
const drift = new THREE.Vector3(0, 0, 0);
const heading = new THREE.Vector3(0, 0, -1);

const motes = new Motes(scene, sectorSeed, drift);

// -- light -------------------------------------------------------------------

/**
 * The key star, and the nebula. Nothing else lights this sector.
 *
 * Every light here is a thing you can point at on screen. The key is the
 * sector's own star, and both the fill and what little ambient there is are
 * the nebula — coloured from it and aimed from its side of the sky, so a hull
 * turned away from the star is lit by the cloud behind it rather than by a
 * general glow with no source.
 *
 * The ambient used to be the sky colour at full strength, which is the usual
 * way to keep shadows readable and is the wrong one here: it lifts every
 * surface uniformly whether or not anything is shining on it, and in space
 * that reads immediately as a lamp just off camera.
 *
 * Still deliberately not a warm key against a cool ambient — that rule is
 * inherited from Currents, where the two averaged every surface to grey.
 */
const key = new THREE.DirectionalLight(PALETTE.starWarm, 2.3);
key.position.set(-0.45, 0.62, 0.64).normalize().multiplyScalar(100);
scene.add(key);

const fill = new THREE.DirectionalLight(PALETTE.nebulaTeal, 0.42);
fill.position.copy(nebula.direction).normalize().multiplyScalar(100);
scene.add(fill);

// Enough that an unlit plate is a shape rather than a silhouette, and no more.
// The design asks for soft light on hard shapes, not for no light at all.
scene.add(new THREE.AmbientLight(PALETTE.nebulaViolet, 0.32));

// -- keep the sky with us ----------------------------------------------------

starfield.update(drift);
nebula.update(drift);

const titleCard = new TitleCard();

// -- frame -------------------------------------------------------------------

const loop = createLoop((dt, elapsed) => {
  // A slow forward drift, and a very slight turn, so the parallax reads as
  // flight rather than as a slide. Both go when the units arrive.
  const turn = Math.sin(elapsed * 0.06) * 0.12;
  heading.set(Math.sin(turn), Math.sin(elapsed * 0.04) * 0.05, -Math.cos(turn)).normalize();
  drift.addScaledVector(heading, 7.5 * dt);

  camera.position.copy(drift);
  camera.position.y += CAMERA.height * 0.12;
  camera.lookAt(
    drift.x + heading.x * 40,
    drift.y + heading.y * 40,
    drift.z + heading.z * 40,
  );

  starfield.update(camera.position);
  nebula.update(camera.position);
  motes.update(dt, elapsed, camera.position);

  titleCard.update(dt);

  // Focus sits where the unit will be once there is one, so the near stardust
  // softens and the far field stays readable.
  diorama.render(scene, camera, CAMERA.distance);
});

// -- lifecycle ---------------------------------------------------------------

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  diorama.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  // A paused page draws nothing, so the old frame would sit there stretched to
  // the new shape until something else happened to paint it.
  if (loop.paused) loop.renderStill();
});

/**
 * A machine asking for less movement opens on a still sector.
 *
 * Started and then immediately held rather than never started: the loop draws
 * one frame on the way into a pause, so what the boot screen lifts off is a
 * real sector holding still rather than an empty canvas.
 */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// Dev-only inspection handle. Stripped from production builds, and the only
// way to poke at live state from the console without exporting internals.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__stardust = {
    scene,
    camera,
    renderer,
    diorama,
    loop,
    starfield,
    nebula,
    motes,
    sectorSeed,
    sector,
  };
}

/**
 * Compile every shader the first frame will need, before that frame is drawn.
 *
 * Three compiles a material's program the first time it is actually rendered,
 * so without this the opening frame stalls while the starfield, the nebula, the
 * stardust and the diorama pass are all built in turn. That stall lands exactly
 * where it is most visible: on the first thing anyone sees.
 */
renderer.compile(scene, camera);

loop.start();

if (prefersReducedMotion()) {
  loop.setPaused(true);
  loop.renderStill();
}

titleCard.show(sector);

/**
 * Take the boot screen down once there is genuinely something behind it.
 *
 * Two frames, not one. The first is the frame the compile above was preparing
 * for and can still be the slow one; waiting for a second means what gets
 * revealed is a sector already running rather than one that judders as it is
 * uncovered.
 */
function dismissBoot(): void {
  const boot = document.getElementById("boot");
  if (!boot || boot.dataset.done === "true") return;
  boot.dataset.done = "true";
  // Removed rather than left transparent, so it can never intercept a pointer.
  window.setTimeout(() => boot.remove(), 900);
}

requestAnimationFrame(() => requestAnimationFrame(dismissBoot));

// A stuck boot screen is far worse than an early one: if anything above throws,
// or the tab is backgrounded before a frame is ever drawn, the animation frames
// never arrive and the page would sit behind the gradient for good.
window.setTimeout(dismissBoot, 8000);

// The address always names this sector, so a copied link is this sector.
if (!/(?:^|[#&])seed=/.test(location.hash)) {
  history.replaceState(null, "", `#seed=${formatSeed(sectorSeed)}`);
}
