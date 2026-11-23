// model.js: the numbers of the Coil Winder Lab.
//  * evaluate(), planSetup(): JS port of coilcv src/utils/system_params.py, thesis eq. (48)-(67)
//    plus the camera model. Checked against Python by data/parity.json (open the Lab with ?selftest).
//  * trackerError(), gapMethod(): looked up from coilcv's synthetic sweeps, NOT simulated here.
//  * Winder: kinematics of winding, a simplified port of winding_sim.simulate_kinematics
//    (guide traverse, laid wire trailing the guide, stalls and gaps), stepped in real time.

// ---------------- eq. (48)-(67) ----------------
export function evaluate(i) {
  const k = i.L_mm / i.P_px;                         // (48)
  const N_D = i.d_wire_mm / k;                       // (52)
  const sigma_s = Math.SQRT2 * i.sigma_c_px;         // (55)
  const sigma_S = k * sigma_s;                       // (56)
  const req = i.frames_per_rev_req ?? 3;
  return {
    "k_mm_per_px (48)": k,
    "dL_1px_mm (50)": k,
    "dL_0.25px_mm (51)": 0.25 * k,
    "N_D_px_per_wire (52)": N_D,
    "sigma_s_px (55)": sigma_s,
    "sigma_S_mm (56)": sigma_S,
    "delta_% (59)": (sigma_S / i.d_wire_mm) * 100,
    "G_max_min_mm (60)": 3 * sigma_S,
    "N_frame_per_rev (62)": (60 * i.fps) / i.rpm,
    "n_max_rpm, 1 frame/rev (64)": 60 * i.fps,
    [`n_max_rpm, ${fmtG(req)} frames/rev (66)`]: (60 * i.fps) / req,
    "k_max for N_D=10, mm/px (49b)": i.d_wire_mm / 10,
    "magnification needed for N_D=10, x": 10 / N_D,
  };
}
const fmtG = (x) => (Number.isInteger(x) ? String(x) : String(x));

// ---------------- camera model ----------------
export const SLOT_FOV_MARGIN = 1.2;

export function kThinLens(pixel_um, focal_mm, distance_mm) {
  if (distance_mm <= focal_mm) return NaN;
  return (pixel_um * 1e-3 * (distance_mm - focal_mm)) / focal_mm;
}

export function kFor(mode, lens, d) {
  if (lens.k_ref_mm_per_px != null) return [lens.k_ref_mm_per_px * (d / lens.d_ref_mm) * (3840 / mode.width_px), "calibrated"];
  return [kThinLens(mode.pixel_um, lens.focal_mm, d), "nominal (thin lens)"];
}

export function distanceForK(mode, lens, kt) {
  if (lens.k_ref_mm_per_px != null) return (kt / (lens.k_ref_mm_per_px * (3840 / mode.width_px))) * lens.d_ref_mm;
  return lens.focal_mm * (1 + kt / (mode.pixel_um * 1e-3));
}

export function planSetup(cams, { cam_id, mode_i, lens_i, distance_mm, d_wire_mm = 0.2, rpm = 300, slot_mm = 11.1,
  sigma_c_px = 0.5, min_px_track = 2, min_px_gap = 10, min_frames_rev = 3 }) {
  const cam = cams.find((c) => c.id === cam_id);
  const mode = cam.modes[mode_i], lens = cam.lenses[lens_i];
  const [k, how] = kFor(mode, lens, distance_mm);
  const fov = k * mode.width_px;
  const ev = evaluate({ L_mm: fov, P_px: mode.width_px, d_wire_mm, sigma_c_px, fps: mode.fps, rpm, frames_per_rev_req: min_frames_rev });
  const nd = ev["N_D_px_per_wire (52)"], fpr = ev["N_frame_per_rev (62)"];
  return {
    k_mm_per_px: k, k_source: how,
    k_nominal_mm_per_px: lens.focal_mm ? kThinLens(mode.pixel_um, lens.focal_mm, distance_mm) : null,
    fov_mm: fov, fov_h_mm: k * mode.height_px,
    slot_fits: fov >= SLOT_FOV_MARGIN * slot_mm, slot_px: slot_mm / k,
    N_D_px_per_wire: nd, sigma_S_mm: ev["sigma_S_mm (56)"], G_max_min_mm: ev["G_max_min_mm (60)"],
    frames_per_rev: fpr, n_max_rpm: ev[`n_max_rpm, ${fmtG(min_frames_rev)} frames/rev (66)`],
    tracker_ok: nd >= min_px_track, gap_ok: nd >= min_px_gap, speed_ok: fpr >= min_frames_rev,
    focus_ok: lens.min_focus_mm == null || distance_mm >= lens.min_focus_mm,
    distance_for_gap_mm: distanceForK(mode, lens, d_wire_mm / min_px_gap),
  };
}

// ---------------- measured behaviour from the sweeps ----------------
// Tracker: mean position RMSE over blur/glare at each px/wire, interpolated in log(px/wire).
export function trackerError(sweep, nd) {
  const by = new Map();
  for (const r of sweep.rows) { const a = by.get(r.px_per_wire) || []; a.push(r.pos_rmse_mm); by.set(r.px_per_wire, a); }
  const g = [...by].map(([p, a]) => [p, a.reduce((s, x) => s + x, 0) / a.length]).sort((a, b) => a[0] - b[0]);
  if (nd < g[0][0]) return { rmse_mm: g[0][1], validated: false, grid: g };
  if (nd >= g[g.length - 1][0]) return { rmse_mm: g[g.length - 1][1], validated: true, grid: g };
  for (let i = 0; i < g.length - 1; i++) {
    if (nd >= g[i][0] && nd < g[i + 1][0]) {
      const t = (Math.log(nd) - Math.log(g[i][0])) / (Math.log(g[i + 1][0]) - Math.log(g[i][0]));
      return { rmse_mm: g[i][1] + t * (g[i + 1][1] - g[i][1]), validated: true, grid: g };
    }
  }
}

// Gap method: nearest sweep grid point at or below this px/wire. Reliable = no false defects for
// gaps up to 0.12 mm; smallest gap = first gap detected in >= 90 % of the trials.
export function gapMethod(sweep, nd) {
  const grid = [...new Set(sweep.rows.map((r) => r.px_per_wire))].sort((a, b) => a - b);
  const g = grid.filter((p) => p <= nd + 1e-9).pop();
  if (g == null) return { grid_px: null, reliable: false, min_gap_mm: null };
  const rows = sweep.rows.filter((r) => r.px_per_wire === g);
  const reliable = rows.filter((r) => r.gap_true_mm <= 0.12).every((r) => (r.false_defects ?? 0) === 0);
  const det = rows.filter((r) => r.gap_true_mm > 0 && r.detect_rate >= 0.9).map((r) => r.gap_true_mm);
  return { grid_px: g, reliable, min_gap_mm: det.length ? Math.min(...det) : null };
}

// ---------------- winding kinematics ----------------
export class Winder {
  constructor(p = {}) { this.reset(p); }

  reset(p = {}) {
    this.p = Object.assign({ slot_mm: 11.1, d_wire_mm: 0.2, rpm: 300, layers: 3, lag_mm: 0.15, tau_s: 0.08,
      settle_s: 0.3, pitch_extra: 0, startDir: -1 }, this.p || {}, p);
    this.t = 0; this.angle = 0; this.layer = 0; this.tl = 0; this.done = false;
    this.xg = this.p.startDir > 0 ? this.xLo : this.xHi; this.xw = this.xg;
    this.turns = [];            // {x, layer, defect}
    this.stallUntil = -1; this.gapOffset = 0;
    this.history = [];          // {t, xg, xw, dev}
    this.revFrac = 0;
  }

  get v() { return (this.p.d_wire_mm * this.p.rpm) / 60 * (1 + this.p.pitch_extra); }   // guide speed, mm/s
  get xLo() { return this.p.d_wire_mm / 2; }
  get xHi() { return this.p.slot_mm - this.p.d_wire_mm / 2; }
  get tplNominal() { return this.p.slot_mm / this.p.d_wire_mm; }
  stalled() { return this.t < this.stallUntil; }

  injectStall(dur = 1.6) { this.stallUntil = this.t + dur; }
  injectGap(extra_mm = 0.25) { this.gapOffset += extra_mm; }

  step(dt) {
    if (this.done) return;
    const p = this.p, span = this.xHi - this.xLo;
    const tLayer = span / this.v;
    this.t += dt;
    this.tl += dt;
    if (this.tl >= tLayer + p.settle_s) {
      this.tl = 0; this.layer += 1; this.gapOffset = 0;
      if (this.layer >= p.layers) { this.done = true; return; }
    }
    const dir = this.dir();
    const along = Math.min(this.tl * this.v + this.gapOffset, span);
    this.xg = dir > 0 ? this.xLo + along : this.xHi - along;
    const moving = this.tl < tLayer;
    const target = Math.min(this.xHi, Math.max(this.xLo, this.xg - (moving ? dir * p.lag_mm : 0)));
    if (!this.stalled()) this.xw += (target - this.xw) * (1 - Math.exp(-dt / p.tau_s));
    // one turn is laid per revolution, at the current wire position
    const f = p.rpm / 60;
    this.angle += 2 * Math.PI * f * dt;
    this.revFrac += f * dt;
    while (this.revFrac >= 1) {
      this.revFrac -= 1;
      this.turns.push({ x: this.xw, layer: this.layer, defect: this.stalled() || Math.abs(this.dev()) > 0.5 });
    }
    this.history.push({ t: this.t, xg: this.xg, xw: this.xw, dev: this.dev() });
    if (this.history.length > 1500) this.history.shift();
  }

  // traverse direction of the current layer (+1 = towards larger x). Default -1: the day-1 recordings
  // start at the right flange, so winding layer 2 runs forward, as in the stall at 0.86.
  // lag deviation: laid position minus where it should be (guide minus nominal lag), mm
  dir() { return this.layer % 2 === 0 ? this.p.startDir : -this.p.startDir; }

  dev() {
    const dir = this.dir();
    return this.xw - (this.xg - dir * this.p.lag_mm);
  }
}
