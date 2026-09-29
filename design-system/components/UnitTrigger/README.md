# UnitTrigger

The visible control that opens the unit select window. It shows what you're flying.

**Markup:** `<button class="sd-trigger sd-plate" aria-haspopup="dialog" aria-expanded aria-controls>` containing `.sd-trigger__icon`, a `.sd-trigger__text` block (`.sd-trigger__label` "Piloting" and `.sd-trigger__name`), and a `.sd-micro` unit code. The consumer supplies the unit name and code and keeps `aria-expanded` in sync.

- The icon is a gold crest chevron. It's an abstract mark, not any franchise's emblem.
- On hover, the edge turns `signal` and the plate lifts 1px.
