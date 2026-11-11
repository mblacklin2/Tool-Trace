/* ==========================================================================
   Multiboard Holder Generator — holder builder
   World frame: X right (facing the board), Z up, board face at y = 0,
   holder occupies y <= 0 (towards the viewer). "d" = distance out from board = -y.
   ========================================================================== */
const B = (() => {
'use strict';
const KK = (typeof K !== 'undefined') ? K : require('./kernel.js');
const GRID = 25;

// Dovetail receiver profiles (half-width r vs depth s from deepest point).
// Multiconnect receiver: published profile (DavidD Multiconnect, as used by QuackWorks):
//   (0,0) (10.15,0) (10.15,1.2121) (7.65,3.712) (7.65,4.15) (0,4.15)
// Multipoint: QuackWorks "Multipoint Beta" spec [r 7.9, 0.4, 2.2, 0.4, offset 0.15] -> receiver
//   (0,0) (8.05,0) (8.05,0.6121) (5.85,2.8121) (5.85,3.15) (0,3.15)
const PROFILES = {
  multiconnect: { R1: 10.15, s1: 1.2121, R2: 7.65, s2: 3.712, D: 4.15, back: 6.5, label: 'Multiconnect' },
  multipoint:   { R1: 8.05,  s1: 0.6121, R2: 5.85, s2: 2.8121, D: 3.15, back: 4.8, label: 'Multipoint' },
};
const MOUNTS = {
  multipoint:   { name: 'Multipoint slot', profile: 'multipoint', kind: 'slot' },
  multiconnect: { name: 'Multiconnect slot', profile: 'multiconnect', kind: 'slot' },
  rail:         { name: 'Multipoint Rail channel', profile: 'multipoint', kind: 'rail' },
  bolt:         { name: 'Big-thread bolt holes', kind: 'bolt' },
  pegboard:     { name: 'Pegboard hooks', kind: 'peg' },
};
const TILE_T = 6.4;          // Multiboard tile thickness (mm)
const PEG_DIAG = 5.2;        // diamond peg diagonal (fits the 6.0 mm small-hole minor diameter)
const BOLT_HOLE = 23.0;      // clearance hole for Big Thread (tile thread outer dia 22.6)
const BOLT_PLATE = 3.0;      // plate thickness at bolt holes (9 mm Big Thread bolts)

function snap(v, on) { return on ? Math.max(GRID, Math.ceil((v - 1e-6) / GRID) * GRID) : Math.max(v, 0); }

function dovetailRing(p, e, xc) {
  // XY-plane ring (u = x, v = y) for a slot cut into the back face (y = 0), deepest at y = -(D+e)
  const k = (Math.SQRT2 - 1) * e;
  const R1 = p.R1 + e, R2 = p.R2 + e, s1 = p.s1 + k, s2 = p.s2 + k, D = p.D + e;
  const y = s => -D + s;
  return [[xc - R1, y(0)], [xc + R1, y(0)], [xc + R1, y(s1)], [xc + R2, y(s2)], [xc + R2, 1.0],
          [xc - R2, 1.0], [xc - R2, y(s2)], [xc - R1, y(s1)]];
}
function railRing(p, e, zc) {
  // (u = y, v = z) ring for a horizontal channel in the back face, extruded along X
  const k = (Math.SQRT2 - 1) * e;
  const R1 = p.R1 + e, R2 = p.R2 + e, s1 = p.s1 + k, s2 = p.s2 + k, D = p.D + e;
  const y = s => -D + s;
  return [[y(0), zc - R1], [y(s1), zc - R1], [y(s2), zc - R2], [1.0, zc - R2],
          [1.0, zc + R2], [y(s2), zc + R2], [y(s1), zc + R1], [y(0), zc + R1]];
}
function diamondRing(xc, zc, diag) { const h = diag / 2; return [[xc, zc - h], [xc + h, zc], [xc, zc + h], [xc - h, zc]]; }

function slotCenters(W) {
  const n = Math.max(1, Math.floor((W + 1e-6) / GRID));
  const off = (W - n * GRID) / 2;
  const xs = [];
  for (let k = 0; k < n; k++) xs.push(off + GRID / 2 + GRID * k);
  return xs;
}
function boltCenters(W) {
  // keep >= 3.5 mm of plate beside each hole: use inner cells when the plate is 3+ cells wide
  const xs = slotCenters(W);
  if (xs.length >= 3) return [xs[1], xs[xs.length - 2]].filter((v, i, a) => a.indexOf(v) === i);
  return xs; // 1 or 2 cells: use them as-is
}
function pairCenters(W) { const xs = slotCenters(W); return xs.length > 1 ? [xs[0], xs[xs.length - 1]] : xs; }

function backThickness(mount) {
  const m = MOUNTS[mount];
  if (m.kind === 'slot' || m.kind === 'rail') return PROFILES[m.profile].back;
  if (m.kind === 'bolt') return BOLT_PLATE;
  return 4.0; // pegboard
}

// ---- mount features on a back plate spanning x in [0,W], z in [0,Hb], y in [-tb,0]
function mountFeatures(o) {
  const { mount, W, Hb, fit, printUpright } = o;
  const m = MOUNTS[mount];
  const adds = [], cuts = [], marks = [];
  if (m.kind === 'slot') {
    const p = PROFILES[m.profile];
    const stop = 13; // slot centre stops 13 mm below the top of the back (Multiconnect convention)
    const ceil = Math.min(Hb - 1.6, Hb - stop + p.R1 + fit);
    for (const xc of slotCenters(W)) {
      cuts.push(KK.prism([{ outer: dovetailRing(p, fit, xc), holes: [] }], -1, ceil, KK.AX.z));
      marks.push({ type: 'slot', x: xc, z0: 0, z1: ceil, w: 2 * (p.R1 + fit), stopZ: Hb - stop });
    }
  } else if (m.kind === 'rail') {
    const p = PROFILES[m.profile];
    const zc = Hb - GRID / 2;
    cuts.push(KK.prism([{ outer: railRing(p, fit, zc), holes: [] }], -1, W + 1, KK.AX.x));
    marks.push({ type: 'rail', z: zc, h: 2 * (p.R1 + fit) });
  } else if (m.kind === 'bolt') {
    const r = (o.boltHole || BOLT_HOLE) / 2;
    const zc = Hb - (r + 3.5);   // >= 3.5 mm of plate above the hole
    for (const xc of boltCenters(W)) {
      const ring = printUpright ? KK.teardropRing(xc, zc, r) : KK.circleRing(xc, zc, r);
      cuts.push(KK.prism([{ outer: ring, holes: [] }], -o.tb - 1, 1, KK.AX.y));
      marks.push({ type: 'bolt', x: xc, z: zc, r });
    }
  } else if (m.kind === 'peg') {
    const zc = Hb - GRID / 2;
    const h = PEG_DIAG / 2;
    const reach = TILE_T + 0.6;     // shaft passes through the tile
    const prongT = 3.4, prongUp = 6.0, prongHalf = 1.6;
    for (const xc of pairCenters(W)) {
      adds.push(KK.prism([{ outer: diamondRing(xc, zc, PEG_DIAG), holes: [] }], -1, reach + prongT, KK.AX.y));
      adds.push(KK.box(xc - prongHalf, reach, zc - 1.0, xc + prongHalf, reach + prongT, zc + prongUp));
      marks.push({ type: 'hook', x: xc, z: zc });
      const zs = zc - GRID;
      if (zs - h >= 0.8) {
        adds.push(KK.prism([{ outer: diamondRing(xc, zs, PEG_DIAG), holes: [] }], -1, 5.0, KK.AX.y));
        marks.push({ type: 'stub', x: xc, z: zs });
      }
    }
  }
  return { adds, cuts, marks };
}

function mountWarnings(mount, W, warnings) {
  const kind = MOUNTS[mount].kind;
  if (kind === 'bolt' && boltCenters(W).length < 2) warnings.push('Only one bolt fits on a 1-cell-wide holder, so it can rotate around the bolt. Widen the holder to 2+ cells (turn on grid snapping or increase the wall).');
  if ((kind === 'peg') && pairCenters(W).length < 2) warnings.push('Only one pegboard hook fits on a 1-cell-wide holder. It will work for light tools, but 2+ cells is steadier.');
  if (kind === 'slot' && slotCenters(W).length < 2) warnings.push('Only one slot fits on a 1-cell-wide holder. It works, but 2+ cells resist twisting better.');
}
function regionsBBox(regions) {
  const bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const r of regions) { const b = KK.ringBBox(r.outer); bb.x0 = Math.min(bb.x0, b.x0); bb.y0 = Math.min(bb.y0, b.y0); bb.x1 = Math.max(bb.x1, b.x1); bb.y1 = Math.max(bb.y1, b.y1); }
  return bb;
}
function shiftRegions(regions, dx, dy) {
  return regions.map(r => ({ outer: r.outer.map(p => [p[0] + dx, p[1] + dy]), holes: r.holes.map(h => h.map(p => [p[0] + dx, p[1] + dy])) }));
}
function nearestOnRegions(regions, pt) {
  let best = null, bd = Infinity;
  for (const r of regions) {
    const ring = r.outer;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L2 = dx * dx + dy * dy || 1e-12;
      let t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const q = [a[0] + t * dx, a[1] + t * dy];
      const d = Math.hypot(q[0] - pt[0], q[1] - pt[1]);
      if (d < bd) { bd = d; best = q; }
    }
  }
  return best;
}
function circleRectOverlap(cx, cy, r, x0, y0, x1, y1) {
  const nx = Math.max(x0, Math.min(cx, x1)), ny = Math.max(y0, Math.min(cy, y1));
  return Math.hypot(nx - cx, ny - cy) < r;
}

/* ------------------------------------------------------------------------ */
function build(P) {
  const warnings = [];
  const fit = P.fit || 0;
  const tb = backThickness(P.mount);
  const wall = Math.max(1.2, P.wall);
  const floor = Math.max(0.8, P.floor);
  if (MOUNTS[P.mount].kind === 'peg' && !pegAllowed(P)) throw new Error('Pegboard hooks are not available for this holder style.');
  const label = P.label && P.label.regions && P.label.regions.length ? P.label : null;

  if (P.mode === 'horizontal') return buildHorizontal(P, tb, wall, floor, fit, label, warnings);
  if (P.mode === 'flat') return buildFlat(P, tb, wall, floor, fit, label, warnings);
  return buildVertical(P, tb, wall, floor, fit, label, warnings);
}
// pegboard hooks need the part printed upright (back plate standing on its bottom edge)
function pegAllowed(P) { return P.mode === 'horizontal' || (P.mode === 'flat' && (P.flatStyle || 'hooks') !== 'clips'); }

/* --------------------------- flat-hanging holder --------------------------- */
// vertical-line crossings of the pocket rings at x; lower=true -> lowest y, else highest
function envelopeAt(regions, x, lower) {
  let best = null;
  for (const r of regions) {
    const ring = r.outer;
    for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
      const a = ring[j], b = ring[i];
      if ((a[0] > x) !== (b[0] > x)) {
        const y = a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]);
        if (best === null || (lower ? y < best : y > best)) best = y;
      }
    }
  }
  return best;
}
function envelopeSamples(regions, x0, x1, lower, step) {
  const out = [];
  const n = Math.max(2, Math.ceil((x1 - x0) / step));
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; out.push([x, envelopeAt(regions, x + 1e-7, lower)]); }
  return out;
}
// find the flattest window of width w near xc on an envelope; returns {xc, lo, hi} or null
function flattestSpot(regions, xc, w, search, lower) {
  let best = null;
  for (let dx = -search; dx <= search + 1e-9; dx += 1) {
    const c = xc + dx;
    const s = envelopeSamples(regions, c - w / 2, c + w / 2, lower, 0.5);
    if (s.some(p => p[1] === null)) continue;
    const ys = s.map(p => p[1]);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const score = (hi - lo) + Math.abs(dx) * 0.02;
    if (!best || score < best.score) best = { xc: c, lo, hi, score };
  }
  return best;
}
function buildFlat(P, tb, wall, floor, fit, label, warnings) {
  const style = P.flatStyle || 'hooks';
  const pk = P.pocket || KK.offsetRings([P.outline], P.clearance);
  const pb = regionsBBox(pk.regions);
  const pw = pb.x1 - pb.x0, ph = pb.y1 - pb.y0;
  const standoff = Math.max(0, P.standoff || 0);
  const clrD = Math.max(0.6, P.clearance);
  const seatT = Math.max(3, P.seatT || 6);
  const lipH = Math.max(2, P.lipH || 6);
  const lipT = Math.max(2, P.lipT || 3);
  const hookW = Math.max(6, P.hookW || 12);
  const d0 = tb + standoff;                    // tool back face
  const dTF = d0 + P.thickness + clrD;         // front of the tool space
  const kind = MOUNTS[P.mount].kind;
  const r = (P.boltHole || BOLT_HOLE) / 2;
  // clip geometry (shadow plate)
  const clipPt = 2.0, clipW = 10, clipBo = Math.max(0.8, P.clipBo || 1.5), barbT = 2.4;
  const recess = Math.max(0, Math.min(P.thickness, P.recess === undefined ? 2 : P.recess));
  // vertical space
  const G = dTF + lipT - tb + 0.5;            // 45° gusset rise under hook/ledge seats
  const bottomSpace = style === 'clips' ? clipPt + 3 : seatT + G + 1;
  const topSpace = style === 'clips' ? clipPt + 3 : Math.max(wall, 3) + 1;
  const labelBand = label ? label.height + 5 : 0;
  const boltBand = kind === 'bolt' ? 2 * r + 7.5 : 0;
  const side = style === 'clips' ? Math.max(wall, 4) : Math.max(wall, 4);
  const W = snap(pw + 2 * side, P.grid);
  const needH = bottomSpace + ph + topSpace + labelBand + boltBand;
  const Hb = P.grid ? snap(needH, true) : needH;
  const sx = (W - pw) / 2 - pb.x0;
  const sz = bottomSpace - pb.y0;
  const pocket = shiftRegions(pk.regions, sx, sz);
  const xs0 = pb.x0 + sx, xs1 = pb.x1 + sx, zTop = pb.y1 + sz;
  const centreZ = (pb.y0 + pb.y1) / 2 + sz;
  const parts = [];
  const supportsDraw = [];
  const printUpright = style !== 'clips';

  let plate = KK.prism([{ outer: KK.roundRectRing(0, 0, W, Hb, 2.5), holes: [] }], -tb, 0, KK.AX.y);
  if (style !== 'clips' && P.engrave) {
    const outer = shiftRegions(KK.offsetRings([P.outline], P.clearance + 0.9).regions, sx, sz);
    // inner edge sits 0.3 mm inside the pocket line so it never coincides with a support surface
    const inner = shiftRegions(KK.offsetRings([P.outline], Math.max(0.05, P.clearance - 0.3)).regions, sx, sz);
    const ring = KK.subtract(KK.prism(outer, -(tb + 1), -(tb - 0.45), KK.AX.y), KK.prism(inner, -(tb + 2), -(tb - 1), KK.AX.y));
    plate = KK.subtract(plate, ring);
  }
  const mf = mountFeatures({ mount: P.mount, W, Hb, fit, tb, printUpright, boltHole: P.boltHole });
  mountWarnings(P.mount, W, warnings);

  // a support block for x in [x0,x1]: seat follows the lower envelope, lip in front, spacer behind
  function supportBlock(x0, x1, samples) {
    const ys = samples.map(p => p[1]);
    const emin = Math.min(...ys), emax = Math.max(...ys);
    const zbot = emin - seatT, zLow = zbot - G;
    const seatRing = [[x0, zLow], [x1, zLow]];
    for (let i = samples.length - 1; i >= 0; i--) seatRing.push([samples[i][0], samples[i][1]]);
    let blk = KK.prism([{ outer: KK.dedupeRing(seatRing), holes: [] }], -(dTF + 0.5), -(tb - 0.5), KK.AX.y);
    const lip = KK.prism([{ outer: KK.rectRing(x0, zLow, x1, emax + lipH), holes: [] }], -(dTF + lipT), -dTF, KK.AX.y);
    blk = KK.union(blk, lip);
    if (standoff > 0.01) blk = KK.union(blk, KK.prism([{ outer: KK.rectRing(x0, zLow, x1, emax + lipH), holes: [] }], -d0, -(tb - 0.5), KK.AX.y));
    // 45° underside: remove the wedge below the line from (d=tb-0.5, zLow) to (d=dTF+lipT, zbot)
    const dA = tb - 1.5, dB = dTF + lipT + 1;
    const wedge = [[-dA, zLow - 1], [-dB, zbot + 1], [-dB, zLow - 1]]; // (u=y, v=z)
    blk = KK.subtract(blk, KK.prism([{ outer: wedge, holes: [] }], x0 - 1, x1 + 1, KK.AX.x));
    supportsDraw.push({ ring: seatRing, lipTop: emax + lipH, x0, x1 });
    return blk;
  }

  if (style === 'hooks') {
    const n = P.hookCount === 3 || (P.hookCount !== 2 && pw > 170) ? 3 : 2;
    const fr = n === 3 ? [0.15, 0.5, 0.85] : [0.22, 0.78];
    for (const f of fr) {
      const xc = xs0 + f * pw;
      const x0 = Math.max(xs0 + 0.5, xc - hookW / 2), x1 = Math.min(xs1 - 0.5, xc + hookW / 2);
      let s = envelopeSamples(pocket, x0, x1, true, 0.25);
      const defined = s.filter(p => p[1] !== null);
      if (!defined.length) continue;
      const fill = Math.max(...defined.map(p => p[1]));
      s = s.map(p => [p[0], p[1] === null ? fill : p[1]]);
      parts.push(supportBlock(x0, x1, s));
    }
  } else if (style === 'ledge') {
    // continuous ledge under the lower half of the outline, split into runs where it exists
    const all = envelopeSamples(pocket, xs0 + 0.3, xs1 - 0.3, true, 0.5);
    let run = [];
    const flush = () => { if (run.length >= 4) parts.push(supportBlock(run[0][0], run[run.length - 1][0], run)); run = []; };
    for (const p of all) { if (p[1] !== null && p[1] <= centreZ) run.push(p); else flush(); }
    flush();
  }
  // stand-off pads behind the top of the tool so it hangs parallel to the board
  if (style !== 'clips' && standoff > 0.01) {
    const fr = [0.25, 0.75];
    for (const f of fr) {
      const xc = xs0 + f * pw;
      const top = envelopeAt(pocket, xc, false), bot = envelopeAt(pocket, xc, true);
      if (top === null || bot === null) continue;
      const zc = top - 5 - P.clearance;
      if (zc - 4 <= bot + seatT) continue;
      if (!KK.pointInRing([xc, zc], P.outline.map(p => [p[0] + sx, p[1] + sz]))) continue;
      parts.push(KK.prism([{ outer: diamondRing(xc, zc, 9), holes: [] }], -d0, -(tb - 0.5), KK.AX.y));
    }
  }
  let clipsDraw = [];
  if (style === 'clips') {
    // floor (raised by the stand-off) and recess walls
    if (standoff > 0.01) parts.push(KK.prism([{ outer: KK.roundRectRing(0, 0, W, Hb, 2.5), holes: [] }], -d0, -(tb - 0.5), KK.AX.y));
    if (recess > 0.05) {
      const slab = KK.prism([{ outer: KK.roundRectRing(0, 0, W, Hb, 2.5), holes: [] }], -(d0 + recess), -(d0 - 0.5), KK.AX.y);
      parts.push(KK.subtract(slab, KK.prism(pocket, -(d0 + recess + 1), -(d0 - 0.01), KK.AX.y)));
    }
    const baseD = tb - 0.5;
    for (const lower of [true, false]) {
      for (const f of [0.25, 0.75]) {
        const spot = flattestSpot(pocket, xs0 + f * pw, clipW, 14, lower);
        if (!spot) continue;
        const x0 = spot.xc - clipW / 2, x1 = spot.xc + clipW / 2;
        let post, barb;
        if (lower) {
          const e = spot.lo, reach = spot.hi + clipBo;
          post = KK.prism([{ outer: KK.rectRing(x0, e - clipPt, x1, e), holes: [] }], -(dTF + barbT), -baseD, KK.AX.y);
          // (u = y, v = z): hold face at d = dTF, lead-in slope to the front
          barb = KK.prism([{ outer: [[-dTF, e - clipPt], [-dTF, reach], [-(dTF + barbT), e], [-(dTF + barbT), e - clipPt]], holes: [] }], x0, x1, KK.AX.x);
          clipsDraw.push({ x0, x1, z0: e - clipPt, z1: reach });
        } else {
          const e = spot.hi, reach = spot.lo - clipBo;
          post = KK.prism([{ outer: KK.rectRing(x0, e, x1, e + clipPt), holes: [] }], -(dTF + barbT), -baseD, KK.AX.y);
          barb = KK.prism([{ outer: [[-dTF, reach], [-dTF, e + clipPt], [-(dTF + barbT), e + clipPt], [-(dTF + barbT), e]], holes: [] }], x0, x1, KK.AX.x);
          clipsDraw.push({ x0, x1, z0: reach, z1: e + clipPt });
        }
        parts.push(KK.union(post, barb));
      }
    }
    if (clipsDraw.length < 2) warnings.push('Few flat edge sections were found for clips. Check that the tool is held, or try the hook or ledge style.');
    warnings.push('Snap clips flex across the print layers. PETG is recommended over PLA, and the fit-test coupon does not cover clips.');
  }
  let solid = KK.unionAll([plate, ...parts, ...mf.adds]);
  const cuts = [...mf.cuts];
  let labelBox = null;
  if (label) {
    if (label.width > W - 6) warnings.push('The label is wider than the holder, so it was left off.');
    else {
      const zc = zTop + topSpace + labelBand / 2;
      labelBox = { x0: W / 2 - label.width / 2, x1: W / 2 + label.width / 2, y0: zc - label.height / 2, y1: zc + label.height / 2, xc: W / 2, yc: zc };
      const face = style === 'clips' ? (recess > 0.05 ? d0 + recess : d0) : tb;
      cuts.push(KK.prism(shiftRegions(label.regions, W / 2, zc), -(face + 1), -(face - (P.labelDepth || 0.6)), KK.AX.y));
    }
  }
  if (cuts.length) solid = KK.subtract(solid, KK.unionAll(cuts));
  if (printUpright && Hb / tb > 12) warnings.push('This holder prints standing on its bottom edge and is tall for its thickness. Add a brim in your slicer.');
  if (G > 30) warnings.push('Thick tools need deep support gussets (' + Math.round(G) + ' mm). Consider the shadow-plate style.');
  const layout = {
    view: 'front', W, H: Hb, x0: 0, y0: 0, x1: W, y1: Hb, sx, sy: sz,
    footprint: KK.roundRectRing(0, 0, W, Hb, 2.5), back: KK.roundRectRing(0, 0, W, Hb, 2.5),
    pocket, supports: supportsDraw, clips: clipsDraw, labelBox, marks: mf.marks,
  };
  const depth = style === 'clips' ? dTF + barbT : dTF + lipT;
  const dims = { width: W, height: Hb, depth, standoff, backThickness: tb, gridW: W / GRID, gridH: Hb / GRID };
  return { solid, layout, dims, warnings, printRotate: printUpright ? 'none' : 'backDown' };
}

function buildHorizontal(P, tb, wall, floor, fit, label, warnings) {
  const pk = P.pocket || KK.offsetRings([P.outline], P.clearance);
  let pocket = pk.regions;
  const pb = regionsBBox(pocket);
  const pw = pb.x1 - pb.x0;
  const depth = Math.max(1, P.pocketDepth);
  const T = floor + depth;
  const textH = label ? label.height : 0;
  const frontMargin = label ? Math.max(wall, textH + 4) : wall;
  const W = snap(pw + 2 * wall, P.grid);
  const sx = (W - pw) / 2 - pb.x0;
  const yBack = -(tb - 0.5);
  const sy = -(tb + wall) - pb.y1;
  pocket = shiftRegions(pocket, sx, sy);
  const pocketFrontY = pb.y0 + sy;
  const yFront = pocketFrontY - frontMargin;
  const D = -yFront;

  // finger notch: centred on the pocket edge, merged with the pocket in 2D
  let notch = null;
  let cutRegions = pocket;
  if (P.notch && P.notch.enabled) {
    const r = P.notch.diameter / 2;
    let c;
    if (P.notch.at) c = nearestOnRegions(pocket, [P.notch.at[0] + sx, P.notch.at[1] + sy]);
    else { // front-most pocket point
      let best = null;
      for (const reg of pocket) for (const p of reg.outer) if (!best || p[1] < best[1]) best = p;
      c = best;
    }
    notch = { x: c[0], y: c[1], r, u: c[0] - sx, v: c[1] - sy };
    const merged = KK.offsetRings([P.outline], P.clearance, { circles: [{ x: notch.u, y: notch.v, r }] });
    cutRegions = shiftRegions(merged.regions, sx, sy);
  }
  // back plate height
  let need = Math.max(T, GRID);
  const kind = MOUNTS[P.mount].kind;
  if (kind === 'bolt') need = Math.max(need, T + (P.boltHole || BOLT_HOLE) + 7.5);
  if (kind === 'peg') need = Math.max(need, GRID);
  const Hb = P.grid ? snap(need, true) : need;

  const parts = [];
  const tray = KK.prism([{ outer: KK.roundRectRing(0, yFront, W, yBack, 3, [true, true, false, false]), holes: [] }], 0, T, KK.AX.z);
  const back = KK.prism([{ outer: KK.roundRectRing(0, 0, W, Hb, 2, [false, false, true, true]), holes: [] }], -tb, 0, KK.AX.y);
  const mf = mountFeatures({ mount: P.mount, W, Hb, fit, tb, printUpright: true, boltHole: P.boltHole });
  mountWarnings(P.mount, W, warnings);
  let solid = KK.unionAll([back, tray, ...mf.adds]);

  const cuts = [KK.prism(cutRegions, floor, T + 1, KK.AX.z)];
  // label in the front strip of the tray top
  let labelBox = null;
  if (label) {
    const tw = label.width, th = label.height;
    const y0 = yFront + 2, y1 = y0 + th, yc = (y0 + y1) / 2;
    const cands = [W / 2];
    if (notch) {
      const leftC = (wall + notch.x - notch.r - 2) / 2, rightC = (notch.x + notch.r + 2 + W - wall) / 2;
      cands.push(leftC, rightC);
    }
    for (const xc of cands) {
      const x0 = xc - tw / 2, x1 = xc + tw / 2;
      if (x0 < wall || x1 > W - wall) continue;
      if (notch && circleRectOverlap(notch.x, notch.y, notch.r + 1, x0, y0, x1, y1)) continue;
      labelBox = { x0, y0, x1, y1, xc, yc };
      break;
    }
    if (labelBox) cuts.push(KK.prism(shiftRegions(label.regions, labelBox.xc, labelBox.yc), T - (P.labelDepth || 0.6), T + 1, KK.AX.z));
    else warnings.push('The label does not fit beside the finger notch, so it was left off. Shorten the text, reduce its size, or move the notch.');
  }
  for (const c of mf.cuts) cuts.push(c);
  solid = KK.subtract(solid, KK.unionAll(cuts));

  if (notch && notch.y - notch.r < yFront) warnings.push('The finger notch cuts through the front wall of the tray (an open finger slot).');
  if (depth < 0.5 * P.thickness) warnings.push('Pocket depth is less than half the tool thickness, so the tool may slide out.');

  const layout = {
    view: 'top', W, H: D + tb, x0: 0, y0: yFront, x1: W, y1: 0, sx, sy,
    footprint: KK.roundRectRing(0, yFront, W, yBack, 3, [true, true, false, false]),
    back: KK.rectRing(0, -tb, W, 0),
    pocket, notch, labelBox, marks: mf.marks,
  };
  const dims = { width: W, height: Hb, depth: D, trayHeight: T, backThickness: tb, gridW: W / GRID, gridH: Hb / GRID };
  return { solid, layout, dims, warnings, printRotate: 'none' };
}

function buildVertical(P, tb, wall, floor, fit, label, warnings) {
  const pk0 = P.pocket || KK.offsetRings([P.outline], P.clearance);
  const pb = regionsBBox(pk0.regions);
  const pw = pb.x1 - pb.x0, ph = pb.y1 - pb.y0;
  const W = snap(pw + 2 * wall, P.grid);
  const needH = wall + Math.max(20, P.cradlePct * ph);
  const Hc = P.grid ? snap(needH, true) : needH;
  const sx = (W - pw) / 2 - pb.x0;
  const sz = wall - pb.y0;
  // swept pocket (tool slides down into the cradle from above)
  const sweepTop = Hc - sz + 3;
  const sw = KK.offsetRings([P.outline], P.clearance, { sweepTo: sweepTop });
  const pocket = shiftRegions(sw.regions, sx, sz);
  const pd = P.thickness + Math.max(0.6, P.clearance);
  const BAR_OV = 0.5; // bar overlaps the body (avoids coplanar contact); pocket deepened to match
  const dFront = tb + floor + pd + BAR_OV;
  const barT = Math.max(1.6, P.barT || 3);
  let barH = Math.max(5, P.barH || 10);
  if (label) barH = Math.max(barH, label.height + 4);
  let zc = wall + P.barPos * (Hc - wall);
  zc = Math.max(barH / 2, Math.min(Hc - barH / 2, zc));
  const zb0 = zc - barH / 2, zb1 = zc + barH / 2;
  if (zb0 < wall + 3) warnings.push('The retainer bar is close to the bottom of the pocket, so the tool may not be held securely. Raise "Retainer bar position".');
  if (W > 90) warnings.push('The retainer bar bridges ' + Math.round(W - 2 * wall) + ' mm across the pocket. Make sure your printer can bridge that far, or narrow the tool outline.');

  const kind = MOUNTS[P.mount].kind;
  let Hb = Hc;
  if (kind === 'bolt') { const bh = (P.boltHole || BOLT_HOLE) + 7.5; Hb = P.grid ? snap(Hc + bh, true) : Hc + bh; }

  const back = KK.prism([{ outer: KK.roundRectRing(0, 0, W, Hb, 2.5), holes: [] }], -tb, 0, KK.AX.y);
  const body = KK.prism([{ outer: KK.roundRectRing(0, 0, W, Hc, 2.5), holes: [] }], -dFront, -(tb - 0.5), KK.AX.y);
  const mf = mountFeatures({ mount: P.mount, W, Hb, fit, tb, printUpright: false, boltHole: P.boltHole });
  mountWarnings(P.mount, W, warnings);
  let solid = KK.union(back, body);
  const cuts = [KK.prism(pocket, -dFront - 1, -(tb + floor), KK.AX.y), ...mf.cuts];
  solid = KK.subtract(solid, KK.unionAll(cuts));
  const bar = KK.prism([{ outer: KK.rectRing(0, zb0, W, zb1), holes: [] }], -(dFront + barT), -(dFront - BAR_OV), KK.AX.y);
  solid = KK.union(solid, bar);
  let labelBox = null;
  if (label) {
    if (label.width > W - 4) warnings.push('The label is wider than the retainer bar, so it was left off.');
    else {
      labelBox = { x0: W / 2 - label.width / 2, x1: W / 2 + label.width / 2, y0: zc - label.height / 2, y1: zc + label.height / 2, xc: W / 2, yc: zc };
      const fy = -(dFront + barT);
      solid = KK.subtract(solid, KK.prism(shiftRegions(label.regions, W / 2, zc), fy - 1, fy + (P.labelDepth || 0.6), KK.AX.y));
    }
  }
  const layout = {
    view: 'front', W, H: Hb, x0: 0, y0: 0, x1: W, y1: Hb, sx, sy: sz,
    footprint: KK.roundRectRing(0, 0, W, Hc, 2.5), back: KK.roundRectRing(0, 0, W, Hb, 2.5),
    pocket, bar: { y0: zb0, y1: zb1 }, labelBox, marks: mf.marks,
  };
  const dims = { width: W, height: Hb, depth: dFront + barT, cradleHeight: Hc, backThickness: tb, gridW: W / GRID, gridH: Hb / GRID };
  return { solid, layout, dims, warnings, printRotate: 'backDown' };
}

// test-fit coupon for the chosen mount
function buildCoupon(mount, fit, boltHole) {
  const kind = MOUNTS[mount].kind;
  const tb = backThickness(mount);
  if (kind === 'peg') {
    const W = 25, Hb = 50;
    const back = KK.prism([{ outer: KK.rectRing(0, 0, W, Hb), holes: [] }], -tb, 0, KK.AX.y);
    const foot = KK.box(0, -(tb + 18), 0, W, -(tb - 0.5), 3);
    const mf = mountFeatures({ mount, W, Hb, fit, tb, printUpright: true });
    return { solid: KK.unionAll([back, foot, ...mf.adds]), printRotate: 'none' };
  }
  const W = 25, Hb = kind === 'bolt' ? 30 : 30;
  const back = KK.prism([{ outer: KK.roundRectRing(0, 0, kind === 'bolt' ? 30 : W, Hb, 2), holes: [] }], -tb, 0, KK.AX.y);
  const mf = mountFeatures({ mount, W: kind === 'bolt' ? 30 : W, Hb, fit, tb, printUpright: false, boltHole });
  return { solid: KK.subtract(back, KK.unionAll(mf.cuts)), printRotate: 'backDown' };
}

// final mesh in world and print orientation
function finalize(result) {
  // try several weld tolerances; keep the first watertight result (else the best one)
  let m = null, best = null;
  for (const weld of [1e-5, 1e-4, 1e-6, 1e-3, 3e-5]) {
    const cand = KK.finalizeMesh(result.solid, { weld });
    const chk = KK.checkManifold(cand);
    const bad = chk.open + chk.dup;
    if (!best || bad < best.bad) best = { m: cand, bad, chk, weld };
    if (bad === 0) break;
  }
  m = best.m;
  result.meshCheck = { watertight: best.bad === 0, openEdges: best.chk.open, nonManifold: best.chk.dup, triangles: best.chk.tris, weld: best.weld };
  const world = m;
  let pm;
  if (result.printRotate === 'backDown') pm = KK.transformFinal(m, q => [q[0], q[2], -q[1]]);
  else pm = KK.transformFinal(m, q => [q[0], q[1], q[2]]);
  const bb = KK.finalBBox(pm);
  const cx = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2;
  pm = KK.transformFinal(pm, q => [q[0] - cx, q[1] - cy, q[2] - bb.min[2]]);
  return { world, print: pm };
}

// one geometry job (used by the Web Worker and by the main-thread fallback)
function runJob(job) {
  try {
    const res = job.kind === 'coupon' ? buildCoupon(job.P.mount, job.P.fit, job.P.boltHole) : build(job.P);
    const fin = finalize(res);
    const flat = m => { const a = new Float32Array(m.tris.length * 9); let o = 0; for (const t of m.tris) for (const i of t) { const v = m.verts[i]; a[o++] = v[0]; a[o++] = v[1]; a[o++] = v[2]; } return a; };
    const pos = flat(fin.print), wpos = flat(fin.world);
    const stl = KK.stlBinary(fin.print, job.name || '');
    return { msg: { id: job.id, kind: job.kind, ok: true, dims: res.dims || null, warnings: res.warnings || [], layout: res.layout || null, check: res.meshCheck, printRotate: res.printRotate, pos, wpos, stl }, transfer: [pos.buffer, wpos.buffer, stl] };
  } catch (err) {
    return { msg: { id: job.id, kind: job.kind, ok: false, error: String((err && err.message) || err) }, transfer: [] };
  }
}

return { build, buildCoupon, finalize, runJob, pegAllowed, MOUNTS, PROFILES, backThickness, GRID, TILE_T, PEG_DIAG, BOLT_HOLE };
})();
if (typeof module !== 'undefined') module.exports = B;
