Stardust is Currents in space: a calm, procedurally generated sector to drift through, piloting one of four original units, two mechs and two ships. There's no score, no timer and no fail state. The look pairs late-90s mecha anime, with its armour plates, tricolour paint and gold vents, with Bebop-style noir cool, and wraps it in early-2000s Flash-era HUD craft: cut-corner windows, 1px rules, micro serials, and panels that draw a line and then unfold.

It's inspired by those shows and studios, not copied from them. Don't use Gundam or Cowboy Bebop names, logos, emblems, suit designs, ship designs, characters or quotes. The only logo is Stardust's own, in `assets/Logos/`.

## Principles

- **Calm pilot, sharp instruments.** The flight is slow and relaxed. The interface is precise. Every window opens with the same single ~420ms sequence (see `Window`), and nothing loops, flickers or pulses on its own.
- **Cut plates, never rounded.** Surfaces are armour plates cut at `cut-*`. Windows and cards cut two opposite corners (`sd-plate--armour`), and small controls cut all four (`sd-plate`). `radius-none` is the only radius.
- **Lines carry the structure.** Use 1px `line` rules inside a plate and a `line-strong` outline around it. `signal` is the one live colour: the active edge, the opening line, the scan bar, focus. `glow-signal` is the only glow.
- **Tricolour and gold, used like paint.** `armor-white`, `armor-navy` and `armor-red` belong on the units and in the world. In the UI, gold (`armor-gold`) is the only filled accent: the selected unit, the primary action, key letters.
- **Micro-text is seasoning.** One or two `.sd-micro` serials per window (a unit code, a sector, a version) in `ink-faint`. Never use it for anything a person must read to act.

## Themes

- `void` is the in-app theme, over the live starfield. It's the default.
- `hangar` is a pale steel theme for manual, press and about pages. Don't use it over the flight.

## Colour usage

- Put text in `ink` on `void`, `panel` or `panel-2`. Secondary text is `ink-dim` and micro-text `ink-faint`.
- `signal` means *live*: the thing being opened, focused or measured right now. `armor-gold` means *chosen*. Use `alert` for warning text. `armor-red` is for marks and 3D paint only.
- In void, `armor-navy` is too dark to use as a UI line or text colour. It's paint.
- The `star-*`, `nebula-*`, `planet-rust` and `thrust` tokens are for the scene (see Space & craft).

## Type

- `display` (Michroma), wide and uppercase with 0.12–0.24em tracking: the title word, window titles and the announce text. It echoes the logo's extended chrome wordmark.
- `ui` (Chakra Petch): names, body copy, hints and labels. Its clipped corners match the plates.
- `mono` (Share Tech Mono): readouts, the boot lines and micro serials.
- All three come from Google Fonts. The boot screen must paint before they load, so it uses `system` and the mono fallback.

## Spacing and shape

- The spacing steps `space-1` to `space-6` run from 4px to 32px. The HUD inset is `space-5`.
- Cuts: `cut-xs` for keys, `cut-sm` for buttons, the trigger and readouts, `cut-md` for cards, and `cut-lg` for windows. Decorative shapes are cut too: chevrons, wedges, four-point stars.

## Motion

- **Open a window:** a line draws (`dur-line`), the window unfolds (`dur-expand`), then the content settles while a scan sweeps once (`dur-settle`). All steps use `ease-snap`.
- **Close:** collapse to the line (`dur-close`).
- **Hover:** lift 1–2px and turn the edge `signal`, over about 120ms.
- **Announce:** the name settles in and the star streaks shoot in, staggered by 50ms.
- **Boot:** lines appear 90ms apart.
- With `prefers-reduced-motion`, everything just appears.
- Never use looping scanlines, idle flicker, glitch jitter or typing effects on body text.

## Voice

Dry, clipped and a little noir. Controls use plain verbs ("Launch", "Close", "to steer"). System strings are uppercase codes ("SECTOR 7G-19", "SD-SYS 2.0"). Unit blurbs are one wry line: "Built like a cathedral. Turns like one too." There are no exclamation marks, no emoji and no urgency. Nothing is a mission, and nobody is in a hurry.

## Iconography

There's no icon set. Icons are small `clip-path` polygons in a token colour: the crest chevron on the trigger, the four-point star on the streaks, corner wedges. Keep them angular, single-colour and abstract. Never draw a franchise emblem.

## Building it

The design system is framework-neutral: `components/bundle.css` holds the `sd-*` classes, and `window.Stardust.open(el)` and `.close(el)` play the window motion. Read **Space & craft** for the 3D scene. If Stardust starts from a fork of Currents, the mapping is one to one: the animals become units, the day cycle becomes the star cycle, and the seabed becomes the debris field.

## Not synced

- **Taken from the logo:** the colours sampled from the poster (JPEG, so approximate): `void-2`, `armor-white`, `armor-navy`, `armor-red`, `armor-gold`, `chrome` and `chrome-deep`.
- **Authored:** everything else, including the fonts (a proposal, hosted on Google Fonts, so there are no files) and the four units (Wayfarer, Bastion, Swordtail, Old Tuesday), which are original placeholders to rename.
- **No code yet:** there's no Stardust repo, so the components are hand-written reference CSS.
