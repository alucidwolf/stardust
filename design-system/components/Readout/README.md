# Readout

Telemetry: a `<dl>` of mono label and value pairs on a small armour plate. Use it for the F stats overlay, and anywhere else you show numbers.

**Markup:** `<dl class="sd-readout sd-plate sd-plate--armour">` with `<dt>` and `<dd>` pairs. On a `<dd>`, add `is-live` for a changing value (`signal`) or `is-warn` for a warning (`alert`).

- Labels are 3–6 letter codes (VEL, HDG, SECTOR). Values are tabular and right-aligned.
