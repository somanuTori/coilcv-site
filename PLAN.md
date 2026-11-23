# coilcv-site: plan for the Lab (step 3) and the data pipeline (step 4)

This repository is the **presentation layer** of [coilcv](https://github.com/somanuTori/coilcv): a project page (done) and the Coil Winder Lab, an interactive setup planner (planned). It holds no analysis code. Every number on the site is either exported from coilcv or computed in JS from the same formulas, checked against Python.

```text
coilcv (the instrument, Python)            coilcv-site (the presentation, static HTML/JS)
  results/, outputs/, docs/figures  --->     data/*.json, assets/img/*      -> index.html  (project page)
  scripts/export_web_data.py                 lab/model.js (formulas in JS)  -> lab/        (Coil Winder Lab)
```

---

## Step 3: the Coil Winder Lab

### Idea in one sentence

A hand-drawn, isometric model of *this* machine (spindle, bobbin, nozzle carriage, tensioner, camera, lamp, background plate). You can turn it, wind it, break it, and move the camera, and it tells you, using coilcv's own numbers, whether that setup could see the problem.

### Screen layout (follows the drone-engineer / Colorfigures pattern)

```text
+----------------+-------------------------------------------+------------------+
| SCENARIOS      |  Fig. 02 - Day-1 phone setup (real)       |  k      0.098    |
|  01 Ideal      |                                           |  px/wire  2.0  ! |
|  02 Day-1 phone|        [ isometric machine, drag to turn ]|  frames/rev 12 ok|
|  03 Stall 0.86 |                                           |  min gap 54 um   |
|  04 Loose wind |                                           |  tracker   ok    |
|  05 Recommended|                                           |  gap method  X   |
|                |  WORKSHOP                                 +------------------+
|                |  [Wind] [Inject stall] [Open gap]         |  CAMERA SEES     |
|                |  [Front/Profile] [Light] [See-through]    |  [pixelated wire]|
|                |  [Replay real recording T02]              |  at 2 vs 10 px   |
+----------------+-------------------------------------------+------------------+
| DESIGN IT: camera [iPhone 15 | Pi HQ + 16 mm | 5 MP + macro]  distance [==o==] |
|            fps [30|60|120]   wire d [0.1-0.5]   rpm [100-600]                  |
+--------------------------------------------------------------------------------+
| MEASURED: live strip chart, wire vs nozzle, lag vs +-0.5 mm, events light up   |
| PIPELINE: [0 input]->[1 pixel]->[2 row]->[3 frame]->[4 series]->[5 process]... |
|           click a block: what it measures, unit, link to the function on GitHub|
| CHECK YOURSELF: 4 questions                                                    |
+--------------------------------------------------------------------------------+
```

### Scenarios (left list, each a preset of all controls)

| # | scenario | what it shows |
|---|---|---|
| 01 | Ideal winding | tight turns, constant lag; everything green |
| 02 | Day-1 phone setup (real) | iPhone 15 at 15 cm: tracker OK, gap method red (2 px per wire) |
| 03 | Stall at 0.86 (real defect) | replays the systematic defect; the wire stops, the nozzle moves on, the event lights up |
| 04 | Loose winding | pitch > d_D, the 3.6–14 % turns-per-layer deficit made visible as gaps |
| 05 | Recommended setup | profile camera at k ≈ 0.02 mm/px, background plate, 90° light; gap method green |

### Workshop buttons (each changes the figure *and* the numbers)

* **Wind / pause:** the bobbin turns, the nozzle traverses, turns are laid one per revolution, and layers reverse at the flanges.
* **Inject stall:** the wire contact point freezes for t seconds while the nozzle continues. The lag grows and the strip chart crosses ±0.5 mm.
* **Open gap:** adds extra pitch at the next turn. It shows in the profile view and in the gap readout (if N_D ≥ 10).
* **Front / Profile view:** moves the camera; the "camera sees" inset and the verdicts change.
* **Light:** ceiling, side or side + polariser. It changes the glare in the inset. The effect on accuracy comes from the synthetic sweep, which found little effect for the tracker.
* **See-through:** shows the layers inside the coil.
* **Labels:** names every part and lights it up while it is active.
* **Replay real recording T02:** drives the animation from the real track (wire, nozzle, lag) instead of the model.

### Numbers: where each one comes from

| shown | source | how |
|---|---|---|
| k from camera + distance | **new**: pinhole model `k = distance × pixel_pitch / focal_length` | Added to `coilcv/src/utils/system_params.py` first (single source of truth), then ported to JS. Calibrated against the measured k of T02/T06/T07. |
| N_D, σ_S, G_max,min, frames/rev, n_max | eq. (48)–(67), `system_params.evaluate` | ported to `lab/model.js`; parity test against Python (step 4) |
| tracker error at this px/wire | `outputs/synthetic/tracker_sweep.csv` | interpolated from the real sweep, not simulated in JS |
| gap detection at this px/wire and gap | `outputs/synthetic/profile_sweep.csv` | nearest grid point of the real sweep |
| stall replay | `results/day01/D01_T02_15cm_003/track_simplified_*.csv` | downsampled to about 25 fps, about 60 kB of JSON |
| verdict texts | `assess.recommendations()` | the same thresholds and wording, exported as JSON |
| camera presets | nominal datasheet values (pixel pitch, focal length, video modes) | listed with their source and marked "nominal"; the phone preset is calibrated by our measurements |

The two heavy parts (the tracker on video, the gap method on images) are **not** re-implemented in JS. Their measured behaviour is looked up from the Python sweeps. That keeps the Lab honest: the planner shows what coilcv actually achieved at that pixel scale.

### Drawing technique (Colorfigures look without the skill)

* **Geometry in 3D, drawn as SVG.** About 15 primitives: cylinders (bobbin, flanges, spindle, pulleys), cones (chucks, nozzle tip), boxes (carriage, camera, plate) and a helix of turns. They are projected with an isometric camera you can turn (drag = yaw), drawn back to front (painter's algorithm). No three.js and no build step.
* **Hand-inked feel:**
  * a thick dark outline and flat fills from the figure palette (copper, brass, steel, foam);
  * one SVG filter (`feTurbulence` + `feDisplacementMap`) for the "hand-drawn wobble", with a slider like the reference;
  * cream paper background, monospace labels in pill-shaped tags with leader lines.
* **Exact mechanism:** dimensions come from the setup (slot 11.1 mm, wire 0.2 mm, 55.5 turns/layer). The wire is drawn thicker than true scale so it is visible, and a "not to scale" tag says so.
* **The "camera sees" inset** is a small canvas. The wire is rendered at the chosen k with nearest-neighbour upscaling, so you *see* the 2 px blur against the 10 px individual turns. This is the key visual argument of the thesis.

### Files

```text
lab/index.html       page shell, controls, panels
lab/model.js         kinematics (port of winding_sim.simulate_kinematics) + eq. (48)-(67) + camera model
lab/iso.js           tiny 3D -> isometric SVG renderer (primitives, painter's order, rotation)
lab/machine.js       the coil winder built from primitives, part labels
lab/ui.js            scenarios, workshop buttons, design-it controls, strip chart, pipeline blocks, quiz
data/*.json          exported from coilcv (step 4)
```

### Status (2026-11-23)

* **Session 1 done:** `lab/iso.js` renderer, `lab/machine.js` drawing, winding animation with stall and gap, stats panel with eq. (48)–(67) and the camera model, Design-it controls, scenarios 01–05, a simple lag strip chart, part labels, wobble slider. JS/Python parity: `lab/index.html?selftest` and `node tests/parity.mjs` (1172/1172 values match).
* **Session 2 done:** "camera sees" inset (`lab/camera.js`, your k next to k = 0.02), replay of the real recording T02 as scenario 06 (`lab/replay.js`), pipeline levels 0–7 with live values and links to the functions (`data/pipeline.json`, line numbers taken at export), quiz, Save figure (PNG, 3x). Thesis figures: `coilcv/docs/figures/fig4a_lab_stall_en.png`, `fig4b_lab_recommended_en.png`.
* **Step 4 written:** `coilcv/.github/workflows/web-data.yml` (on a `v*` tag: tests, export, dispatch) and `.github/workflows/deploy.yml` here (export at that tag, parity test, Pages). Setup steps: [DEPLOY.md](DEPLOY.md). Tested locally from a clean copy with only the CI packages; not yet run on GitHub.
* Camera model and presets live in `coilcv/src/utils/system_params.py` (`CAMERAS`, `plan_setup`), tests in `coilcv/tests/test_camera_model.py`.
* `coilcv/scripts/export_web_data.py --out ../coilcv-site/data` writes the JSON; the synthetic sweeps were copied to `coilcv/results/synthetic/` (now tracked).

### Effort and order

1. **Session 1:**
   * renderer and machine drawing;
   * winding animation (wind, stall, gap);
   * stats panel with eq. (48)–(67);
   * Design it controls with the camera model.
2. **Session 2:**
   * camera-sees inset;
   * strip chart and real replay;
   * pipeline blocks with GitHub links;
   * scenarios, quiz, mobile layout and polish;
   * thesis screenshot.

### Thesis framing

Call it an *interactive setup planner* (agreed). It visualises the kinematic model and coilcv's measured operating limits. It is not a reconstruction of the coil from video.

---

## Step 4: JSON export and automatic deployment

### What is exported

`coilcv/scripts/export_web_data.py` (new) writes `web_data/`:

| file | content | from |
|---|---|---|
| `meta.json` | coilcv commit SHA, date, versions | git |
| `targets.json` | TARGET_PX_PER_WIRE_GAP, MIN_PX_PER_WIRE_TRACK, MIN_FRAMES_PER_REV, THRESHOLDS_MM, K_DESIGN, K_RANGE | `assess.py`, `wire_tracker.py`, `system_params.py` |
| `system_params.json` | the design scenarios and the k sweep, plus **parity cases** (inputs → Python outputs) | `system_params.py` |
| `camera_presets.json` | cameras and lenses with nominal values and sources | new table in coilcv |
| `tracker_sweep.json`, `profile_sweep.json` | the synthetic grids | `outputs/synthetic/` |
| `day01.json` | summary, defects across videos, process checks | `results/day01/` |
| `replay_T02.json` | downsampled real track: t, wire mm, nozzle mm, lag deviation mm, layer, event class | `results/day01/D01_T02_15cm_003/` |

It also copies the figures and the hero GIF/MP4 from `docs/figures` and `docs/media`. They are committed in coilcv because they need the raw video, which CI does not have.

### Parity test (keeps the JS formulas honest)

`system_params.json` contains, for example, 20 input sets with the outputs Python computed. `lab/model.js` runs the same inputs:
* in the site's CI, a small Node script fails the deploy if any value differs by more than 1e-9;
* in the browser, `?selftest` shows the result.

So if the formulas in coilcv ever change, the site cannot silently go out of date.

### How the data moves between the two repositories

```text
push to coilcv/master
   -> coilcv Action "export-web-data": runs export_web_data.py (no videos needed),
      sends event "coilcv-updated" to coilcv-site  (repository_dispatch)
coilcv-site Action "build-and-deploy" (on that event, on push, or by hand):
   -> checks out coilcv-site + coilcv, runs the export (or downloads its artifact),
      copies web_data/ -> data/, runs the parity test, deploys to GitHub Pages
```

* One-way: coilcv never depends on the site.
* **Tokens:**
  * While coilcv is **private**, the site's Action needs read access to it: a fine-grained personal access token, read-only, coilcv only, stored as a secret in coilcv-site.
  * Sending the dispatch event needs a token with write access to coilcv-site, stored in coilcv.
  * Once coilcv is public, the read token is no longer needed.
* **GitHub Pages on a free account needs the site repository to be public.** coilcv can stay private. Everything on the site is then public, including the hero GIF of the lab recording (approved).
* Pages source: *Settings → Pages → Source: GitHub Actions*. The workflow uses `actions/upload-pages-artifact` and `actions/deploy-pages`.
* The site footer shows "data from coilcv @<commit>", so every number is traceable to a code version and tag (for example `v0.1-interim`).

### Effort

Small, about half a session:
* the export script and its test in coilcv;
* two workflow files;
* setting up two tokens (the GitHub UI part is a step-by-step for you).
