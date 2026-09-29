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
// Space is deep blue, never black. The far field sits on this, and anything
// that outruns the star shell falls back to it rather than to a void.
scene.background = new THREE.Color(PALETTE.void2);

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
 * One key star, and a cool fill from the nebula's side.
 *
 * Deliberately not a warm key against a cool ambient — that is the rule
 * inherited from Currents, where it averaged every surface to grey. The key is
 * neutral to faintly warm and the fill is cool and weak, and the warmth that
 * makes the scene feel lit arrives in the diorama grade instead.
 */
const key = new THREE.DirectionalLight(PALETTE.starWarm, 2.1);
key.position.set(-0.45, 0.62, 0.64).normalize().multiplyScalar(100);
scene.add(key);

const fill = new THREE.DirectionalLight(PALETTE.nebulaTeal, 0.55);
fill.position.copy(nebula.direction).normalize().multiplyScalar(100);
scene.add(fill);

scene.add(new THREE.AmbientLight(PALETTE.void2, 1.1));

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
