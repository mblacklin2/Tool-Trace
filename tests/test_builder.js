const K = require('../js/kernel.js');
const B = require('../js/builder.js');
const fs = require('fs');
let fails = 0;
// a wrench-like outline: long handle with an open jaw head
function wrench() {
  const pts = [];
  // handle (rounded rectangle 150 x 16)
  const r = K.roundRectRing(0, -8, 150, 8, 7, null, 10);
  // head circle at x=165 r=18 with jaw notch -> approximate by polygon union via raster offset 0
  const head = K.circleRing(165, 0, 18, 80);
  const jaw = K.rectRing(168, -6, 190, 6);
  return { rings: [r, head], jaw };
}
const w = wrench();
// union via offset 0 of two rings (even-odd would cancel overlap; build mask manually)
const g = K.makeGrid({ x0: -2, y0: -22, x1: 190, y1: 22 }, 0.1, 2);
const m1 = K.rasterizeRings([w.rings[0]], g), m2 = K.rasterizeRings([w.rings[1]], g), m3 = K.rasterizeRings([w.jaw], g);
const mask = new Uint8Array(m1.length);
for (let i = 0; i < mask.length; i++) mask[i] = (m1[i] | m2[i]) & (m3[i] ^ 1);
const sd = K.signedDistance(mask, g);
const loops = K.contourField(sd, g, 0);
const regs = K.simplifyRegions(K.loopsToRegions(loops, 1), 0.05);
const outline = regs[0].outer;
console.log('outline verts', outline.length, 'area', K.ringArea(outline).toFixed(1));

// fake label: two rectangles with a hole (like an "O")
const label = { height: 6, width: 30, regions: [
  { outer: K.rectRing(-15, -3, -5, 3), holes: [K.rectRing(-12, -1, -8, 1).reverse()] },
  { outer: K.rectRing(0, -3, 15, 3), holes: [] },
] };

const configs = [];
for (const mode of ['horizontal', 'vertical'])
  for (const mount of ['multipoint', 'multiconnect', 'rail', 'bolt', 'pegboard'])
    for (const lab of [false, true]) {
      if (mode === 'vertical' && mount === 'pegboard') continue;
      configs.push({ mode, mount, lab });
    }
for (const style of ['hooks', 'ledge', 'clips'])
  for (const mount of ['multipoint', 'multiconnect', 'rail', 'bolt', 'pegboard'])
    for (const [lab, so] of [[false, 0], [true, 8]]) {
      if (style === 'clips' && mount === 'pegboard') continue;
      configs.push({ mode: 'flat', style, mount, lab, so });
    }
for (const c of configs) {
  const P = {
    outline, mode: c.mode, mount: c.mount, thickness: 12, clearance: 1.0, wall: 3, floor: 2.4,
    pocketDepth: 10, cradlePct: 0.5, barPos: 0.35, barH: 10, barT: 3, grid: true, fit: 0,
    notch: { enabled: c.mode === 'horizontal', diameter: 22, at: null }, label: c.lab ? label : null,
    flatStyle: c.style, standoff: c.so || 0, engrave: true,
  };
  const t0 = Date.now();
  let res, fin;
  try { res = B.build(P); fin = B.finalize(res); } catch (e) { fails++; console.log('FAIL build', c, e.stack); continue; }
  const chk = K.checkManifold(fin.print);
  const vol = K.meshVolume(fin.print);
  const bb = K.finalBBox(fin.print);
  const ms = Date.now() - t0;
  const okk = chk.open === 0 && chk.dup === 0 && vol > 0 && Math.abs(bb.min[2]) < 1e-6;
  if (!okk) fails++;
  console.log((okk ? 'ok  ' : 'FAIL'), (c.mode + (c.style ? ':' + c.style : '') + (c.so ? '+so' : '')).padEnd(16), c.mount.padEnd(12), c.lab ? 'label' : '     ', 'tris', String(chk.tris).padStart(6), 'open', chk.open, 'dup', chk.dup,
    'vol', vol.toFixed(0), 'dims', JSON.stringify(res.dims), ms + 'ms', res.warnings.length ? 'W:' + res.warnings.length : '');
  if (c.lab && (c.mount === 'multiconnect' || c.mount === 'pegboard')) fs.writeFileSync(`out_${c.mode}${c.style ? '_' + c.style : ''}_${c.mount}.stl`, Buffer.from(K.stlBinary(fin.print, 'test')));
}
for (const mount of ['multipoint', 'multiconnect', 'rail', 'bolt', 'pegboard']) {
  const cp = B.buildCoupon(mount, 0.1, 23);
  const fin = B.finalize(cp);
  const chk = K.checkManifold(fin.print);
  const vol = K.meshVolume(fin.print);
  const okk = chk.open === 0 && vol > 0;
  if (!okk) fails++;
  console.log((okk ? 'ok  ' : 'FAIL'), 'coupon', mount, 'tris', chk.tris, 'open', chk.open, 'vol', vol.toFixed(0));
  fs.writeFileSync(`coupon_${mount}.stl`, Buffer.from(K.stlBinary(fin.print, 'coupon')));
}
console.log(fails ? fails + ' FAILURES' : 'ALL PASS');
