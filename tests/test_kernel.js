const K = require('../js/kernel.js');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// --- earcut: star polygon with holes, compare triangle area sum
function triArea(flat, tris) {
  let s = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i] * 2, b = tris[i + 1] * 2, c = tris[i + 2] * 2;
    s += ((flat[b] - flat[a]) * (flat[c + 1] - flat[a + 1]) - (flat[c] - flat[a]) * (flat[b + 1] - flat[a + 1])) / 2;
  }
  return s;
}
for (let trial = 0; trial < 50; trial++) {
  const n = 20 + Math.floor(Math.random() * 300);
  const outer = [];
  for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; const r = 50 + 20 * Math.random(); outer.push([r * Math.cos(a), r * Math.sin(a)]); }
  const holes = [];
  const nh = Math.floor(Math.random() * 4);
  for (let h = 0; h < nh; h++) {
    const cx = (h - 1.5) * 18, cy = (h % 2) * 10 - 5, m = 12;
    const ring = [];
    for (let i = 0; i < m; i++) { const a = -2 * Math.PI * i / m; ring.push([cx + 6 * Math.cos(a), cy + 6 * Math.sin(a)]); }
    holes.push(ring);
  }
  const flat = [], hi = [];
  outer.forEach(p => flat.push(p[0], p[1]));
  holes.forEach(h => { hi.push(flat.length / 2); h.forEach(p => flat.push(p[0], p[1])); });
  const tris = K.earcut(flat, hi);
  const expect = K.ringArea(outer) - holes.reduce((s, h) => s + Math.abs(K.ringArea(h)), 0);
  const got = triArea(flat, tris);
  if (!near(got, expect, 1e-6 * Math.abs(expect))) { fails++; console.log('FAIL earcut', trial, got, expect); }
}
console.log('earcut random done');

// --- offset accuracy: circle r=20 offset +1.0 -> r=21 area
const circ = K.circleRing(0, 0, 20, 400);
const off = K.offsetRings([circ], 1.0);
ok(off.regions.length === 1, 'offset 1 region');
const A = K.ringArea(off.regions[0].outer);
ok(near(Math.sqrt(A / Math.PI), 21, 0.05), 'offset radius ~21 got ' + Math.sqrt(A / Math.PI).toFixed(4) + ' res ' + off.res);
const off2 = K.offsetRings([circ], -2.0);
ok(near(Math.sqrt(K.ringArea(off2.regions[0].outer) / Math.PI), 18, 0.05), 'negative offset radius ~18');
// sweep: circle swept up to y=40 => area = circle + rectangle 2r x (40 - 0) roughly
const sw = K.offsetRings([K.circleRing(0, 0, 10, 200)], 0.0, { sweepTo: 40 });
const swA = K.ringArea(sw.regions[0].outer);
const swE = Math.PI * 100 / 2 + 20 * 40;
ok(near(swA, swE, swE * 0.01), 'sweep area ' + swA.toFixed(1) + ' expect ' + swE.toFixed(1));
const bbs = K.ringBBox(sw.regions[0].outer);
ok(bbs.y1 >= 39.5, 'sweep reaches top ' + bbs.y1);

// --- CSG
function fin(m) { const f = K.finalizeMesh(m); return { f, c: K.checkManifold(f), v: K.meshVolume(f) }; }
const b1 = K.box(0, 0, 0, 10, 10, 10), b2 = K.box(5, 5, 5, 15, 15, 15);
let r = fin(K.union(b1, b2));
ok(r.c.open === 0 && near(r.v, 2000 - 125, 1e-6), 'union boxes vol ' + r.v + ' open ' + r.c.open);
r = fin(K.subtract(b1, b2));
ok(r.c.open === 0 && near(r.v, 1000 - 125, 1e-6), 'subtract boxes vol ' + r.v + ' open ' + r.c.open);
// coplanar touching union
r = fin(K.union(K.box(0, 0, 0, 10, 10, 10), K.box(10, 0, 0, 20, 10, 10)));
ok(r.c.open === 0 && near(r.v, 2000, 1e-6), 'coplanar union vol ' + r.v + ' open ' + r.c.open);
// overlapping coplanar bottoms
r = fin(K.union(K.box(0, 0, 0, 10, 10, 10), K.box(5, 2, 0, 20, 8, 4)));
ok(r.c.open === 0 && near(r.v, 1000 + 10 * 6 * 4, 1e-6), 'coplanar bottom union vol ' + r.v + ' open ' + r.c.open);
// prism with hole and cylinder subtract
const plate = K.prism([{ outer: K.roundRectRing(0, 0, 60, 40, 4), holes: [] }], 0, 5, K.AX.z);
const cyl = K.prism([{ outer: K.circleRing(30, 20, 8, 64), holes: [] }], -1, 6, K.AX.z);
r = fin(K.subtract(plate, cyl));
ok(r.c.open === 0, 'plate-cyl manifold open ' + r.c.open + ' tris ' + r.c.tris);
const exp = (K.ringArea(K.roundRectRing(0, 0, 60, 40, 4)) - K.ringArea(K.circleRing(30, 20, 8, 64))) * 5;
ok(near(r.v, exp, 1e-3), 'plate-cyl volume');
// prism along Y and X orientation
const py = K.prism([{ outer: K.rectRing(0, 0, 10, 20), holes: [] }], -5, 0, K.AX.y);
ok(near(K.signedVolume(py), 10 * 20 * 5, 1e-6), 'prism Y volume positive');
const bb = K.meshBBox(py);
ok(bb.min[1] === -5 && bb.max[2] === 20, 'prism Y bbox');
const px = K.prism([{ outer: K.teardropRing(0, 0, 5), holes: [] }], 0, 10, K.AX.x);
ok(K.signedVolume(px) > 0, 'prism X teardrop positive');

// stress: a tray with an irregular pocket
const blob = [];
for (let i = 0; i < 300; i++) { const a = 2 * Math.PI * i / 300; const rr = 30 + 8 * Math.sin(5 * a) + 3 * Math.cos(13 * a); blob.push([75 + 1.8 * rr * Math.cos(a), 40 + rr * Math.sin(a) * 0.8]); }
const t0 = Date.now();
const pk = K.offsetRings([blob], 1.0);
const t1 = Date.now();
const tray = K.prism([{ outer: K.roundRectRing(0, 0, 150, 80, 3), holes: [] }], 0, 20, K.AX.z);
const pocket = K.prism(pk.regions, 2.4, 21, K.AX.z);
const notch = K.prism([{ outer: K.circleRing(75, 10, 11), holes: [] }], 2.4, 21, K.AX.z);
const back = K.prism([{ outer: K.roundRectRing(0, 0, 150, 50, 2, [false, false, true, true]), holes: [] }], -6.5, 0.5, K.AX.y);
let solid = K.union(back, tray);
solid = K.subtract(solid, K.union(pocket, notch));
const t2 = Date.now();
r = fin(solid);
const t3 = Date.now();
console.log('pocket verts', pk.regions[0].outer.length, 'offset ms', t1 - t0, 'csg ms', t2 - t1, 'final ms', t3 - t2, 'tris', r.c.tris);
ok(r.c.open === 0, 'tray manifold open edges ' + r.c.open);
console.log(fails ? fails + ' FAILURES' : 'ALL PASS');
