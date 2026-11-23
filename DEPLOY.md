# Deploying coilcv-site (step 4)

The site is static. It is rebuilt from a **coilcv release tag**, so the numbers examiners see always match a fixed version of the code.

```text
you tag coilcv (v0.1-interim) and push the tag
  -> coilcv  .github/workflows/web-data.yml      tests, export, sends "coilcv-updated" (ref = the tag)
  -> coilcv-site .github/workflows/deploy.yml    checks out coilcv at that tag, exports data + figures,
                                                 parity test (JS = Python), publishes on GitHub Pages
```

The site also rebuilds:
* on every push to coilcv-site, from the latest `v*` tag;
* by hand: *Actions → build-and-deploy → Run workflow*. You can type a branch (for example `master`) to preview unreleased results.

## One-time setup

### 1. Commit and push coilcv, including the files the export needs

Everything below is new or changed and must be in the commit:
* `scripts/export_web_data.py`
* `.github/workflows/web-data.yml`
* `src/utils/system_params.py`, `tests/test_camera_model.py`
* `results/synthetic/`
* `docs/figures/`, `docs/media/`

### 2. Create the site repository (public)

GitHub Pages on a free account needs a public repository. coilcv can stay private.

```bash
cd coilcv-site
git add -A && git commit -m "coilcv-site: project page and Coil Winder Lab"
gh repo create somanuTori/coilcv-site --public --source . --push
```

Then in coilcv-site: *Settings → Pages → Build and deployment → Source: **GitHub Actions***.

### 3. Token so the site can read private coilcv: `COILCV_READ_TOKEN`

1. *GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.*
2. Name: `coilcv-site read coilcv`. Expiration: until after the defence.
3. Repository access: **Only select repositories → coilcv**.
4. Permissions → Repository permissions → **Contents: Read-only** (Metadata: read-only is added automatically).
5. Copy the token. In **coilcv-site**: *Settings → Secrets and variables → Actions → New repository secret*, name `COILCV_READ_TOKEN`.

You don't need this once coilcv is public.

### 4. Token so coilcv can trigger the site: `SITE_DISPATCH_TOKEN`

1. A new fine-grained token. Name: `coilcv trigger coilcv-site`.
2. Repository access: **Only select repositories → coilcv-site**.
3. Permissions → **Contents: Read and write**. This is the permission the `repository_dispatch` API requires.
4. Store it in **coilcv** as the Actions secret `SITE_DISPATCH_TOKEN`.

If this secret is missing, the coilcv workflow still runs the tests and the export. It just skips the trigger.

### 5. First release

```bash
cd ../project
git tag -a v0.1-interim -m "Interim version for the thesis draft"
git push origin v0.1-interim
```

Watch *Actions* in both repositories. The site appears at `https://somanutori.github.io/coilcv-site/`. Its footer shows `data from coilcv @v0.1-interim`.

## Updating later

* New results or code in coilcv → commit, then tag (`v0.2-…`) and push the tag. The site follows automatically.
* A change only to the site → push to coilcv-site. It rebuilds from the latest tag.
* Local preview: `python scripts/export_web_data.py --out ../coilcv-site/data --assets ../coilcv-site/assets` in coilcv, then `python3 -m http.server` in coilcv-site.
