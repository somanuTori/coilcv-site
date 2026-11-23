// replay.js: drive the Lab from the real recording D01_T02_15cm_003 instead of the model.
// Same interface as model.Winder, so the drawing, the inset, the strip chart and the readouts work
// unchanged. Data: data/replay_T02.json (coilcv track, simplified, 20 fps): wire and nozzle
// positions measured by coilcv frame by frame, lag deviation, layers, anomaly flags.

export class Replay {
  constructor(data, setup) {
    this.data = data;
    const slot = data.slot_px * data.k_mm_per_px;            // = slot_mm used for k (eq. 48)
    this.p = { slot_mm: slot, d_wire_mm: setup.wire_diameter_mm || 0.2, rpm: setup.spindle_rpm || 300,
      layers: 2, pitch_extra: 0, lag_mm: 0 };
    const wl = data.layer.filter((_, i) => data.winding_layer[i]);
    this.firstLayer = wl.length ? Math.min(...wl) : 0;
    this.reset();
  }

  reset() {
    this.t = 0; this.i = 0; this.angle = 0; this.revFrac = 0; this.done = false;
    this.turns = []; this.history = [];
    this.apply(0);
  }

  get xLo() { return this.p.d_wire_mm / 2; }
  get xHi() { return this.p.slot_mm - this.p.d_wire_mm / 2; }
  get tplNominal() { return this.p.slot_mm / this.p.d_wire_mm; }
  get tEnd() { return this.data.t[this.data.t.length - 1]; }

  apply(i) {
    const D = this.data;
    this.i = i;
    const pos = D.pos_norm[i] ?? 0;
    this.xw = Math.max(this.xLo, Math.min(this.xHi, pos * this.p.slot_mm));
    const wire = D.wire_mm[i], noz = D.nozzle_mm[i];
    // where the wire should touch: nozzle + the median lag of the winding layers
    this.xg = wire != null && noz != null ? this.xw + (noz + D.lag_median_mm - wire) : this.xw;
    this.layer = Math.max(0, D.layer[i] - this.firstLayer);
    this.windingNow = D.winding_layer[i];
    this._dev = D.lag_dev_mm[i] ?? 0;
    this._stall = D.anomaly[i];
  }

  step(dt) {
    if (this.done) return;
    this.t += dt;
    if (this.t >= this.tEnd) { this.done = true; return; }
    let i = this.i;
    while (i + 1 < this.data.t.length && this.data.t[i + 1] <= this.t) i++;
    this.apply(i);
    const f = this.p.rpm / 60;
    this.angle += 2 * Math.PI * f * dt;
    this.revFrac += f * dt;
    while (this.revFrac >= 1) {
      this.revFrac -= 1;
      if (this.windingNow) this.turns.push({ x: this.xw, layer: this.layer, defect: this._stall || Math.abs(this._dev) > 0.5 });
    }
    this.history.push({ t: this.t, xg: this.xg, xw: this.xw, dev: this._dev });
    if (this.history.length > 1500) this.history.shift();
  }

  stalled() { return this._stall; }
  dev() { return this._dev; }
  dir() {
    const D = this.data, j = Math.max(0, this.i - 4);
    return Math.sign((D.pos_norm[this.i] ?? 0) - (D.pos_norm[j] ?? 0)) || 1;
  }
  injectStall() {}
  injectGap() {}
}
