// iso.js: a tiny 3D -> SVG renderer for the Coil Winder Lab.
// World axes (mm): X along the spindle, Y depth (away from the front camera), Z up.
// View: yaw around Z (drag to turn), fixed elevation, orthographic. Objects are convex solids made of
// polygons; they are drawn back to front (painter's algorithm on object centroids), back faces culled,
// flat-shaded, with an ink outline around each object's silhouette.

export class View {
  constructor({ yaw = -0.55, elev = 0.5, scale = 4, cx = 0, cy = 0 } = {}) {
    Object.assign(this, { yaw, elev, scale, cx, cy });
  }
  // rotate into view space: x right, y away from viewer, z up
  toView([X, Y, Z]) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const x1 = X * c - Y * s, y1 = X * s + Y * c;
    const ce = Math.cos(this.elev), se = Math.sin(this.elev);
    return [x1, y1 * ce - Z * se, Z * ce + y1 * se];       // [right, depth, up]
  }
  project(p) {
    const [x, d, u] = this.toView(p);
    return [this.cx + x * this.scale, this.cy - u * this.scale, d];
  }
  // unit vector toward the viewer, in world coordinates
  viewDir() {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), ce = Math.cos(this.elev), se = Math.sin(this.elev);
    // view depth axis in world = (s*ce, c*ce, -se); toward viewer is its negative
    return [-s * ce, -c * ce, se];
  }
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------- colour helpers ----------
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(hex, f) {               // f in [-1, 1]: darken / lighten
  const [r, g, b] = hex2rgb(hex);
  const m = (c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
const LIGHT = norm([-0.4, -0.6, 0.9]);

// ---------- solids ----------
// A solid: { name, faces: [[p,...]], color, centre, bias, outline, extra: (view) => svg string }
// Axis-aligned frame helper: returns a basis (u, v, w) with w along the given axis.
function basis(axis) {
  const w = norm(axis);
  const t = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(t, w)), v = cross(w, u);
  return [u, v, w];
}

export function cylinder(name, c0, axis, length, r, color, opt = {}) {
  const n = opt.n || 28, r2 = opt.r2 ?? r;                 // r2 != r gives a cone frustum
  const [u, v, w] = basis(axis);
  const ring = (rad, off) => Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n, ca = Math.cos(a) * rad, sa = Math.sin(a) * rad;
    return [c0[0] + u[0] * ca + v[0] * sa + w[0] * off, c0[1] + u[1] * ca + v[1] * sa + w[1] * off,
            c0[2] + u[2] * ca + v[2] * sa + w[2] * off];
  });
  const A = ring(r, 0), B = ring(r2, length);
  const faces = [];
  for (let i = 0; i < n; i++) faces.push([A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]]);
  if (r > 1e-6) faces.push([...A].reverse());
  if (r2 > 1e-6) faces.push(B);
  const centre = [c0[0] + w[0] * length / 2, c0[1] + w[1] * length / 2, c0[2] + w[2] * length / 2];
  return { name, faces, color, centre, smooth: true, ...opt };
}

export function box(name, c, size, color, opt = {}) {
  const [sx, sy, sz] = size.map((s) => s / 2);
  const P = (a, b, d) => [c[0] + a * sx, c[1] + b * sy, c[2] + d * sz];
  const faces = [
    [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)],     // front (-Y)
    [P(1, 1, -1), P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1)],         // back
    [P(-1, 1, -1), P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1)],     // left
    [P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)],         // right
    [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)],         // top
    [P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), P(-1, -1, -1)],     // bottom
  ];
  return { name, faces, color, centre: c, ...opt };
}

// ---------- rendering ----------
function faceNormal(f) { return norm(cross(sub(f[1], f[0]), sub(f[2], f[0]))); }

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

const f1 = (x) => x.toFixed(1);
const pts = (arr) => arr.map((q) => `${f1(q[0])},${f1(q[1])}`).join(" ");

export function renderSolid(view, s) {
  const vd = view.viewDir();
  let out = `<g data-part="${s.name}"${s.cls ? ` class="${s.cls}"` : ""}${s.opacity != null ? ` opacity="${s.opacity}"` : ""}>`;
  const all = [];
  for (const f of s.faces) {
    const nrm = faceNormal(f);
    const P = f.map((p) => view.project(p));
    all.push(...P);
    if (dot(nrm, vd) <= 0) continue;
    const lit = dot(nrm, LIGHT);
    const fill = shade(s.color, Math.max(-0.35, Math.min(0.35, lit * 0.35 - 0.05)));
    const edge = s.smooth && f.length === 4 ? fill : "#22201c";
    const sw = s.smooth && f.length === 4 ? 0.6 : (s.thin ? 0.8 : 1.3);
    out += `<polygon points="${pts(P)}" fill="${fill}" stroke="${edge}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  }
  if (s.outline !== false) {
    out += `<polygon points="${pts(convexHull(all))}" fill="none" stroke="#22201c" stroke-width="${s.thin ? 1.1 : 1.9}" stroke-linejoin="round"/>`;
  }
  if (s.extra) out += s.extra(view);
  return out + "</g>";
}

export function render(view, solids) {
  const order = solids.map((s) => ({ s, d: view.toView(s.centre)[1] - (s.bias || 0) }))
    .sort((a, b) => b.d - a.d);
  return order.map(({ s }) => renderSolid(view, s)).join("");
}

// Polyline in 3D (wires, leader lines). Returns an SVG path string.
export function line3(view, P, attrs) {
  const q = P.map((p) => view.project(p));
  return `<polyline points="${pts(q)}" fill="none" ${attrs}/>`;
}

// Visible half of a circle around the X axis (one wire turn on the coil), as an SVG polyline.
export function ringFront(view, x, cy, cz, r, attrs, n = 24) {
  const vd = view.viewDir();
  const seg = [];
  let cur = [];
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * i) / n;
    const nrm = [0, Math.cos(a), Math.sin(a)];
    const p = [x, cy + r * nrm[1], cz + r * nrm[2]];
    if (dot(nrm, vd) > -0.02) cur.push(view.project(p));
    else if (cur.length) { seg.push(cur); cur = []; }
  }
  if (cur.length) seg.push(cur);
  return seg.filter((s) => s.length > 1).map((s) => `<polyline points="${pts(s)}" fill="none" ${attrs}/>`).join("");
}

export { dot, norm };
