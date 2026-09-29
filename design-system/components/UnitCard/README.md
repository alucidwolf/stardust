# UnitCard

One choice in the unit select window: an armour-cut plate showing the unit code, a keycap, the name, a class tag (MECH or SHIP) and a one-line blurb.

**Markup:** `<button class="sd-card sd-plate sd-plate--armour" aria-pressed>` containing `.sd-card__top` (a `.sd-micro` code and a `Keycap`), `.sd-card__name`, `.sd-card__class` (add `--ship` for ships) and `.sd-card__blurb`.

- The current unit gets `aria-pressed="true"`, which gives it an `armor-gold` edge and a gold corner wedge.
- On hover, the edge turns `signal` and the card lifts 2px.
- Blurbs are one short, dry line with some Bebop wit: "A freighter with a kitchen and a leak."
