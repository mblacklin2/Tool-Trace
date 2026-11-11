// Edge-accuracy test for the auto-trace on synthetic photos with blur, noise and soft shadows.
const K = require('../js/kernel.js');
const V = require('../js/vision.js');
const spec = V.MATS.letter;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
// tool in paper mm (y down): handle + head circle, with a jaw notch cut
const handle = K.roundRectRing(50, 120, 170, 142, 8, null, 16);
const HC = [60, 131], HR = 16;
const jaw = K.rectRing(30, 126, 58, 136);
const inTool = (x, y) => (K.pointInRing([x, y], handle) || Math.hypot(x - HC[0], y - HC[1]) < HR) && !K.pointInRing([x, y], jaw);
// signed distance (approx) to tool boundary, paper mm
function segDist(p, r) { let b = Infinity; for (let i = 0; i < r.length; i++) { const a = r[i], c = r[(i + 1) % r.length]; const dx = c[0] - a[0], dy = c[1] - a[1]; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy); t = Math.max(0, Math.min(1, t)); b = Math.min(b, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1])); } return b; }
function boundaryDist(p) {
  // distance from p to the boundary of (handle ∪ circle) \ jaw, sampled numerically
  const cand = [];
  const dh = segDist(p, handle), dc = Math.abs(Math.hypot(p[0] - HC[0], p[1] - HC[1]) - HR), dj = segDist(p, jaw);
  return Math.min(dh, dc, dj);
}
function synth(W, H, corners, color, blurPx, shadow) {
  const Hm = V.homography(corners, [[0, 0], [spec.w, 0], [spec.w, spec.h], [0, spec.h]]);
  const raw = new Float32Array(W * H * 3);
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const SS = 3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let acc = [0, 0, 0];
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const [u, v] = V.applyH(Hm, x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
      let c = [120, 98, 76];
      if (u >= 0 && v >= 0 && u <= spec.w && v <= spec.h) {
        c = [238, 237, 232];
        const m = V.MARK;
        for (const [cx, cy] of [[m.inset, m.inset], [spec.w - m.inset, m.inset], [spec.w - m.inset, spec.h - m.inset], [m.inset, spec.h - m.inset]])
          if (Math.abs(u - cx) <= m.size / 2 && Math.abs(v - cy) <= m.size / 2) c = [14, 14, 14];
        if (inTool(u, v)) c = color;
        else if (shadow && inTool(u - 2.2, v - 2.2)) c = [238 * 0.78, 237 * 0.78, 232 * 0.78];
      }
      acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
    }
    const o = (y * W + x) * 3; raw[o] = acc[0] / SS / SS; raw[o + 1] = acc[1] / SS / SS; raw[o + 2] = acc[2] / SS / SS;
  }
  // camera blur (box, separable, repeated)
  let cur = raw;
  for (let it = 0; it < blurPx; it++) {
    const nx = new Float32Array(cur.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
      let s = 0, n = 0;
      for (let k = -1; k <= 1; k++) { const xx = x + k; if (xx >= 0 && xx < W) { s += cur[(y * W + xx) * 3 + c]; n++; } }
      nx[(y * W + x) * 3 + c] = s / n;
    }
    const ny = new Float32Array(cur.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
      let s = 0, n = 0;
      for (let k = -1; k <= 1; k++) { const yy = y + k; if (yy >= 0 && yy < H) { s += nx[(yy * W + x) * 3 + c]; n++; } }
      ny[(y * W + x) * 3 + c] = s / n;
    }
    cur = ny;
  }
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const n = (rnd() - 0.5) * 12; data[i * 4] = cur[i * 3] + n; data[i * 4 + 1] = cur[i * 3 + 1] + n; data[i * 4 + 2] = cur[i * 3 + 2] + n; data[i * 4 + 3] = 255; }
  return { data, width: W, height: H };
}
function edgeError(ring, rect, prep) {
  // prep frame mm (y up from bottom of rectified area) -> paper mm (y down)
  const Hmm = prep.h * prep.mmPerPx;
  const errs = K.resampleRing(ring, 0.5).map(p => boundaryDist([p[0] + V.MARK.inset, V.MARK.inset + (Hmm - p[1])]));
  errs.sort((a, b) => a - b);
  return { mean: errs.reduce((s, v) => s + v, 0) / errs.length, p95: errs[Math.floor(errs.length * 0.95)], max: errs[errs.length - 1] };
}
const cases = [
  ['dark tool, blur 2, shadow', [32, 38, 46], 2, true, [[260, 180], [1530, 220], [1600, 1880], [180, 1830]]],
  ['orange tool, blur 3, shadow', [210, 90, 30], 3, true, [[420, 260], [1420, 300], [1700, 1900], [120, 1880]]],
  ['grey tool, blur 2, no shadow', [120, 124, 130], 2, false, [[260, 180], [1530, 220], [1600, 1880], [180, 1830]]],
];
for (const [name, col, blur, shadow, corners] of cases) {
  const img = synth(1800, 2050, corners, col, blur, shadow);
  const pts = V.detectMarkers(img);
  ok(!!pts, name + ': markers');
  if (!pts) continue;
  const rect = V.rectifyMat(img, pts, spec);
  const prep = V.prepare(rect.img, rect.mmPerPx);
  const seg = V.segment(prep);
  const ring0 = V.maskToOutline(seg, prep.mmPerPx);
  const t0 = Date.now();
  const ring1 = V.refineOutline(ring0, prep);
  const dt = Date.now() - t0;
  const e0 = edgeError(ring0, rect, prep), e1 = edgeError(ring1, rect, prep);
  console.log(`    ${name}: px/mm ${(1 / rect.mmPerPx).toFixed(1)}  before mean ${e0.mean.toFixed(3)} p95 ${e0.p95.toFixed(3)} max ${e0.max.toFixed(2)}  |  after mean ${e1.mean.toFixed(3)} p95 ${e1.p95.toFixed(3)} max ${e1.max.toFixed(2)}  (${dt} ms, ${ring1.length} pts)`);
  ok(e1.mean <= e0.mean + 0.01 && e1.mean < 0.15, name + ': refined mean edge error < 0.15 mm');
}
console.log(fails ? fails + ' FAILURES' : 'ALL PASS');
