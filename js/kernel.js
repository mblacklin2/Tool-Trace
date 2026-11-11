/* ==========================================================================
   Multiboard Holder Generator — geometry kernel (no dependencies)
   - earcut (port of the mapbox/earcut algorithm, ISC license, simplified)
   - BSP solid CSG (after Evan Wallace's csg.js, MIT), iterative
   - raster signed-distance offsets + marching squares contours
   - T-junction repair, triangulation, binary STL
   All units are millimetres.
   ========================================================================== */
const K = (() => {
'use strict';

/* ------------------------------ earcut ---------------------------------- */
function earcut(data, holeIndices) {
  const dim = 2;
  const hasHoles = holeIndices && holeIndices.length;
  const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
  let outerNode = linkedList(data, 0, outerLen, dim, true);
  const triangles = [];
  if (!outerNode || outerNode.next === outerNode.prev) return triangles;
  if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
  earcutLinked(outerNode, triangles, dim, 0);
  return triangles;
}
function linkedList(data, start, end, dim, clockwise) {
  let i, last;
  if (clockwise === (signedAreaFlat(data, start, end, dim) > 0)) {
    for (i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
  } else {
    for (i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
  }
  if (last && equalsN(last, last.next)) { removeNode(last); last = last.next; }
  return last;
}
function filterPoints(start, end) {
  if (!start) return start;
  if (!end) end = start;
  let p = start, again;
  do {
    again = false;
    if (!p.steiner && (equalsN(p, p.next) || areaN(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = end = p.prev;
      if (p === p.next) break;
      again = true;
    } else p = p.next;
  } while (again || p !== end);
  return end;
}
function earcutLinked(ear, triangles, dim, pass) {
  if (!ear) return;
  let stop = ear, prev, next;
  let guard = 0;
  while (ear.prev !== ear.next) {
    if (++guard > 5e7) break;
    prev = ear.prev; next = ear.next;
    if (isEar(ear)) {
      triangles.push(prev.i / dim | 0, ear.i / dim | 0, next.i / dim | 0);
      removeNode(ear);
      ear = next.next; stop = next.next;
      continue;
    }
    ear = next;
    if (ear === stop) {
      if (!pass) earcutLinked(filterPoints(ear), triangles, dim, 1);
      else if (pass === 1) {
        ear = cureLocalIntersections(filterPoints(ear), triangles, dim);
        earcutLinked(ear, triangles, dim, 2);
      } else if (pass === 2) splitEarcut(ear, triangles, dim);
      break;
    }
  }
}
function isEar(ear) {
  const a = ear.prev, b = ear, c = ear.next;
  if (areaN(a, b, c) >= 0) return false;
  const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
  const x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy), x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy);
  let p = c.next;
  while (p !== a) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 &&
        pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
        areaN(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}
function cureLocalIntersections(start, triangles, dim) {
  let p = start;
  do {
    const a = p.prev, b = p.next.next;
    if (!equalsN(a, b) && intersectsN(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      triangles.push(a.i / dim | 0, p.i / dim | 0, b.i / dim | 0);
      removeNode(p); removeNode(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);
  return filterPoints(p);
}
function splitEarcut(start, triangles, dim) {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        let c = splitPolygonN(a, b);
        a = filterPoints(a, a.next);
        c = filterPoints(c, c.next);
        earcutLinked(a, triangles, dim, 0);
        earcutLinked(c, triangles, dim, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}
function eliminateHoles(data, holeIndices, outerNode, dim) {
  const queue = [];
  for (let i = 0, len = holeIndices.length; i < len; i++) {
    const start = holeIndices[i] * dim;
    const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
    const list = linkedList(data, start, end, dim, false);
    if (!list) continue;
    if (list === list.next) list.steiner = true;
    queue.push(getLeftmost(list));
  }
  queue.sort((a, b) => a.x - b.x);
  for (let i = 0; i < queue.length; i++) outerNode = eliminateHole(queue[i], outerNode);
  return outerNode;
}
function eliminateHole(hole, outerNode) {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) return outerNode;
  const bridgeReverse = splitPolygonN(bridge, hole);
  filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(bridge, bridge.next);
}
function findHoleBridge(hole, outerNode) {
  let p = outerNode;
  const hx = hole.x, hy = hole.y;
  let qx = -Infinity, m;
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) return m;
      }
    }
    p = p.next;
  } while (p !== outerNode);
  if (!m) return null;
  const stop = m, mx = m.x, my = m.y;
  let tanMin = Infinity, tan;
  p = m;
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x &&
        pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      tan = Math.abs(hy - p.y) / (hx - p.x);
      if (locallyInside(p, hole) &&
          (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
        m = p; tanMin = tan;
      }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}
function sectorContainsSector(m, p) { return areaN(m.prev, m, p.prev) < 0 && areaN(p.next, m, m.next) < 0; }
function getLeftmost(start) {
  let p = start, leftmost = start;
  do {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
    p = p.next;
  } while (p !== start);
  return leftmost;
}
function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
         (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
         (bx - px) * (cy - py) >= (cx - px) * (by - py);
}
function isValidDiagonal(a, b) {
  return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
    ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) &&
      (areaN(a.prev, a, b.prev) || areaN(a, b.prev, b))) ||
     (equalsN(a, b) && areaN(a.prev, a, a.next) > 0 && areaN(b.prev, b, b.next) > 0));
}
function areaN(p, q, r) { return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y); }
function equalsN(p1, p2) { return p1.x === p2.x && p1.y === p2.y; }
function sgn(n) { return n > 0 ? 1 : n < 0 ? -1 : 0; }
function onSegmentN(p, q, r) {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}
function intersectsN(p1, q1, p2, q2) {
  const o1 = sgn(areaN(p1, q1, p2)), o2 = sgn(areaN(p1, q1, q2)), o3 = sgn(areaN(p2, q2, p1)), o4 = sgn(areaN(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegmentN(p1, p2, q1)) return true;
  if (o2 === 0 && onSegmentN(p1, q2, q1)) return true;
  if (o3 === 0 && onSegmentN(p2, p1, q2)) return true;
  if (o4 === 0 && onSegmentN(p2, q1, q2)) return true;
  return false;
}
function intersectsPolygon(a, b) {
  let p = a;
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersectsN(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}
function locallyInside(a, b) {
  return areaN(a.prev, a, a.next) < 0 ?
    areaN(a, b, a.next) >= 0 && areaN(a, a.prev, b) >= 0 :
    areaN(a, b, a.prev) < 0 || areaN(a, a.next, b) < 0;
}
function middleInside(a, b) {
  let p = a, inside = false;
  const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
  do {
    if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y &&
        (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x)) inside = !inside;
    p = p.next;
  } while (p !== a);
  return inside;
}
function splitPolygonN(a, b) {
  const a2 = new ENode(a.i, a.x, a.y), b2 = new ENode(b.i, b.x, b.y), an = a.next, bp = b.prev;
  a.next = b; b.prev = a;
  a2.next = an; an.prev = a2;
  b2.next = a2; a2.prev = b2;
  bp.next = b2; b2.prev = bp;
  return b2;
}
function insertNode(i, x, y, last) {
  const p = new ENode(i, x, y);
  if (!last) { p.prev = p; p.next = p; }
  else { p.next = last.next; p.prev = last; last.next.prev = p; last.next = p; }
  return p;
}
function removeNode(p) { p.next.prev = p.prev; p.prev.next = p.next; }
function ENode(i, x, y) { this.i = i; this.x = x; this.y = y; this.prev = null; this.next = null; this.steiner = false; }
function signedAreaFlat(data, start, end, dim) {
  let sum = 0;
  for (let i = start, j = end - dim; i < end; i += dim) { sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]); j = i; }
  return sum;
}

/* ------------------------------ 2D utils -------------------------------- */
function ringArea(r) { // signed, CCW positive (y up)
  let s = 0;
  for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return s / 2;
}
function ringBBox(r) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { x0, y0, x1, y1 };
}
function pointInRing(pt, r) {
  let inside = false;
  const x = pt[0], y = pt[1];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function dedupeRing(r, eps) {
  eps = eps || 1e-9;
  const out = [];
  for (const p of r) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > eps || Math.abs(q[1] - p[1]) > eps) out.push(p);
  }
  while (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps) out.pop(); else break;
  }
  return out;
}
// Douglas–Peucker for a closed ring
function simplifyRing(r, tol) {
  r = dedupeRing(r);
  const n = r.length;
  if (n < 5 || tol <= 0) return r.slice();
  // split at two far-apart points
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < n; i++) { const d = (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2; if (d > best) { best = d; b = i; } }
  best = -1;
  for (let i = 0; i < n; i++) { const d = (r[i][0] - r[b][0]) ** 2 + (r[i][1] - r[b][1]) ** 2; if (d > best) { best = d; a = i; } }
  if (a > b) { const t = a; a = b; b = t; }
  const keep = new Uint8Array(n);
  keep[a] = 1; keep[b] = 1;
  const tol2 = tol * tol;
  const stack = [[a, b], [b, a + n]];
  while (stack.length) {
    const [s, e] = stack.pop();
    if (e - s < 2) continue;
    const P = r[s % n], Q = r[e % n];
    const dx = Q[0] - P[0], dy = Q[1] - P[1];
    const L2 = dx * dx + dy * dy;
    let maxD = -1, idx = -1;
    for (let k = s + 1; k < e; k++) {
      const R = r[k % n];
      let d;
      if (L2 < 1e-18) d = (R[0] - P[0]) ** 2 + (R[1] - P[1]) ** 2;
      else {
        let t = ((R[0] - P[0]) * dx + (R[1] - P[1]) * dy) / L2;
        t = Math.max(0, Math.min(1, t));
        d = (P[0] + t * dx - R[0]) ** 2 + (P[1] + t * dy - R[1]) ** 2;
      }
      if (d > maxD) { maxD = d; idx = k; }
    }
    if (maxD > tol2) { keep[idx % n] = 1; stack.push([s, idx], [idx, e]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(r[i]);
  return out;
}
// Chaikin-free light smoothing (moving average) for closed ring
function smoothRing(r, iterations) {
  let cur = r;
  for (let it = 0; it < iterations; it++) {
    const n = cur.length, nx = [];
    for (let i = 0; i < n; i++) {
      const p = cur[(i - 1 + n) % n], q = cur[i], s = cur[(i + 1) % n];
      nx.push([(p[0] + 2 * q[0] + s[0]) / 4, (p[1] + 2 * q[1] + s[1]) / 4]);
    }
    cur = nx;
  }
  return cur;
}
function resampleRing(r, step) {
  const n = r.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  }
  return out;
}

/* --------------------- raster fields and contours ----------------------- */
// grid: {x0, y0, res, w, h}; cell (i,j) centre = (x0 + (i+.5)res, y0 + (j+.5)res); j grows with +y
function makeGrid(bb, res, margin) {
  const x0 = bb.x0 - margin, y0 = bb.y0 - margin;
  const w = Math.ceil((bb.x1 - bb.x0 + 2 * margin) / res) + 1;
  const h = Math.ceil((bb.y1 - bb.y0 + 2 * margin) / res) + 1;
  return { x0, y0, res, w, h };
}
// even-odd scanline fill of rings into a mask (1 = inside)
function rasterizeRings(rings, g) {
  const m = new Uint8Array(g.w * g.h);
  const xs = [];
  for (let j = 0; j < g.h; j++) {
    const y = g.y0 + (j + 0.5) * g.res;
    xs.length = 0;
    for (const r of rings) {
      for (let i = 0, n = r.length, k = n - 1; i < n; k = i++) {
        const a = r[k], b = r[i];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    if (!xs.length) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      let i0 = Math.ceil((xs[k] - g.x0) / g.res - 0.5), i1 = Math.floor((xs[k + 1] - g.x0) / g.res - 0.5);
      if (i0 < 0) i0 = 0; if (i1 > g.w - 1) i1 = g.w - 1;
      for (let i = i0; i <= i1; i++) m[j * g.w + i] ^= 1;
    }
  }
  return m;
}
// Felzenszwalb exact squared EDT. f: Float64Array with 0 for sites and INF otherwise
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let r = v[k];
    let s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r);
    while (s <= z[k]) {
      k--;
      r = v[k];
      s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    d[q] = (q - r) * (q - r) + f[r];
  }
}
function edt2d(sites, w, h) { // sites: Uint8Array (1 = site). returns Float64Array squared dist in cells
  const INF = 1e20;
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const out = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = sites[i] ? 0 : INF;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) f[x] = out[o + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[o + x] = d[x];
  }
  return out;
}
// signed distance (mm): negative inside the mask
function signedDistance(mask, g) {
  const N = g.w * g.h;
  const inv = new Uint8Array(N);
  for (let i = 0; i < N; i++) inv[i] = mask[i] ? 0 : 1;
  const dIn = edt2d(inv, g.w, g.h);   // for inside pixels: distance to nearest outside pixel
  const dOut = edt2d(mask, g.w, g.h); // for outside pixels: distance to nearest inside pixel
  const sd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    sd[i] = mask[i] ? -(Math.sqrt(dIn[i]) - 0.5) * g.res : (Math.sqrt(dOut[i]) - 0.5) * g.res;
  }
  return sd;
}
// marching squares: loops where field < level, inside on the left (outer CCW, holes CW)
function contourField(field, g, level) {
  const W = g.w + 2, H = g.h + 2; // pad with "outside"
  const BIG = 1e9;
  const F = new Float64Array(W * H);
  F.fill(BIG);
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) F[(j + 1) * W + i + 1] = field[j * g.w + i];
  const px = i => g.x0 + (i - 0.5) * g.res;  // padded index -> coordinate of node
  const py = j => g.y0 + (j - 0.5) * g.res;
  const pts = new Map();
  const next = new Map();
  const hKey = (i, j) => (j * W + i) * 2;     // edge from node (i,j) to (i+1,j)
  const vKey = (i, j) => (j * W + i) * 2 + 1; // edge from node (i,j) to (i,j+1)
  const lerpT = (a, b) => { let t = (level - a) / (b - a); if (!(t > 1e-6)) t = 1e-6; if (t > 1 - 1e-6) t = 1 - 1e-6; return t; };
  function pt(key, i, j, horizontal) {
    if (pts.has(key)) return;
    if (horizontal) { const a = F[j * W + i], b = F[j * W + i + 1]; const t = lerpT(a, b); pts.set(key, [px(i) + t * g.res, py(j)]); }
    else { const a = F[j * W + i], b = F[(j + 1) * W + i]; const t = lerpT(a, b); pts.set(key, [px(i), py(j) + t * g.res]); }
  }
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const f0 = F[j * W + i], f1 = F[j * W + i + 1], f2 = F[(j + 1) * W + i + 1], f3 = F[(j + 1) * W + i];
      const b0 = f0 < level, b1 = f1 < level, b2 = f2 < level, b3 = f3 < level;
      const c = (b0 ? 1 : 0) | (b1 ? 2 : 0) | (b2 ? 4 : 0) | (b3 ? 8 : 0);
      if (c === 0 || c === 15) continue;
      // edges CCW: e0 bottom (v0->v1), e1 right (v1->v2), e2 top (v2->v3), e3 left (v3->v0)
      const ins = [b0, b1, b2, b3];
      const keys = [hKey(i, j), vKey(i + 1, j), hKey(i, j + 1), vKey(i, j)];
      const trans = []; // [edgeIndex, type] type 1 = in->out, 2 = out->in
      for (let e = 0; e < 4; e++) {
        const a = ins[e], b = ins[(e + 1) % 4];
        if (a !== b) trans.push([e, a ? 1 : 2]);
      }
      const mk = e => {
        const k = keys[e];
        if (e === 0) pt(k, i, j, true); else if (e === 1) pt(k, i + 1, j, false);
        else if (e === 2) pt(k, i, j + 1, true); else pt(k, i, j, false);
        return k;
      };
      let pairs = [];
      if (trans.length === 2) {
        const s = trans[0][1] === 1 ? trans[0][0] : trans[1][0];
        const e = trans[0][1] === 2 ? trans[0][0] : trans[1][0];
        pairs.push([s, e]);
      } else if (trans.length === 4) {
        const centerIn = (f0 + f1 + f2 + f3) / 4 < level;
        for (let t = 0; t < 4; t++) {
          if (trans[t][1] !== 1) continue;
          const s = trans[t][0];
          const e = centerIn ? trans[(t + 1) % 4][0] : trans[(t + 3) % 4][0];
          pairs.push([s, e]);
        }
      }
      for (const [s, e] of pairs) next.set(mk(s), mk(e));
    }
  }
  const loops = [];
  const used = new Set();
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop = [];
    let k = start, guard = 0;
    while (!used.has(k)) {
      used.add(k);
      loop.push(pts.get(k));
      k = next.get(k);
      if (k === undefined || ++guard > 1e7) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
// group loops (outer CCW / holes CW) into regions [{outer, holes}]
function loopsToRegions(loops, minArea) {
  minArea = minArea || 0;
  const outers = [], holes = [];
  for (const l of loops) {
    const a = ringArea(l);
    if (Math.abs(a) < minArea) continue;
    (a > 0 ? outers : holes).push({ ring: l, area: Math.abs(a) });
  }
  outers.sort((a, b) => a.area - b.area);
  const regions = outers.map(o => ({ outer: o.ring, holes: [], area: o.area, bb: ringBBox(o.ring) }));
  for (const h of holes) {
    const p = h.ring[0];
    for (const r of regions) {
      if (r.area <= h.area) continue;
      if (p[0] < r.bb.x0 || p[0] > r.bb.x1 || p[1] < r.bb.y0 || p[1] > r.bb.y1) continue;
      if (pointInRing(p, r.outer)) { r.holes.push(h.ring); break; }
    }
  }
  return regions.map(r => ({ outer: r.outer, holes: r.holes }));
}
function simplifyRegions(regions, tol) {
  const out = [];
  for (const r of regions) {
    const o = simplifyRing(r.outer, tol);
    if (o.length < 3 || Math.abs(ringArea(o)) < 1e-6) continue;
    const hs = [];
    for (const h of r.holes) { const s = simplifyRing(h, tol); if (s.length >= 3 && Math.abs(ringArea(s)) > 1e-6) hs.push(s); }
    out.push({ outer: o, holes: hs });
  }
  return out;
}
// offset (positive = grow) of a set of outer rings; optional upward sweep (+y) to yTop
function offsetRings(rings, delta, opts) {
  opts = opts || {};
  let bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const r of rings) { const b = ringBBox(r); bb.x0 = Math.min(bb.x0, b.x0); bb.y0 = Math.min(bb.y0, b.y0); bb.x1 = Math.max(bb.x1, b.x1); bb.y1 = Math.max(bb.y1, b.y1); }
  if (opts.sweepTo !== undefined) bb.y1 = Math.max(bb.y1, opts.sweepTo);
  for (const c of opts.circles || []) { bb.x0 = Math.min(bb.x0, c.x - c.r); bb.x1 = Math.max(bb.x1, c.x + c.r); bb.y0 = Math.min(bb.y0, c.y - c.r); bb.y1 = Math.max(bb.y1, c.y + c.r); }
  const span = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) + 2 * Math.abs(delta) + 4;
  let res = opts.res || Math.max(0.06, Math.min(0.2, Math.sqrt(((bb.x1 - bb.x0 + 6) * (bb.y1 - bb.y0 + 6)) / 2.5e6)));
  const g = makeGrid(bb, res, Math.abs(delta) + 2 * res + 1);
  const mask = rasterizeRings(rings, g);
  const sd = signedDistance(mask, g);
  if (opts.circles && opts.circles.length) {
    for (const c of opts.circles) {
      const i0 = Math.max(0, Math.floor((c.x - c.r - g.x0) / g.res) - 2), i1 = Math.min(g.w - 1, Math.ceil((c.x + c.r - g.x0) / g.res) + 2);
      const j0 = Math.max(0, Math.floor((c.y - c.r - g.y0) / g.res) - 2), j1 = Math.min(g.h - 1, Math.ceil((c.y + c.r - g.y0) / g.res) + 2);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = g.x0 + (i + 0.5) * g.res, y = g.y0 + (j + 0.5) * g.res;
        const v = Math.hypot(x - c.x, y - c.y) - c.r + delta;
        const k = j * g.w + i;
        if (v < sd[k]) sd[k] = v;
      }
    }
  }
  if (opts.sweepTo !== undefined) {
    for (let i = 0; i < g.w; i++) {
      let m = Infinity;
      for (let j = 0; j < g.h; j++) { const k = j * g.w + i; if (sd[k] < m) m = sd[k]; else sd[k] = m; }
    }
  }
  const loops = contourField(sd, g, delta);
  let regions = loopsToRegions(loops, res * res * 4);
  regions = simplifyRegions(regions, opts.tol || res * 0.5);
  return { regions, res };
}

/* ------------------------------ 3D mesh --------------------------------- */
// a mesh is an array of polygons; polygon = {v: [[x,y,z],...], p: plane{n,w}}
function newellPlane(v) {
  let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
  for (let i = 0, n = v.length; i < n; i++) {
    const a = v[i], b = v[(i + 1) % n];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
    cx += a[0]; cy += a[1]; cz += a[2];
  }
  const L = Math.hypot(nx, ny, nz);
  if (L < 1e-14) return null;
  nx /= L; ny /= L; nz /= L;
  const n = v.length;
  return { n: [nx, ny, nz], w: (nx * cx + ny * cy + nz * cz) / n };
}
function poly(v) { const p = newellPlane(v); return p ? { v, p } : null; }
function flipPoly(P) { return { v: P.v.slice().reverse(), p: { n: [-P.p.n[0], -P.p.n[1], -P.p.n[2]], w: -P.p.w } }; }
function signedVolume(mesh) {
  let s = 0;
  for (const P of mesh) {
    const a = P.v[0];
    for (let i = 1; i + 1 < P.v.length; i++) {
      const b = P.v[i], c = P.v[i + 1];
      s += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
  }
  return s / 6;
}
function orientOutward(mesh) { return signedVolume(mesh) < 0 ? mesh.map(flipPoly) : mesh; }
function meshBBox(mesh) {
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const P of mesh) for (const q of P.v) for (let k = 0; k < 3; k++) { if (q[k] < b.min[k]) b.min[k] = q[k]; if (q[k] > b.max[k]) b.max[k] = q[k]; }
  return b;
}
function transformMesh(mesh, fn) {
  const out = [];
  for (const P of mesh) { const q = poly(P.v.map(fn)); if (q) out.push(q); }
  return orientOutward(out);
}
function translate(mesh, d) { return transformMesh(mesh, q => [q[0] + d[0], q[1] + d[1], q[2] + d[2]]); }

// Extrude 2D regions [{outer, holes}] between w0 and w1 along the third axis,
// mapped to world by map(u, v, w) -> [x, y, z]. Returns closed outward mesh.
function prism(regions, w0, w1, map) {
  const out = [];
  for (const R of regions) {
    let outer = dedupeRing(R.outer);
    if (outer.length < 3) continue;
    if (ringArea(outer) < 0) outer = outer.slice().reverse();
    const holes = [];
    for (const h0 of R.holes || []) {
      let h = dedupeRing(h0);
      if (h.length < 3) continue;
      if (ringArea(h) > 0) h = h.slice().reverse();
      holes.push(h);
    }
    if (!holes.length && isConvexRing(outer)) {
      const top = poly(outer.map(p => map(p[0], p[1], w1)));
      const bot = poly(outer.slice().reverse().map(p => map(p[0], p[1], w0)));
      if (top) out.push(top); if (bot) out.push(bot);
      for (let i = 0, n = outer.length; i < n; i++) {
        const a = outer[i], b = outer[(i + 1) % n];
        const q = poly([map(a[0], a[1], w0), map(b[0], b[1], w0), map(b[0], b[1], w1), map(a[0], a[1], w1)]);
        if (q) out.push(q);
      }
      continue;
    }
    const flat = [], holeIdx = [], ptsAll = [];
    for (const p of outer) { flat.push(p[0], p[1]); ptsAll.push(p); }
    for (const h of holes) { holeIdx.push(ptsAll.length); for (const p of h) { flat.push(p[0], p[1]); ptsAll.push(p); } }
    const tris = earcut(flat, holeIdx);
    for (let t = 0; t < tris.length; t += 3) {
      const a = ptsAll[tris[t]], b = ptsAll[tris[t + 1]], c = ptsAll[tris[t + 2]];
      const top = poly([map(a[0], a[1], w1), map(b[0], b[1], w1), map(c[0], c[1], w1)]);
      const bot = poly([map(c[0], c[1], w0), map(b[0], b[1], w0), map(a[0], a[1], w0)]);
      if (top) out.push(top); if (bot) out.push(bot);
    }
    for (const ring of [outer, ...holes]) {
      for (let i = 0, n = ring.length; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n];
        const q = poly([map(a[0], a[1], w0), map(b[0], b[1], w0), map(b[0], b[1], w1), map(a[0], a[1], w1)]);
        if (q) out.push(q);
      }
    }
  }
  // orientation: compute in uvw space sign via map determinant using volume
  return orientOutward(out);
}
function isConvexRing(r) {
  const n = r.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n], c = r[(i + 2) % n];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cr < -1e-9) return false; // ring is CCW here
  }
  return true;
}
const AX = {
  // extrude along Z: (u,v) -> (x,y)
  z: (u, v, w) => [u, v, w],
  // extrude along Y: (u,v) -> (x,z), w -> y
  y: (u, v, w) => [u, w, v],
  // extrude along X: (u,v) -> (y,z), w -> x
  x: (u, v, w) => [w, u, v],
};
function rectRing(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
function roundRectRing(x0, y0, x1, y1, r, corners, seg) {
  // corners: [bl, br, tr, tl] booleans
  corners = corners || [true, true, true, true];
  seg = seg || 8;
  r = Math.max(0, Math.min(r, (x1 - x0) / 2 - 1e-3, (y1 - y0) / 2 - 1e-3));
  const pts = [];
  const C = [[x0 + r, y0 + r, Math.PI, 1.5 * Math.PI], [x1 - r, y0 + r, 1.5 * Math.PI, 2 * Math.PI],
             [x1 - r, y1 - r, 0, 0.5 * Math.PI], [x0 + r, y1 - r, 0.5 * Math.PI, Math.PI]];
  const sharp = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (let k = 0; k < 4; k++) {
    if (!corners[k] || r <= 0) { pts.push(sharp[k]); continue; }
    const [cx, cy, a0, a1] = C[k];
    for (let s = 0; s <= seg; s++) { const a = a0 + (a1 - a0) * s / seg; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  return pts;
}
function circleRing(cx, cy, r, seg) {
  seg = seg || Math.max(24, Math.ceil(2 * Math.PI * r / 0.6));
  const pts = [];
  for (let s = 0; s < seg; s++) { const a = 2 * Math.PI * s / seg; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
// teardrop: circle with a 45° pointed roof towards +v (for horizontal holes printed upright)
function teardropRing(cx, cy, r, seg) {
  seg = seg || Math.max(32, Math.ceil(2 * Math.PI * r / 0.6));
  const pts = [];
  // arc from 135° to 405° (=45°), going CCW through bottom, then the apex
  const a0 = 0.75 * Math.PI, a1 = 2.25 * Math.PI;
  const n = Math.ceil(seg * 0.75);
  for (let s = 0; s <= n; s++) { const a = a0 + (a1 - a0) * s / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  pts.push([cx, cy + r * Math.SQRT2]);
  return pts;
}
function box(x0, y0, z0, x1, y1, z1) { return prism([{ outer: rectRing(x0, y0, x1, y1), holes: [] }], z0, z1, AX.z); }

/* --------------------------------- CSG ---------------------------------- */
const EPS = 1e-5;
const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;
function splitPoly(pl, P, cf, cb, f, b) {
  const n = pl.n, w = pl.w;
  let type = 0;
  const types = new Array(P.v.length);
  for (let i = 0; i < P.v.length; i++) {
    const q = P.v[i];
    const t = n[0] * q[0] + n[1] * q[1] + n[2] * q[2] - w;
    const ty = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
    type |= ty; types[i] = ty;
  }
  switch (type) {
    case COPLANAR: (n[0] * P.p.n[0] + n[1] * P.p.n[1] + n[2] * P.p.n[2] > 0 ? cf : cb).push(P); break;
    case FRONT: f.push(P); break;
    case BACK: b.push(P); break;
    default: {
      const fv = [], bv = [];
      const L = P.v.length;
      for (let i = 0; i < L; i++) {
        const j = (i + 1) % L, ti = types[i], tj = types[j], vi = P.v[i], vj = P.v[j];
        if (ti !== BACK) fv.push(vi);
        if (ti !== FRONT) bv.push(vi);
        if ((ti | tj) === SPANNING) {
          const di = n[0] * vi[0] + n[1] * vi[1] + n[2] * vi[2];
          const dj = n[0] * vj[0] + n[1] * vj[1] + n[2] * vj[2];
          const t = (w - di) / (dj - di);
          const v = [vi[0] + (vj[0] - vi[0]) * t, vi[1] + (vj[1] - vi[1]) * t, vi[2] + (vj[2] - vi[2]) * t];
          fv.push(v); bv.push(v);
        }
      }
      if (fv.length >= 3) f.push({ v: fv, p: P.p });
      if (bv.length >= 3) b.push({ v: bv, p: P.p });
    }
  }
}
class BSP {
  constructor(polys) { this.plane = null; this.front = null; this.back = null; this.polys = []; if (polys) this.build(polys); }
  build(polys) {
    const stack = [[this, polys]];
    while (stack.length) {
      const [node, ps] = stack.pop();
      if (!ps.length) continue;
      if (!node.plane) node.plane = ps[0].p;
      const f = [], b = [];
      for (const P of ps) splitPoly(node.plane, P, node.polys, node.polys, f, b);
      if (f.length) { if (!node.front) node.front = new BSP(); stack.push([node.front, f]); }
      if (b.length) { if (!node.back) node.back = new BSP(); stack.push([node.back, b]); }
    }
  }
  nodes() { const out = [], st = [this]; while (st.length) { const n = st.pop(); out.push(n); if (n.front) st.push(n.front); if (n.back) st.push(n.back); } return out; }
  invert() {
    for (const n of this.nodes()) {
      n.polys = n.polys.map(flipPoly);
      if (n.plane) n.plane = { n: [-n.plane.n[0], -n.plane.n[1], -n.plane.n[2]], w: -n.plane.w };
      const t = n.front; n.front = n.back; n.back = t;
    }
  }
  clipPolygons(polys) {
    // iterative: returns polygons not inside this solid
    const result = [];
    const stack = [[this, polys]];
    while (stack.length) {
      const [node, ps] = stack.pop();
      if (!node.plane) { for (const p of ps) result.push(p); continue; }
      const f = [], b = [];
      for (const P of ps) splitPoly(node.plane, P, f, b, f, b);
      if (node.front) stack.push([node.front, f]); else for (const p of f) result.push(p);
      if (node.back) stack.push([node.back, b]); // else discarded (inside)
    }
    return result;
  }
  clipTo(bsp) { for (const n of this.nodes()) n.polys = bsp.clipPolygons(n.polys); }
  all() { const out = []; for (const n of this.nodes()) for (const p of n.polys) out.push(p); return out; }
}
function bboxOverlap(A, B) {
  const a = meshBBox(A), b = meshBBox(B);
  for (let k = 0; k < 3; k++) if (a.max[k] < b.min[k] - 1e-6 || b.max[k] < a.min[k] - 1e-6) return false;
  return true;
}
function union(A, B) {
  if (!A.length) return B.slice(); if (!B.length) return A.slice();
  if (!bboxOverlap(A, B)) return A.concat(B);
  const a = new BSP(A), b = new BSP(B);
  a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert();
  a.build(b.all());
  return a.all();
}
function subtract(A, B) {
  if (!A.length || !B.length) return A.slice();
  if (!bboxOverlap(A, B)) return A.slice();
  const a = new BSP(A), b = new BSP(B);
  a.invert(); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert();
  a.build(b.all()); a.invert();
  return a.all();
}
function unionAll(list) {
  // pairwise tree reduction keeps operands balanced
  let cur = list.filter(m => m && m.length);
  if (!cur.length) return [];
  while (cur.length > 1) {
    const nx = [];
    for (let i = 0; i < cur.length; i += 2) nx.push(i + 1 < cur.length ? union(cur[i], cur[i + 1]) : cur[i]);
    cur = nx;
  }
  return cur[0];
}

/* -------------------- final mesh: weld, T-junctions ---------------------- */
function finalizeMesh(polys, opts) {
  opts = opts || {};
  const WT = opts.weld || 1e-3;   // cluster-weld tolerance (mm)
  // cluster weld: reuse an existing vertex within WT
  const wcell = WT * 4;
  const wmap = new Map(), verts = [];
  const wk = (x, y, z) => x + ',' + y + ',' + z;
  const idx = q => {
    const cx = Math.floor(q[0] / wcell), cy = Math.floor(q[1] / wcell), cz = Math.floor(q[2] / wcell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const arr = wmap.get(wk(cx + dx, cy + dy, cz + dz));
      if (!arr) continue;
      for (const i of arr) { const p = verts[i]; if (Math.abs(p[0] - q[0]) <= WT && Math.abs(p[1] - q[1]) <= WT && Math.abs(p[2] - q[2]) <= WT) return i; }
    }
    const i = verts.length; verts.push(q);
    const k = wk(cx, cy, cz); let a = wmap.get(k); if (!a) wmap.set(k, a = []); a.push(i);
    return i;
  };
  const faceArea = f => {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < f.length; i++) {
      const a = verts[f[i]], b = verts[f[(i + 1) % f.length]];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return Math.hypot(nx, ny, nz) / 2;
  };
  let faces = [];
  for (const P of polys) {
    let f = [];
    for (const q of P.v) { const i = idx(q); if (f[f.length - 1] !== i) f.push(i); }
    while (f.length > 1 && f[0] === f[f.length - 1]) f.pop();
    if (f.length < 3) continue;
    // split pinched loops (a vertex repeated non-adjacently)
    const stack = [f];
    while (stack.length) {
      const g = stack.pop();
      let split = false;
      const seen = new Map();
      for (let i = 0; i < g.length && !split; i++) {
        if (seen.has(g[i])) {
          const j = seen.get(g[i]);
          const a = g.slice(j, i), b = g.slice(i).concat(g.slice(0, j));
          if (a.length >= 3) stack.push(a);
          if (b.length >= 3) stack.push(b);
          split = true;
        } else seen.set(g[i], i);
      }
      if (!split && g.length >= 3 && faceArea(g) > 1e-10) faces.push(g);
    }
  }
  // spatial hash of vertices for T-junction search
  const cell = opts.cell || 2.0;
  const grid = new Map();
  const ck = (x, y, z) => x + ',' + y + ',' + z;
  verts.forEach((q, i) => {
    const k = ck(Math.floor(q[0] / cell), Math.floor(q[1] / cell), Math.floor(q[2] / cell));
    let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i);
  });
  const TOL = opts.tjTol || WT;
  const edgeCache = new Map();
  function interior(a, b) {
    const ek = a < b ? a + '_' + b : b + '_' + a;
    if (edgeCache.has(ek)) { const r = edgeCache.get(ek); return a < b ? r : r.slice().reverse(); }
    const A = verts[a], B = verts[b];
    const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const found = [];
    if (L2 > 1e-12) {
      const mn = [Math.min(A[0], B[0]) - TOL, Math.min(A[1], B[1]) - TOL, Math.min(A[2], B[2]) - TOL];
      const mx = [Math.max(A[0], B[0]) + TOL, Math.max(A[1], B[1]) + TOL, Math.max(A[2], B[2]) + TOL];
      const c0 = mn.map(v => Math.floor(v / cell)), c1 = mx.map(v => Math.floor(v / cell));
      const ncells = (c1[0] - c0[0] + 1) * (c1[1] - c0[1] + 1) * (c1[2] - c0[2] + 1);
      const test = i => {
        if (i === a || i === b) return;
        const P = verts[i];
        if (P[0] < mn[0] || P[0] > mx[0] || P[1] < mn[1] || P[1] > mx[1] || P[2] < mn[2] || P[2] > mx[2]) return;
        const t = ((P[0] - A[0]) * d[0] + (P[1] - A[1]) * d[1] + (P[2] - A[2]) * d[2]) / L2;
        if (t <= 1e-9 || t >= 1 - 1e-9) return;
        const ex = A[0] + d[0] * t - P[0], ey = A[1] + d[1] * t - P[1], ez = A[2] + d[2] * t - P[2];
        if (ex * ex + ey * ey + ez * ez < TOL * TOL) found.push([t, i]);
      };
      if (ncells > 64) {
        // long edge: walk cells along the segment
        const L = Math.sqrt(L2), steps = Math.ceil(L / (cell * 0.5));
        const seen = new Set();
        for (let s = 0; s <= steps; s++) {
          const x = A[0] + d[0] * s / steps, y = A[1] + d[1] * s / steps, z = A[2] + d[2] * s / steps;
          const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            const k = ck(cx + dx, cy + dy, cz + dz);
            if (seen.has(k)) continue; seen.add(k);
            const arr = grid.get(k); if (arr) for (const i of arr) test(i);
          }
        }
      } else {
        for (let x = c0[0]; x <= c1[0]; x++) for (let y = c0[1]; y <= c1[1]; y++) for (let z = c0[2]; z <= c1[2]; z++) {
          const arr = grid.get(ck(x, y, z)); if (arr) for (const i of arr) test(i);
        }
      }
    }
    found.sort((p, q) => p[0] - q[0]);
    const uniq = [];
    for (const f of found) if (!uniq.length || uniq[uniq.length - 1] !== f[1]) uniq.push(f[1]);
    edgeCache.set(ek, a < b ? uniq : uniq.slice().reverse());
    return uniq;
  }
  const tris = [];
  const area2 = (i, j, k) => {
    const A = verts[i], B = verts[j], C = verts[k];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
  };
  for (const f of faces) {
    const ring = [];
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      ring.push(a);
      for (const m of interior(a, b)) ring.push(m);
    }
    // dedupe
    const r = [];
    for (const i of ring) if (r[r.length - 1] !== i) r.push(i);
    while (r.length > 1 && r[0] === r[r.length - 1]) r.pop();
    if (r.length < 3) continue;
    const n = r.length;
    let done = false;
    // try a non-degenerate fan from each corner
    for (let s = 0; s < n && !done; s++) {
      let ok = true;
      for (let k = 1; k + 1 < n; k++) if (area2(r[s], r[(s + k) % n], r[(s + k + 1) % n]) < 1e-9) { ok = false; break; }
      if (ok) { for (let k = 1; k + 1 < n; k++) tris.push([r[s], r[(s + k) % n], r[(s + k + 1) % n]]); done = true; }
    }
    if (!done) {
      // centroid fan
      let cx = 0, cy = 0, cz = 0;
      for (const i of r) { cx += verts[i][0]; cy += verts[i][1]; cz += verts[i][2]; }
      const c = verts.length; verts.push([cx / n, cy / n, cz / n]);
      for (let k = 0; k < n; k++) { const a = r[k], b = r[(k + 1) % n]; if (area2(c, a, b) > 1e-12) tris.push([c, a, b]); }
    }
  }
  return { verts, tris };
}
function checkManifold(m) {
  const edges = new Map();
  for (const t of m.tris) for (let k = 0; k < 3; k++) {
    const a = t[k], b = t[(k + 1) % 3];
    const key = a + '_' + b;
    edges.set(key, (edges.get(key) || 0) + 1);
  }
  let open = 0, dup = 0;
  for (const [key, c] of edges) {
    const [a, b] = key.split('_');
    const rev = edges.get(b + '_' + a) || 0;
    if (rev !== c) open++;
    if (c > 1) dup++;
  }
  return { edges: edges.size, open, dup, tris: m.tris.length };
}
function meshVolume(m) {
  let s = 0;
  for (const t of m.tris) {
    const a = m.verts[t[0]], b = m.verts[t[1]], c = m.verts[t[2]];
    s += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return s / 6;
}
function stlBinary(m, name) {
  const n = m.tris.length;
  const buf = new ArrayBuffer(84 + 50 * n);
  const dv = new DataView(buf);
  const header = ('Multiboard holder ' + (name || '')).slice(0, 79);
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (const t of m.tris) {
    const a = m.verts[t[0]], b = m.verts[t[1]], c = m.verts[t[2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true); o += 12;
    for (const q of [a, b, c]) { dv.setFloat32(o, q[0], true); dv.setFloat32(o + 4, q[1], true); dv.setFloat32(o + 8, q[2], true); o += 12; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return buf;
}
function transformFinal(m, fn) { return { verts: m.verts.map(fn), tris: m.tris }; }
function finalBBox(m) {
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const q of m.verts) for (let k = 0; k < 3; k++) { if (q[k] < b.min[k]) b.min[k] = q[k]; if (q[k] > b.max[k]) b.max[k] = q[k]; }
  return b;
}

return {
  earcut, ringArea, ringBBox, pointInRing, dedupeRing, simplifyRing, smoothRing, resampleRing,
  makeGrid, rasterizeRings, edt2d, signedDistance, contourField, loopsToRegions, simplifyRegions, offsetRings,
  poly, flipPoly, signedVolume, orientOutward, meshBBox, transformMesh, translate, prism, AX,
  rectRing, roundRectRing, circleRing, teardropRing, box,
  BSP, union, subtract, unionAll, finalizeMesh, checkManifold, meshVolume, stlBinary, transformFinal, finalBBox,
};
})();
if (typeof module !== 'undefined') module.exports = K;
