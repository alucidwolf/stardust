/**
 * The poster, once, over the opening drift.
 *
 * Shown over a sector already moving rather than over a held screen, so it
 * costs nobody any time. It leaves on its own, and leaves sooner if touched:
 * anybody who has reached for the mouse has stopped looking at a logo and
 * started looking at a sector, and the card should be out of the way before
 * they notice it was ever there.
 *
 * The poster carries the wordmark already, so the name is not set beside it.
 * What is set beside it is one line of micro-text — the sortie and the sector
 * — which is the design system's register for a serial: there to be glanced at
 * and never to be acted on.
 */

/** Seconds the card holds before fading of its own accord. */
const HOLD = 3.6;

export class TitleCard {
  private readonly root: HTMLElement;
  private readonly micro: HTMLElement;
  private remaining = 0;
  private dismissed = true;

  constructor() {
    this.root = document.getElementById("title-card")!;
    this.micro = document.getElementById("title-micro")!;
  }

  /** `sector` is the sector's own designation, derived from its seed. */
  show(sector: string): void {
    this.micro.textContent = `SORTIE 01 · SECTOR ${sector}`;
    this.root.dataset.show = "true";
    this.remaining = HOLD;
    this.dismissed = false;

    const onInput = () => this.dismiss();
    // `once` on each, so the listeners clean themselves up whichever fires.
    window.addEventListener("pointerdown", onInput, { once: true });
    window.addEventListener("keydown", onInput, { once: true });
    window.addEventListener("wheel", onInput, { once: true, passive: true });
  }

  update(dt: number): void {
    if (this.dismissed) return;
    this.remaining -= dt;
    if (this.remaining <= 0) this.dismiss();
  }

  private dismiss(): void {
    if (this.dismissed) return;
    this.dismissed = true;
    this.root.dataset.show = "false";
    // Removed once faded, so it can never intercept a pointer.
    window.setTimeout(() => this.root.remove(), 1400);
  }
}
