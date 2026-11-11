/* ==========================================================================
   Multiboard Holder Generator — image processing
   Images are {data: Uint8ClampedArray RGBA, width, height}.
   ========================================================================== */
const VZ = (() => {
'use strict';
const KK = (typeof K !== 'undefined') ? K : require('./kernel.js');

const MATS = {
  letter: { name: 'US Letter', w: 215.9, h: 279.4 },
  a4: { name: 'A4', w: 210, h: 297 },
};
const MARK = { inset: 15, size: 14 };
function matCenters(spec) { return { dx: spec.w - 2 * MARK.inset, dy: spec.h - 2 * MARK.inset }; }

function lumAt(d, i) { return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }

function downscale(img, maxPix) {
  const s = Math.min(1, Math.sqrt(maxPix / (img.width * img.height)));
  if (s >= 0.999) return { img, s: 1 };
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  const out = new Uint8ClampedArray(w * h * 4);
  const fx = img.width / w, fy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * img.width + xx) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
      }
      const o = (y * w + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { img: { data: out, width: w, height: h }, s: w / img.width };
}
function otsu(hist) {
  let total = 0, sum = 0;
  for (let i = 0; i < hist.length; i++) { total += hist[i]; sum += i * hist[i]; }
  let sumB = 0, wB = 0, best = 0, thr = 0;
  for (let t = 0; t < hist.length; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}
// connected components (4-connectivity) of mask==1
function components(mask, w, h) {
  const lab = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || lab[start] >= 0) continue;
    const id = comps.length;
    let sp = 0; stack[sp++] = start; lab[start] = id;
    const c = { id, area: 0, x0: w, y0: h, x1: -1, y1: -1, sx: 0, sy: 0, border: false };
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p / w) | 0;
      c.area++; c.sx += x; c.sy += y;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.border = true;
      if (x > 0 && mask[p - 1] && lab[p - 1] < 0) { lab[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && lab[p + 1] < 0) { lab[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && lab[p - w] < 0) { lab[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && lab[p + w] < 0) { lab[p + w] = id; stack[sp++] = p + w; }
    }
    c.cx = c.sx / c.area; c.cy = c.sy / c.area;
    comps.push(c);
  }
  return { lab, comps };
}

/* ----------------------------- markers ---------------------------------- */
function detectMarkers(img) {
  const ds = downscale(img, 900 * 900);
  const im = ds.img, w = im.width, h = im.height;
  const L = new Float32Array(w * h), hist = new Uint32Array(256);
  for (let i = 0; i < w * h; i++) { const v = lumAt(im.data, i * 4); L[i] = v; hist[Math.min(255, v | 0)]++; }
  const t = Math.min(otsu(hist), 140);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = L[i] < t ? 1 : 0;
  const { comps } = components(mask, w, h);
  const imgArea = w * h;
  const cands = comps.filter(c => {
    if (c.border || c.area < 25 || c.area > imgArea * 0.03) return false;
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    const ar = bw / bh;
    if (ar < 0.5 || ar > 2) return false;
    return c.area / (bw * bh) >= 0.5;
  });
  if (cands.length < 4) return null;
  const pick = f => cands.reduce((a, b) => (f(b) < f(a) ? b : a));
  const TL = pick(c => c.cx + c.cy), BR = pick(c => -(c.cx + c.cy)), TR = pick(c => -(c.cx - c.cy)), BL = pick(c => c.cx - c.cy);
  const quad = [TL, TR, BR, BL];
  if (new Set(quad.map(c => c.id)).size !== 4) return null;
  const areas = quad.map(c => c.area);
  if (Math.max(...areas) / Math.min(...areas) > 4) return null;
  const pts = quad.map(c => [c.cx + 0.5, c.cy + 0.5]);
  const qa = Math.abs(KK.ringArea(pts));
  if (qa < imgArea * 0.08) return null;
  // convexity
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= 0) return null; // clockwise in y-down
  }
  // refine centroids at full resolution; then correct for perspective by measuring each
  // centroid in the rectified (undistorted) frame and mapping it back
  const s = ds.s;
  const blobs = quad.map(c => {
    const pad = 3;
    const x0 = Math.max(0, Math.floor((c.x0 - pad) / s)), x1 = Math.min(img.width - 1, Math.ceil((c.x1 + 1 + pad) / s));
    const y0 = Math.max(0, Math.floor((c.y0 - pad) / s)), y1 = Math.min(img.height - 1, Math.ceil((c.y1 + 1 + pad) / s));
    const px = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const v = lumAt(img.data, (y * img.width + x) * 4);
      if (v < t) px.push([x + 0.5, y + 0.5, t - v]);
    }
    return { px, fallback: [(c.cx + 0.5) / s, (c.cy + 0.5) / s] };
  });
  let out = blobs.map(b => {
    let sx = 0, sy = 0, n = 0;
    for (const [x, y, w] of b.px) { sx += x * w; sy += y * w; n += w; }
    return n ? [sx / n, sy / n] : b.fallback;
  });
  const side = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const A = (side(out[0], out[1]) + side(out[3], out[2])) / 2, Bv = (side(out[0], out[3]) + side(out[1], out[2])) / 2;
  for (let iter = 0; iter < 2; iter++) {
    const dst = [[0, 0], [A, 0], [A, Bv], [0, Bv]];
    const H = homography(out, dst), Hi = homography(dst, out);
    if (!H || !Hi) break;
    out = blobs.map((b, k) => {
      let sx = 0, sy = 0, n = 0;
      for (const [x, y, w] of b.px) {
        const p = applyH(H, x, y), px1 = applyH(H, x + 1, y), py1 = applyH(H, x, y + 1);
        const J = Math.abs((px1[0] - p[0]) * (py1[1] - p[1]) - (px1[1] - p[1]) * (py1[0] - p[0]));
        const ww = w * J;
        sx += p[0] * ww; sy += p[1] * ww; n += ww;
      }
      return n ? applyH(Hi, sx / n, sy / n) : out[k];
    });
  }
  return out;
}

/* --------------------------- homography --------------------------------- */
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    if (Math.abs(A[i][i]) < 1e-12) return null;
    for (let k = i + 1; k < n; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
  return x;
}
function homography(src, dst) { // maps src -> dst
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
function applyH(H, x, y) { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; }
function warp(img, Hds, outW, outH) { // Hds maps dst -> src
  const out = new Uint8ClampedArray(outW * outH * 4);
  const W = img.width, Hh = img.height, d = img.data;
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const [sx, sy] = applyH(Hds, x + 0.5, y + 0.5);
    const fx = sx - 0.5, fy = sy - 0.5;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const ax = fx - x0, ay = fy - y0;
    const o = (y * outW + x) * 4;
    if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= Hh) { out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = 255; continue; }
    const i00 = (y0 * W + x0) * 4, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4;
    for (let c = 0; c < 3; c++) {
      out[o + c] = (d[i00 + c] * (1 - ax) + d[i10 + c] * ax) * (1 - ay) + (d[i01 + c] * (1 - ax) + d[i11 + c] * ax) * ay;
    }
    out[o + 3] = 255;
  }
  return { data: out, width: outW, height: outH };
}
// rectify the area between the four marker centres. pts: TL,TR,BR,BL (image px)
function rectifyMat(img, pts, spec, opts) {
  opts = opts || {};
  const c = matCenters(spec);
  const dxm = opts.dx || c.dx, dym = opts.dy || c.dy;
  const top = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) + Math.hypot(pts[2][0] - pts[3][0], pts[2][1] - pts[3][1]);
  const side = Math.hypot(pts[3][0] - pts[0][0], pts[3][1] - pts[0][1]) + Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
  const landscape = top > side;
  const Wmm = landscape ? Math.max(dxm, dym) : Math.min(dxm, dym);
  const Hmm = landscape ? Math.min(dxm, dym) : Math.max(dxm, dym);
  // match the photo's own resolution (no point upsampling), capped at 10 px/mm and ~8 MP
    const spanPx = (top / 2 + side / 2) / 2, spanMm = (Wmm + Hmm) / 2;
  const native = spanPx / spanMm;
  const pxPerMm = opts.pxPerMm || Math.max(3, Math.min(10, native * 0.95, Math.sqrt(8e6 / (Wmm * Hmm))));
  const outW = Math.round(Wmm * pxPerMm), outH = Math.round(Hmm * pxPerMm);
  const dst = [[0, 0], [outW, 0], [outW, outH], [0, outH]];
  const Hds = homography(dst, pts);
  if (!Hds) return null;
  const rect = warp(img, Hds, outW, outH);
  // mask marker remnants in the corners with the paper colour
  const bg = borderMedian(rect, 0.06);
  const m = Math.round((MARK.size / 2 + 3) * pxPerMm);
  for (const [cx, cy] of [[0, 0], [outW, 0], [outW, outH], [0, outH]]) {
    for (let y = Math.max(0, cy - m); y < Math.min(outH, cy + m); y++)
      for (let x = Math.max(0, cx - m); x < Math.min(outW, cx + m); x++) {
        const o = (y * outW + x) * 4; rect.data[o] = bg[0]; rect.data[o + 1] = bg[1]; rect.data[o + 2] = bg[2];
      }
  }
  return { img: rect, mmPerPx: 1 / pxPerMm, landscape, Wmm, Hmm };
}

/* ---------------------------- segmentation ------------------------------ */
function borderMedian(img, frac) {
  const w = img.width, h = img.height, b = Math.max(2, Math.round(Math.min(w, h) * frac));
  const hs = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  const add = (x, y) => { const i = (y * w + x) * 4; hs[0][img.data[i]]++; hs[1][img.data[i + 1]]++; hs[2][img.data[i + 2]]++; n++; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < b || y < b || x >= w - b || y >= h - b) add(x, y);
  return hs.map(hh => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hh[v]; if (acc >= n / 2) return v; } return 255; });
}
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0; const o = y * w;
    for (let x = -r; x <= r; x++) acc += src[o + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = acc / (2 * r + 1);
      acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}
function morph(mask, w, h, r, dilate) {
  // separable square max/min filter
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dilate ? 0 : 1;
    for (let k = -r; k <= r; k++) { const xx = x + k; const m = (xx < 0 || xx >= w) ? (dilate ? 0 : 0) : mask[y * w + xx]; if (dilate ? m : !m) { v = dilate ? 1 : 0; break; } }
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dilate ? 0 : 1;
    for (let k = -r; k <= r; k++) { const yy = y + k; const m = (yy < 0 || yy >= h) ? 0 : tmp[yy * w + x]; if (dilate ? m : !m) { v = dilate ? 1 : 0; break; } }
    out[y * w + x] = v;
  }
  return out;
}
function fillHoles(mask, w, h) {
  const reach = new Uint8Array(w * h);
  const st = [];
  const push = p => { if (!mask[p] && !reach[p]) { reach[p] = 1; st.push(p); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (st.length) {
    const p = st.pop(), x = p % w, y = (p / w) | 0;
    if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (y > 0) push(p - w); if (y < h - 1) push(p + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = reach[i] ? 0 : 1;
  return out;
}
// prepare: distance-from-background map (computed once per image)
// colour distance from the background
function bgDistance(r, g, b, bg) {
  const dr = r - bg[0], dg = g - bg[1], db = b - bg[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
// a soft shadow is a uniform darkening of the background colour
function shadowLike(r, g, b, bg) {
  const rr = r / Math.max(1, bg[0]), rg = g / Math.max(1, bg[1]), rb = b / Math.max(1, bg[2]);
  const m = (rr + rg + rb) / 3;
  const spread = Math.max(Math.abs(rr - m), Math.abs(rg - m), Math.abs(rb - m));
  return m > 0.58 && m < 0.97 && spread < 0.06;
}
const SHADOW_GAIN = 0.3;
function prepare(img, mmPerPx, maxPix, opts) {
  opts = opts || {};
  const shadows = opts.shadows !== false;
  const ds = downscale(img, maxPix || 2.2e6);
  const im = ds.img, w = im.width, h = im.height;
  const bg = borderMedian(im, 0.03);
  const D = new Float32Array(w * h);
  const hist = new Uint32Array(256);
  let shadowMask = null;
  if (shadows) {
    // shadow only where the whole neighbourhood looks like shadow: a real shadow is a wide band,
    // the blend between a grey tool and the background is only a pixel or two wide
    let raw = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { const o = i * 4; raw[i] = shadowLike(im.data[o], im.data[o + 1], im.data[o + 2], bg) ? 1 : 0; }
    const r = Math.max(2, Math.round(0.5 / (mmPerPx / ds.s)));
    // morphological opening, limited to the original shadow-like pixels
    shadowMask = morph(morph(raw, w, h, r, false), w, h, r, true);
    for (let i = 0; i < w * h; i++) shadowMask[i] &= raw[i];
  }
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    let v = bgDistance(im.data[o], im.data[o + 1], im.data[o + 2], bg);
    if (shadowMask && shadowMask[i]) v *= SHADOW_GAIN;
    D[i] = v;
  }
  const Db = boxBlur(D, w, h, 1);
  for (let i = 0; i < w * h; i++) hist[Math.min(255, Db[i] / 442 * 255 | 0)]++;
  let auto = otsu(hist) / 255 * 442;
  auto = Math.max(28, auto);
  return { img: im, w, h, D: Db, bg, auto, mmPerPx: mmPerPx / ds.s, scale: ds.s, full: img, shadowMask };
}
function segment(prep, opts) {
  opts = opts || {};
  const { w, h, D } = prep;
  const thr = opts.threshold || prep.auto;
  let mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = D[i] > thr ? 1 : 0;
  const rc = Math.max(1, Math.round(0.6 / prep.mmPerPx)); // close gaps ~0.6 mm
  mask = morph(morph(mask, w, h, rc, true), w, h, rc, false);
  mask = morph(morph(mask, w, h, 1, false), w, h, 1, true);
  const { lab, comps } = components(mask, w, h);
  if (!comps.length) return null;
  let chosen = null;
  if (opts.seed) {
    const sx = Math.round(opts.seed[0]), sy = Math.round(opts.seed[1]);
    if (sx >= 0 && sy >= 0 && sx < w && sy < h && lab[sy * w + sx] >= 0) chosen = comps[lab[sy * w + sx]];
    else {
      let bd = Infinity;
      for (const c of comps) { if (c.area < 50) continue; const d = Math.hypot(c.cx - sx, c.cy - sy); if (d < bd) { bd = d; chosen = c; } }
    }
  }
  if (!chosen) {
    const inner = comps.filter(c => !c.border);
    const pool = inner.length ? inner : comps;
    chosen = pool.reduce((a, b) => (b.area > a.area ? b : a));
  }
  let sel = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) sel[i] = lab[i] === chosen.id ? 1 : 0;
  sel = fillHoles(sel, w, h);
  return { mask: sel, w, h, threshold: thr, touchesBorder: chosen.border, area: chosen.area };
}
// keep the largest connected component and fill its holes
function cleanMask(mask, w, h) {
  const { lab, comps } = components(mask, w, h);
  if (!comps.length) return null;
  const big = comps.reduce((a, b) => (b.area > a.area ? b : a));
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = lab[i] === big.id ? 1 : 0;
  return fillHoles(out, w, h);
}
// mask -> outline ring in mm. Frame: x right, y up, origin at bottom-left of the work image.
function maskToOutline(seg, mmPerPx) {
  const { mask, w, h } = seg;
  const f = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) f[i] = mask[i];
  const b = boxBlur(boxBlur(f, w, h, 1), w, h, 1);
  const field = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let x = 0; x < w; x++) field[(h - 1 - r) * w + x] = 0.5 - b[r * w + x];
  const g = { x0: 0, y0: 0, res: mmPerPx, w, h };
  const loops = KK.contourField(field, g, 0);
  let best = null, ba = 0;
  for (const l of loops) { const a = KK.ringArea(l); if (a > ba) { ba = a; best = l; } }
  if (!best) return null;
  return KK.simplifyRing(best, Math.max(0.12, 0.4 * mmPerPx));
}

/* -------------------------- sub-pixel edge refinement --------------------- */
// Slides each outline point along its normal to the strongest background->tool edge in the
// full-resolution image, then filters outliers. Outline frame: mm, y up, origin bottom-left of prep image.
function refineOutline(ring, prep, opts) {
  opts = opts || {};
  const full = prep.full, FW = full.width, FH = full.height, d = full.data;
  const sxF = FW / prep.w, syF = FH / prep.h, mm = prep.mmPerPx;
  const toF = (x, y) => [x / mm * sxF, (prep.h - y / mm) * syF];
  const D = (x, y) => {
    const [fx, fy] = toF(x, y);
    const X = fx - 0.5, Y = fy - 0.5;
    let x0 = Math.floor(X), y0 = Math.floor(Y);
    if (x0 < 0 || y0 < 0 || x0 >= FW - 1 || y0 >= FH - 1) return 0;
    const ax = X - x0, ay = Y - y0;
    const i00 = (y0 * FW + x0) * 4, i10 = i00 + 4, i01 = i00 + FW * 4, i11 = i01 + 4;
    const c = k => (d[i00 + k] * (1 - ax) + d[i10 + k] * ax) * (1 - ay) + (d[i01 + k] * (1 - ax) + d[i11 + k] * ax) * ay;
    // raw colour distance: a hard on/off shadow gain would create a false edge at the shadow border;
    // the tool edge is the larger step, and the search is centred on the segmented edge
    return bgDistance(c(0), c(1), c(2), prep.bg);
  };
  const fullMm = mm / Math.max(sxF, syF);       // size of one full-res pixel in mm
  let pts = KK.resampleRing(ring, opts.step || Math.max(0.35, fullMm * 2));
  if (KK.ringArea(pts) < 0) pts.reverse();
  const passes = opts.passes || [1.4, 0.6];
  for (const R of passes) {
    const n = pts.length;
    const h = Math.max(0.03, fullMm * 0.5);
    const steps = Math.ceil(R / h);
    const off = new Float64Array(n), ok = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      const nx = ty, ny = -tx;               // outward for a CCW ring
      const p = pts[i];
      const prof = new Float64Array(2 * steps + 3);
      for (let k = -steps - 1; k <= steps + 1; k++) prof[k + steps + 1] = D(p[0] + nx * k * h, p[1] + ny * k * h);
      // smooth then take the outward-decreasing derivative
      const sm = new Float64Array(prof.length);
      for (let k = 0; k < prof.length; k++) sm[k] = (prof[Math.max(0, k - 1)] + 2 * prof[k] + prof[Math.min(prof.length - 1, k + 1)]) / 4;
      let best = -1, bv = 0;
      for (let k = 1; k < sm.length - 1; k++) {
        const g = (sm[k - 1] - sm[k + 1]) / (2 * h);
        const t = (k - steps - 1) * h;
        const w = g * Math.exp(-0.5 * (t / R) * (t / R) * 1.5);
        if (w > bv) { bv = w; best = k; }
      }
      const minG = opts.minGrad || 25;            // colour units per mm
      if (best > 1 && best < sm.length - 2 && bv > minG) {
        const g0 = (sm[best - 2] - sm[best]) / (2 * h), g1 = (sm[best - 1] - sm[best + 1]) / (2 * h), g2 = (sm[best] - sm[best + 2]) / (2 * h);
        const den = g0 - 2 * g1 + g2;
        const sub = Math.abs(den) > 1e-9 ? Math.max(-0.5, Math.min(0.5, 0.5 * (g0 - g2) / den)) : 0;
        off[i] = ((best - steps - 1) + sub) * h; ok[i] = 1;
      }
    }
    // fill gaps, median filter, light smoothing
    const filled = Array.from(off);
    const good = []; for (let i = 0; i < n; i++) if (ok[i]) good.push(i);
    if (good.length < n * 0.3) break;
    for (let i = 0; i < n; i++) if (!ok[i]) filled[i] = 0;
    const med = new Float64Array(n), W2 = 4;
    for (let i = 0; i < n; i++) {
      const win = [];
      for (let k = -W2; k <= W2; k++) win.push(filled[(i + k + n) % n]);
      win.sort((p, q) => p - q); med[i] = win[W2];
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const o = (med[(i - 1 + n) % n] + 2 * med[i] + med[(i + 1) % n]) / 4;
      const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      out.push([pts[i][0] + ty * o, pts[i][1] - tx * o]);
    }
    if (selfIntersects(KK.simplifyRing(out, 0.05))) break;
    pts = out;
  }
  return KK.simplifyRing(pts, opts.tol || 0.05);
}
function selfIntersects(r) {
  const n = r.length;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n];
    const ax0 = Math.min(a[0], b[0]), ax1 = Math.max(a[0], b[0]), ay0 = Math.min(a[1], b[1]), ay1 = Math.max(a[1], b[1]);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = r[j], e = r[(j + 1) % n];
      if (Math.max(c[0], e[0]) < ax0 || Math.min(c[0], e[0]) > ax1 || Math.max(c[1], e[1]) < ay0 || Math.min(c[1], e[1]) > ay1) continue;
      const d1 = cross(a, b, c), d2 = cross(a, b, e), d3 = cross(c, e, a), d4 = cross(c, e, b);
      if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return true;
    }
  }
  return false;
}
// rasterise an outline (mm, prep frame) back into a prep-resolution mask
function ringToMask(ring, prep) {
  const g = { x0: 0, y0: 0, res: prep.mmPerPx, w: prep.w, h: prep.h };
  const m = KK.rasterizeRings([ring], g); // row j = from bottom
  const out = new Uint8Array(prep.w * prep.h);
  for (let j = 0; j < prep.h; j++) for (let i = 0; i < prep.w; i++) out[(prep.h - 1 - j) * prep.w + i] = m[j * prep.w + i];
  return out;
}

/* ---------------------------- PDF calibration mat ------------------------ */
function matPDF(key) {
  const spec = MATS[key];
  const pt = mm => mm * 72 / 25.4;
  const Wp = pt(spec.w), Hp = pt(spec.h);
  const Y = mm => (Hp - pt(mm)); // mm from top -> PDF y
  const c = matCenters(spec);
  let s = '0 g\n';
  for (const [cx, cy] of [[MARK.inset, MARK.inset], [spec.w - MARK.inset, MARK.inset], [spec.w - MARK.inset, spec.h - MARK.inset], [MARK.inset, spec.h - MARK.inset]]) {
    const h2 = MARK.size / 2;
    s += `${pt(cx - h2).toFixed(3)} ${Y(cy + h2).toFixed(3)} ${pt(MARK.size).toFixed(3)} ${pt(MARK.size).toFixed(3)} re f\n`;
  }
  // 100 mm check bar at the bottom, outside the marker rectangle
  const bx = (spec.w - 100) / 2, by = spec.h - 9.5;
  s += `0.6 w ${pt(bx).toFixed(3)} ${Y(by).toFixed(3)} m ${pt(bx + 100).toFixed(3)} ${Y(by).toFixed(3)} l S\n`;
  for (let k = 0; k <= 10; k++) {
    const x = bx + k * 10, len = k % 5 === 0 ? 3 : 1.6;
    s += `0.4 w ${pt(x).toFixed(3)} ${Y(by).toFixed(3)} m ${pt(x).toFixed(3)} ${Y(by - len).toFixed(3)} l S\n`;
  }
  const txt = (x, y, size, str) => `BT /F1 ${size} Tf ${pt(x).toFixed(3)} ${Y(y).toFixed(3)} Td (${str.replace(/[()\\]/g, m => '\\' + m)}) Tj ET\n`;
  s += txt(26, 8.5, 9, `Multiboard holder calibration mat - ${spec.name}. Print at 100% / Actual size (no "fit to page").`);
  s += txt(26, 12.5, 7.5, `Marker centres: ${c.dx.toFixed(1)} x ${c.dy.toFixed(1)} mm. Place the tool flat inside the four squares, on a plain light surface.`);
  s += txt(bx + 102, by + 0.8, 7, 'must be 100 mm');
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${Wp.toFixed(3)} ${Hp.toFixed(3)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
  objs.push(`<< /Length ${s.length} >>\nstream\n${s}endstream`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) pdf += String(o).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

/* ------------------------------ ZIP (store) ------------------------------ */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(files) { // files: [{name, data: Uint8Array}]
  const enc = s => { const a = []; for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 0x7f); return new Uint8Array(a); };
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const total = all.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0; for (const c of all) { out.set(c, o); o += c.length; }
  return out;
}

return { MATS, MARK, matCenters, downscale, otsu, components, detectMarkers, homography, applyH, warp, rectifyMat,
  bgDistance, shadowLike, refineOutline, cleanMask, selfIntersects, ringToMask,
  borderMedian, boxBlur, morph, fillHoles, prepare, segment, maskToOutline, matPDF, crc32, zip };
})();
if (typeof module !== 'undefined') module.exports = VZ;
