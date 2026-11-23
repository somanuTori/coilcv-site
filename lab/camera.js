// camera.js: "what the camera sees". A small window around the wire contact point, rendered at the
// pixel scale k of the chosen setup: each sensor pixel averages the scene over k x k mm (3x3 samples),
// plus a little noise, then it is enlarged with nearest-neighbour so the pixels stay visible.
// The scene is schematic (shaded round turns, a free wire, glare from the lamp, background), not a
// photograph: it shows how many pixels the wire gets, which is what decides the method.

const TAU = Math.PI * 2;

// sorted x of the turns (slot coordinates, mm) of the current layer, else the previous one
function turnsNear(w) {
  const L = Math.max(0, w.layer);
  let xs = w.turns.filter((t) => t.layer === L).map((t) => t.x);
  const prev = w.turns.filter((t) => t.layer === L - 1).map((t) => t.x);
  return { cur: xs.sort((a, b) => a - b), prev: prev.sort((a, b) => a - b) };
}

function nearest(arr, x) {
  let lo = 0, hi = arr.length - 1;
  if (hi < 0) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m; else hi = m; }
  return Math.abs(arr[lo] - x) < Math.abs(arr[hi] - x) ? arr[lo] : arr[hi];
}

// brightness 0..1 of the scene at (x, y) mm
function sceneFn(o) {
  const { w, view, light, plate } = o;
  const d = w.p.d_wire_mm, r = d / 2, xc = w.xw;
  const { cur, prev } = turnsNear(w);
  const glare = light === "ceiling" ? 0.55 : 0.15;
  const back = (x, y) => (plate ? 0.1 : 0.42 + 0.1 * Math.sin(x * 9.1 + y * 4.3) * Math.sin(y * 7.7 - x * 2.1));
  // which turn covers x: current layer turn if it is near, otherwise the layer below
  const turnAt = (x) => {
    const a = nearest(cur, x);
    if (a != null && Math.abs(a - x) <= r * 1.05) return a;
    const b = nearest(prev, x);
    if (b != null && Math.abs(b - x) <= r * 1.05) return b;
    return null;
  };
  if (view === "profile") {
    // silhouette of the top edge against the background; y = 0 at the turn tops
    return (x, y) => {
      const t = turnAt(x);
      const h = t == null ? -r : Math.sqrt(Math.max(0, r * r - (x - t) ** 2)) - r;
      if (y > h) return back(x, y);
      return (light === "side" ? 0.78 : 0.55) - 0.15 * Math.min(1, (h - y) / d);
    };
  }
  // front view: coil surface for y > 0, free wire span going down for y < 0
  const tilt = (w.xg - w.xw) / 3;            // mm of x per mm of y, schematic
  return (x, y) => {
    if (y >= 0) {
      const t = turnAt(x);
      if (t == null) return 0.12;                                   // gap between turns: dark
      const u = (x - t) / r;
      const shade = 0.3 + 0.45 * Math.sqrt(Math.max(0, 1 - u * u));
      return Math.min(1, shade + glare * Math.exp(-(((u - 0.25) / 0.22) ** 2)));
    }
    const xw = xc + tilt * -y;
    if (Math.abs(x - xw) <= r) {
      const u = (x - xw) / r;
      return Math.min(1, 0.45 + 0.35 * Math.sqrt(1 - u * u) + glare * 0.8 * Math.exp(-((u / 0.25) ** 2)));
    }
    return back(x, y);
  };
}

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Render into `canvas` (CSS size fixed); returns {nx, ny, n_d}
export function renderView(canvas, o, k) {
  const d = o.w.p.d_wire_mm;
  const Wmm = 12 * d, Hmm = 7 * d;
  const nx = Math.max(3, Math.min(260, Math.round(Wmm / k))), ny = Math.max(2, Math.min(160, Math.round(Hmm / k)));
  const kx = Wmm / nx, ky = Hmm / ny;
  const f = sceneFn(o);
  const off = renderView.off || (renderView.off = document.createElement("canvas"));
  off.width = nx; off.height = ny;
  const g = off.getContext("2d");
  const img = g.createImageData(nx, ny);
  const x0 = o.w.xw - Wmm / 2, y0 = o.view === "profile" ? Hmm * 0.45 : Hmm * 0.5;
  seed = 12345;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let s = 0;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) s += f(x0 + (i + (a + 0.5) / 3) * kx, y0 - (j + (b + 0.5) / 3) * ky);
      let v = s / 9 + (rnd() - 0.5) * 0.06;
      v = Math.max(0, Math.min(1, v));
      const p = (j * nx + i) * 4;
      img.data[p] = 255 * Math.min(1, v * 1.08); img.data[p + 1] = 255 * v * 0.93; img.data[p + 2] = 255 * v * 0.8; img.data[p + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const W = canvas.width, H = canvas.height;
  const c = canvas.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
  c.drawImage(off, 0, 0, W, H);
  // pixel grid when the pixels are large
  const px = W / nx;
  if (px >= 7) {
    c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 1; c.beginPath();
    for (let i = 1; i < nx; i++) { c.moveTo(i * px + 0.5, 0); c.lineTo(i * px + 0.5, H); }
    for (let j = 1; j < ny; j++) { c.moveTo(0, j * (H / ny) + 0.5); c.lineTo(W, j * (H / ny) + 0.5); }
    c.stroke();
  }
  // scale bar: one wire diameter
  const bar = (d / Wmm) * W;
  c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(6, H - 22, bar + 70, 16);
  c.fillStyle = "#fff"; c.fillRect(10, H - 16, bar, 4);
  c.font = "10px IBM Plex Mono, monospace"; c.fillText(`${d.toFixed(2)} mm`, bar + 16, H - 10);
  return { nx, ny, n_d: d / k };
}
