// machine.js: the coil winder built from iso.js primitives.
// Units: mm, X along the spindle (slot centre at X = 0), Z up, the spindle axis at Y = Z = 0.
// The bobbin and wire use the real slot (11.1 mm) and wire pitch; the layer build-up is exaggerated
// (LAYER_EXAG) and the camera distance is compressed so everything fits: the drawing is not to scale.

import { box, cylinder, line3, ringFront, render } from "./iso.js";

export const C = {
  ink: "#22201c", copper: "#c27a3a", copperDark: "#9a5a26", brass: "#c9a24a", steel: "#a9b0b6",
  steelDark: "#7d858c", frame: "#5b6670", plastic: "#e8e2d4", foam: "#dcd5c6", camera: "#3b4148",
  lens: "#1f2328", red: "#d73027", green: "#1a9850", blue: "#2c6fbb", lamp: "#f2d16b", purple: "#7b3fa0",
};

export const GEO = { core_r: 5, flange_r: 11, flange_t: 1.2, LAYER_EXAG: 4, nozzleY: -14, nozzleZ: -8 };

export function layerRadius(L, d) { return GEO.core_r + (L + 1) * d * GEO.LAYER_EXAG; }

// Where the free wire touches the coil (front-lower side of the current layer).
export function contactPoint(w) {
  const r = layerRadius(w.layer - 1, w.p.d_wire_mm) + (w.p.d_wire_mm * GEO.LAYER_EXAG) / 2;
  const a = (-150 * Math.PI) / 180;                    // angle in the Y-Z plane, front-lower quadrant
  return [w.xw - w.p.slot_mm / 2, r * Math.cos(a), r * Math.sin(a)];
}
export function nozzleTip(w) { return [w.xg - w.p.slot_mm / 2, GEO.nozzleY, GEO.nozzleZ]; }

export function cameraPos(o) {
  const back = 24 + Math.min(o.distance_mm, 600) * 0.08;       // compressed distance
  return o.view === "profile" ? [0, -back, GEO.flange_r - 1] : [-2, -back, -6];
}

// Build all solids for one frame. o = {winder, view, light, plate, seeThrough, distance_mm, active}
export function build(o) {
  const w = o.winder, half = w.p.slot_mm / 2, d = w.p.d_wire_mm;
  const S = [];
  const hi = (name) => (o.active && o.active.has(name) ? " active" : "");

  // frame and base
  S.push(box("base", [0, 2, -20], [84, 52, 4], C.frame, { bias: -1e4 }));
  S.push(box("headstock", [-33, 0, -8], [12, 18, 20], C.steelDark));
  S.push(box("tailstock", [32, 0, -10], [8, 12, 16], C.steelDark));
  // spindle, chuck, live centre
  S.push(cylinder("spindle", [-27, 0, 0], [1, 0, 0], 14, 2.2, C.steel, { thin: true }));
  S.push(cylinder("chuck", [-14, 0, 0], [1, 0, 0], 6.2, 6.5, C.steel, { r2: 3.2, cls: "rot" + hi("spindle") }));
  S.push(cylinder("live centre", [28, 0, 0], [-1, 0, 0], 21.8, 3, C.steel, { r2: 0.8, thin: true }));

  // bobbin: core and flanges (flange faces show a mark that turns with the spindle)
  S.push(cylinder("core", [-half, 0, 0], [1, 0, 0], w.p.slot_mm, GEO.core_r, C.plastic,
    { centre: [0, 0, 0], bias: 0 }));
  const flangeMark = (x) => (view) => {
    const a = w.angle;
    const P = [[x, 0, 0], [x, Math.cos(a) * (GEO.flange_r - 1.5), Math.sin(a) * (GEO.flange_r - 1.5)]];
    return line3(view, P, `stroke="${C.ink}" stroke-width="2" stroke-linecap="round"`);
  };
  S.push(cylinder("flange L", [-half - GEO.flange_t, 0, 0], [1, 0, 0], GEO.flange_t, GEO.flange_r, C.plastic,
    { extra: flangeMark(-half - GEO.flange_t) }));
  S.push(cylinder("flange R", [half, 0, 0], [1, 0, 0], GEO.flange_t, GEO.flange_r, C.plastic,
    { extra: flangeMark(half + GEO.flange_t) }));

  // wound layers: one cylinder per layer over its laid extent, turn lines on top
  const byLayer = new Map();
  for (const t of w.turns) { (byLayer.get(t.layer) || byLayer.set(t.layer, []).get(t.layer)).push(t); }
  for (const [L, turns] of byLayer) {
    const r = layerRadius(L, d);
    const xs = turns.map((t) => t.x - half);
    const x0 = Math.min(...xs) - d / 2, x1 = Math.max(...xs) + d / 2;
    const rings = (view) => turns.map((t) => ringFront(view, t.x - half, 0, 0, r + 0.05,
      `stroke="${t.defect ? C.red : C.copperDark}" stroke-width="${t.defect ? 1.6 : 1}" stroke-linecap="round"`)).join("");
    S.push(cylinder(`layer ${L + 1}`, [x0, 0, 0], [1, 0, 0], Math.max(x1 - x0, 0.05), r, C.copper,
      { centre: [0, 0, 0], bias: 1 + L, extra: rings, opacity: o.seeThrough ? 0.35 : 1, outline: !o.seeThrough }));
  }

  // traverse: rail, carriage, nozzle
  const tip = nozzleTip(w);
  S.push(box("rail", [0, GEO.nozzleY, -16.75], [62, 3, 2.5], C.steelDark, { thin: true }));
  S.push(box("carriage", [tip[0], GEO.nozzleY, -13.5], [7, 6, 4], C.brass, { cls: hi("carriage").trim() }));
  S.push(cylinder("nozzle", [tip[0], GEO.nozzleY, -11.5], [0, 0, 1], 3.5, 1.1, C.brass, { r2: 0.5, thin: true }));

  // tensioner pulley on a post, wire spool
  S.push(box("post", [-22, GEO.nozzleY - 5, -3], [2.5, 2.5, 30], C.steelDark, { thin: true }));
  S.push(cylinder("tensioner", [-22, GEO.nozzleY - 6.2, 12], [0, 1, 0], 1.6, 4, C.steel, { thin: true }));
  S.push(cylinder("spool", [-34, 16, -18], [0, 0, 1], 10, 5, C.copper, { thin: true }));

  // background plate (profile view needs it behind the coil)
  if (o.plate) S.push(box("background plate", [2, 26, 0], [50, 2.5, 36], C.foam, { bias: -100, thin: true }));

  // camera and lamp
  const cp = cameraPos(o);
  S.push(box("camera", [cp[0], cp[1] - 6, cp[2]], [12, 10, 10], C.camera, { cls: hi("camera").trim() }));
  S.push(cylinder("lens", [cp[0], cp[1] - 1, cp[2]], [0, 1, 0], 6, 3.6, C.lens, { r2: 4, thin: true }));
  const lampAt = o.light === "ceiling" ? [0, -6, 31] : [42, -10, 2];
  const lampDir = o.light === "ceiling" ? [0, 0, -1] : [-1, 0, 0];
  S.push(cylinder("lamp", lampAt, lampDir, 7, 3, C.lamp, { r2: 7, thin: true }));

  let svg = render(o.viewObj, S);

  // wire: spool -> tensioner -> nozzle -> free span -> contact point
  const cpt = contactPoint(w);
  const stall = w.stalled();
  svg += line3(o.viewObj, [[-34, 16, -8], [-22, GEO.nozzleY - 6.4, 16], [-22, GEO.nozzleY - 6.4, 8], [tip[0], GEO.nozzleY, -11.5]],
    `stroke="${C.copperDark}" stroke-width="1.1" stroke-dasharray="3 2"`);
  svg += line3(o.viewObj, [tip, cpt], `stroke="${stall ? C.red : C.copperDark}" stroke-width="2" stroke-linecap="round"`);
  // camera sight line
  const aim = o.view === "profile" ? [0, 0, layerRadius(Math.max(0, w.layer), d)] : cpt;
  svg += line3(o.viewObj, [[cp[0], cp[1] + 5, cp[2]], aim], `stroke="${C.blue}" stroke-width="1" stroke-dasharray="2 3" opacity="0.8"`);
  // light rays
  svg += line3(o.viewObj, [lampAt.map((v, i) => v + lampDir[i] * 7), [0, 0, 0]],
    `stroke="#d9a400" stroke-width="1" stroke-dasharray="1 3" opacity="0.9"`);
  return { svg, anchors: anchors(o, tip, cpt, cp, lampAt) };
}

// 3D anchor points of the part labels (screen offsets are chosen in ui.js)
function anchors(o, tip, cpt, cp, lampAt) {
  const w = o.winder;
  return {
    bobbin: [o.winder.p.slot_mm / 2 + 1, 0, GEO.flange_r],
    "wound layers": [0, -layerRadius(Math.max(0, w.layer), w.p.d_wire_mm) * 0.7, layerRadius(Math.max(0, w.layer), w.p.d_wire_mm) * 0.7],
    "guide nozzle": tip,
    "free wire span": [(tip[0] + cpt[0]) / 2, (tip[1] + cpt[1]) / 2, (tip[2] + cpt[2]) / 2],
    spindle: [-22, 0, 2.2],
    tensioner: [-22, GEO.nozzleY - 6.4, 16],
    camera: [cp[0], cp[1] - 6, cp[2] + 5],
    lamp: lampAt,
    "background plate": o.plate ? [22, 26, 16] : null,
    "traverse rail": [26, GEO.nozzleY, -15.5],
  };
}
