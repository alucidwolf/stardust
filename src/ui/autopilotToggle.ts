/**
 * Who is flying, and the switch that says so.
 *
 * The rule is that taking the stick is a decision and handing it back is also
 * a decision. Touching the steering drops the autopilot and leaves it dropped;
 * it never quietly takes over again a few seconds later because you stopped
 * moving the mouse. Coming back to it is something you ask for.
 *
 * Which means there has to be something to ask with. An autopilot you can only
 * leave is a trap, and a key nobody can see is not a way back — so this is a
 * button first and a shortcut second.
 *
 * The button reads as the *state*, not the action: it says AUTOPILOT and lights
 * gold when it is on, the same way the unit cards mark the unit you are flying.
 * A button that says what it will do rather than what is true has to be read
 * twice every time, and this one sits in the corner of a screen nobody is
 * studying.
 */
export class AutopilotToggle {
  private readonly button: HTMLButtonElement;
  private engaged = true;

  constructor(private readonly onChange: (engaged: boolean) => void) {
    this.button = document.getElementById("autopilot-toggle") as HTMLButtonElement;

    this.button.addEventListener("click", () => this.set(!this.engaged));

    window.addEventListener("keydown", (event) => {
      if (event.key !== "a" && event.key !== "A") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      // Typing into something else is not a request to hand over the stick.
      if (isTypingTarget(event.target)) return;
      this.set(!this.engaged);
    });

    this.render();
  }

  get isEngaged(): boolean {
    return this.engaged;
  }

  /**
   * Drop the autopilot because the pilot has taken the stick.
   *
   * Separate from `set` so that steering is never reported as a change back —
   * it only ever switches this off, and calling it while already off does
   * nothing at all.
   */
  release(): void {
    if (!this.engaged) return;
    this.set(false);
  }

  set(engaged: boolean): void {
    if (engaged === this.engaged) return;
    this.engaged = engaged;
    this.render();
    this.onChange(engaged);
  }

  private render(): void {
    this.button.dataset.on = String(this.engaged);
    this.button.setAttribute("aria-pressed", String(this.engaged));
    this.button.setAttribute(
      "aria-label",
      this.engaged ? "Autopilot engaged. Press to fly manually." : "Flying manually. Press to engage the autopilot.",
    );
  }
}

/**
 * Space activates whatever button has focus, and so does Enter.
 *
 * Without this, tabbing to a control and pressing A would work, but so would
 * every other stray key path into it. Cheap insurance, and the same guard the
 * pause control in Currents needed for the same reason.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}
