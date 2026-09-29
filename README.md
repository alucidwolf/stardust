# Stardust

A calm, procedurally generated sector to drift through in the browser. Currents,
in space. It starts flying the moment it loads — nothing to click through first
— and you can steer, change unit, or leave it alone entirely.

No score, no timer, no fail state. Nothing fires, fights or explodes.

[**design-system/START-HERE.md**](design-system/START-HERE.md) is the approved
design direction and the authority for anything visual. Everything in Stardust
is original: no franchise names, designs, emblems or quotes.

## Status

Built in phases. **Phase 1 is done**: the project runs and shows the sector's
sky. Phases 2 to 5 — the interface, the four units, the debris fields and the
sound — are not built yet, so there is nothing to fly and nothing to press.

| Phase | What it covers | State |
| --- | --- | --- |
| 1 | Scaffold, starfield, nebula, stardust, diorama pass, boot and title card | **done** |
| 2 | HUD hints, unit trigger, unit select window, announce, sound control, telemetry | to do |
| 3 | The four units, their paint, engine glow and flight feel | to do |
| 4 | Asteroid and debris fields, landmarks, speed streaks, the star cycle, autopilot, memory | to do |
| 5 | Engine hum, far-off notes, UI ticks and tones | to do |

## Running it

```sh
npm install
npm run dev      # http://127.0.0.1:5174
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck, then production bundle into `dist/` |
| `npm run preview` | Serve the production bundle |
| `npm run typecheck` | Types only |
| `npm run verify:starfield` | Headless check that the sky is evenly covered and stays with you |

More verify scripts arrive with the things they check: steering and the
autopilot wander in phase 4, the saved sortie in phase 4, the star cycle in
phase 4. They are ports of the equivalents in Currents, which is where the
approach comes from — a headless check that steps the real code and asks a
question about the result, rather than a screenshot somebody has to squint at.

## URL options

| Fragment | Effect |
| --- | --- |
| `#seed=abc123` | Rebuild a specific sector exactly. The current seed is always written into the address, so a copied link is this sector. |

## What Currents this is built from

Stardust is not a fork. It is the same architecture, written again, with the
parts that had nothing to do with water carried over directly and everything
else rebuilt. The mapping the design system describes holds: the animals become
units, the day cycle becomes the star cycle, the seabed becomes the debris
field.

**Carried over as-is:** the seeded RNG (`src/core/rng.ts`), the frame loop
(`src/core/loop.ts`) and the diorama pass (`src/render/diorama.ts`). The loop
brings its pause with it, including the part worth knowing about — there are two
independent reasons it stops, the pilot asked or nobody can see the page, and
they are tracked separately so that a paused tab switched away from and back
does not start itself up again.

**Rebuilt:** everything else.

## The sky

Two layers, doing different jobs.

The **far field** is 2,600 cool points pinned to the camera. It never gets
closer and never parallaxes, because it is meant to be unreachably distant —
moving it would immediately tell you how big the sector really is. The **near
layer** is 150 warm four-point glints scattered through the volume you actually
fly in, and these *do* parallax. That contrast is the entire depth cue: a still
background behind sliding foreground points. Either layer on its own gives none
of it.

Both are one draw call, and the glints are shaped in the fragment stage rather
than from a sprite — a four-point star is two crossed tapers, which is cheaper
and sharper as maths than as a texture somebody has to download.

The stars are scattered by distributing their **height** uniformly rather than
their latitude. Picking a latitude at random is the obvious approach and is
wrong in a way that survives a screenshot: equal steps of latitude cover less
area near the poles, so the stars crowd into two dense caps with a bald band
around the equator, and you only notice by looking straight up. `verify:starfield`
measures the imbalance over equal-area bands, and finishes by generating the
naive version on purpose to confirm it still fails — the real sky comes out
about 14% off perfect, and the naive one over 100%.

**One nebula per sector**, teal or violet, never both and never filling the
screen. That last part is a rule: a nebula you can turn toward or away from is a
landmark, and one that is always there is weather. Its colour, position and lean
all come from the seed, so a sector's sky is part of its identity.

**Stardust** is the app's namesake and is treated as such — in quiet moments it
should be the brightest thing on screen. Tiny octahedra rather than round
points, so each catches the key light on a facet and the field glitters as you
turn. It is also the only thing giving a sense of motion before there is debris
to fly past.

The near glints and the stardust both **wrap**: anything falling more than a
radius behind the camera folds around to the far side, which holds a constant
density out of a fixed count with nothing allocated per frame. Wrapping by a
whole diameter rather than to a fresh random spot means a glint you just passed
does not reappear ahead of you a second later.

## Light

One key star, neutral to faintly warm, with a weak cool fill from the nebula's
side. Deliberately **not** a warm key against a cool ambient — that rule is
inherited from Currents, where the two averaged every surface to grey and the
palette went muddy. The warmth that makes the scene feel lit arrives in the
diorama grade instead, after lighting, where it pulls apart from the cool
shadows rather than cancelling against them.

## The diorama pass

Carried over from Currents, and it matters more here than it did underwater.
Water had scattering to tell the eye how far away things were; space has
nothing, so without a shallow depth of field the sector reads as a flat sheet of
shapes at no particular distance. Focus follows your unit, so the subject stays
crisp while near debris and the far field soften.

## The boot screen

Five monospace lines and a segmented bar, styled inline in `<head>` and sitting
first in the body. That is not laziness — the stylesheet is imported from the
entry module, so in development it arrives only once the JavaScript has run, and
until then the browser would paint the raw markup. The first paint has to be
right with nothing loaded at all, which means no webfonts and no images.

This is the one place in Stardust where the full "system booting" register is
allowed, and the last line is LAUNCH.
