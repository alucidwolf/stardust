import * as THREE from "three";
import "./styles.css";
import "./ui.css";

import { FLIGHT, PALETTE, RENDER } from "./core/config";
import { createLoop } from "./core/loop";
import { formatSeed, resolveSectorSeed, sectorCode } from "./core/rng";
import { CameraRig } from "./control/cameraRig";
import { createInput } from "./control/input";
import { trimCommand } from "./control/steering";
import { Autopilot } from "./flight/autopilot";
import { Pilot } from "./flight/pilot";
import type { SteerCommand } from "./flight/pilot";
import { Diorama } from "./render/diorama";
import { UNITS, unitById } from "./units/units";
import type { UnitDef, UnitRig } from "./units/units";
import { Fields } from "./world/fields";
import { Motes } from "./world/motes";
import { Nebula } from "./world/nebula";
import { Starfield } from "./world/starfield";
import { Hud } from "./ui/hud";
import { TitleCard } from "./ui/titleCard";
import { UnitPicker } from "./ui/unitPicker";

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

// -- sector ------------------------------------------------------------------

const sectorSeed = resolveSectorSeed(location.hash);
const sector = sectorCode(sectorSeed);

const starfield = new Starfield(scene, sectorSeed);
const nebula = new Nebula(scene, sectorSeed);

const pilot = new Pilot();
const autopilot = new Autopilot(sectorSeed);
const rig = new CameraRig(window.innerWidth / window.innerHeight);
const input = createInput(canvas);
const hud = new Hud();
const titleCard = new TitleCard();

const motes = new Motes(scene, sectorSeed, pilot.position);
const fields = new Fields(scene, sectorSeed);

scene.add(pilot.object);

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

// -- choosing a unit ---------------------------------------------------------

let rigged: UnitRig | null = null;
let unit: UnitDef | null = null;

/**
 * Seconds a swapped-in unit takes to settle to full size.
 *
 * Only long enough to stop the change being a hard cut. Everything else about
 * the flight carries over untouched — position, heading, speed, the bank it was
 * in — so the new unit picks up exactly where the old one was, and the swap
 * reads as the same flight continuing.
 */
const SWAP_SETTLE = 0.4;
let swapSettle = 1;

const picker = new UnitPicker(
  (chosen) => adoptUnit(chosen, true),
  (owned) => input.setSteeringEnabled(!owned),
);

/**
 * Keep the sector and the current unit in the address.
 *
 * The seed is written even when the link did not name one, so a copied address
 * is always this exact sector. `replaceState` rather than assigning
 * `location.hash`: assigning pushes a history entry for every swap, so Back
 * would walk you through each one instead of leaving the page.
 */
function rememberUnit(id: string): void {
  const parts = location.hash.replace(/^#/, "").split("&").filter(Boolean);
  const kept = parts.filter((part) => !/^(?:seed|unit)=/i.test(part));
  kept.unshift(`seed=${formatSeed(sectorSeed)}`);
  kept.push(`unit=${id}`);
  history.replaceState(null, "", `#${kept.join("&")}`);
}

function adoptUnit(chosen: UnitDef, announce = false): void {
  rigged?.dispose();
  rigged?.root.removeFromParent();

  unit = chosen;
  rigged = chosen.build();
  pilot.object.add(rigged.root);

  // A floor, not a reset — swapping units should not throw away whatever the
  // pilot had zoomed to.
  rig.ensureRoomFor(chosen.viewDistance);
  rememberUnit(chosen.id);
  // However the unit was changed — card, number key or Tab — the button and the
  // marked card follow it.
  picker.setCurrent(chosen);

  if (announce) {
    swapSettle = 0;
    hud.announce(`${chosen.name} ${chosen.code}`);
  }
}

/**
 * Swap units mid-flight.
 *
 * Numbers pick one outright; Tab walks the list for anyone who would rather
 * not remember which is which. Modified presses are left to the browser, so
 * Ctrl+Tab and friends still do what they always did.
 */
window.addEventListener("keydown", (event) => {
  if (!unit) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  // While the window is open it owns the keyboard: Tab walks its cards and the
  // numbers would be fighting whatever has focus.
  if (picker.isOpen) return;

  if (event.key === "Tab") {
    event.preventDefault();
    const step = event.shiftKey ? -1 : 1;
    const next = (UNITS.indexOf(unit) + step + UNITS.length) % UNITS.length;
    adoptUnit(UNITS[next]!, true);
    return;
  }

  const pick = Number.parseInt(event.key, 10);
  if (pick >= 1 && pick <= UNITS.length) {
    const chosen = UNITS[pick - 1]!;
    if (chosen !== unit) adoptUnit(chosen, true);
  }
});

// -- steering ----------------------------------------------------------------

const steerTarget = new THREE.Vector3();
const steerDirection = new THREE.Vector3();

/**
 * Turn the cursor into a heading.
 *
 * The cursor is unprojected to a point out ahead of the camera and the unit is
 * asked to face it, so steering means "go over there" rather than "rotate by
 * this much" — which is far easier to do gently.
 */
function pointerCommand(): SteerCommand {
  steerTarget.set(input.ndcX, input.ndcY, 0.5).unproject(rig.camera);
  steerDirection.copy(steerTarget).sub(rig.camera.position).normalize();

  // Projected out to a fixed distance, so the turn rate does not depend on how
  // far away whatever is under the cursor happens to be.
  steerTarget.copy(rig.camera.position).addScaledVector(steerDirection, 90);
  steerDirection.copy(steerTarget).sub(pilot.position);

  if (steerDirection.lengthSq() < 1e-6) {
    return { yaw: pilot.yaw, pitch: pilot.pitch, turnRate: 0 };
  }

  steerDirection.normalize();

  return {
    yaw: Math.atan2(steerDirection.x, steerDirection.z),
    pitch: THREE.MathUtils.clamp(
      Math.asin(steerDirection.y),
      -FLIGHT.maxPitch,
      FLIGHT.maxPitch,
    ),
    turnRate: FLIGHT.turnRate * (unit?.turnScale ?? 1),
  };
}

/**
 * Turn the arrow keys into a trim on the current course.
 *
 * Relative where the cursor is absolute, and gentle where the cursor is
 * direct: the cursor says "go over there", a key says "a little more to the
 * left". Both are steering, but they are not the same control, and running
 * them at the same rate made the keys useless for the thing they are for — a
 * held arrow swung the ship through nearly two hundred degrees in four
 * seconds, which is a spin rather than a correction.
 *
 * The eased axes do the rest: a tap leans in and unwinds rather than switching
 * the turn on and off, so a short press is a small adjustment and a long hold
 * still eventually brings you about.
 *
 * The maths itself is in `control/steering`, so its signs can be tested
 * against which way the ship actually goes on screen.
 */
function keyCommand(): SteerCommand {
  return trimCommand(
    pilot.yaw,
    pilot.pitch,
    input.steerX,
    input.steerY,
    unit?.turnScale ?? 1,
  );
}

// -- frame -------------------------------------------------------------------

const loop = createLoop((dt, elapsed) => {
  input.tick(dt);

  const piloted = input.steering || input.keySteering;

  // While the pilot is flying, the autopilot keeps reading their heading as its
  // own baseline, so the moment they let go it carries on from there rather
  // than steering back to wherever its waves had got to. Done every frame
  // rather than on release, so there is no handover edge to miss.
  if (piloted) autopilot.hold(elapsed, pilot);

  const command = piloted
    ? input.steering
      ? pointerCommand()
      : keyCommand()
    : autopilot.update(elapsed, pilot, unit?.turnScale ?? 1);

  pilot.update(dt, elapsed, command);

  const rate = pilot.speed / FLIGHT.cruiseSpeed;

  if (rigged) {
    rigged.update(elapsed, rate * (unit?.speedScale ?? 1), pilot.turnEffort);

    if (swapSettle < 1) {
      swapSettle = Math.min(1, swapSettle + dt / SWAP_SETTLE);
      const eased = swapSettle * swapSettle * (3 - 2 * swapSettle);
      rigged.root.scale.setScalar(0.82 + eased * 0.18);
    }
  }

  rig.update(dt, input, pilot);

  starfield.update(rig.camera.position);
  nebula.update(rig.camera.position);
  motes.update(dt, elapsed, rig.camera.position);
  fields.update(dt, elapsed, pilot.position);

  titleCard.update(dt);

  // Heading as a compass bearing, which is what a readout should show — not the
  // raw yaw, which is an implementation detail and runs the wrong way round.
  const bearing = ((THREE.MathUtils.radToDeg(pilot.yaw) % 360) + 360) % 360;
  hud.update(dt, input.idleTime, {
    heading: bearing,
    speed: pilot.speed * (unit?.speedScale ?? 1),
    piloted,
  });

  // Drag and wheel are accumulators; the camera has now had its look at them.
  input.consume();

  diorama.render(scene, rig.camera, rig.focusDistance(pilot));
});

// -- lifecycle ---------------------------------------------------------------

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  diorama.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
  rig.resize(window.innerWidth / window.innerHeight);
  // A paused page draws nothing, so the old frame would sit there stretched to
  // the new shape until something else happened to paint it.
  if (loop.paused) loop.renderStill();
});

/** A fresh sector. Different seed, different unit, different sky. */
window.addEventListener("keydown", (event) => {
  if (event.key !== "n" && event.key !== "N") return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (picker.isOpen) return;

  const boot = document.getElementById("boot");
  if (boot) boot.dataset.done = "false";

  // One frame for that to paint, then go. Reloading in the same tick would
  // navigate before the cover was ever shown.
  requestAnimationFrame(() => {
    location.hash = "";
    location.reload();
  });
});

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// -- launch ------------------------------------------------------------------

/**
 * Straight into the flight. There is no menu.
 *
 * `#unit=` names one directly for a link; otherwise the sector deals you one.
 * Choosing is something you do while already flying, from the window, which is
 * the same decision Currents made when it deleted its start screen.
 */
const requested = /(?:^|[#&])unit=([a-z-]+)/.exec(location.hash)?.[1] ?? null;
adoptUnit(
  requested ? unitById(requested) : UNITS[Math.floor(Math.random() * UNITS.length)]!,
);

hud.setSector(sector);
rig.snapBehind();
// One frame of camera before anything is drawn, so the opening shot is framed
// rather than swinging into place from wherever the rig started.
rig.update(0.016, input, pilot);

// Dev-only inspection handle. Stripped from production builds, and the only
// way to poke at live state from the console without exporting internals.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__stardust = {
    scene,
    camera: rig.camera,
    renderer,
    diorama,
    loop,
    starfield,
    nebula,
    motes,
    fields,
    pilot,
    rig,
    sectorSeed,
    sector,
    get unit() {
      return unit;
    },
  };
}

/**
 * Compile every shader the first frame will need, before that frame is drawn.
 *
 * Three compiles a material's program the first time it is actually rendered,
 * so without this the opening frame stalls while the starfield, the nebula, the
 * stardust, the unit and the diorama pass are all built in turn. That stall
 * lands exactly where it is most visible: on the first thing anyone sees.
 */
renderer.compile(scene, rig.camera);

loop.start();

/**
 * A machine asking for less movement opens on a still sector.
 *
 * Started and then immediately held rather than never started: the loop draws
 * one frame on the way into a pause, so what the boot screen lifts off is a
 * real sector holding still rather than an empty canvas.
 */
if (prefersReducedMotion()) {
  loop.setPaused(true);
  loop.renderStill();
} else {
  titleCard.show(sector);
}

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
