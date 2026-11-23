# coilcv-site

Project page and interactive setup planner for **coilcv**, a computer vision system for wire displacement control in coil winding (master's thesis).

* Code and analysis: [coilcv](https://github.com/somanuTori/coilcv)
* Page: `index.html` (static, no build step)
* Coil Winder Lab (interactive setup planner): `lab/` (`lab/?selftest` checks the JS formulas against Python)
* Parity test for CI: `node tests/parity.mjs`
* Deployment (GitHub Actions, tokens, Pages): [DEPLOY.md](DEPLOY.md)
* Plan for the Coil Winder Lab and the data pipeline: [PLAN.md](PLAN.md)

Preview locally:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

All figures and numbers come from the coilcv repository. Refresh the data with `python scripts/export_web_data.py --out ../coilcv-site/data --assets ../coilcv-site/assets` in coilcv. Do not edit `assets/img` or `data/` by hand; they are replaced by the export (see PLAN.md, step 4).
