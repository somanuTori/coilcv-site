// Parity test: lab/model.js (JS port) must reproduce coilcv's Python outputs in data/parity.json.
//   node tests/parity.mjs        (run in CI before deploying; exits 1 on any mismatch)
import { readFileSync } from "node:fs";
import { evaluate, planSetup } from "../lab/model.js";

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url)));
const par = read("parity"), cams = read("camera_presets");
let n = 0;
const bad = [];
function cmp(exp, got, tag) {
  for (const [k, v] of Object.entries(exp)) {
    n++;
    const g = got[k];
    const ok = typeof v === "number" ? Math.abs(g - v) <= 1e-9 * Math.max(1, Math.abs(v)) : v === g;
    if (!ok) bad.push(`${tag} ${k}: python ${v}, js ${g}`);
  }
}
par.evaluate.forEach((c, i) => cmp(c.outputs, evaluate(c.inputs), `evaluate[${i}]`));
par.plan_setup.forEach((c, i) => cmp(c.outputs, planSetup(cams, c.inputs), `plan_setup[${i}]`));
console.log(`${n - bad.length}/${n} values match Python`);
if (bad.length) { console.error(bad.slice(0, 20).join("\n")); process.exit(1); }
