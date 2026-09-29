import { UNITS } from "../units/units";
import type { UnitDef } from "../units/units";

/**
 * Choosing a unit, by pointing at one.
 *
 * Wired exactly as Currents wires its animals, because the decision it embodies
 * was the right one there and is the right one here: this is **not** a start
 * screen. It is opened on purpose, it sits over a flight already in progress,
 * and it closes on almost anything. Nothing waits on it — your unit keeps
 * flying behind it the whole time, which is also why choosing from it is
 * instant rather than a commitment.
 *
 * The number keys do the same job and are printed on each card. They are the
 * accelerator, not the interface: a control nobody can see is not a way to
 * change unit, it is a thing you have to already know.
 *
 * The one thing that is Stardust's rather than Currents' is the motion. The
 * window draws a line, unfolds out of it, and lets one scan sweep past as the
 * content settles — about 420ms, played once, and never again while it is open.
 */
export class UnitPicker {
  private readonly layer: HTMLElement;
  private readonly wrap: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly trigger: HTMLButtonElement;
  private readonly triggerName: HTMLElement;
  private readonly triggerCode: HTMLElement;
  private readonly cards = new Map<string, HTMLButtonElement>();

  private open = false;
  private current: UnitDef | null = null;
  private closing = 0;

  constructor(
    private readonly onChoose: (unit: UnitDef) => void,
    /** Called with true while this owns the keyboard. */
    private readonly onKeyboardOwnership: (owned: boolean) => void,
  ) {
    this.layer = document.getElementById("unit-layer")!;
    this.wrap = document.getElementById("unit-window")!;
    this.grid = document.getElementById("unit-grid")!;
    this.trigger = document.getElementById("unit-trigger") as HTMLButtonElement;
    this.triggerName = document.getElementById("unit-trigger-name")!;
    this.triggerCode = document.getElementById("unit-trigger-code")!;

    this.buildCards();

    this.trigger.addEventListener("click", () => this.toggle());

    // Anywhere off the window closes it. The backdrop is the layer itself, so
    // this only fires when the press missed everything inside.
    this.layer.addEventListener("pointerdown", (event) => {
      if (event.target === this.layer) this.hide();
    });

    this.layer.addEventListener("keydown", (event) => this.onDialogKey(event));
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Reflect a change of unit, however it was made. */
  setCurrent(unit: UnitDef): void {
    this.current = unit;
    this.triggerName.textContent = unit.name;
    this.triggerCode.textContent = unit.code;

    for (const [id, card] of this.cards) {
      const isCurrent = id === unit.id;
      card.dataset.current = String(isCurrent);
      // `aria-pressed` rather than `aria-selected`: these are buttons that
      // change something, not options in a listbox.
      card.setAttribute("aria-pressed", String(isCurrent));
    }
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    window.clearTimeout(this.closing);

    this.layer.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    this.onKeyboardOwnership(true);

    // Restart the sequence from nothing: clearing the state, forcing a reflow
    // and setting it again is what makes it replay on a second open. Without
    // the reflow the browser coalesces the two writes and nothing animates.
    this.wrap.removeAttribute("data-state");
    void this.wrap.offsetWidth;
    this.wrap.setAttribute("data-state", "open");

    const focusTarget =
      (this.current && this.cards.get(this.current.id)) ??
      (this.grid.firstElementChild as HTMLButtonElement | null);
    focusTarget?.focus();
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.trigger.setAttribute("aria-expanded", "false");
    this.onKeyboardOwnership(false);

    this.wrap.setAttribute("data-state", "closing");

    // Hidden once it has collapsed, not before, or it would vanish rather than
    // leave. Reduced motion has no collapse to wait for.
    const settle = prefersReducedMotion() ? 0 : 200;
    this.closing = window.setTimeout(() => {
      if (this.open) return;
      this.layer.hidden = true;
      this.wrap.removeAttribute("data-state");
    }, settle);

    // Back where it came from, so the keyboard is not left at the top of the
    // document after a visit.
    this.trigger.focus();
  }

  private buildCards(): void {
    UNITS.forEach((unit, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "plate plate--armour card";
      card.dataset.unitId = unit.id;
      card.innerHTML = `
        <span class="card__top">
          <span class="card__name"></span>
          <span class="plate key" aria-hidden="true"></span>
        </span>
        <span class="card__class"></span>
        <span class="card__blurb"></span>
      `;

      // Assigned rather than interpolated, so unit copy can never be parsed as
      // markup.
      card.querySelector(".card__name")!.textContent = unit.name;
      card.querySelector(".key")!.textContent = String(index + 1);
      card.querySelector(".card__blurb")!.textContent = unit.blurb;

      const kind = card.querySelector(".card__class") as HTMLElement;
      const isShip = unit.id === "swordtail" || unit.id === "old-tuesday";
      kind.textContent = `${isShip ? "Ship" : "Mech"} · ${unit.code}`;
      if (isShip) kind.classList.add("card__class--ship");

      card.addEventListener("click", () => {
        this.onChoose(unit);
        this.hide();
      });

      this.grid.append(card);
      this.cards.set(unit.id, card);
    });
  }

  /**
   * Keyboard inside the open window.
   *
   * Escape closes. The arrows walk the cards, because with the window open the
   * arrows are a menu's, not the unit's — the steering is handed over for
   * exactly as long as this is up.
   */
  private onDialogKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.hide();
      return;
    }

    const ids = [...this.cards.keys()];
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;

    event.preventDefault();
    const active = document.activeElement as HTMLElement | null;
    const here = ids.findIndex((id) => this.cards.get(id) === active);
    const next = ids[(Math.max(0, here) + step + ids.length) % ids.length]!;
    this.cards.get(next)?.focus();
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
