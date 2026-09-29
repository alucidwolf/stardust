/* @ds-bundle: {"format":4,"namespace":"Stardust","components":[{"name":"Keycap"},{"name":"Button"},{"name":"HudHints"},{"name":"UnitTrigger"},{"name":"SoundControl"},{"name":"UnitCard"},{"name":"Window"},{"name":"Readout"},{"name":"Announce"},{"name":"BootSequence"},{"name":"TitleCard"}]} */
/* Stardust ships plain DOM + CSS: every component is markup styled by bundle.css. Two helpers play the one-shot motion. */
window.Stardust = {
  open: function (wrap) { wrap.hidden = false; wrap.removeAttribute("data-state"); void wrap.offsetWidth; wrap.setAttribute("data-state", "open"); },
  close: function (wrap) {
    wrap.setAttribute("data-state", "closing");
    var done = function () { wrap.hidden = true; wrap.removeAttribute("data-state"); };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { done(); return; }
    wrap.addEventListener("animationend", done, { once: true });
  }
};
