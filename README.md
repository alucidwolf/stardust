# Stardust

A calm, procedurally generated sector to drift through in the browser. Currents,
in space. It starts flying the moment it loads — nothing to click through first
— and you can steer, change unit, or leave it alone entirely.

No score, no timer, no fail state. Nothing fires, fights or explodes.

[**design-system/START-HERE.md**](design-system/START-HERE.md) is the approved
design direction and the authority for anything visual. Everything in Stardust
is original: no franchise names, designs, emblems or quotes.

## Status

You can fly it. Pick a unit, steer it or let it fly itself, and drift past
asteroid fields, derelict stations and the occasional black hole.

| Phase | What it covers | State |
| --- | --- | --- |
| 1 | Scaffold, starfield, nebula, stardust, diorama pass, boot and title card | **done** |
| 2 | HUD hints, unit trigger, unit select window, announce, telemetry readout | **done** |
| 3 | The four units, their paint, engine glow and flight feel | **done** |
| 4 | Asteroid and debris fields, landmarks, autopilot wander | **done** |
| 4b | Speed streaks, the star cycle, remembering where you were | to do |
| 5 | Engine hum, far-off notes, UI ticks and tones | to do |

Not built yet: the sound, the star cycle, speed streaks, and remembering your
sortie between visits. There is also no sound control in the HUD, because there
is nothing yet for it to control.

## Controls

| Input | Effect |
| --- | --- |
| **Left-hold and drag** | Orbit the camera. It lives behind your unit; moved, it stays where you put it. |
| **Scroll** | Zoom in and out. |
| **Right-hold** | Steer: the unit turns toward your cursor. Release and it goes back to flying itself. Pressing the right button also swings the camera back behind — on the press, not after the hold. |
| **Arrow keys** | Steer without the mouse. Speed never changes; the keys only change where the unit is pointing. |
| **Flying…** | The button bottom-left opens the unit window. The sector keeps moving behind it, and choosing is instant — position, heading and speed all carry over. |
| **1**–**4**, **Tab** | The same thing without opening anything. Numbers pick one outright, Tab walks the list (Shift+Tab backwards). |
| **N** | A new sector. Different seed, different unit, different sky. |
| **H** | Toggle the overlay. |

Both mouse gestures are holds: a button does nothing until it has been down for
a fifth of a second, so a plain click never moves the camera or turns the unit.

## The four units

Original designs and original names. The language is late-90s mecha — armour
plates, tricolour paint, gold vents — and the language is all that is borrowed.
No franchise names, shapes, emblems or quotes, and nothing fires, fights or
explodes.

| Unit | Class | The one shape | How it flies |
| --- | --- | --- | --- |
| **Wayfarer** XR-7 | Light mech | Folded wing binders that open as it pushes | Light, floaty, happiest on a long glide |
| **Bastion** HV-2 | Heavy mech | A shield plate wider than it is tall | Slow and stately, wide lazy turns |
| **Swordtail** SW-4 | Interceptor | A long blade-like tail boom carrying the engines | Quick, sharp, banks hard |
| **Old Tuesday** FR-9 | Freighter | An open hauling frame with containers slung in it | Slow, steady, lived-in |

Each is built to one recipe. **Plates, not surfaces**: chunky bevelled blocks,
flat-shaded, with a thin dark gap between them, and each plate exactly one
colour — which is what makes the tricolour read as paint rather than as
shading. **One silhouette idea**, exaggerated, with everything else kept
compact, because an outline is what identifies a unit at distance. **Gold where
the camera is**, on the back vents and thrusters, since the camera lives behind.
And **thrust is the animation** — engines breathe from `thrust` toward `signal`
and the bell stretches with them. Nothing loops, flickers or pulses at you.

The bevelled box each plate is built from is wound by hand: six face quads,
twelve edge quads and eight corner triangles, and the handedness of the corner
decides which way round its triangle goes. Get one wrong and you have a plate
that looks perfect from every angle except one, so `verify:units` counts edges
used by exactly one triangle and checks the signed volume is positive.

It also **measures the paint**. The design gives a ratio — roughly 55 white, 25
navy, 12 red, 8 gold — and it is the thing that makes four different
silhouettes read as one fleet. It is also the easiest thing here to drift:
every plate added changes it a little, and nobody notices until one unit has
quietly become mostly navy. Measured by area rather than by plate count,
because counting plates would call a unit mostly gold when its gold is four
vents the size of a thumbnail.

## The sector

Debris comes in **clusters with empty space between them**, not sprinkled
evenly. That rule is inherited: an endlessly generated world has a
characteristic failure where everywhere is equally interesting, which means
nowhere is. Rocks are icosahedra squashed and turned at random, warm rust mixed
with cool grey per rock rather than per cluster, and most are small — the
occasional big one is what gives a cluster a scale to read the rest against.

Roughly **one region in nine** carries something worth flying to: a planet, a
derelict station ring still slowly turning, a gate frame standing in nothing, a
drifting container yard, or a black hole. The black hole is the one thing out
here that is not lit — a genuinely black sphere with a bright disc around it,
which works precisely because the sky it sits against never is. No lens flare
and no distortion shader: the design allows one flare per scene at most, and
the logo already spent it.

Space is built in **regions** the way Currents built the seabed in chunks — a
cube generated from a hash of its own coordinates, so a region rebuilds
identically whether you reach it in ten seconds or ten minutes, and from any
direction. Vertically the sector is much thinner than it is wide, because there
is no reason to generate debris a kilometre above the lane nobody flies in.

## Flying itself

Left alone, a unit keeps flying, and it has to stay interesting indefinitely.
The failure that guards against is a unit which settles into a slow permanent
circle — the natural resting state of any naive version, which picks a random
heading offset and eases toward it, because the easing never quite arrives and
so the offset never fully spends.

So the heading is a **sum of slow sine waves at unrelated periods** rather than
a target chased with a spring. Sines cannot wind up. `verify:steering` flies
twenty simulated minutes and measures the **net turn**: 0.7 turns, reversing
direction sixteen times. A circling autopilot would show tens of turns all one
way.

That check deliberately does **not** measure displacement, and the reason is
worth keeping: a wanderer is a random walk, and a random walk's displacement
grows as the square root of the distance flown, so a perfectly healthy drift
covers only a few percent of the ground it travels. An earlier version of the
check tested that number, failed a good autopilot, and would have passed a
circling one with a wide enough radius.

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
| `npm run verify:units` | Headless check that every plate is closed and the paint follows the ratio |
| `npm run verify:steering` | Headless check that each control goes the way it looks, and the autopilot never circles |

The approach comes from Currents: a headless check that steps the real code and
asks a question about the result, rather than a screenshot somebody has to
squint at. All three run in the deploy workflow before anything is published,
because a build log cannot tell you that the sky has a bald patch at the poles,
that a unit is full of holes, or that the controls send you the opposite way
from the one they name.

## Deploying

Pushing `main` builds and publishes to GitHub Pages, via
`.github/workflows/deploy.yml`. The three checks run first and a failure stops
the deploy. `BASE_PATH` comes from GitHub rather than being written down, so it
keeps working if the repository is renamed or forked.

## URL options

| Fragment | Effect |
| --- | --- |
| `#seed=abc123` | Rebuild a specific sector exactly. The current seed is always written into the address, so a copied link is this sector. |
| `#unit=swordtail` | Launch as a named unit (`wayfarer`, `bastion`, `swordtail`, `old-tuesday`) rather than one the sector deals you. Changing unit in game rewrites this, so a reload keeps whichever one you are flying. |

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
landmark, and one that is always there is weather. Its colour, bearing, pitch
and lean all come from the seed, so a sector's sky is part of its identity. At
its strongest it lights about a quarter of the view.

Its bearing is drawn from the forward arc rather than the whole circle. Drawing
from the whole circle reads better in principle and fails in practice: most of
the time the sector's one light source spends the entire flight behind your
shoulder, and because it also tints the fill light, the sector loses its colour
without ever showing you why. Measured over a long drift, a full-circle bearing
lit not one pixel.

It is also held well inside the frustum rather than out on the star shell. The
distance is arbitrary — it travels with the camera and ignores depth, so only
the angle it covers means anything — and parked out near the far plane it was
**clipped away entirely**. A `0.4` near against a `2000` far leaves so little
depth precision that a surface several hundred units short of the far plane
still rounds past it. The symptom was the worst kind: not a glitch, just
nothing, with the object present, visible, unculled, and drawing.

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

**The stars and the nebula are the only light in this sector.** Every light in
the scene is a thing you can point at on screen: the key is the sector's own
star, and both the fill and what little ambient there is are the nebula —
coloured from it and aimed from its side of the sky, so a hull turned away from
the star is lit by the cloud behind it rather than by a general glow with no
source. The usual trick of a strong sky-coloured ambient is the wrong one here;
it lifts every surface whether or not anything is shining on it, and in space
that reads immediately as a lamp just off camera. What ambient remains is only
enough that an unlit plate is a shape rather than a silhouette, because the
design asks for soft light on hard shapes, not for no light at all.

Deliberately **not** a warm key against a cool ambient — that rule is inherited
from Currents, where the two averaged every surface to grey and the palette went
muddy.

**Space here is near enough to black.** The background is the darkest token in
the set rather than a colour invented for it, so the sky is still the sector's
own blue, just far enough down that nothing reads it as blue on its own. The
grade's lift on dark areas is now a whisper — a twenty-fifth of what Currents
used — so that black still reads as *space* rather than as a hole in the canvas.
Everything brighter than that is something actually there: a star, the nebula,
or stardust catching the light.

This reverses what the design system originally said — "space is deep blue,
never black" — deliberately, and `space-and-craft.md` has been updated to
match, with the old rule recorded beside the new one. The first version left
the sky a milky navy with the stars washing out against it.

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
