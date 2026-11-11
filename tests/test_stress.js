const K = require('../js/kernel.js');
const B = require('../js/builder.js');
let seed = +(process.argv[2] || 1);
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const N = +(process.argv[3] || 60);
let fails = 0, warnTotal = 0, tmax = 0;
function blob() {
  const n = 80 + Math.floor(rnd() * 300);
  const L = 30 + rnd() * 220, Wd = 10 + rnd() * 70;
  const f1 = 2 + Math.floor(rnd() * 6), f2 = 5 + Math.floor(rnd() * 15), a1 = rnd() * 0.3, a2 = rnd() * 0.1;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = 2 * Math.PI * i / n;
    const r = 1 + a1 * Math.sin(f1 * t + rnd() * 0.05) + a2 * Math.cos(f2 * t);
    pts.push([L / 2 * r * Math.cos(t) + 40, Wd / 2 * r * Math.sin(t) - 10]);
  }
  return K.simplifyRing(pts, 0.05);
}
const mounts = ['multipoint', 'multiconnect', 'rail', 'bolt', 'pegboard'];
for (let c = 0; c < N; c++) {
  const mode = rnd() < 0.5 ? 'horizontal' : 'vertical';
  let mount = mounts[Math.floor(rnd() * mounts.length)];
  if (mode === 'vertical' && mount === 'pegboard') mount = 'multipoint';
  const lab = rnd() < 0.4;
  const label = lab ? { height: 5 + rnd() * 4, width: 20 + rnd() * 30, regions: [
    { outer: K.rectRing(-10, -2.5, -2, 2.5), holes: [K.rectRing(-8, -1, -4, 1).reverse()] }, { outer: K.circleRing(6, 0, 2.5, 30), holes: [] }] } : null;
  const P = {
    outline: blob(), mode, mount, thickness: 3 + rnd() * 40, clearance: 0.3 + rnd() * 1.7, wall: 1.6 + rnd() * 4, floor: 1 + rnd() * 3,
    pocketDepth: 3 + rnd() * 30, cradlePct: 0.2 + rnd() * 0.8, barPos: rnd(), barH: 6 + rnd() * 10, barT: 2 + rnd() * 3,
    grid: rnd() < 0.7, fit: -0.1 + rnd() * 0.4, boltHole: 22.8 + rnd() * 0.6,
    notch: { enabled: mode === 'horizontal' && rnd() < 0.7, diameter: 15 + rnd() * 15, at: rnd() < 0.5 ? null : [40 + (rnd() - 0.5) * 100, -10 + (rnd() - 0.5) * 60] },
    label,
  };
  const t0 = Date.now();
  try {
    const res = B.build(P);
    const fin = B.finalize(res);
    const chk = K.checkManifold(fin.print);
    const vol = K.meshVolume(fin.print);
    const dt = Date.now() - t0; tmax = Math.max(tmax, dt);
    warnTotal += res.warnings.length;
    const okk = chk.open === 0 && chk.dup === 0 && vol > 0;
    if (!okk) { fails++; console.log('FAIL', c, mode, mount, 'open', chk.open, 'dup', chk.dup, 'vol', vol.toFixed(0), JSON.stringify({ ...P, outline: P.outline.length, label: !!P.label })); }
  } catch (e) { fails++; console.log('EXC', c, mode, mount, e.message); }
}
console.log('cases', N, 'fails', fails, 'max ms', tmax, 'warnings', warnTotal);
