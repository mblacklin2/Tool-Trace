# Tool-Trace

Photograph a tool, trace it, and download a 3D-printable holder STL that mounts on a
[Multiboard](https://multiboard.io) wall. Everything runs in the browser: photos are never uploaded.

## What it does

1. **Photo** – shoot the tool lying flat on the printable calibration mat (`assets/calibration-mat-*.pdf`), or next to a card/ruler.
2. **Scale** – the four mat markers fix scale *and* camera perspective (or drag a reference line of known length).
3. **Outline** – automatic trace (standard colour segmentation or the optional AI trace), then sub-pixel edge snapping and soft-shadow suppression. Points can be edited by hand.
4. **Holder & STL** – choose a holder type and a mount, preview it in 3D on a Multiboard, and download an STL already oriented for printing (no supports).

Holder types

| Type | Description | Prints |
|---|---|---|
| Tray | shelf with a tool-shaped pocket, finger notch, label | upright |
| Vertical | tool drops in from above; retainer bar across the front | on its back |
| Flat on board – Hooks | 2–3 support hooks with front lips, 45° gussets, optional stand-off | upright |
| Flat on board – Contour ledge | shelf following the bottom of the tool | upright |
| Flat on board – Shadow plate | recessed outline with snap clips | on its back |

Mounts: Multipoint slot (community beta profile), Multiconnect slot (published profile), Multipoint Rail channel (beta),
Big Thread bolt holes, pegboard hooks (upright-printed holders only). A fit-test coupon STL is available for each mount.

## Run locally

It is a static site with no build step. Serve the folder with any web server (module workers need `http://`, not `file://`):

```
python -m http.server 8000
# then open http://localhost:8000
```

## Deploy

GitHub Pages: *Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`*.
Any static host works (Cloudflare Pages, Netlify, your own server). The AI trace needs internet access to
`cdn.jsdelivr.net` (Transformers.js) and `huggingface.co` (model weights) on first use.

## Project layout

```
index.html            page
css/app.css           styles (light and dark themes)
js/kernel.js          geometry kernel: earcut, BSP CSG, raster offsets, marching squares, STL
js/builder.js         holder + mount geometry
js/vision.js          marker detection, rectification, segmentation, edge refinement, mat PDF
js/app.js             UI, image editor, WebGL preview
js/geom-worker.js     geometry Web Worker
js/sam-worker.js      AI segmentation module worker (SlimSAM via Transformers.js)
assets/               calibration mat PDFs, favicon
tools/make-mats.js    regenerates the mat PDFs
tests/                Node test suites (geometry, stress, vision, trace accuracy)
```

## Tests

```
node tests/test_kernel.js
node tests/test_builder.js        # every holder type × mount, checks watertight meshes
node tests/test_stress.js 7 120   # randomised outlines and parameters
node tests/test_vision.js         # marker detection + scale on synthetic photos
node tests/test_trace_accuracy.js # edge accuracy with blur, noise and shadows
```

## Accuracy notes

- Mount geometry comes from published/community dimensions, not official CAD. Print the fit-test coupon first and
  tune **Mount fit** (±0.05 mm steps).
- On synthetic test photos the traced edge lands within ~0.05 mm (mean) of the true edge at ~5.5 px/mm.

See [NOTICE.md](NOTICE.md) for credits and third-party licences.
