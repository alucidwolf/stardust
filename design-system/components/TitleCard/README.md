# TitleCard

Shown once as the first flight starts: the Stardust logo poster above one micro line of sortie and sector.

**Markup:** `.sd-title` containing `img.sd-title__logo` (the `stardust-logo.jpg` asset) and a `.sd-micro`.

- The poster already has the wordmark in it, so don't repeat the name as text. Use `.sd-title__word` only where the poster doesn't fit, such as short viewports.
- It fades in and out over 1.2s and never blocks input.
