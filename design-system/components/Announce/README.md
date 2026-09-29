# Announce

The unit name that appears when you switch, with three star streaks drawn after the logo's own streaks.

**Markup:** `<div class="sd-announce" aria-live="polite">` containing `.sd-announce__name` and `.sd-announce__streaks` (three `<i>`). Set `data-show="true"` to play: the name settles in and the streaks shoot in from the right, staggered by 50ms. Fade it out yourself after about 1.6s.
