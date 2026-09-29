# SoundControl

A sound on/off toggle with a segmented volume meter made of skewed bars.

**Markup:** `<div class="sd-sound sd-plate" role="group" aria-label="Sound">` containing `<button class="sd-sound__toggle" aria-pressed>` and a `.sd-sound__meter` of `<i>` segments, with the lit ones marked `.on`.

- For real input, put an `<input type="range">` over the meter, or drive the meter from arrow keys. The meter itself is only a display.
- The label says the state in words ("Sound on", "Sound off"), so colour is never the only signal.
