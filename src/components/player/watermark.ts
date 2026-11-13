/**
 * Dynamic watermark rendered by the PLAYER (a DOM overlay, never burned into the video).
 * - drifts to a new position every few seconds, stays semi-transparent
 * - built with raw DOM (not React) so we fully control it, and guarded by:
 *     1. a MutationObserver on the container (re-injects if removed)
 *     2. a MutationObserver on each node (restores style/text if edited)
 *     3. a 1s integrity poll over computed style (opacity / display / visibility / size)
 * Honest limit: a determined user with devtools can still hide it for a moment or record the screen
 * with it cropped - the overlay is a deterrent + forensic trail, not DRM. See README.
 */
export type WatermarkInfo = { name: string; code: string; email: string };

const BASE = "position:absolute;z-index:2147483000;pointer-events:none;user-select:none;color:#fff;opacity:.3;" +
  "font:600 12px/1.35 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 0 3px rgba(0,0,0,.9),0 0 1px #000;" +
  "padding:6px 10px;white-space:pre;transition:top 2.2s ease-in-out,left 2.2s ease-in-out;mix-blend-mode:normal;visibility:visible;display:block;";

export function installWatermark(container: HTMLElement, info: WatermarkInfo, onTamper: (why: string) => void) {
  const stamp = () => new Date().toLocaleString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" });
  const text = () => `${info.name} · ${info.code}\n${info.email}\n${stamp()} IST`;
  const rand = (a: number, b: number) => Math.round(a + Math.random() * (b - a));

  type Mark = { el: HTMLDivElement; lastStyle: string; lastText: string; pos: () => [number, number]; obs?: MutationObserver };
  const marks: Mark[] = [];
  const specs: { pos: () => [number, number]; rot: number }[] = [
    { pos: () => [rand(4, 62), rand(6, 70)], rot: 0 },        // primary: roams the frame
    { pos: () => [rand(40, 70), rand(55, 80)], rot: -14 },    // secondary: tilted, slower
  ];

  const styleFor = (m: Mark, rot: number) => { const [l, t] = m.pos(); return `${BASE}left:${l}%;top:${t}%;transform:rotate(${rot}deg);`; };

  function build(i: number): Mark {
    const el = document.createElement("div");
    el.setAttribute("data-wm", String(i));
    const m: Mark = { el, lastStyle: "", lastText: "", pos: specs[i].pos };
    m.lastStyle = styleFor(m, specs[i].rot); m.lastText = text();
    el.setAttribute("style", m.lastStyle); el.textContent = m.lastText;
    container.appendChild(el);
    m.obs = new MutationObserver(() => {
      if (el.getAttribute("style") !== m.lastStyle || el.textContent !== m.lastText) { restore(m, i); onTamper("node_modified"); }
    });
    m.obs.observe(el, { attributes: true, characterData: true, childList: true, subtree: true });
    return m;
  }
  function restore(m: Mark, i: number) {
    m.el.setAttribute("style", m.lastStyle); m.el.textContent = m.lastText;
    if (!m.el.isConnected) container.appendChild(m.el);
    void i;
  }
  specs.forEach((_, i) => marks.push(build(i)));

  // 1) container-level observer: re-inject removed marks
  const cobs = new MutationObserver((recs) => {
    for (const r of recs) r.removedNodes.forEach((n) => {
      const idx = marks.findIndex((m) => m.el === n);
      if (idx >= 0) { container.appendChild(marks[idx].el); onTamper("node_removed"); }
    });
  });
  cobs.observe(container, { childList: true });

  const update = (i: number, move: boolean) => {
    const m = marks[i];
    m.lastText = text();
    if (move) m.lastStyle = styleFor(m, specs[i].rot);
    m.el.setAttribute("style", m.lastStyle); m.el.textContent = m.lastText;
  };
  const clock = setInterval(() => marks.forEach((_, i) => update(i, false)), 1000);
  const movers = [setInterval(() => update(0, true), 7000), setInterval(() => update(1, true), 11000)];

  // 3) integrity poll
  const poll = setInterval(() => {
    marks.forEach((m, i) => {
      if (!m.el.isConnected) { container.appendChild(m.el); onTamper("detached"); return; }
      const cs = getComputedStyle(m.el), r = m.el.getBoundingClientRect(), c = container.getBoundingClientRect();
      const hidden = cs.display === "none" || cs.visibility !== "visible" || parseFloat(cs.opacity) < 0.12 || r.width < 20 || r.height < 10;
      const covered = r.right < c.left || r.left > c.right || r.bottom < c.top || r.top > c.bottom;
      if (hidden || covered) { restore(m, i); onTamper("hidden_or_offscreen"); }
    });
  }, 1000);

  return () => {
    clearInterval(clock); clearInterval(poll); movers.forEach(clearInterval); cobs.disconnect();
    marks.forEach((m) => { m.obs?.disconnect(); m.el.remove(); });
  };
}
