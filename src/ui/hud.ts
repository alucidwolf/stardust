/**
 * The overlay: control hints, and a small telemetry readout.
 *
 * The hints fade themselves out after a few seconds of stillness and come back
 * on the first sign of life, so an unattended screen ends up clean without the
 * pilot having to dismiss anything.
 *
 * The readout is the one place in Stardust where the instruments get to look
 * like instruments, and there is a rule about what may go in it: it reads what
 * is true right now — heading, speed, the sector — and nothing that has to be
 * acted on. No warnings, no targets, no reticle. The instruments here are for
 * flying, not for fighting.
 */

/** Seconds of no input before the hints fade away. */
const FADE_AFTER = 6;

/** How long a swapped-in unit's name stays up. */
const ANNOUNCE_SECONDS = 2.1;

export interface Telemetry {
  /** Degrees, 0 to 359. */
  heading: number;
  /** Units per second. */
  speed: number;
  /** True while the pilot has the stick rather than the autopilot. */
  piloted: boolean;
  /** How far into the boost, 0 to 1. */
  boost: number;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly announceEl: HTMLElement;
  private readonly announceName: HTMLElement;
  private readonly headingEl: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly modeEl: HTMLElement;

  private hintsHidden = false;
  private announceTimer = 0;
  private readoutTimer = 0;

  constructor() {
    this.root = document.getElementById("hud")!;
    this.announceEl = document.getElementById("announce")!;
    this.announceName = document.getElementById("announce-name")!;
    this.headingEl = document.getElementById("read-heading")!;
    this.speedEl = document.getElementById("read-speed")!;
    this.modeEl = document.getElementById("read-mode")!;

    window.addEventListener("keydown", (event) => {
      if (event.key === "h" || event.key === "H") {
        this.hintsHidden = !this.hintsHidden;
        this.root.dataset.hidden = String(this.hintsHidden);
      }
    });
  }

  setSector(code: string): void {
    const el = document.getElementById("read-sector");
    if (el) el.textContent = code;
  }

  /** Start with the overlay already faded, for an unattended display. */
  setAmbient(): void {
    this.root.dataset.faded = "true";
  }

  /** Name the unit that was just swapped in, briefly. */
  announce(name: string): void {
    this.announceName.textContent = name;
    // Restart the streak sequence from nothing, the same way the window does.
    this.announceEl.dataset.show = "false";
    void this.announceEl.offsetWidth;
    this.announceEl.dataset.show = "true";
    this.announceTimer = ANNOUNCE_SECONDS;
  }

  update(dt: number, idleTime: number, telemetry: Telemetry): void {
    this.root.dataset.faded = String(idleTime > FADE_AFTER);

    if (this.announceTimer > 0) {
      this.announceTimer -= dt;
      if (this.announceTimer <= 0) this.announceEl.dataset.show = "false";
    }

    // Four times a second. Refreshing every frame is pointless churn and makes
    // the numbers unreadable, which for a readout is the whole failure.
    this.readoutTimer += dt;
    if (this.readoutTimer < 0.25) return;
    this.readoutTimer = 0;

    this.headingEl.textContent = `${Math.round(telemetry.heading).toString().padStart(3, "0")}°`;
    this.speedEl.textContent = telemetry.speed.toFixed(1);
    // Lit while the boost is in, because the velocity moving on its own with
    // nothing to explain it is the sort of thing an instrument should account
    // for. It is the one number here that the pilot can change.
    this.speedEl.classList.toggle("is-live", telemetry.boost > 0.05);
    this.modeEl.textContent = telemetry.piloted ? "MANUAL" : "AUTO";
    this.modeEl.classList.toggle("is-live", telemetry.piloted);
  }
}
