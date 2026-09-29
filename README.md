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
| 4 | Asteroid and debris fields, landmarks, wonders, autopilot wander, boost, speed streaks | **done** |
| 4b | The star cycle, remembering where you were | to do |
| 5 | Engine hum, far-off notes, UI ticks and tones | to do |

Not built yet: the sound, the star cycle, and remembering your sortie between
visits. There is also no sound control in the HUD, because there is nothing yet
for it to control.

## Controls

| Input | Effect |
| --- | --- |
| **Left-hold and drag** | Orbit the camera. It lives behind your unit; moved, it stays where you put it. |
| **Scroll** | Zoom in and out. |
| **Right-hold** | Steer: the unit turns toward your cursor. Release and it goes back to flying itself. Pressing the right button also swings the camera back behind — on the press, not after the hold. |
| **Arrow keys** | Trim the course — a nudge, not a rudder held over. About eleven degrees a second, a fifth of the cursor's rate, so a tap is a small correction and a long hold still eventually brings you about. Speed never changes. |
| **Flying…** | The button bottom-left opens the unit window. The sector keeps moving behind it, and choosing is instant — position, heading and speed all carry over. |
| **1**–**4**, **Tab** | The same thing without opening anything. Numbers pick one outright, Tab walks the list (Shift+Tab backwards). |
| **Shift** | Boost. Hold it and the engines light, the binders open, the stars streak and the velocity readout goes live. It eases in and out rather than switching, and there is no brake — this is a drift, and a unit that can crawl is a unit that can get stuck. |
| **Autopilot**, **A** | Hand the stick back. Touching the steering drops the autopilot and *leaves* it dropped; this is the way back. The button reads as the state, lit gold when the autopilot has it. |
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

## Rare things, and rarer things

Two tiers, rolled separately, because rarity is the entire mechanism by which
any of them is impressive. A ringed giant you meet every other region is
scenery; one you meet twice an hour is an event.

**Landmarks**, about one region in nine: a planet, a derelict station ring
still slowly turning, a gate frame standing in nothing, a drifting container
yard.

**Wonders**, about one in thirty-four:

- a **black hole** — the only unlit thing out here, which works precisely
  because the sky it sits against never is;
- a **ringed gas giant**, tipped well off both edge-on and face-on, its rings
  solid through the middle and soft at both rims — a band of material thinning
  out into nothing rather than a washer with an edge you could trace;
- a **comet**, its tail pointing away from the sector's star rather than
  backward along its path;
- the **hulk** of a capital ship, broken into pieces that drifted apart and
  stayed that way;
- a **crystal shoal**, the only thing besides the star and the nebula that
  makes its own light.

## The sector

Debris comes in **clusters with empty space between them**, not sprinkled
evenly. That rule is inherited: an endlessly generated world has a
characteristic failure where everywhere is equally interesting, which means
nowhere is. Rocks are cut from three different solids — icosahedra,
dodecahedra, octahedra — warm rust mixed with cool grey per rock rather than
per cluster, and most are small, the occasional big one giving a cluster a
scale to read the rest against.

They are barely squashed. The first version stretched them from half to a third
again on each axis, and that is where "blocky" came from: it is not the face
count that makes a shape look square, it is having one dimension obviously
shorter than the others. A twenty-face solid flattened that hard stops reading
as rock and starts reading as a slab. Kept near enough to round, the facets are
what you notice.

**How much is out there is set by how much should be in view**, not by how
often a region should be interesting. One region in nine was a fair rate when a
couple of dozen were live; once landmarks streamed six regions out there were
five hundred of them, which put around seventy landmarks and a dozen planets
about you at once. That is a solar system, not deep space. At one in a hundred
and ninety there are **two things clearly in view on average and never more
than one planet**, while a twelve-minute flight still meets six different kinds
of thing.

The foreground stars went the same way, and for the same reason: a hundred and
fifty glints in a small shell crossed the screen several a second, which reads
as flying through weather. A third as many, spread through half again the
volume, still proves the far field is far away. The stardust was thinned less —
it is the app's namesake and should still be the brightest thing in a quiet
moment — but it is meant to be dust caught in the light, not snow.

Space is built in **regions** the way Currents built the seabed in chunks — a
cube generated from a hash of its own coordinates, so a region rebuilds
identically whether you reach it in ten seconds or ten minutes, and from any
direction. Vertically the sector is much thinner than it is wide, because there
is no reason to generate debris a kilometre above the lane nobody flies in.

### Coming into view

Debris and landmarks stream at **two different radii**, because they are seen
from two very different distances. A three-unit rock is invisible past a few
hundred units. A planet two hundred and eighty units across is visible from
thousands — and building it only when you were already close is how one came to
simply *appear* in the middle distance, already filling a quarter of the sky, on
the single frame its region was created.

So landmarks are generated six regions out, are guaranteed to exist by 2,604
units, and stay invisible until 2,400 — then fade up over the approach, which
at cruise takes the better part of a minute. What is created and what appears are
no longer the same moment.

Three things had to be got right for that to hold, and each was wrong first.

**The fade is a multiplier, not a value.** These materials do not all end at
full strength — a planetary ring settles at a fifth, a comet tail at a fifth,
the crystals vary per shard — so fading them by assigning an opacity quietly
promoted every one of them to solid on arrival. And the accretion disc is a
shader, whose `opacity` is a property nothing reads; it fades on the uniform
its own shader multiplies by.

**The fade is measured to where the landmark is**, which is not the anchor its
region picked. A planet is slung four to six hundred units above or below the
lane so that it is scenery you pass rather than an obstacle. Timing the fade
against the anchor faded planets in against a place they were not, so one could
be solid at 1,800 units when it was supposed to be halfway through appearing —
the original complaint, in miniature, surviving its own fix. It is now measured
once, from the bounds of whatever the landmark turned out to be built from.

**A distant region still takes every random draw a near one would.** Only the
rock geometry is skipped. The sector depends on a region generating identically
however you arrive at it, and skipping the draws would leave the generator at a
different point in its sequence by the time it reached the landmark — so the
same region would hold a different landmark, somewhere else, depending on
whether you had happened to pass nearby before.

`verify:approach` flies twelve simulated minutes and walks the real scene graph
rather than reading the fade constants back, because the original bug was that
nothing consulted them. The measurement that matters is the **brightness step**:
a pop is a material going from nothing to everything between two frames, and
distance thresholds cannot express that — a landmark is not a point, and a gas
giant's outer ring sits seven hundred units from the giant's own centre. The
worst step over the flight is 1.3% per half second.

## Flying itself

Left alone, a unit explores. Slowly, randomly, and without ever hurrying: over
twenty simulated minutes the nose comes to point a full **179° from where it
started**, covering a 180° arc on the way, at a peak rate of **1.4° a second**.
You can watch it happen without noticing it happen.

Two different failures are being avoided here, and the design has fallen into
both.

The first is a unit that settles into a slow permanent **circle** — the natural
resting state of any naive version, which picks a random heading offset and
eases toward it, because the easing never quite arrives and so the offset never
fully spends. The answer is that the heading is a **sum of slow sine waves at
unrelated periods** rather than a target chased with a spring. Sines cannot
wind up. `verify:steering` measures the **net turn** over those twenty minutes:
0.3 turns, changing direction six times. A circling autopilot would show tens
of turns all one way.

The second is subtler and arrived as the fix for something else. The wander was
once far wider and was cut to a fifth to stop it feeling like the ship
disagreeing with the pilot — which worked, and also fenced the heading into a
40° cone it could never leave. Left alone the ship flew very nearly straight
for ever and explored nothing, and for the first minute that looks exactly like
calm.

**Amplitude decides where it can go; frequency decides how fast it gets
there**, and the fix had cut the wrong one. The waves now sum to about 200° —
more than half a circle, so the nose can come to point anywhere at all — while
each amplitude is paired with a low enough frequency that the heading can never
swing faster than about two degrees a second. The constraint that forced the
amplitudes down is met elsewhere now: steering hands the pilot the stick and
keeps it there, so a heading they chose is held exactly until they ask for the
autopilot back. It no longer has to be timid in order to be polite.

The camera stays behind through all of it. It trails on purpose — swinging
round late through a turn is most of what makes a turn feel like the ship moved
rather than the world did — and a trail is a lag, so the faster the heading
changes the further behind it falls. Over eight simulated minutes of wandering
it never gets more than **15° off directly behind**, and never leaves its
station.

That check deliberately does **not** measure displacement, and the reason is
worth keeping: a wanderer is a random walk, and a random walk's displacement
grows as the square root of the distance flown, so a perfectly healthy drift
covers only a few percent of the ground it travels. An earlier version of the
check tested that number, failed a good autopilot, and would have passed a
circling one with a wide enough radius.

And what you steer to, you keep — in two senses. The autopilot resumes from
**your** heading rather than from wherever its waves had got to, and more than
that, it does not resume at all unless you ask it to.

Touching the steering hands the stick over and it stays handed over. An
autopilot that quietly takes back control a few seconds after you stop moving
the mouse is one that thinks it knows better than the pilot, and the complaint
that produced this was a ship that kept undoing the heading it had just been
given. Which means there has to be a way back, because an autopilot you can
only leave is a trap — hence a button, in the corner by the readout, and `A` as
its accelerator. It reads as the state rather than the action: lit gold means
the autopilot has it, the same way a unit card marks the unit you are flying.

## The arrow keys, and a sign that was wrong

The cursor and the arrow keys are different controls, not one control at two
speeds. The cursor says "go over there" and gets there; the keys say "a little
more to the left" and trim the course at about a fifth of that rate.

They originally ran at the same rate, and that hid a real bug for a while.
`forward` is `(sin yaw, ·, cos yaw)`, so a larger yaw swings toward **+X**,
while screen right is `cross(forward, up)`, which is **−X**. A larger yaw turns
you *left* — so a right arrow that added to yaw sent the unit the wrong way.
This is the same bug Currents shipped, wrote down, and built a check to catch,
and Stardust reproduced it anyway.

What is interesting is why the check did not catch it either. At the full turn
rate, six seconds of holding one arrow swung the unit through nearly three
hundred degrees — most of a circle. The check measures net displacement against
where screen-right was pointing at the start, and a unit that has come most of
the way round a circle is displaced in a direction with very little to do with
which way it first turned. The measurement was reading a lap, not a turn, and
it happened to come out positive.

Slowing the keys to a trim shortened the arc to sixty-five degrees, and the
sign that had been wrong all along became the only thing the number could be
describing. The maths now lives in `src/control/steering.ts` and the check
calls that exact function rather than a copy of it, because a copy is how the
signs drift apart again — the test would go on proving something true about a
formula nothing ships.

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
| `npm run verify:steering` | Headless check that each control goes the way it looks, and the autopilot explores without circling |
| `npm run verify:approach` | Headless check that nothing large ever simply appears, and that the sky never gets crowded |

The approach comes from Currents: a headless check that steps the real code and
asks a question about the result, rather than a screenshot somebody has to
squint at. All four run in the deploy workflow before anything is published,
because a build log cannot tell you that the sky has a bald patch at the poles,
that a unit is full of holes, or that the controls send you the opposite way
from the one they name.

## Deploying

Pushing `main` builds and publishes to GitHub Pages, via
`.github/workflows/deploy.yml`. The four checks run first and a failure stops
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

**It is a body, not a picture of one.** The first version was a single
camera-facing plane with two smooth elliptical falloffs, and it looked exactly
like what it was: a flat disc with a soft edge. Two things gave it away. Smooth
falloffs have no structure — anything whose brightness is a clean function of
distance-from-centre reads as an airbrush however carefully the ellipse is
shaped — and one plane is one plane, since every part of it is the same
distance away and turns with the camera in lockstep.

So the shape is now fractal noise, warped by more noise so the shapes curl
rather than blob, and the elliptical falloff only decides where the cloud
*ends*. And there are four layers at different distances, scales, rotations and
tints, holding station relative to one another so that turning your head slides
them across each other the way parts of one cloud at different depths would.

The same complaint applied to the black hole's accretion disc, which was
literally a flat ring of one flat colour. Its brightness is now a function of
radius — blazing at the inner edge, falling away outward — with a hot side, a
thin photon ring hugging the horizon, and a second disc tipped off the first so
the silhouette never resolves into a clean ellipse from any direction.

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
