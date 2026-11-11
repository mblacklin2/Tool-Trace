const K = require('../js/kernel.js');
const V = require('../js/vision.js');
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const spec = V.MATS.letter;
// tool in paper mm coords (y down from top of paper): handle 120 x 22 mm + head circle r=16
const toolHandle = K.roundRectRing(50, 120, 170, 142, 8, null, 8);
const head = K.circleRing(60, 131, 16, 80);
function inTool(x, y) { return K.pointInRing([x, y], toolHandle) || Math.hypot(x - 60, y - 131) < 16; }
// expected tool bbox: x 44..170 (126), y 115..147 (32)
function synth(W, H, cornersPx, color, landscapeRot) {
  // cornersPx: image positions of paper corners TL,TR,BR,BL (paper portrait)
  const Hm = V.homography(cornersPx, [[0, 0], [spec.w, 0], [spec.w, spec.h], [0, spec.h]]); // image -> paper mm
  const data = new Uint8ClampedArray(W * H * 4);
  let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [u, v] = V.applyH(Hm, x + 0.5, y + 0.5);
    let c = [118, 96, 74];
    if (u >= 0 && v >= 0 && u <= spec.w && v <= spec.h) {
      c = [236, 236, 230];
      const m = V.MARK;
      for (const [cx, cy] of [[m.inset, m.inset], [spec.w - m.inset, m.inset], [spec.w - m.inset, spec.h - m.inset], [m.inset, spec.h - m.inset]])
        if (Math.abs(u - cx) <= m.size / 2 && Math.abs(v - cy) <= m.size / 2) c = [15, 15, 15];
      if (inTool(u, v)) c = color;
      else if (inTool(u - 1.2, v - 1.2)) c = [205, 205, 200]; // soft shadow
    }
    const n = (rnd() - 0.5) * 14;
    const o = (y * W + x) * 4;
    data[o] = c[0] + n; data[o + 1] = c[1] + n; data[o + 2] = c[2] + n; data[o + 3] = 255;
  }
  return { data, width: W, height: H };
}
for (const [name, color, corners] of [
  ['dark tool, mild perspective', [30, 40, 90], [[260, 180], [1530, 220], [1600, 1880], [180, 1830]]],
  ['red tool, strong perspective', [190, 30, 30], [[420, 260], [1420, 300], [1700, 1900], [120, 1880]]],
  ['landscape shot', [40, 40, 40], [[1880, 230], [1900, 1440], [230, 1420], [200, 260]]],
]) {
  const W = name.includes('landscape') ? 2100 : 1800, H = name.includes('landscape') ? 1650 : 2050;
  const img = synth(W, H, corners, color);
  const t0 = Date.now();
  const pts = V.detectMarkers(img);
  ok(!!pts, name + ': markers detected');
  if (!pts) continue;
  const rect = V.rectifyMat(img, pts, spec);
  const prep = V.prepare(rect.img, rect.mmPerPx);
  const seg = V.segment(prep);
  const ring = V.maskToOutline(seg, prep.mmPerPx);
  const bb = K.ringBBox(ring);
  const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0;
  const dims = [w, h].sort((a, b) => b - a);
  console.log('   ', name, 'dims', dims.map(v => v.toFixed(2)), 'expect [126, 32]', 'area', K.ringArea(ring).toFixed(0), 'pts', ring.length, Date.now() - t0 + 'ms', 'thr', prep.auto.toFixed(1));
  ok(Math.abs(dims[0] - 126) < 0.8 && Math.abs(dims[1] - 32) < 0.8, name + ': size within 0.8 mm');
}
// PDF + zip sanity
const pdf = V.matPDF('letter');
ok(pdf.startsWith('%PDF-1.4') && pdf.includes('/MediaBox [0 0 612.000 792.000]'), 'pdf letter mediabox');
fs.writeFileSync('mat_letter.pdf', pdf, 'latin1');
fs.writeFileSync('mat_a4.pdf', V.matPDF('a4'), 'latin1');
const z = V.zip([{ name: 'a.stl', data: new Uint8Array([1, 2, 3]) }, { name: 'b.txt', data: new TextEncoder().encode('hello') }]);
fs.writeFileSync('t.zip', Buffer.from(z));
console.log(fails ? fails + ' FAILURES' : 'ALL PASS');
