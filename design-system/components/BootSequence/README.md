# BootSequence

The loading screen: a short list of system lines followed by a segmented progress bar.

**Markup:** `.sd-boot` (with `role="status"`) containing a `ul.sd-boot__lines` (each line ends in a `<span>OK</span>`) and `.sd-boot__bar` with 16 `<i>` segments, the filled ones marked `.on`. Set `data-state="run"` to reveal the lines 90ms apart.

- This is the one place the full "system booting" register is allowed. Keep it to five lines, and let the last one say "LAUNCH".
- Like Currents' boot screen, it has to paint before any fonts load. The inline version uses `system` and the mono fallback, with no images.
