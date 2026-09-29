# Window

The Stardust window: an armour plate cut at the top-left and bottom-right corners, with a title bar, a micro serial, `signal` corner ticks and the signature open sequence.

**Markup:** `.sd-window-wrap` (it carries the shadow and the animation) containing `.sd-window.sd-plate.sd-plate--armour` (with `role="dialog"`). Inside that goes `.sd-window__bar` (an `h2.sd-window__title` and a `.sd-micro`), then `.sd-window__body`, then the two `.sd-window__tick` spans.

**Motion:** set `data-state="open"` on the wrapper to play the sequence once:

1. A 1px `signal` line draws out (`dur-line`).
2. The window unfolds from that line (`dur-expand`).
3. The content settles up 4px while one scan bar sweeps down (`dur-settle`).

To close, set `data-state="closing"` (it runs over `dur-close`), then set `hidden` when the animation ends. Nothing loops. With reduced motion, the window just appears.

- The backdrop stays light, and the starfield keeps moving behind the window.
- Titles are two words at most, uppercase `window-title`.
