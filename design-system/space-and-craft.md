# Space & craft

These are the 3D rules for the sector, the four units and everything drifting past them. They take their cues from 90s mecha anime and Bebop-style space. Take the moves, never the designs: no V-fin crests, no copied suits or ships, no franchise emblems.

## The scene is a diorama in space

- **Shallow depth of field.** Keep Currents' diorama pass, with focus following your unit, so the scene reads as a model on a table.
- **Space is near enough to black, and the stars and the nebula are the only light in it.** The sky is `deep`, the darkest token in the set and about a third of `void` — far enough down that no screen will call it anything but black. What little colour is left in it is not there to be seen; it is there so the grade's lift on the darkest pixels has somewhere to lift from, which is what stops the nebula's outer edges banding as they fade out. Everything brighter than that is something actually there: a star, the nebula, or stardust catching the light. One soft body per sector, `nebula-violet` or `nebula-teal`, and depth still reads as bluer and dustier rather than darker; there is simply very little above it to read against. *(This reverses an earlier rule that space should be deep blue and never black — that version left the sky a milky navy with the stars washing out against it. The later move from `void` to `deep` is not a second reversal: the rule did not change, only how far down "near enough to black" is taken.)*
- **One key light, the nebula, and your own engines.** A distant star, neutral to faintly warm (`star-warm`), with a cool fill from the nebula's side. What ambient there is should be the nebula too — coloured from it, aimed from its side of the sky, and weak. A strong sky-coloured ambient lifts every surface whether or not anything is shining on it, and in space that reads immediately as a lamp just off camera. Enough that an unlit plate is a shape rather than a silhouette, and no more. As in Currents, avoid a warm key against a cool ambient.
- **The engine bells light the hull.** The camera sits behind the unit and the star is somewhere out in the sky, so for much of any sortie the whole visible side of the unit is its dark side: measured against a surface facing the camera, the key came in at *minus* a third, which left half the hull at a sixth of its own paint value and a third of it not distinguishable from empty space. The bells are already the brightest thing on screen from that angle, so let them do the work. Short-ranged, set back down the plume rather than at the nozzle, falling off linearly so the light spreads along the hull instead of burning the nearest plate, and breathing with the same rhythm as the glow. Light with the plume's white-hot core and not its blue edge — the raw `thrust` blue turns the tricolour into three blues.
- **Stars are round, and dimmer the further off they are.** A dense far field of `star-cool` points, and a sparse near layer of `star-warm` four-point glints that parallax past. Draw both as maths rather than as stock point sprites, which have no texture to stamp and so come out as squares — a sky of small squares reads as noise, not as stars. Vary the sizes, keep the large ones rare, and let brightness fall away with distance: a field of equally bright lights at unequal distances has no depth in it, and the eye reads the whole layer as one sheet of lamps. The logo's streaks become speed lines: short `star-cool` streaks aligned with your velocity. There are only a few, and only while you're turning or boosting.
- **The sky is drawn before anything solid, in its own pass.** Stars and the nebula write no depth, so if they share a pass with the hull they are sorted as transparencies and drawn *after* it — which put the sky over a fifth of the unit's own pixels. Rendering them first, into a clean depth buffer, is what keeps them behind it; and the sky is exempted from the depth-of-field blur, or the stars smear.

## Units: how the mechs and ships are designed

The logo poster is the reference for the paint language, not for any single unit's shape.

1. **Armour plates, not surfaces.** Build units from chunky, flat-shaded plates with bevelled edges and a thin dark gap between plates. Every plate is one paint colour.
2. **The tricolour rule.** Each unit is mostly `armor-white`, with `armor-navy` on the core (chest, cockpit, hull spine), `armor-red` on one or two blocks (waist, intakes), and `armor-gold` on vents, sensors and one crest. The ratio is roughly 55 / 25 / 12 / 8. Ships can swap white for a hull colour, but keep the same ratios.
3. **One silhouette idea each.** A large wing binder, a shield, a long tail boom, a hauling frame. Exaggerate that one shape and keep the rest compact.
4. **Readable at a glance.** Put the gold vents where the camera sees them from behind: back vents and thrusters.
5. **Detail goes on the back and the top.** The camera lives behind and a little above, so that is the only surface worth modelling; detail on a chest plate is modelling for a view nobody has. The vocabulary is shared across the fleet, which is part of what makes four silhouettes read as one: a seam or band crossing any plate big enough to read as a blank slab, louvres and radiator panels on the rear faces, small vernier housings with gold lips, canted skirts and fences to break a straight silhouette edge, and one asymmetric mast or beacon per unit. Bracing earns its place twice over on an open structure — a rectangle carries no load, and a frame without diagonals reads as a drawing of a frame.
6. **Thrust is the animation.** Engines pulse softly `thrust` → `signal`, with a bloom. Fade the plume out along its length rather than ending it with an edge: a cone drawn flat is a hard triangle from every angle except dead astern, and exhaust does not stop, it thins until it is gone. Mechs drift with small limb adjustments, and ships bank. Nothing fires, fights or explodes.

| Unit | Class | Silhouette idea | Flight feel |
| --- | --- | --- | --- |
| Wayfarer (XR-7) | Light mech | Folded wing binders that open when it boosts | Floaty, long glides |
| Bastion (HV-2) | Heavy mech | A huge shield-plate on one arm, slow and stately | Wide, lazy turns |
| Swordtail (SW-4) | Interceptor ship | A long blade-like tail boom, twin engines | Quick, sharp banking |
| Old Tuesday (FR-9) | Freighter ship | A boxy hauling frame with containers and patched plates | Slow, steady, lived-in |

The names and codes are placeholders. Rename them freely, but keep the UNIT XX-N code format.

## The sector

- **Debris and asteroids** replace the seabed. Chunky, flat-shaded rocks in `planet-rust` (warm side) and cool greys, gathered in fields and clusters like Currents' colonies, not sprinkled evenly.
- **Landmarks** replace the reefs and wrecks: a derelict station ring, a gate frame, a drifting container yard, a dusty planet on the horizon. Place them sparingly, about one per large region.
- **Particulate becomes stardust.** Fine motes drift in the current vector, and near landmarks they catch the light like gold dust. This is the app's namesake, so let it be the brightest thing in quiet moments.
- **The star cycle** replaces the day cycle: a slow drift of the key star's colour, from warm to cool to deep violet, over about 20 minutes.

## Sound, briefly

Keep it calm, but give the UI the Flash-era click: a soft mechanical tick on hover, a short rising tone on window open, and a lower one on close. The ambient bed is low engine hum plus sparse, jazzy piano or bass notes far away. Nothing loud.

## Don'ts

- Don't use weapons, explosions, damage or HUD targeting reticles. The instruments are for flying, not fighting.
- Don't use lens flares on every light. The logo's single flare is the benchmark, one per scene at most.
- Don't let a nebula fill the whole screen, and don't use purple-blue gradients.
- Don't place the nebula anywhere on the circle. Now that it's one of only two light sources, a bearing drawn from the full 360° leaves it behind your shoulder most of the time — and because it tints the fill light too, the sector quietly loses its colour without ever showing you why. Draw the bearing from the arc you can see from a standing start. It should still be something you can turn away from; it just shouldn't start that way.
- Don't copy any franchise unit, emblem or colour scheme exactly. Stardust's units share a language, not a lineage.
