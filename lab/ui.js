// ui.js: scenarios, workshop buttons, design-it controls, stats panel, labels, strip chart, self-test.
import { View } from "./iso.js";
import { build, C } from "./machine.js";
import { Winder, planSetup, distanceForK, trackerError, gapMethod, evaluate } from "./model.js";
import { renderView } from "./camera.js";
import { Replay } from "./replay.js";

const $ = (id) => document.getElementById(id);
const load = (f) => fetch(`../data/${f}.json`).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });

const [cams, targets, trSweep, prSweep, meta, pipeline, day01, replayData] = await Promise.all(
  ["camera_presets", "targets", "tracker_sweep", "profile_sweep", "meta", "pipeline", "day01", "replay_T02"].map(load));

// ---------------- state ----------------
const S = {
  cam_id: "iphone15", mode_i: 0, lens_i: 0, distance_mm: 150, d_wire_mm: 0.2, rpm: 300,
  view: "front", light: "ceiling", plate: false, seeThrough: false, labels: true,
  running: true, speed: 1, wobble: 2.5, scenario: 1, auto: [],
};
const view = new View({ yaw: -0.62, elev: 0.52, scale: 9.5, cx: 450, cy: 285 });
const winder = new Winder({ rpm: S.rpm, d_wire_mm: S.d_wire_mm });
const replaySetup = day01.setup.find((r) => r.video_id === replayData.video_id) || {};
const replay = new Replay(replayData, replaySetup);
let sim = winder;              // what drives the drawing: the model or the real recording

const camOf = () => cams.find((c) => c.id === S.cam_id);
function recommendedDistance(camId, mi, li) {
  const c = cams.find((x) => x.id === camId);
  return Math.round(distanceForK(c.modes[mi], c.lenses[li], targets.K_DESIGN));
}

// ---------------- scenarios ----------------
const SCEN = [
  { n: "01", name: "Ideal winding", fig: "Ideal winding, recommended camera",
    set: () => ({ cam_id: "pi_hq", mode_i: 0, lens_i: 1, distance_mm: recommendedDistance("pi_hq", 0, 1), view: "profile", light: "side", plate: true }),
    proc: { pitch_extra: 0 }, auto: [] },
  { n: "02", name: "Day-1 phone setup (real)", fig: "Day-1 phone setup (real): iPhone 15, 4K 60 fps, 15 cm",
    set: () => ({ cam_id: "iphone15", mode_i: 0, lens_i: 0, distance_mm: 150, view: "front", light: "ceiling", plate: false }),
    proc: { pitch_extra: 0 }, auto: [] },
  { n: "03", name: "Stall at 0.86 (real defect)", fig: "Stall at 0.86 of the slot, layer 2: the defect found in all three recordings",
    set: () => ({ cam_id: "iphone15", mode_i: 0, lens_i: 0, distance_mm: 150, view: "front", light: "ceiling", plate: false }),
    proc: { pitch_extra: 0 }, auto: [{ layer: 1, pos: 0.86, what: "stall", dur: 2.0 }] },
  { n: "04", name: "Loose winding", fig: "Loose winding: pitch 8 % above the wire diameter, fewer turns per layer",
    set: () => ({ cam_id: "iphone15", mode_i: 0, lens_i: 0, distance_mm: 150, view: "front", light: "ceiling", plate: false }),
    proc: { pitch_extra: 0.08 }, auto: [] },
  { n: "05", name: "Recommended setup", fig: "Recommended setup: profile camera at k = 0.02 mm/px, plate, side light",
    set: () => ({ cam_id: "pi_hq", mode_i: 0, lens_i: 1, distance_mm: recommendedDistance("pi_hq", 0, 1), view: "profile", light: "side", plate: true }),
    proc: { pitch_extra: 0 }, auto: [{ layer: 0, pos: 0.5, what: "gap", extra: 0.06 }, { layer: 1, pos: 0.86, what: "stall", dur: 2.0 }] },
  { n: "06", name: "Replay real recording T02", fig: "Real recording D01_T02_15cm_003: positions measured by coilcv, frame by frame",
    set: () => ({ cam_id: "iphone15", mode_i: 0, lens_i: 1, distance_mm: 150, view: "front", light: "ceiling", plate: false }),
    proc: { pitch_extra: 0 }, auto: [], replay: true },
];

function applyScenario(i) {
  const sc = SCEN[i];
  S.scenario = i;
  Object.assign(S, sc.set());
  S.auto = sc.auto.map((a) => ({ ...a, done: false }));
  winder.p.pitch_extra = sc.proc.pitch_extra;
  sim = sc.replay ? replay : winder;
  $("b-stall").disabled = $("b-gap").disabled = !!sc.replay;
  $("replay-note").hidden = !sc.replay;
  $("fig-title").textContent = `Fig. ${sc.n} · ${sc.fig}`;
  syncControls();
  restart();
  renderScenarioList();
}

function renderScenarioList() {
  $("scenarios").innerHTML = SCEN.map((s, i) =>
    `<li><button data-i="${i}" aria-current="${i === S.scenario}"><span class="n">${s.n}</span>${s.name}</button></li>`).join("");
  $("scenarios").querySelectorAll("button").forEach((b) => (b.onclick = () => applyScenario(+b.dataset.i)));
}

// ---------------- controls ----------------
function fillSelect(sel, items, cur) {
  sel.innerHTML = items.map((t, i) => `<option value="${i}"${i === cur ? " selected" : ""}>${t}</option>`).join("");
}
function syncControls() {
  fillSelect($("c-cam"), cams.map((c) => c.name), cams.indexOf(camOf()));
  fillSelect($("c-mode"), camOf().modes.map((m) => m.label), S.mode_i);
  fillSelect($("c-lens"), camOf().lenses.map((l) => l.label), S.lens_i);
  $("c-dist").value = S.distance_mm; $("c-wire").value = S.d_wire_mm; $("c-rpm").value = S.rpm;
  $("c-speed").value = S.speed; $("c-wob").value = S.wobble;
  $("b-view").textContent = `View: ${S.view}`;
  $("b-light").textContent = `Light: ${S.light}`;
  $("b-plate").setAttribute("aria-pressed", S.plate);
  $("b-see").setAttribute("aria-pressed", S.seeThrough);
  $("b-labels").setAttribute("aria-pressed", S.labels);
  $("b-wind").textContent = S.running ? "❚❚ Pause" : "▶ Wind";
  $("wobble-map").setAttribute("scale", S.wobble);
  updateStats();
}

$("c-cam").onchange = (e) => { S.cam_id = cams[+e.target.value].id; S.mode_i = 0; S.lens_i = 0; syncControls(); };
$("c-mode").onchange = (e) => { S.mode_i = +e.target.value; syncControls(); };
$("c-lens").onchange = (e) => { S.lens_i = +e.target.value; syncControls(); };
$("c-dist").oninput = (e) => { S.distance_mm = +e.target.value; updateStats(); };
$("c-wire").oninput = (e) => { S.d_wire_mm = +e.target.value; updateStats(); restart(); };
$("c-rpm").oninput = (e) => { S.rpm = +e.target.value; winder.p.rpm = S.rpm; updateStats(); };
$("c-speed").oninput = (e) => { S.speed = +e.target.value; updateStats(); };
$("c-wob").oninput = (e) => { S.wobble = +e.target.value; $("wobble-map").setAttribute("scale", S.wobble); updateStats(); };

$("b-wind").onclick = () => { if (sim.done) restart(); S.running = !S.running; syncControls(); };
$("b-restart").onclick = () => { restart(); S.running = true; syncControls(); };
$("b-stall").onclick = () => { winder.injectStall(1.6); flash("stall"); };
$("b-gap").onclick = () => { winder.injectGap(0.06); flash("gap"); };
$("b-view").onclick = () => { S.view = S.view === "front" ? "profile" : "front"; syncControls(); };
$("b-light").onclick = () => { S.light = S.light === "ceiling" ? "side" : "ceiling"; syncControls(); };
$("b-plate").onclick = () => { S.plate = !S.plate; syncControls(); };
$("b-see").onclick = () => { S.seeThrough = !S.seeThrough; syncControls(); };
$("b-labels").onclick = () => { S.labels = !S.labels; syncControls(); };

function restart() {
  winder.reset({ rpm: S.rpm, d_wire_mm: S.d_wire_mm });
  replay.reset();
  S.auto.forEach((a) => (a.done = false));
  lastEvent = null;
}

let flashUntil = 0, flashWhat = "";
function flash(what) { flashWhat = what; flashUntil = performance.now() + 1500; }

// drag to turn
let drag = null;
$("scene").addEventListener("pointerdown", (e) => { drag = { x: e.clientX, yaw: view.yaw }; $("scene").setPointerCapture(e.pointerId); });
// yaw limited to front-ish views, where the painter's order of the parts is right
$("scene").addEventListener("pointermove", (e) => { if (drag) view.yaw = Math.max(-1.25, Math.min(0.35, drag.yaw + (e.clientX - drag.x) * 0.008)); });
$("scene").addEventListener("pointerup", () => (drag = null));

// ---------------- stats panel ----------------
const fmt = (x, n = 3) => (x == null || !isFinite(x) ? "–"
  : Math.abs(x) >= 100 ? Math.round(x).toLocaleString("en-US") : Math.abs(x) >= 10 ? x.toFixed(1) : Number(x).toPrecision(n));
const badge = (ok, warn) => `<span class="badge ${ok ? "ok" : warn ? "warn" : "bad"}">${ok ? "ok" : warn ? "~" : "no"}</span>`;
let plan = null;

function updateStats() {
  plan = planSetup(cams, { cam_id: S.cam_id, mode_i: S.mode_i, lens_i: S.lens_i, distance_mm: S.distance_mm,
    d_wire_mm: S.d_wire_mm, rpm: S.rpm, min_px_track: targets.MIN_PX_PER_WIRE_TRACK,
    min_px_gap: targets.TARGET_PX_PER_WIRE_GAP, min_frames_rev: targets.MIN_FRAMES_PER_REV });
  const p = plan, cam = camOf(), lens = cam.lenses[S.lens_i], mode = cam.modes[S.mode_i];
  const tr = trackerError(trSweep, p.N_D_px_per_wire);
  const gm = gapMethod(prSweep, p.N_D_px_per_wire);
  const gapOK = S.view === "profile" && p.gap_ok && gm.reliable && p.slot_fits;
  const row = (q, v, b = "") => `<tr><td class="q">${q}</td><td class="v">${v}</td><td>${b}</td></tr>`;
  $("stats").innerHTML = [
    row(`pixel scale <b>k</b> (48)<br><small>${p.k_source}</small>`, `${fmt(p.k_mm_per_px)} mm/px`),
    p.k_source === "calibrated" ? row(`<small>nominal optics would give</small>`, `<small>${fmt(p.k_nominal_mm_per_px)}</small>`) : "",
    row("field of view along the slot", `${fmt(p.fov_mm)} mm`, badge(p.slot_fits)),
    row(`<b>px per wire</b> N<sub>D</sub> (52)`, fmt(p.N_D_px_per_wire), badge(p.gap_ok, p.tracker_ok)),
    row(`frames per revolution (62)`, fmt(p.frames_per_rev), badge(p.speed_ok)),
    row(`max speed for ${targets.MIN_FRAMES_PER_REV} frames/rev (66)`, `${fmt(p.n_max_rpm)} rpm`),
    row(`σ<sub>S</sub> (56) · min gap G (60)`, `${fmt(p.sigma_S_mm * 1000, 2)} · ${fmt(p.G_max_min_mm * 1000, 2)} µm`),
    row(`in focus at this distance${p.focus_ok ? "" : "<br><small>closer: extension tube / macro</small>"}`, lens.min_focus_mm ? `≥ ${lens.min_focus_mm} mm` : "–", badge(p.focus_ok, true)),
    `<tr class="verdict"><td class="q"><b>Channel A</b>: wire tracker (front)</td><td class="v">${tr.validated ? `±${fmt(tr.rmse_mm * 1000, 2)} µm` : p.N_D_px_per_wire >= 1.5 ? `~±${fmt(tr.rmse_mm * 1000, 2)} µm*` : "below 1.5 px"}</td><td>${badge(p.tracker_ok && p.slot_fits, !p.tracker_ok && p.N_D_px_per_wire > 1.5)}</td></tr>`,
    `<tr class="verdict"><td class="q"><b>Channel B</b>: gap method (profile, eq. 44–47)</td><td class="v">${gapOK ? `gaps ≥ ${gm.min_gap_mm} mm` : S.view !== "profile" ? "needs profile view" : `${fmt(p.N_D_px_per_wire, 2)} &lt; ${targets.TARGET_PX_PER_WIRE_GAP} px`}</td><td>${badge(gapOK)}</td></tr>`,
  ].join("");
  $("src").innerHTML = `Rows (48)–(66): thesis equations, same code as <code>system_params.py</code>. Channel A/B: measured on coilcv's synthetic sweeps (tracker RMSE at this px/wire; gap method at grid ${gm.grid_px ?? "–"} px/wire). For gaps with this lens, move to <b>${fmt(p.distance_for_gap_mm)} mm</b>${lens.min_focus_mm && p.distance_for_gap_mm < lens.min_focus_mm ? " (closer than it can focus: needs a macro lens)" : ""}.${p.tracker_ok ? "" : " *Below the synthetic validation range (2 px/wire); the day-1 recordings at 1.7–2.0 px/wire were still tracked and showed the stall."}`;
  $("v-dist").textContent = `${S.distance_mm} mm`;
  $("v-wire").textContent = `${S.d_wire_mm.toFixed(2)} mm`;
  $("v-rpm").textContent = `${S.rpm} rpm`;
  $("v-speed").textContent = `${S.speed.toFixed(1)}×`;
  $("v-wob").textContent = S.wobble;
  $("cam-note").textContent = `${cam.name}: ${cam.sensor}; ${mode.label}, effective pixel ${mode.pixel_um} µm; ${lens.label}. ${lens.note ? lens.note + ". " : ""}Source: ${cam.source}.`;
}

// ---------------- labels ----------------
const LBL = {
  bobbin: [40, -70], "wound layers": [-120, -95], "guide nozzle": [70, 60], "free wire span": [-150, 40],
  spindle: [-30, -80], tensioner: [-60, -50], camera: [-80, -40], lamp: [40, -30], "background plate": [40, -40],
  "traverse rail": [40, 50],
};
function labelsSvg(anchors, active) {
  if (!S.labels) return "";
  let s = "";
  for (const [name, a] of Object.entries(anchors)) {
    if (!a) continue;
    const [x, y] = view.project(a);
    const [dx, dy] = LBL[name];
    const tx = Math.max(6, Math.min(894 - name.length * 7 - 16, x + dx)), ty = Math.max(14, Math.min(546, y + dy));
    const w = name.length * 6.9 + 16;
    const on = active.has(name);
    s += `<g><line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(tx + w / 2).toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${C.ink}" stroke-width="1"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="${C.ink}"/>` +
      `<rect x="${tx.toFixed(1)}" y="${(ty - 10).toFixed(1)}" width="${w.toFixed(1)}" height="20" rx="10" fill="${on ? C.ink : "#fbf9f4"}" stroke="${C.ink}" stroke-width="1.2"/>` +
      `<text x="${(tx + 8).toFixed(1)}" y="${(ty + 4).toFixed(1)}" font-family="IBM Plex Mono, Menlo, monospace" font-size="11" font-weight="500" fill="${on ? "#f5f1e8" : C.ink}">${name}</text></g>`;
  }
  return s;
}

// ---------------- strip chart ----------------
function stripSvg() {
  const H = sim.history, W = 600, Hh = 110, span = 10, lim = 2;
  if (!H.length) return "";
  const t1 = H[H.length - 1].t, t0 = t1 - span;
  const X = (t) => ((t - t0) / span) * W, Y = (v) => Hh / 2 - (Math.max(-lim, Math.min(lim, v)) / lim) * (Hh / 2 - 6);
  const pts = H.filter((h) => h.t >= t0).map((h) => `${X(h.t).toFixed(1)},${Y(h.dev).toFixed(1)}`).join(" ");
  return `<rect x="0" y="${Y(0.5)}" width="${W}" height="${Y(-0.5) - Y(0.5)}" fill="${C.green}" opacity="0.1"/>` +
    `<line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="#ccc"/>` +
    `<text x="6" y="${Y(0.5) - 4}" font-size="10" font-family="IBM Plex Mono" fill="${C.green}">+0.5 mm</text>` +
    `<text x="6" y="${Hh - 6}" font-size="10" font-family="IBM Plex Mono" fill="#999">−2 mm</text>` +
    `<polyline points="${pts}" fill="none" stroke="${C.purple}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
}

// ---------------- main loop ----------------
let lastT = performance.now(), lastEvent = null, lastInset = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (S.running && !sim.done) {
    const sub = Math.max(1, Math.ceil((dt * S.speed) / 0.005));
    for (let i = 0; i < sub; i++) {
      sim.step((dt * S.speed) / sub);
      if (sim === winder) autoEvents();
    }
  }
  draw(now);
  requestAnimationFrame(frame);
}

function draw(now = performance.now()) {
  const active = new Set();
  if (S.running && !sim.done) active.add("spindle").add("guide nozzle");
  if (sim.stalled() || Math.abs(sim.dev()) > 0.5) active.add("free wire span");
  if (now < flashUntil) active.add(flashWhat === "gap" ? "wound layers" : "free wire span");
  const { svg, anchors } = build({ winder: sim, view: S.view, light: S.light, plate: S.plate, seeThrough: S.seeThrough,
    distance_mm: S.distance_mm, viewObj: view, active });
  $("machine").innerHTML = svg;
  $("labels").innerHTML = labelsSvg(anchors, active);
  $("strip").innerHTML = stripSvg();
  live();
  if (now - lastInset > 100) { lastInset = now; inset(); pipelineLive(); }
}

function autoEvents() {
  const span = winder.xHi - winder.xLo;
  for (const a of S.auto) {
    if (a.done || winder.layer !== a.layer) continue;
    const dir = winder.dir();
    const pos = (winder.xg - winder.xLo) / span;
    if ((dir > 0 && pos >= a.pos) || (dir < 0 && pos <= a.pos)) {
      a.done = true;
      if (a.what === "stall") winder.injectStall(a.dur);
      else winder.injectGap(a.extra);
      flash(a.what);
    }
  }
}

function live() {
  const w = sim, dev = w.dev(), defect = Math.abs(dev) > 0.5;
  if (defect) lastEvent = { t: w.t, pos: (w.xw - w.xLo) / (w.xHi - w.xLo), layer: w.layer + 1 };
  const perLayer = w.turns.filter((t) => t.layer === Math.max(0, w.layer - (w.done ? 1 : 0))).length;
  const tpl = w.p.slot_mm / (w.p.d_wire_mm * (1 + w.p.pitch_extra));
  const seen = plan && plan.N_D_px_per_wire >= 1.5, edge = plan && !plan.tracker_ok;
  $("live").innerHTML = [
    `t <b>${w.t.toFixed(1)} s</b>`,
    `layer <b>${Math.min(w.layer + 1, w.p.layers)}</b>/${w.p.layers}`,
    `turns this layer <b>${perLayer}</b> (full ${tpl.toFixed(1)} vs ${w.tplNominal.toFixed(1)} tight)`,
    `lag dev <b style="color:${defect ? C.red : C.ink}">${dev >= 0 ? "+" : ""}${dev.toFixed(2)} mm</b>`,
    defect ? `<span class="ev bad">DISPLACEMENT DEFECT${seen ? (edge ? " · tracker sees it (below validated 2 px, as on day 1)" : " · tracker sees it") : " · too few px per wire to see it"}</span>`
      : lastEvent ? `<span class="ev bad" style="opacity:.55">last defect: layer ${lastEvent.layer}, pos ${lastEvent.pos.toFixed(2)}</span>`
        : `<span class="ev ok">wire follows the guide</span>`,
    w === replay ? `<span class="ev" style="background:${C.blue}">real data</span>` : "",
    w.done ? `<b>finished</b> · press Restart` : "",
  ].join(" &nbsp; ");
}

// ---------------- camera sees ----------------
function inset() {
  if (!plan) return;
  const o = { w: sim, view: S.view, light: S.light, plate: S.plate };
  const a = renderView($("cam-a"), o, plan.k_mm_per_px);
  const b = renderView($("cam-b"), o, targets.K_DESIGN);
  $("cam-a-lbl").innerHTML = `your setup · k ${fmt(plan.k_mm_per_px)} mm/px · <b>${fmt(a.n_d, 2)} px</b> per wire`;
  $("cam-b-lbl").innerHTML = `target · k ${targets.K_DESIGN} mm/px · <b>${fmt(b.n_d, 2)} px</b> per wire`;
}

// ---------------- pipeline (levels of Fig. 2) ----------------
let pipeSel = { level: 4, ch: "A" };
function renderPipeline() {
  $("pipe").innerHTML = pipeline.levels.map((L) => `<div class="lvl"><div class="lvl-name"><b>${L.level}</b> ${L.name}<small>${L.unit}</small></div>` +
    L.blocks.map((b) => `<button class="blk ch${b.channel}" data-l="${L.level}" data-c="${b.channel}" aria-pressed="${pipeSel.level === L.level && pipeSel.ch === b.channel}">${b.title}</button>`).join("") + "</div>").join("");
  $("pipe").querySelectorAll(".blk").forEach((b) => (b.onclick = () => { pipeSel = { level: +b.dataset.l, ch: b.dataset.c }; renderPipeline(); }));
  pipelineLive();
}

function pipelineLive() {
  const L = pipeline.levels.find((l) => l.level === pipeSel.level);
  const b = L.blocks.find((x) => x.channel === pipeSel.ch);
  const p = plan, w = sim, cam = camOf(), mode = cam.modes[S.mode_i];
  const nd = p ? fmt(p.N_D_px_per_wire, 2) : "–";
  const sys = day01.defects_across_videos.find((r) => r.systematic);
  const now = {
    0: `${mode.label}, ${S.rpm} rpm, wire ${S.d_wire_mm.toFixed(2)} mm, slot ${w.p.slot_mm.toFixed(1)} mm`,
    1: `one pixel covers ${fmt(p?.k_mm_per_px)} × ${fmt(p?.k_mm_per_px)} mm of the scene (see "camera sees")`,
    2: `the wire is ${nd} px wide in every image row`,
    3: `wire contact at ${w.xw.toFixed(2)} mm, guide at ${w.xg.toFixed(2)} mm`,
    4: `layer ${Math.min(w.layer + 1, w.p.layers)}, lag deviation ${w.dev().toFixed(2)} mm ${Math.abs(w.dev()) > 0.5 ? "→ <b>displacement defect</b>" : "(within ±0.5 mm)"}`,
    5: `f_rev = ${(S.rpm / 60).toFixed(2)} Hz; pitch = d_D = ${nd} px per turn`,
    6: `k ${fmt(p?.k_mm_per_px)} mm/px · N_D ${nd} px · ${fmt(p?.frames_per_rev)} frames/rev`,
    7: sys ? `day 1: winding layer ${sys.winding_layer_no} at ${sys.pos_norm_mean.toFixed(2)} of the slot in ${sys.n_videos}/3 videos → systematic` : "–",
  }[L.level];
  const chName = { A: "Channel A, wire tracker", B: "Channel B, gap method", AB: "both channels" }[b.channel];
  $("pipe-detail").innerHTML = `<p class="kick">Level ${L.level} · ${L.name} · ${chName} · unit: ${L.unit}</p>` +
    `<h3>${b.title}</h3><p>${b.what}</p>` +
    (b.channel === "B" && S.view !== "profile" ? `<p class="muted">Channel B needs the profile view (switch View in the workshop).</p>` : "") +
    `<p class="now"><span>in the Lab now</span> ${now}</p>` +
    `<p class="fns">${b.functions.map((f) => `<a href="${f.url}" target="_blank" rel="noopener"><code>${f.name}</code></a>`).join(" ")}</p>`;
}

// ---------------- check yourself ----------------
const QUIZ = [
  { q: "The day-1 phone setup gives about 1.7–2 px per 0.2 mm wire. What can it measure?",
    a: ["Gaps between turns with the gap method", "The wire position and stalls (Channel A)", "Nothing useful"], ok: 1,
    why: "The tracker needs about 2 px per wire and found the stall at 0.86 in all three recordings. The gap method needs ≥ 10 px per wire." },
  { q: "You want to measure gaps between turns. What changes most?",
    a: ["Faster spindle", "Profile view at k ≈ 0.02 mm/px, plate behind, side light", "Ceiling light only"], ok: 1,
    why: "Eq. (52): N_D = d_D / k ≥ 10 → k ≤ 0.02 mm/px for a 0.2 mm wire, seen against a matte plate (try scenario 05)." },
  { q: "60 fps camera, spindle at 1200 rpm. Frames per revolution (eq. 62)?",
    a: ["3", "12", "0.05"], ok: 0,
    why: "60 × 60 / 1200 = 3: exactly the minimum of eq. (66). Any faster and one revolution is under-sampled." },
  { q: "The same defect appears at 0.86 of the slot in three recordings. Its likely cause is…",
    a: ["The camera", "The winding process (systematic)", "Random noise"], ok: 1,
    why: "A defect at the same place in ≥ 2 runs is classed as systematic: it comes from the machine or process, not from the camera." },
];
function renderQuiz() {
  $("quiz").innerHTML = QUIZ.map((x, i) => `<li><p>${x.q}</p><div class="opts">${x.a.map((t, j) =>
    `<button data-q="${i}" data-a="${j}">${t}</button>`).join("")}</div><p class="why" id="why-${i}" hidden></p></li>`).join("");
  $("quiz").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    const x = QUIZ[+b.dataset.q], right = +b.dataset.a === x.ok;
    b.parentElement.querySelectorAll("button").forEach((o) => (o.className = +o.dataset.a === x.ok ? "right" : o === b ? "wrong" : ""));
    const why = $(`why-${b.dataset.q}`);
    why.hidden = false;
    why.innerHTML = `<b>${right ? "Right." : "Not quite."}</b> ${x.why}`;
  }));
}

// ---------------- save the figure (PNG, 3x) ----------------
async function figurePNG(scale = 3) {
  // the scene plus a title band on top and a source line at the bottom, so nothing overlaps
  const t = $("fig-title").textContent.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const mono = "IBM Plex Mono, Menlo, monospace";
  const H = 560 + 36 + 26;
  const src = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${H}" viewBox="0 0 900 ${H}">` +
    `<rect width="900" height="${H}" fill="#f5f1e8"/>` +
    `<text x="14" y="24" font-family="${mono}" font-size="13" font-weight="600" fill="#22201c">${t}</text>` +
    `<svg x="0" y="36" width="900" height="560" viewBox="0 0 900 560" overflow="hidden">${$("scene").innerHTML}</svg>` +
    `<text x="886" y="${H - 9}" text-anchor="end" font-family="${mono}" font-size="10" fill="#6b665c">coilcv Coil Winder Lab · schematic, not to scale</text></svg>`;
  const svg = { outer: src };
  const url = URL.createObjectURL(new Blob([svg.outer], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise((r, e) => { img.onload = r; img.onerror = e; img.src = url; });
  const c = document.createElement("canvas");
  c.width = 900 * scale; c.height = H * scale;
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/png");
}
$("b-save").onclick = async () => {
  const a = document.createElement("a");
  a.href = await figurePNG();
  a.download = `coilcv_lab_${SCEN[S.scenario].n}.png`;
  a.click();
};

// ---------------- self-test (?selftest): JS port vs Python ----------------
async function selftest() {
  const par = await load("parity");
  let n = 0, bad = [];
  const cmp = (exp, got, tag) => {
    for (const [k, v] of Object.entries(exp)) {
      n++;
      const g = got[k];
      const ok = typeof v === "number" ? Math.abs(g - v) <= 1e-9 * Math.max(1, Math.abs(v)) : v === g;
      if (!ok) bad.push(`${tag} ${k}: py ${v} js ${g}`);
    }
  };
  par.evaluate.forEach((c, i) => cmp(c.outputs, evaluate(c.inputs), `evaluate[${i}]`));
  par.plan_setup.forEach((c, i) => cmp(c.outputs, planSetup(cams, c.inputs), `plan[${i}]`));
  $("selftest").innerHTML = `<span class="badge ${bad.length ? "bad" : "ok"}">${bad.length ? "parity FAIL" : "parity ok"}</span>${n - bad.length}/${n} values match Python. `;
  if (bad.length) console.error(bad);
}

// ---------------- start ----------------
$("data-src").textContent = `coilcv @${(meta.coilcv_tag || meta.coilcv_commit || "local").slice(0, 12)}${meta.dirty ? " (uncommitted)" : ""}`;
if (meta.coilcv_commit) $("data-src").href = `${meta.repo}/tree/${meta.coilcv_commit}`;
renderScenarioList();
renderPipeline();
renderQuiz();
applyScenario(1);
if (new URLSearchParams(location.search).has("selftest")) selftest();
requestAnimationFrame(frame);
window.__lab = { winder, replay, S, view, figurePNG, draw, get sim() { return sim; } };   // for debugging in the console
