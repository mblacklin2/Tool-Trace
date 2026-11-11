(() => {
'use strict';
const $ = id => document.getElementById(id);
const DPR = () => Math.min(2.5, window.devicePixelRatio || 1);
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);

/* ------------------------------------------------------------------ state */
const S = {
  step: 1, maxStep: 1, example: false,
  src: null, srcCanvas: null,
  scaleMode: 'mat', paper: 'letter', matPts: null, linePts: null,
  prep: null, workCanvas: null, threshold: null, seed: null, segInfo: null,
  outline: null, hist: [], sel: -1, tapMode: false,
  tr: { method: 'standard', refine: true, shadows: true, points: [], tapLabel: 1, imageId: 0 }, work: null,
  rot: 0,
  d: {
    mode: 'horizontal', mount: 'multipoint', thickness: 12, clearance: 0.8, wall: 3, floor: 2.4,
    pdepth: null, cpct: 50, fit: 0, bolth: 23.0, grid: true, notchOn: true, notchD: 22, notchAt: null,
    barPos: 40, barH: 10, label: '', labelSize: 7,
    flatStyle: 'hooks', standoff: 0, hookCount: 'auto', lipH: 6, seatT: 6, recess: 2, engrave: true,
  },
  result: null, view: 'board',
};
const MOUNT_UI = [
  { id: 'multipoint', name: 'Multipoint slot', tag: ['beta', 'beta profile'], desc: 'Slides down onto Multipoint pegs screwed into the board. Uses the community Multipoint profile, so print the fit-test coupon first.' },
  { id: 'multiconnect', name: 'Multiconnect slot', tag: ['exact', 'published profile'], desc: 'Slides down onto Multiconnect connectors in the board’s large holes. Uses the published Multiconnect receiver profile.' },
  { id: 'rail', name: 'Multipoint Rail', tag: ['beta', 'beta profile'], desc: 'A horizontal channel that slides sideways onto a Multipoint Rail. Same beta profile as the Multipoint slot.' },
  { id: 'bolt', name: 'Big-thread bolts', tag: null, desc: 'Two 23 mm holes on the 25 mm grid for official Multiboard 9 mm Big Thread flat-head bolts. The plate is 3 mm thick there.' },
  { id: 'pegboard', name: 'Pegboard hooks', tag: null, desc: 'Hooks drop into the board’s small pegboard holes. Needs a gap of 6.25 mm or more behind the tiles. Horizontal cradle only.' },
];

/* -------------------------------------------------------------- utilities */
function status(id, text, cls) { const e = $(id); e.textContent = text || ''; e.className = 'status' + (cls ? ' ' + cls : ''); }
function busy(on, text) { $('busy').classList.toggle('on', !!on); if (text) $('busyText').textContent = text; }
function later(fn) { return new Promise((res, rej) => setTimeout(() => { try { res(fn()); } catch (e) { rej(e); } }, 30)); }
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function cssRGB(name, fallback) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = fallback || '#888'; c.fillStyle = cssVar(name) || fallback;
  const h = c.fillStyle;
  if (h[0] === '#') return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const m = h.match(/[\d.]+/g); return m ? [m[0] / 255, m[1] / 255, m[2] / 255] : [0.5, 0.5, 0.5];
}
function imageDataToCanvas(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}
function slug(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }

/* ------------------------------------------------------------- navigation */
function goStep(n) {
  S.step = n; S.maxStep = Math.max(S.maxStep, n);
  for (let i = 1; i <= 4; i++) {
    $('p' + i).classList.toggle('on', i === n);
    const b = $('st' + i);
    b.classList.toggle('on', i === n);
    b.classList.toggle('done', i < S.maxStep && i !== n);
    b.disabled = !canGo(i);
    b.setAttribute('aria-current', i === n ? 'step' : 'false');
  }
  const is3 = n === 4;
  $('imgCanvas').style.display = is3 ? 'none' : 'block';
  $('viewTabs').style.display = is3 ? 'block' : 'none';
  if (is3) setView(S.view); else { $('glCanvas').style.display = 'none'; $('layoutCanvas').style.display = 'none'; }
  if (n === 2) { ivSetImage(S.srcCanvas); }
  if (n === 3) { ivSetImage(S.workCanvas); renderOutlineSpec(); syncTraceUI(); }
  if (n === 1 && S.srcCanvas) ivSetImage(S.srcCanvas);
  if (n === 4) { syncDesignUI(); requestBuild(true); }
  updateStageChrome();
  drawIV();
}
function canGo(i) {
  if (i === 1) return true;
  if (i === 2) return !!S.src;
  if (i === 3) return !!S.outline;
  if (i === 4) return !!S.outline;
  return false;
}
for (let i = 1; i <= 4; i++) $('st' + i).addEventListener('click', () => { if (canGo(i)) goStep(i); });

function updateStageChrome() {
  const hud = $('hud'), tools = $('stageTools'), help = $('stageHelp');
  hud.innerHTML = ''; tools.innerHTML = ''; help.innerHTML = '';
  const chip = (t, cls) => { const s = document.createElement('span'); s.className = 'chip' + (cls ? ' ' + cls : ''); s.textContent = t; hud.appendChild(s); return s; };
  const tool = (t, fn, title) => { const b = document.createElement('button'); b.textContent = t; b.title = title || t; b.addEventListener('click', fn); tools.appendChild(b); };
  const helpText = t => { const s = document.createElement('span'); s.textContent = t; help.appendChild(s); };
  if (S.example) chip('Example photo', 'accent');
  if (S.step <= 3 && (S.src)) {
    tool('Fit', () => { ivFit(); drawIV(); }, 'Fit the image to the window');
    tool('+', () => ivZoom(1.25), 'Zoom in'); tool('−', () => ivZoom(0.8), 'Zoom out');
  }
  if (S.step === 1 && !S.src) helpText('Choose or drop a photo to begin.');
  if (S.step === 2) helpText(S.scaleMode === 'mat' ? 'Drag the crosshairs onto the centres of the four black squares.' : 'Drag the line ends across your reference object.');
  if (S.step === 3 && S.outline) {
    const bb = K.ringBBox(S.outline);
    chip(fmt(bb.x1 - bb.x0) + ' × ' + fmt(bb.y1 - bb.y0) + ' mm');
    if (S.aiInfo) chip('AI confidence ' + Math.round(S.aiInfo.score * 100) + '%');
    helpText(S.tapMode ? (S.tr.method === 'ai' ? (S.tr.tapLabel ? 'Tap parts of the tool the AI missed.' : 'Tap areas that are not the tool.') : 'Tap the tool to select it.') : 'Drag points · double-click an edge to add · select + Delete to remove · drag empty space to pan');
  }
  if (S.step === 4) {
    if (S.result && S.result.dims) {
      const d = S.result.dims;
      chip(fmt(d.width, 0) + ' × ' + fmt(d.height, 0) + ' mm on the board');
      chip(d.gridW + ' × ' + d.gridH + ' cells');
      const c = S.result.check;
      if (c) chip(c.watertight ? 'Watertight mesh' : 'Mesh has ' + (c.openEdges + c.nonManifold) + ' bad edges', c.watertight ? 'good' : 'warn');
    }
    if (S.view !== 'layout') tool('Reset view', () => { glFit(); glDraw(); });
    helpText(S.view === 'layout' ? (S.d.mode === 'horizontal' ? 'Top view. Click the pocket edge to move the finger notch.' : 'Front view of the holder on the board.') : 'Drag to orbit · scroll or pinch to zoom · right-drag or Shift-drag to pan');
  }
}

/* ------------------------------------------------------------ image input */
async function loadFile(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) { status('matStatus', 'That file is not an image.', 'err'); return; }
  busy(true, 'Reading photo…');
  try {
    let drawable;
    try { drawable = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      drawable = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('decode')); im.src = URL.createObjectURL(file); });
    }
    setSource(drawable, false);
  } catch (e) {
    busy(false);
    status('matStatus', 'This browser could not read that image. Try a JPEG or PNG.', 'err');
  }
}
function setSource(drawable, isExample) {
  const w0 = drawable.width, h0 = drawable.height;
  const s = Math.min(1, 4096 / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(drawable, 0, 0, c.width, c.height);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  S.src = { data: id.data, width: id.width, height: id.height };
  S.srcCanvas = c; S.example = isExample;
  S.prep = null; S.outline = null; S.hist = []; S.sel = -1; S.seed = null; S.result = null; S.maxStep = 2;
  S.d.notchAt = null;
  S.matPts = null; S.linePts = null;
  busy(false);
  goStep(2);
  autoDetect();
}
$('fileIn').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadFile(f); });
$('btnSample').addEventListener('click', () => loadExample(false));
const stage = $('stage');
stage.addEventListener('dragover', e => { e.preventDefault(); $('drop').classList.add('on'); });
stage.addEventListener('dragleave', e => { if (e.target === stage || e.target.id === 'drop') $('drop').classList.remove('on'); });
stage.addEventListener('drop', e => { e.preventDefault(); $('drop').classList.remove('on'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });

/* -------------------------------------------------------- example photo */
function makeExamplePhoto() {
  const spec = VZ.MATS.letter, ppm = 5;
  const mw = Math.round(spec.w * ppm), mh = Math.round(spec.h * ppm);
  const mat = document.createElement('canvas'); mat.width = mw; mat.height = mh;
  const m = mat.getContext('2d');
  m.fillStyle = '#f3f3ef'; m.fillRect(0, 0, mw, mh);
  m.fillStyle = '#111';
  const M = VZ.MARK;
  for (const [cx, cy] of [[M.inset, M.inset], [spec.w - M.inset, M.inset], [spec.w - M.inset, spec.h - M.inset], [M.inset, spec.h - M.inset]])
    m.fillRect((cx - M.size / 2) * ppm, (cy - M.size / 2) * ppm, M.size * ppm, M.size * ppm);
  // combination wrench, drawn in mm
  const tool = document.createElement('canvas'); tool.width = mw; tool.height = mh;
  const t = tool.getContext('2d');
  t.scale(ppm, ppm);
  const cy = 132;
  const grad = t.createLinearGradient(0, cy - 15, 0, cy + 15);
  grad.addColorStop(0, '#2c343d'); grad.addColorStop(0.45, '#5f6b77'); grad.addColorStop(0.55, '#4b5560'); grad.addColorStop(1, '#262d35');
  t.fillStyle = grad;
  t.beginPath();
  t.moveTo(58, cy - 6.5); t.lineTo(176, cy - 5.5); t.lineTo(176, cy + 5.5); t.lineTo(58, cy + 6.5); t.closePath(); t.fill();
  t.beginPath(); t.arc(52, cy, 15.5, 0, Math.PI * 2); t.fill();
  t.beginPath(); t.arc(186, cy, 12.5, 0, Math.PI * 2); t.fill();
  t.globalCompositeOperation = 'destination-out';
  t.beginPath(); t.moveTo(28, cy - 6.6); t.lineTo(49, cy - 6.6); t.arc(49, cy, 6.6, -Math.PI / 2, Math.PI / 2); t.lineTo(28, cy + 6.6); t.closePath(); t.fill();
  t.beginPath(); t.arc(186, cy, 7.2, 0, Math.PI * 2); t.fill();
  t.globalCompositeOperation = 'source-over';
  m.save(); m.filter = 'blur(6px)'; m.globalAlpha = 0.25; m.drawImage(tool, 6, 8); m.restore();
  m.drawImage(tool, 0, 0);
  const matImg = m.getImageData(0, 0, mw, mh);
  const W = 1500, H = 1900;
  const corners = [[150, 120], [1365, 160], [1420, 1800], [95, 1765]];
  const Hds = VZ.homography(corners, [[0, 0], [mw, 0], [mw, mh], [0, mh]]);
  const out = VZ.warp({ data: matImg.data, width: mw, height: mh }, Hds, W, H);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [u, v] = VZ.applyH(Hds, x + 0.5, y + 0.5);
    const o = (y * W + x) * 4;
    const n = (rnd() - 0.5) * 10;
    if (u < 0 || v < 0 || u > mw || v > mh) {
      const g = 0.92 + 0.08 * Math.sin(x * 0.02 + y * 0.004);
      out.data[o] = 128 * g + n; out.data[o + 1] = 104 * g + n; out.data[o + 2] = 80 * g + n;
    } else {
      const shade = 0.93 + 0.07 * (x / W);
      out.data[o] = out.data[o] * shade + n; out.data[o + 1] = out.data[o + 1] * shade + n; out.data[o + 2] = out.data[o + 2] * shade + n;
    }
  }
  return imageDataToCanvas(out);
}
async function loadExample(auto) {
  busy(true, 'Building the example…');
  await later(() => {});
  const c = makeExamplePhoto();
  S.d.thickness = 5; S.d.pdepth = null; S.d.label = '13 mm'; S.d.mode = 'horizontal'; S.d.notchOn = true;
  setSource(c, true);
  if (S.matPts) {
    await applyScale();
    busy(false);
    if (S.outline) { S.maxStep = 4; goStep(4); }
  }
  busy(false);
}

/* ------------------------------------------------------------ image view */
const IV = { canvas: $('imgCanvas'), img: null, k: 1, ox: 0, oy: 0, drag: null, ptrs: new Map(), pinch: null, lastTap: null };
function stageSize() { const r = stage.getBoundingClientRect(); return { w: Math.max(50, r.width), h: Math.max(50, r.height) }; }
function ivSetImage(canvas) { IV.img = canvas; ivFit(); drawIV(); }
function ivFit() {
  if (!IV.img) return;
  const { w, h } = stageSize();
  IV.k = Math.min(w / IV.img.width, h / IV.img.height) * 0.92;
  IV.ox = (w - IV.img.width * IV.k) / 2; IV.oy = (h - IV.img.height * IV.k) / 2;
}
function ivZoom(f, cx, cy) {
  const { w, h } = stageSize();
  if (cx === undefined) { cx = w / 2; cy = h / 2; }
  const nk = Math.max(0.02, Math.min(40, IV.k * f));
  IV.ox = cx - (cx - IV.ox) * nk / IV.k; IV.oy = cy - (cy - IV.oy) * nk / IV.k; IV.k = nk;
  drawIV();
}
const toS = (x, y) => [IV.ox + x * IV.k, IV.oy + y * IV.k];
const toI = (sx, sy) => [(sx - IV.ox) / IV.k, (sy - IV.oy) / IV.k];
// outline mm <-> work image px
const o2i = p => [p[0] / S.prep.mmPerPx, S.prep.h - p[1] / S.prep.mmPerPx];
const i2o = (x, y) => [x * S.prep.mmPerPx, (S.prep.h - y) * S.prep.mmPerPx];

function drawIV() {
  if (S.step === 4) return;
  const cv = IV.canvas, { w, h } = stageSize(), dpr = DPR();
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  if (!IV.img) {
    c.fillStyle = cssVar('--muted'); c.font = '600 15px ' + cssVar('--body'); c.textAlign = 'center';
    c.fillText('No photo yet', w / 2, h / 2);
    return;
  }
  c.imageSmoothingQuality = 'high';
  c.drawImage(IV.img, IV.ox, IV.oy, IV.img.width * IV.k, IV.img.height * IV.k);
  const accent = cssVar('--accent') || '#d9480f';
  if (S.step === 2 && S.scaleMode === 'mat' && S.matPts) {
    const p = S.matPts.map(q => toS(q[0], q[1]));
    c.strokeStyle = accent; c.lineWidth = 1.5; c.setLineDash([6, 5]);
    c.beginPath(); p.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.stroke(); c.setLineDash([]);
    p.forEach((q, i) => crosshair(c, q[0], q[1], accent, ['TL', 'TR', 'BR', 'BL'][i]));
  }
  if (S.step === 2 && S.scaleMode === 'line' && S.linePts) {
    const a = toS(...S.linePts[0]), b = toS(...S.linePts[1]);
    c.strokeStyle = accent; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    crosshair(c, a[0], a[1], accent); crosshair(c, b[0], b[1], accent);
    const len = +$('refLen').value || 0;
    label(c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 14, len ? fmt(len, 2) + ' mm' : 'enter length');
  }
  if (S.step === 3 && S.outline) {
    const pts = S.outline.map(p => toS(...o2i(p)));
    c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath();
    c.fillStyle = 'rgba(217,72,15,0.16)'; c.fill();
    c.strokeStyle = accent; c.lineWidth = 2; c.stroke();
    const sz = 4.5;
    c.lineWidth = 1.5;
    pts.forEach((q, i) => {
      const sel = i === S.sel;
      c.fillStyle = sel ? accent : '#fff'; c.strokeStyle = sel ? '#fff' : accent;
      const r = sel ? 6.5 : sz;
      c.fillRect(q[0] - r, q[1] - r, 2 * r, 2 * r); c.strokeRect(q[0] - r, q[1] - r, 2 * r, 2 * r);
    });
    if (S.seed && S.tr.method !== 'ai') { const q = toS(S.seed[0], S.seed[1]); c.fillStyle = cssVar('--cyan') || '#0b7285'; c.beginPath(); c.arc(q[0], q[1], 6, 0, 7); c.fill(); }
    if (S.tr.method === 'ai') for (const [x, y, l] of S.tr.points) {
      const q = toS(x, y);
      c.fillStyle = l ? (cssVar('--good') || '#2b8a3e') : (cssVar('--bad') || '#c92a2a');
      c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.arc(q[0], q[1], 7, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.font = '700 12px ' + (cssVar('--mono') || 'monospace'); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(l ? '+' : '−', q[0], q[1] + 0.5);
    }
  }
}
function crosshair(c, x, y, col, tag) {
  c.save();
  c.strokeStyle = '#fff'; c.lineWidth = 5;
  c.beginPath(); c.arc(x, y, 13, 0, 7); c.moveTo(x - 20, y); c.lineTo(x + 20, y); c.moveTo(x, y - 20); c.lineTo(x, y + 20); c.stroke();
  c.strokeStyle = col; c.lineWidth = 2;
  c.beginPath(); c.arc(x, y, 13, 0, 7); c.moveTo(x - 20, y); c.lineTo(x + 20, y); c.moveTo(x, y - 20); c.lineTo(x, y + 20); c.stroke();
  c.restore();
}
function label(c, x, y, text) {
  c.save(); c.font = '600 13px ' + (cssVar('--mono') || 'monospace');
  const w = c.measureText(text).width + 14;
  c.fillStyle = 'rgba(20,24,28,.85)'; c.fillRect(x - w / 2, y - 11, w, 22);
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y + 0.5);
  c.restore();
}
function hitHandle(pts, sx, sy, r) {
  let best = -1, bd = r;
  pts.forEach((p, i) => { const q = toS(p[0], p[1]); const d = Math.hypot(q[0] - sx, q[1] - sy); if (d < bd) { bd = d; best = i; } });
  return best;
}
function evPos(e) { const r = IV.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
IV.canvas.addEventListener('pointerdown', e => {
  if (!IV.img) return;
  IV.canvas.setPointerCapture(e.pointerId);
  const [sx, sy] = evPos(e);
  IV.ptrs.set(e.pointerId, [sx, sy]);
  if (IV.ptrs.size === 2) {
    const [a, b] = [...IV.ptrs.values()];
    IV.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: IV.k, ox: IV.ox, oy: IV.oy, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 };
    IV.drag = null; return;
  }
  if (S.step === 2) {
    const pts = S.scaleMode === 'mat' ? S.matPts : S.linePts;
    const i = pts ? hitHandle(pts, sx, sy, 28) : -1;
    if (i >= 0) { IV.drag = { type: 'handle', i, off: [pts[i][0] - toI(sx, sy)[0], pts[i][1] - toI(sx, sy)[1]] }; return; }
  }
  if (S.step === 3 && S.outline) {
    const now = performance.now();
    const isDouble = e.pointerType !== 'mouse' && IV.lastTap && now - IV.lastTap.t < 320 && Math.hypot(IV.lastTap.x - sx, IV.lastTap.y - sy) < 24;
    IV.lastTap = { t: now, x: sx, y: sy };
    if (isDouble) { insertPointAt(sx, sy); IV.drag = null; return; }
    if (S.tapMode) {
      const p = toI(sx, sy);
      if (S.tr.method === 'ai') S.tr.points.push([p[0], p[1], S.tr.tapLabel]);
      else S.seed = p;
      retrace(); return;
    }
    const pts = S.outline.map(p => o2i(p));
    const i = hitHandle(pts, sx, sy, e.pointerType === 'mouse' ? 10 : 18);
    if (i >= 0) { S.sel = i; pushHist(); IV.drag = { type: 'pt', i, moved: false }; drawIV(); return; }
    S.sel = -1;
  }
  IV.drag = { type: 'pan', sx, sy, ox: IV.ox, oy: IV.oy };
  drawIV();
});
IV.canvas.addEventListener('pointermove', e => {
  if (!IV.ptrs.has(e.pointerId)) return;
  const [sx, sy] = evPos(e);
  IV.ptrs.set(e.pointerId, [sx, sy]);
  if (IV.pinch && IV.ptrs.size === 2) {
    const [a, b] = [...IV.ptrs.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const f = d / IV.pinch.d;
    const nk = Math.max(0.02, Math.min(40, IV.pinch.k * f));
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    IV.k = nk;
    IV.ox = cx - (IV.pinch.cx - IV.pinch.ox) * nk / IV.pinch.k;
    IV.oy = cy - (IV.pinch.cy - IV.pinch.oy) * nk / IV.pinch.k;
    drawIV(); return;
  }
  const dr = IV.drag; if (!dr) return;
  if (dr.type === 'pan') { IV.ox = dr.ox + sx - dr.sx; IV.oy = dr.oy + sy - dr.sy; drawIV(); }
  else if (dr.type === 'handle') {
    const p = toI(sx, sy);
    const pts = S.scaleMode === 'mat' ? S.matPts : S.linePts;
    pts[dr.i] = [p[0] + dr.off[0], p[1] + dr.off[1]];
    drawIV();
  } else if (dr.type === 'pt') {
    const p = toI(sx, sy);
    S.outline[dr.i] = i2o(p[0], p[1]); dr.moved = true;
    drawIV();
  }
});
function endPtr(e) {
  IV.ptrs.delete(e.pointerId);
  if (IV.ptrs.size < 2) IV.pinch = null;
  if (IV.drag && IV.drag.type === 'pt') { if (!IV.drag.moved) S.hist.pop(); else outlineChanged(); }
  IV.drag = null;
}
IV.canvas.addEventListener('pointerup', endPtr);
IV.canvas.addEventListener('pointercancel', endPtr);
IV.canvas.addEventListener('wheel', e => { e.preventDefault(); const [sx, sy] = evPos(e); ivZoom(Math.pow(1.0015, -e.deltaY), sx, sy); }, { passive: false });
IV.canvas.addEventListener('dblclick', e => { if (S.step !== 3 || !S.outline || S.tapMode) return; const [sx, sy] = evPos(e); insertPointAt(sx, sy); });
function insertPointAt(sx, sy) {
  const pts = S.outline.map(p => toS(...o2i(p)));
  let best = -1, bd = 16, bq = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    let t = ((sx - a[0]) * dx + (sy - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t));
    const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(q[0] - sx, q[1] - sy);
    if (d < bd) { bd = d; best = i; bq = q; }
  }
  if (best < 0) return;
  pushHist();
  const p = toI(bq[0], bq[1]);
  S.outline.splice(best + 1, 0, i2o(p[0], p[1]));
  S.sel = best + 1;
  outlineChanged();
}
window.addEventListener('keydown', e => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
  if (S.step === 3 && (e.key === 'Delete' || e.key === 'Backspace') && S.sel >= 0) { e.preventDefault(); deletePoint(); }
  if (S.step === 3 && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
});

/* ------------------------------------------------------------- step 2 */
function autoDetect() {
  if (!S.src) return;
  if (S.scaleMode === 'line') { defaultLine(); drawIV(); return; }
  const pts = VZ.detectMarkers(S.src);
  if (pts) { S.matPts = pts; status('detectStatus', 'Found all four markers.', 'ok'); }
  else {
    const w = S.src.width, h = S.src.height, ix = w * 0.12, iy = h * 0.12;
    S.matPts = [[ix, iy], [w - ix, iy], [w - ix, h - iy], [ix, h - iy]];
    status('detectStatus', 'Couldn’t find all four markers. Drag the crosshairs onto the squares, or switch to Reference line.', 'err');
  }
  drawIV();
}
function defaultLine() {
  if (S.linePts) return;
  const w = S.src.width, h = S.src.height;
  S.linePts = [[w * 0.3, h * 0.85], [w * 0.7, h * 0.85]];
}
$('scaleSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  S.scaleMode = b.dataset.mode;
  [...$('scaleSeg').children].forEach(x => x.classList.toggle('on', x === b));
  $('scaleMat').style.display = S.scaleMode === 'mat' ? '' : 'none';
  $('scaleLine').style.display = S.scaleMode === 'line' ? '' : 'none';
  if (S.scaleMode === 'line') defaultLine(); else if (!S.matPts) autoDetect();
  updateStageChrome(); drawIV();
});
$('paper').addEventListener('change', e => {
  S.paper = e.target.value;
  const c = VZ.matCenters(VZ.MATS[S.paper]);
  $('measDx').placeholder = c.dx.toFixed(1); $('measDy').placeholder = c.dy.toFixed(1);
});
$('btnDetect').addEventListener('click', () => { S.matPts = null; autoDetect(); });
$('refPreset').addEventListener('change', e => { if (e.target.value !== 'custom') $('refLen').value = e.target.value; else $('refLen').focus(); drawIV(); });
$('refLen').addEventListener('input', () => { $('refPreset').value = 'custom'; drawIV(); });
$('btnApplyScale').addEventListener('click', () => applyScale());

async function applyScale() {
  status('scaleStatus', '');
  busy(true, 'Tracing the tool…');
  try {
    await later(() => {
      let work, mmpp;
      if (S.scaleMode === 'mat') {
        const spec = VZ.MATS[S.paper];
        const dx = parseFloat($('measDx').value), dy = parseFloat($('measDy').value);
        const r = VZ.rectifyMat(S.src, S.matPts, spec, { dx: dx > 0 ? dx : undefined, dy: dy > 0 ? dy : undefined });
        if (!r) throw new Error('The four crosshairs don’t form a usable rectangle. Check that each one sits on a marker.');
        work = r.img; mmpp = r.mmPerPx;
      } else {
        const [a, b] = S.linePts;
        const dpx = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const len = parseFloat($('refLen').value);
        if (!(len > 0)) throw new Error('Enter the real length of the reference line in millimetres.');
        if (dpx < 20) throw new Error('The reference line is too short. Drag its ends across the reference object.');
        work = S.src; mmpp = len / dpx;
      }
      S.work = { img: work, mmpp };
      prepareWork();
      S.hist = []; S.sel = -1; S.tr.points = [];
    });
    const ok = await runTrace();
    busy(false);
    if (ok) { S.maxStep = Math.max(S.maxStep, 3); goStep(3); }
    else status('scaleStatus', 'Nothing stood out from the background. Check the scale markers or use a plainer background.', 'err');
  } catch (e) {
    busy(false);
    status('scaleStatus', e.message, 'err');
  }
}
function prepareWork() {
  S.prep = VZ.prepare(S.work.img, S.work.mmpp, undefined, { shadows: S.tr.shadows });
  S.workCanvas = imageDataToCanvas(S.prep.img);
  S.threshold = S.prep.auto; S.seed = null;
  $('thr').value = Math.round(Math.min(300, Math.max(10, S.threshold)));
  S.tr.imageId = (S.tr.imageId || 0) + 1;
}

/* ------------------------------------------------------------- step 3 */
// auto-trace: standard segmentation (or AI), then sub-pixel edge refinement
async function runTrace() {
  const seg = VZ.segment(S.prep, { threshold: S.threshold, seed: S.seed });
  S.segInfo = seg;
  let mask = seg ? seg.mask : null;
  S.aiInfo = null;
  if (S.tr.method === 'ai') {
    try {
      const r = await aiSegment(seg);
      if (r) { mask = VZ.cleanMask(r.mask, S.prep.w, S.prep.h); S.aiInfo = { score: r.score }; }
    } catch (e) {
      status('outlineStatus', 'The AI trace didn’t run (' + e.message + '). Showing the standard trace instead.', 'err');
    }
  }
  if (!mask) return false;
  let ring = VZ.maskToOutline({ mask, w: S.prep.w, h: S.prep.h }, S.prep.mmPerPx);
  if (!ring || ring.length < 3) return false;
  if (S.tr.refine) {
    busy(true, 'Snapping edges…');
    await later(() => {});
    try { ring = VZ.refineOutline(ring, S.prep); } catch (e) { /* keep the unrefined outline */ }
  }
  S.outline = ring;
  outlineChanged(true);
  return true;
}
function retrace() {
  pushHist(); busy(true, 'Tracing…'); status('outlineStatus', '');
  later(() => {}).then(runTrace).then(ok => {
    busy(false);
    if (ok === false) { undo(); status('outlineStatus', 'Nothing was traced with these settings. Try moving the sensitivity slider back.', 'err'); }
    drawIV();
  }).catch(e => { busy(false); undo(); status('outlineStatus', 'Tracing failed: ' + e.message, 'err'); });
}

/* ------------------------------------------------------- AI segmentation */
const AI = { worker: null, seq: 0, pending: new Map(), embedded: 0, files: {}, device: null };
function aiWorker() {
  if (AI.worker) return AI.worker;
  const w = new Worker('js/sam-worker.js', { type: 'module' });
  w.onmessage = e => {
    const m = e.data;
    if (m.type === 'progress') {
      AI.files[m.file] = [m.loaded, m.total];
      let l = 0, t = 0; for (const k in AI.files) { l += AI.files[k][0]; t += AI.files[k][1]; }
      busy(true, 'Downloading the AI model… ' + (l / 1048576).toFixed(1) + (t ? ' / ' + (t / 1048576).toFixed(1) : '') + ' MB');
      return;
    }
    const p = AI.pending.get(m.reqId); if (!p) return;
    AI.pending.delete(m.reqId);
    if (m.type === 'error') p.rej(new Error(m.error)); else p.res(m);
  };
  w.onerror = ev => {
    if (ev && ev.preventDefault) ev.preventDefault();
    for (const [, p] of AI.pending) p.rej(new Error('the AI worker could not start (needs an internet connection and a modern browser)'));
    AI.pending.clear(); AI.worker = null; AI.embedded = 0;
  };
  AI.worker = w;
  return w;
}
function aiCall(msg, transfer) {
  return new Promise((res, rej) => {
    const reqId = ++AI.seq; msg.reqId = reqId;
    AI.pending.set(reqId, { res, rej });
    aiWorker().postMessage(msg, transfer || []);
  });
}
// automatic prompts: inside points from the standard mask's distance field, outside points around it
function autoPrompts(seg) {
  const w = S.prep.w, h = S.prep.h, pts = [];
  if (!seg) { pts.push([w / 2, h / 2, 1]); return pts; }
  const bg = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) bg[i] = seg.mask[i] ? 0 : 1;
  const dist = K.edt2d(bg, w, h);
  let sx = 0, sy = 0, n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (seg.mask[y * w + x]) { sx += x; sy += y; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!n) { pts.push([w / 2, h / 2, 1]); return pts; }
  const cx = sx / n, cy = sy / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (seg.mask[y * w + x]) { const dx = x - cx, dy = y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th);
  let tmin = Infinity, tmax = -Infinity;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (seg.mask[y * w + x]) { const t = (x - cx) * ux + (y - cy) * uy; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
  for (let k = 0; k < 3; k++) {
    const ta = tmin + (tmax - tmin) * k / 3, tb = tmin + (tmax - tmin) * (k + 1) / 3;
    let best = -1, bd = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!seg.mask[i]) continue;
      const t = (x - cx) * ux + (y - cy) * uy; if (t < ta || t > tb) continue;
      if (dist[i] > bd) { bd = dist[i]; best = i; }
    }
    if (best >= 0) pts.push([best % w + 0.5, Math.floor(best / w) + 0.5, 1]);
  }
  const mx = Math.max(12, (x1 - x0) * 0.08), my = Math.max(12, (y1 - y0) * 0.08);
  const clampP = (x, y) => [Math.min(w - 2, Math.max(1, x)), Math.min(h - 2, Math.max(1, y))];
  for (const [x, y] of [[(x0 + x1) / 2, y0 - my], [(x0 + x1) / 2, y1 + my], [x0 - mx, (y0 + y1) / 2], [x1 + mx, (y0 + y1) / 2]]) {
    const q = clampP(x, y);
    if (!seg.mask[Math.floor(q[1]) * w + Math.floor(q[0])]) pts.push([q[0], q[1], 0]);
  }
  return pts;
}
async function aiSegment(seg) {
  if (AI.embedded !== S.tr.imageId) {
    busy(true, 'Loading the AI model…');
    const r = await aiCall({ type: 'load' });
    AI.device = r.device;
    busy(true, 'AI is studying the photo…');
    const img = S.prep.img;
    const copy = new Uint8ClampedArray(img.data);
    await aiCall({ type: 'embed', imageId: S.tr.imageId, data: copy, width: img.width, height: img.height }, [copy.buffer]);
    AI.embedded = S.tr.imageId;
  }
  busy(true, 'AI is tracing the tool…');
  const points = autoPrompts(seg).concat(S.tr.points);
  const m = await aiCall({ type: 'decode', imageId: S.tr.imageId, width: S.prep.w, height: S.prep.h, points });
  if (m.w !== S.prep.w || m.h !== S.prep.h) throw new Error('unexpected mask size');
  return m;
}
function pushHist() { if (S.outline) { S.hist.push(S.outline.map(p => p.slice())); if (S.hist.length > 60) S.hist.shift(); } }
function undo() { if (!S.hist.length) return; S.outline = S.hist.pop(); S.sel = -1; outlineChanged(); }
function deletePoint() {
  if (S.sel < 0 || !S.outline || S.outline.length <= 3) return;
  pushHist(); S.outline.splice(S.sel, 1); S.sel = Math.min(S.sel, S.outline.length - 1); outlineChanged();
}
function outlineChanged(fresh) {
  S.d.notchAt = null;
  S.result = S.result && fresh ? null : S.result;
  renderOutlineSpec(); updateStageChrome(); drawIV();
}
function renderOutlineSpec() {
  const el = $('outlineSpec'); el.innerHTML = '';
  if (!S.outline || !S.prep) return;
  const bb = K.ringBBox(S.outline);
  const rows = [
    ['Tool size', fmt(bb.x1 - bb.x0) + ' × ' + fmt(bb.y1 - bb.y0) + ' mm'],
    ['Area', fmt(Math.abs(K.ringArea(S.outline)) / 100) + ' cm²'],
    ['Outline points', String(S.outline.length)],
    ['Photo resolution', fmt(1 / S.prep.mmPerPx, 1) + ' px/mm'],
  ];
  for (const [k, v] of rows) { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; el.append(dt, dd); }
  $('thrV').textContent = Math.round(S.threshold || 0);
  if (S.segInfo && S.segInfo.touchesBorder) {
    const dt = document.createElement('dt'); dt.textContent = 'Check'; const dd = document.createElement('dd'); dd.textContent = 'Shape touches the photo edge'; dd.style.color = 'var(--warn)'; el.append(dt, dd);
  }
}
$('thr').addEventListener('input', e => { $('thrV').textContent = e.target.value; });
$('thr').addEventListener('change', e => { S.threshold = +e.target.value; retrace(); });
$('tapMode').addEventListener('change', e => { S.tapMode = e.target.checked; updateStageChrome(); });
$('btnRedetect').addEventListener('click', () => { S.seed = null; S.threshold = +$('thr').value; retrace(); });
$('traceSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.dataset.method === S.tr.method) return;
  S.tr.method = b.dataset.method; syncTraceUI(); retrace();
});
$('tapSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.tr.tapLabel = +b.dataset.label; syncTraceUI(); });
$('btnClearTaps').addEventListener('click', () => { S.tr.points = []; S.seed = null; retrace(); });
$('refineOn').addEventListener('change', e => { S.tr.refine = e.target.checked; retrace(); });
$('shadowOn').addEventListener('change', e => {
  S.tr.shadows = e.target.checked;
  busy(true, 'Re-reading the photo…');
  later(() => prepareWork()).then(() => retrace());
});
function syncTraceUI() {
  [...$('traceSeg').children].forEach(b => b.classList.toggle('on', b.dataset.method === S.tr.method));
  [...$('tapSeg').children].forEach(b => b.classList.toggle('on', +b.dataset.label === S.tr.tapLabel));
  $('aiOpts').style.display = S.tr.method === 'ai' ? '' : 'none';
  $('stdOpts').style.display = S.tr.method === 'ai' ? 'none' : '';
  $('tapModeLabel').textContent = S.tr.method === 'ai' ? 'Tap to add AI hints' : 'Tap the tool to select it';
  $('refineOn').checked = S.tr.refine; $('shadowOn').checked = S.tr.shadows;
  updateStageChrome();
}
$('btnUndo').addEventListener('click', undo);
$('btnDelPt').addEventListener('click', deletePoint);
$('btnSmooth').addEventListener('click', () => {
  if (!S.outline) return;
  pushHist();
  S.outline = K.simplifyRing(K.smoothRing(K.resampleRing(S.outline, 0.8), 2), 0.12);
  S.sel = -1; outlineChanged();
});
$('btnToDesign').addEventListener('click', () => { S.maxStep = Math.max(S.maxStep, 4); S.rotDone = false; goStep(4); });

/* ------------------------------------------------------------- step 4 */
function centroidOf(r) { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; }
function principalAngle(r) {
  const pts = K.resampleRing(r, 1);
  const c = centroidOf(pts);
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { const dx = p[0] - c[0], dy = p[1] - c[1]; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy) * 180 / Math.PI;
}
function normDeg(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return Math.round(a); }
function straighten() {
  const th = principalAngle(S.outline);
  S.rot = normDeg(S.d.mode === 'vertical' ? 90 - th : -th);
}
function designOutline() {
  const c = centroidOf(S.outline), a = S.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  return S.outline.map(p => { const x = p[0] - c[0], y = p[1] - c[1]; return [x * ca - y * sa, x * sa + y * ca]; });
}
function renderMounts() {
  const box = $('mounts'); box.innerHTML = '';
  for (const m of MOUNT_UI) {
    const disabled = m.id === 'pegboard' && !pegOK();
    const lab = document.createElement('label');
    lab.className = 'mount' + (S.d.mount === m.id ? ' on' : '') + (disabled ? ' off' : '');
    const inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'mount'; inp.value = m.id; inp.id = 'mount-' + m.id;
    inp.checked = S.d.mount === m.id; inp.disabled = disabled;
    inp.addEventListener('change', () => { S.d.mount = m.id; renderMounts(); syncDesignUI(); requestBuild(); });
    const b = document.createElement('b'); b.textContent = m.name;
    if (m.tag) { const t = document.createElement('span'); t.className = 'tag ' + m.tag[0]; t.textContent = m.tag[1]; b.appendChild(t); }
    const sm = document.createElement('small'); sm.textContent = disabled ? (S.d.mode === 'vertical' ? 'Not available for the vertical cradle: it prints on its back, so the hooks would point into the print bed.' : 'Not available for the shadow plate: it prints on its back, so the hooks would point into the print bed.') : m.desc;
    lab.append(inp, b, sm);
    box.appendChild(lab);
  }
}
const sliders = [
  ['clear', 'clearance', v => fmt(v) + ' mm'], ['wall', 'wall', v => fmt(v) + ' mm'], ['floor', 'floor', v => fmt(v) + ' mm'],
  ['cpct', 'cpct', v => Math.round(v) + '%'], ['fit', 'fit', v => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), 2) + ' mm'],
  ['bolth', 'bolth', v => fmt(v) + ' mm'], ['notchD', 'notchD', v => Math.round(v) + ' mm'], ['barPos', 'barPos', v => Math.round(v) + '%'],
  ['barH', 'barH', v => Math.round(v) + ' mm'], ['labelSize', 'labelSize', v => fmt(v) + ' mm'],
  ['standoff', 'standoff', v => fmt(v) + ' mm'], ['lipH', 'lipH', v => fmt(v) + ' mm'], ['seatT', 'seatT', v => fmt(v) + ' mm'],
  ['recess', 'recess', v => fmt(v) + ' mm'],
];
function pegOK() { return S.d.mode === 'horizontal' || (S.d.mode === 'flat' && S.d.flatStyle !== 'clips'); }
function syncDesignUI() {
  const d = S.d;
  if (!S.rotDone && S.outline) { straighten(); S.rotDone = true; }
  [...$('modeCards').children].forEach(c => c.classList.toggle('on', c.dataset.mode === d.mode));
  if (d.mount === 'pegboard' && !pegOK()) d.mount = 'multipoint';
  [...$('flatSeg').children].forEach(b => b.classList.toggle('on', b.dataset.style === d.flatStyle));
  $('hookCount').value = d.hookCount; $('engrave').checked = d.engrave;
  $('flatGroup').style.display = d.mode === 'flat' ? '' : 'none';
  $('hookWrap').style.display = d.mode === 'flat' && d.flatStyle === 'hooks' ? 'contents' : 'none';
  $('lipWrap').style.display = d.mode === 'flat' && d.flatStyle !== 'clips' ? 'contents' : 'none';
  $('recessWrap').style.display = d.mode === 'flat' && d.flatStyle === 'clips' ? 'contents' : 'none';
  $('engraveRow').style.display = d.mode === 'flat' && d.flatStyle !== 'clips' ? '' : 'none';
  $('floorWrap').style.display = d.mode === 'flat' ? 'none' : 'contents';
  renderMounts();
  $('thick').value = d.thickness; $('thickV').textContent = fmt(d.thickness) + ' mm';
  $('rot').value = S.rot; $('rotV').textContent = S.rot + '°';
  for (const [id, key, f] of sliders) { $(id).value = d[key]; $(id + 'V').textContent = f(d[key]); }
  const pd = d.pdepth == null ? Math.min(60, d.thickness) : d.pdepth;
  $('pdepth').value = pd; $('pdepthV').textContent = fmt(pd) + ' mm' + (d.pdepth == null ? ' (auto)' : '');
  $('grid').checked = d.grid; $('notchOn').checked = d.notchOn; $('labelText').value = d.label;
  $('pdWrap').style.display = d.mode === 'horizontal' ? 'contents' : 'none';
  $('cpWrap').style.display = d.mode === 'vertical' ? 'contents' : 'none';
  $('boltWrap').style.display = d.mount === 'bolt' ? 'contents' : 'none';
  $('notchGroup').style.display = d.mode === 'horizontal' ? '' : 'none';
  $('barGroup').style.display = d.mode === 'vertical' ? '' : 'none';
  renderPrintNotes();
}
$('modeCards').addEventListener('click', e => {
  const c = e.target.closest('.card'); if (!c) return;
  if (S.d.mode === c.dataset.mode) return;
  S.d.mode = c.dataset.mode; S.d.notchAt = null;
  if (S.outline) straighten();
  syncDesignUI(); requestBuild();
});
$('flatSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.dataset.style === S.d.flatStyle) return;
  S.d.flatStyle = b.dataset.style; syncDesignUI(); requestBuild();
});
$('hookCount').addEventListener('change', e => { S.d.hookCount = e.target.value; requestBuild(); });
$('engrave').addEventListener('change', e => { S.d.engrave = e.target.checked; requestBuild(); });
$('thick').addEventListener('input', e => { const v = parseFloat(e.target.value); if (v > 0) { S.d.thickness = Math.min(120, v); $('thickV').textContent = fmt(S.d.thickness) + ' mm'; if (S.d.pdepth == null) { $('pdepth').value = Math.min(60, S.d.thickness); $('pdepthV').textContent = fmt(Math.min(60, S.d.thickness)) + ' mm (auto)'; } requestBuild(); } });
$('rot').addEventListener('input', e => { S.rot = +e.target.value; $('rotV').textContent = S.rot + '°'; S.d.notchAt = null; requestBuild(); });
$('rotL').addEventListener('click', () => { S.rot = normDeg(S.rot + 90); S.d.notchAt = null; syncDesignUI(); requestBuild(); });
$('rotR').addEventListener('click', () => { S.rot = normDeg(S.rot - 90); S.d.notchAt = null; syncDesignUI(); requestBuild(); });
$('rotAuto').addEventListener('click', () => { straighten(); S.d.notchAt = null; syncDesignUI(); requestBuild(); });
for (const [id, key, f] of sliders) {
  $(id).addEventListener('input', e => { S.d[key] = +e.target.value; $(id + 'V').textContent = f(S.d[key]); requestBuild(); });
}
$('pdepth').addEventListener('input', e => { S.d.pdepth = +e.target.value; $('pdepthV').textContent = fmt(S.d.pdepth) + ' mm'; requestBuild(); });
$('grid').addEventListener('change', e => { S.d.grid = e.target.checked; requestBuild(); });
$('notchOn').addEventListener('change', e => { S.d.notchOn = e.target.checked; requestBuild(); });
$('labelText').addEventListener('input', e => { S.d.label = e.target.value; requestBuild(); });

/* ------------------------------------------------------------- label text */
const labelCache = new Map();
function labelRegions(text, capH) {
  text = (text || '').trim();
  if (!text) return null;
  const key = text + '|' + capH;
  if (labelCache.has(key)) return labelCache.get(key);
  const ppm = 14;
  const font = px => `700 ${px}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  ctx.font = font(100);
  const capAsc = ctx.measureText('H').actualBoundingBoxAscent || 70;
  const px = 100 * capH * ppm / capAsc;
  ctx.font = font(px);
  const m = ctx.measureText(text);
  const left = m.actualBoundingBoxLeft || 0, right = m.actualBoundingBoxRight || m.width;
  const asc = m.actualBoundingBoxAscent || px * 0.75, desc = m.actualBoundingBoxDescent || px * 0.2;
  const pad = 8;
  const W = Math.ceil(left + right) + 2 * pad, H = Math.ceil(asc + desc) + 2 * pad;
  c.width = W; c.height = H;
  ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.font = font(px); ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, pad + left, pad + asc);
  const a = ctx.getImageData(0, 0, W, H).data;
  const field = new Float32Array(W * H);
  for (let r = 0; r < H; r++) for (let x = 0; x < W; x++) field[(H - 1 - r) * W + x] = 0.5 - a[(r * W + x) * 4 + 3] / 255;
  const g = { x0: 0, y0: 0, res: 1 / ppm, w: W, h: H };
  let regions = K.simplifyRegions(K.loopsToRegions(K.contourField(field, g, 0), 0.02), 0.025);
  if (!regions.length) { labelCache.set(key, null); return null; }
  let bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const r of regions) { const b = K.ringBBox(r.outer); bb.x0 = Math.min(bb.x0, b.x0); bb.y0 = Math.min(bb.y0, b.y0); bb.x1 = Math.max(bb.x1, b.x1); bb.y1 = Math.max(bb.y1, b.y1); }
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  regions = regions.map(r => ({ outer: r.outer.map(p => [p[0] - cx, p[1] - cy]), holes: r.holes.map(h => h.map(p => [p[0] - cx, p[1] - cy])) }));
  const out = { regions, width: bb.x1 - bb.x0, height: bb.y1 - bb.y0 };
  labelCache.set(key, out);
  return out;
}

/* ---------------------------------------------------- geometry worker */
const W = { worker: null, busy: false, pending: null, cb: new Map(), seq: 0 };
function makeWorker() {
  try {
    const w = new Worker('js/geom-worker.js');
    w.onmessage = e => onJobDone(e.data);
    w.onerror = ev => { if (ev && ev.preventDefault) ev.preventDefault(); W.worker = null; W.busy = false; if (W.inflight) { const j = W.inflight; W.inflight = null; runLocal(j); } };
    W.worker = w;
  } catch (e) { W.worker = null; }
}
function runLocal(job) { setTimeout(() => onJobDone(B.runJob(job).msg), 20); }
function submit(job, cb) {
  job.id = ++W.seq; W.cb.set(job.id, cb);
  if (W.busy) { if (W.pending) { W.cb.delete(W.pending.id); } W.pending = job; return; }
  dispatch(job);
}
function dispatch(job) {
  W.busy = true; W.inflight = job;
  if (W.worker) W.worker.postMessage(job); else runLocal(job);
}
function onJobDone(msg) {
  W.busy = false; W.inflight = null;
  const cb = W.cb.get(msg.id); W.cb.delete(msg.id);
  if (cb) cb(msg);
  if (W.pending) { const j = W.pending; W.pending = null; dispatch(j); }
}

let buildTimer = null;
function requestBuild(now) {
  if (!S.outline) return;
  clearTimeout(buildTimer);
  buildTimer = setTimeout(doBuild, now ? 0 : 280);
}
function currentParams() {
  const d = S.d;
  const lab = labelRegions(d.label, d.labelSize);
  return {
    outline: designOutline(), mode: d.mode, mount: d.mount, thickness: d.thickness, clearance: d.clearance,
    wall: d.wall, floor: d.floor, pocketDepth: d.pdepth == null ? Math.min(60, d.thickness) : d.pdepth,
    cradlePct: d.cpct / 100, barPos: d.barPos / 100, barH: d.barH, barT: 3, grid: d.grid, fit: d.fit, boltHole: d.bolth,
    notch: { enabled: d.mode === 'horizontal' && d.notchOn, diameter: d.notchD, at: d.notchAt },
    label: lab,
    flatStyle: d.flatStyle, standoff: d.standoff, hookCount: d.hookCount === 'auto' ? 'auto' : +d.hookCount,
    lipH: d.lipH, lipT: Math.max(3, Math.min(6, d.lipH * 0.6)), seatT: d.seatT, recess: d.recess, engrave: d.engrave,
  };
}
function doBuild() {
  if (!S.outline) return;
  $('dlHolder').disabled = true;
  busy(true, 'Building the holder…');
  const job = { kind: 'holder', P: currentParams(), name: fileBase() };
  submit(job, msg => {
    busy(false);
    if (!msg.ok) { S.result = null; renderResult(msg.error); return; }
    S.result = msg;
    $('dlHolder').disabled = false;
    glSetMesh(msg);
    renderResult();
    if (S.view === 'layout') drawLayout(); else glDraw();
    updateStageChrome();
  });
}
function fileBase() {
  const d = S.d;
  const name = slug(d.label) || 'tool';
  return `${name}-holder-${d.mode === 'flat' ? 'flat-' + d.flatStyle : d.mode}-${d.mount}`;
}

/* ------------------------------------------------------------- results */
function renderResult(err) {
  const spec = $('resultSpec'), wl = $('warnList');
  spec.innerHTML = ''; wl.innerHTML = '';
  if (err) { const li = document.createElement('li'); li.className = 'note bad'; li.textContent = 'Could not build the holder: ' + err; wl.appendChild(li); return; }
  const r = S.result, d = r.dims;
  const rows = [['Footprint on the board', `${fmt(d.width, 1)} × ${fmt(d.height, 1)} mm`], ['Grid cells', `${fmt(d.gridW, d.gridW % 1 ? 2 : 0)} × ${fmt(d.gridH, d.gridH % 1 ? 2 : 0)}`], ['Sticks out from the board', fmt(d.depth, 1) + ' mm']];
  if (S.d.mode === 'horizontal') rows.push(['Tray height', fmt(d.trayHeight, 1) + ' mm']);
  else if (S.d.mode === 'vertical') rows.push(['Cradle height', fmt(d.cradleHeight, 1) + ' mm']);
  else rows.push(['Tool stand-off', fmt(d.standoff, 1) + ' mm']);
  rows.push(['Back plate', fmt(d.backThickness, 1) + ' mm thick']);
  rows.push(['Print orientation', r.printRotate === 'backDown' ? 'On its back, no supports' : 'Standing upright, no supports']);
  if (r.check) rows.push(['Mesh', (r.check.watertight ? 'Watertight' : 'Check in slicer') + ', ' + r.check.triangles.toLocaleString() + ' triangles']);
  for (const [k, v] of rows) { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; spec.append(dt, dd); }
  const warns = r.warnings.slice();
  if (S.d.mount === 'multipoint' || S.d.mount === 'rail') warns.push('The Multipoint profile is a community beta. Print the fit-test coupon and adjust “Mount fit” before printing the whole holder.');
  if (S.d.mount === 'bolt') warns.push('Check that your bolt head is wider than the ' + fmt(S.d.bolth) + ' mm hole. The fit-test coupon has one hole to try.');
  for (const w of warns) { const li = document.createElement('li'); li.className = 'note warn'; li.textContent = w; wl.appendChild(li); }
}
function renderPrintNotes() {
  const d = S.d, el = $('printNotes');
  const notes = [];
  notes.push(d.mode === 'horizontal'
    ? 'The STL is already oriented for printing: back plate standing up, tray flat on the bed. No supports are needed.'
    : d.mode === 'vertical'
      ? 'The STL is already oriented for printing: lying on its back with the pocket facing up. The retainer bar prints as a bridge, so make sure bridging is enabled.'
      : d.flatStyle === 'clips'
        ? 'The STL is already oriented for printing: lying on its back with the clips pointing up. PETG is recommended because the clips flex.'
        : 'The STL is already oriented for printing: standing on the bottom edge of the back plate, with 45° supports under each seat so no slicer supports are needed. Use a brim on tall holders.');
  notes.push('Suggested settings: 0.2 mm layers, 3 walls, 15–25% infill, PLA or PETG. Multiboard parts are designed around 0.25 mm tolerance.');
  const mountNote = {
    multipoint: 'Screw Multipoints into the board, then slide the holder down onto them until it stops. Multipoints are on multiboard.io.',
    multiconnect: 'Fit Multiconnect connectors into the board’s large holes at the slot spacing (every 25 mm), then slide the holder down onto them.',
    rail: 'Mount a Multipoint Rail on the board and slide the holder on from one end.',
    bolt: 'Hold the holder against the board with the holes over the large threaded holes, and fasten with 9 mm Big Thread flat-head bolts.',
    pegboard: 'Tilt the holder, insert the hooks into the small pegboard holes, and rotate it down flat. Needs an offset gap behind the tiles.',
  }[d.mount];
  notes.push(mountNote);
  notes.push('Before you print the full holder, print the fit-test coupon for your mount type and adjust “Mount fit” if it’s too tight or too loose.');
  el.innerHTML = '';
  for (const n of notes) { const p = document.createElement('p'); p.textContent = n; el.appendChild(p); }
}

/* ------------------------------------------------------------ downloads */
function saveFile(name, bytes, mime, statusId) {
  try {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    status(statusId, 'Downloaded ' + name + '.', 'ok');
  } catch (e) {
    status(statusId, 'Your browser blocked the download. Try another browser, or allow downloads for this site.', 'err');
  }
}
$('dlHolder').addEventListener('click', () => {
  if (!S.result || !S.result.stl) return;
  saveFile(fileBase() + '.stl', S.result.stl.slice(0), 'model/stl', 'dlStatus');
});
$('dlCoupon').addEventListener('click', () => {
  status('dlStatus', 'Building the coupon…');
  const P = currentParams();
  submit({ kind: 'coupon', P: { mount: P.mount, fit: P.fit, boltHole: P.boltHole }, name: 'coupon' }, msg => {
    if (!msg.ok) { status('dlStatus', 'Could not build the coupon: ' + msg.error, 'err'); return; }
    saveFile(`fit-test-${S.d.mount}-fit${S.d.fit >= 0 ? '+' : ''}${fmt(S.d.fit, 2)}.stl`, msg.stl, 'model/stl', 'dlStatus');
  });
});
/* ---------------------------------------------------------- 3D preview */
const G = { canvas: $('glCanvas'), gl: null, progs: {}, mesh: null, cam: { theta: -1.15, phi: 0.42, dist: 300, target: [0, 0, 0] }, drag: null, ptrs: new Map() };
function glInit() {
  const gl = G.canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false });
  if (!gl) return false;
  G.gl = gl;
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision > 0 ? 'highp' : 'mediump';
  const VS = `attribute vec3 aP; attribute vec3 aN; uniform mat4 uM; varying vec3 vN; varying vec3 vW;
    void main(){ vN=aN; vW=aP; gl_Position=uM*vec4(aP,1.0); }`;
  const FS_MESH = `precision ${hp} float; varying vec3 vN; varying vec3 vW; uniform vec3 uCol; uniform vec3 uEye;
    void main(){ vec3 n=normalize(vN); vec3 v=normalize(uEye-vW); if(dot(n,v)<0.0) n=-n;
      vec3 l1=normalize(vec3(0.35,-0.75,0.8)); vec3 l2=normalize(vec3(-0.7,0.25,0.35));
      float d=max(dot(n,l1),0.0)*0.62+max(dot(n,l2),0.0)*0.22+0.24;
      vec3 h=normalize(l1+v); float sp=pow(max(dot(n,h),0.0),48.0)*0.22;
      gl_FragColor=vec4(uCol*d+vec3(sp),1.0); }`;
  const FS_BOARD = `precision ${hp} float; varying vec3 vN; varying vec3 vW; uniform vec3 uCol; uniform vec3 uHole; uniform vec2 uO;
    void main(){ vec2 q=vec2(vW.x,vW.z)-uO; vec2 g=mod(q+12.5,25.0)-12.5; vec2 a=abs(g);
      float oct=max(max(a.x,a.y),(a.x+a.y)*0.70711); vec2 g2=mod(q,25.0)-12.5; float r2=length(g2);
      vec3 c=uCol; float rim=smoothstep(11.7,12.4,oct); if(oct<11.7) c=uHole; else c=mix(uCol*0.86,uCol,rim);
      if(r2<3.75) c=uHole; gl_FragColor=vec4(c,0.9); }`;
  const FS_BED = `precision ${hp} float; varying vec3 vN; varying vec3 vW; uniform vec3 uCol; uniform vec3 uHole;
    void main(){ vec2 g=abs(mod(vW.xy+5.0,10.0)-5.0); float line=min(g.x,g.y); vec2 g5=abs(mod(vW.xy+25.0,50.0)-25.0); float l5=min(g5.x,g5.y);
      vec3 c=uCol; if(line<0.35) c=mix(uCol,uHole,0.35); if(l5<0.5) c=mix(uCol,uHole,0.6); gl_FragColor=vec4(c,1.0); }`;
  const mk = (fs) => {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return { p, aP: gl.getAttribLocation(p, 'aP'), aN: gl.getAttribLocation(p, 'aN'), uM: gl.getUniformLocation(p, 'uM'), uCol: gl.getUniformLocation(p, 'uCol'), uEye: gl.getUniformLocation(p, 'uEye'), uHole: gl.getUniformLocation(p, 'uHole'), uO: gl.getUniformLocation(p, 'uO') };
  };
  try { G.progs.mesh = mk(FS_MESH); G.progs.board = mk(FS_BOARD); G.progs.bed = mk(FS_BED); }
  catch (e) { G.gl = null; return false; }
  return true;
}
function buffersFor(pos) {
  const gl = G.gl, n = pos.length / 9;
  const nrm = new Float32Array(pos.length);
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2];
    const vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    for (let k = 0; k < 3; k++) { nrm[o + k * 3] = nx; nrm[o + k * 3 + 1] = ny; nrm[o + k * 3 + 2] = nz; }
  }
  const bp = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
  const bn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bn); gl.bufferData(gl.ARRAY_BUFFER, nrm, gl.STATIC_DRAW);
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { if (pos[i + k] < mn[k]) mn[k] = pos[i + k]; if (pos[i + k] > mx[k]) mx[k] = pos[i + k]; }
  return { bp, bn, n: n * 3, mn, mx };
}
function quad(x0, y0, z0, x1, y1, z1, plane) {
  // plane 'xz' at y0, 'xy' at z0
  const p = plane === 'xz'
    ? [x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z0, x1, y0, z1, x0, y0, z1]
    : [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y0, z0, x1, y1, z0, x0, y1, z0];
  return new Float32Array(p);
}
function glSetMesh(msg) {
  if (!G.gl && !glInit()) return;
  const gl = G.gl;
  if (G.mesh) for (const k of ['world', 'print', 'board', 'bed']) if (G.mesh[k]) { gl.deleteBuffer(G.mesh[k].bp); gl.deleteBuffer(G.mesh[k].bn); }
  const world = buffersFor(msg.wpos), print = buffersFor(msg.pos);
  const bw = world;
  const board = buffersFor(quad(bw.mn[0] - 37.5, 0.08, bw.mn[2] - 37.5, bw.mx[0] + 37.5, 0, bw.mx[2] + 37.5, 'xz'));
  const span = Math.max(220, Math.max(print.mx[0] - print.mn[0], print.mx[1] - print.mn[1]) + 60);
  const bed = buffersFor(quad(-span / 2, -span / 2, -0.05, span / 2, span / 2, 0, 'xy'));
  // board hole origin from the mount marks
  let o = [12.5, 12.5];
  const m = (msg.layout && msg.layout.marks && msg.layout.marks[0]) || null;
  if (m) {
    if (m.type === 'slot') o = [m.x, m.stopZ];
    else if (m.type === 'bolt') o = [m.x, m.z];
    else if (m.type === 'rail') o = [12.5, m.z];
    else if (m.type === 'hook' || m.type === 'stub') o = [m.x - 12.5, m.z - 12.5];
  }
  const keepCam = !!G.mesh && G.mesh.mode === S.d.mode;
  G.mesh = { world, print, board, bed, origin: o, mode: S.d.mode };
  if (!keepCam) glFit();
}
function glFit() {
  if (!G.mesh) return;
  const b = S.view === 'bed' ? G.mesh.print : G.mesh.world;
  G.cam.target = [(b.mn[0] + b.mx[0]) / 2, (b.mn[1] + b.mx[1]) / 2, (b.mn[2] + b.mx[2]) / 2];
  const r = Math.hypot(b.mx[0] - b.mn[0], b.mx[1] - b.mn[1], b.mx[2] - b.mn[2]) / 2;
  G.cam.dist = Math.max(40, r / Math.sin(17.5 * Math.PI / 180) * 1.08);
  if (S.view === 'bed') { G.cam.theta = -1.2; G.cam.phi = 0.62; } else { G.cam.theta = -1.15; G.cam.phi = 0.38; }
}
function mat4Mul(a, b) { const r = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; r[i * 4 + j] = s; } return r; }
function persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); const r = new Float32Array(16); r[0] = t / asp; r[5] = t; r[10] = (f + n) / (n - f); r[11] = -1; r[14] = 2 * f * n / (n - f); return r; }
function lookAt(e, c, u) {
  let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; let L = Math.hypot(...z); z = z.map(v => v / L);
  let x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]; L = Math.hypot(...x); x = x.map(v => v / L);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const r = new Float32Array(16);
  r[0] = x[0]; r[4] = x[1]; r[8] = x[2]; r[1] = y[0]; r[5] = y[1]; r[9] = y[2]; r[2] = z[0]; r[6] = z[1]; r[10] = z[2];
  r[12] = -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]); r[13] = -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]); r[14] = -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]); r[15] = 1;
  return { m: r, x, y, z };
}
let glRaf = 0;
function glDraw() { if (glRaf) return; glRaf = requestAnimationFrame(() => { glRaf = 0; glRender(); }); }
function glRender() {
  if (S.step !== 4 || S.view === 'layout') return;
  const gl = G.gl, cv = G.canvas;
  if (!gl) return;
  const { w, h } = stageSize(), dpr = DPR();
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  gl.viewport(0, 0, cv.width, cv.height);
  const bg = cssRGB('--stage', '#dfe3e1');
  gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (!G.mesh) return;
  gl.enable(gl.DEPTH_TEST);
  const c = G.cam;
  const eye = [c.target[0] + c.dist * Math.cos(c.phi) * Math.cos(c.theta), c.target[1] + c.dist * Math.cos(c.phi) * Math.sin(c.theta), c.target[2] + c.dist * Math.sin(c.phi)];
  const V = lookAt(eye, c.target, [0, 0, 1]);
  const P = persp(35 * Math.PI / 180, w / h, c.dist / 200, c.dist * 20);
  const M = mat4Mul(P, V.m);
  const dark = (document.documentElement.dataset.theme === 'dark') || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const accent = cssRGB('--accent', '#d9480f');
  const draw = (prog, buf, col, extra) => {
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(prog.uM, false, M);
    if (prog.uCol) gl.uniform3fv(prog.uCol, col);
    if (prog.uEye) gl.uniform3fv(prog.uEye, eye);
    if (extra) extra(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.bp); gl.enableVertexAttribArray(prog.aP); gl.vertexAttribPointer(prog.aP, 3, gl.FLOAT, false, 0, 0);
    if (prog.aN >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, buf.bn); gl.enableVertexAttribArray(prog.aN); gl.vertexAttribPointer(prog.aN, 3, gl.FLOAT, false, 0, 0); }
    gl.drawArrays(gl.TRIANGLES, 0, buf.n);
  };
  if (S.view === 'bed') {
    draw(G.progs.bed, G.mesh.bed, dark ? [0.16, 0.18, 0.2] : [0.78, 0.8, 0.8], p => gl.uniform3fv(p.uHole, dark ? [0.4, 0.44, 0.48] : [0.5, 0.53, 0.55]));
    draw(G.progs.mesh, G.mesh.print, accent);
  } else {
    draw(G.progs.mesh, G.mesh.world, accent);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    draw(G.progs.board, G.mesh.board, dark ? [0.3, 0.33, 0.36] : [0.66, 0.69, 0.71], p => { gl.uniform3fv(p.uHole, dark ? [0.08, 0.09, 0.1] : [0.22, 0.24, 0.26]); gl.uniform2fv(p.uO, G.mesh.origin); });
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
}
function gPos(e) { const r = G.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
G.canvas.addEventListener('contextmenu', e => e.preventDefault());
G.canvas.addEventListener('pointerdown', e => {
  G.canvas.setPointerCapture(e.pointerId);
  G.ptrs.set(e.pointerId, gPos(e));
  const [x, y] = gPos(e);
  if (G.ptrs.size === 2) { const [a, b] = [...G.ptrs.values()]; G.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), dist: G.cam.dist }; G.drag = null; return; }
  G.drag = { x, y, pan: e.button === 2 || e.shiftKey, theta: G.cam.theta, phi: G.cam.phi, target: G.cam.target.slice() };
});
G.canvas.addEventListener('pointermove', e => {
  if (!G.ptrs.has(e.pointerId)) return;
  G.ptrs.set(e.pointerId, gPos(e));
  if (G.pinch && G.ptrs.size === 2) { const [a, b] = [...G.ptrs.values()]; G.cam.dist = G.pinch.dist * G.pinch.d / Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])); glDraw(); return; }
  const d = G.drag; if (!d) return;
  const [x, y] = gPos(e);
  if (d.pan) {
    const c = G.cam;
    const eye = [Math.cos(c.phi) * Math.cos(c.theta), Math.cos(c.phi) * Math.sin(c.theta), Math.sin(c.phi)];
    const V = lookAt(eye, [0, 0, 0], [0, 0, 1]);
    const s = c.dist / stageSize().h * 0.63;
    c.target = [0, 1, 2].map(k => d.target[k] - V.x[k] * (x - d.x) * s + V.y[k] * (y - d.y) * s);
  } else {
    G.cam.theta = d.theta - (x - d.x) * 0.008;
    G.cam.phi = Math.max(-1.5, Math.min(1.5, d.phi + (y - d.y) * 0.008));
  }
  glDraw();
});
const gEnd = e => { G.ptrs.delete(e.pointerId); if (G.ptrs.size < 2) G.pinch = null; G.drag = null; };
G.canvas.addEventListener('pointerup', gEnd); G.canvas.addEventListener('pointercancel', gEnd);
G.canvas.addEventListener('wheel', e => { e.preventDefault(); G.cam.dist *= Math.pow(1.0012, e.deltaY); G.cam.dist = Math.max(10, Math.min(5000, G.cam.dist)); glDraw(); }, { passive: false });

function setView(v) {
  S.view = v;
  $('vBoard').classList.toggle('on', v === 'board'); $('vBed').classList.toggle('on', v === 'bed'); $('vLayout').classList.toggle('on', v === 'layout');
  $('glCanvas').style.display = v === 'layout' ? 'none' : 'block';
  $('layoutCanvas').style.display = v === 'layout' ? 'block' : 'none';
  if (v !== 'layout') {
    if (!G.gl && !glInit()) { $('glCanvas').style.display = 'none'; $('layoutCanvas').style.display = 'block'; S.view = 'layout'; drawLayout(); updateStageChrome(); return; }
    if (G.mesh) glFit();
    glDraw();
  } else drawLayout();
  updateStageChrome();
}
$('vBoard').addEventListener('click', () => setView('board'));
$('vBed').addEventListener('click', () => setView('bed'));
$('vLayout').addEventListener('click', () => setView('layout'));

/* ------------------------------------------------------------ layout 2D */
const LY = { canvas: $('layoutCanvas'), tf: null };
function drawLayout() {
  const cv = LY.canvas, { w, h } = stageSize(), dpr = DPR();
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  if (!S.result || !S.result.layout) return;
  const L = S.result.layout;
  const x0 = L.x0 - 12, x1 = L.x1 + 12, y0 = L.y0 - 12, y1 = L.y1 + 12;
  const k = Math.min((w - 40) / (x1 - x0), (h - 90) / (y1 - y0));
  const ox = (w - (x1 - x0) * k) / 2 - x0 * k, oy = (h - 30 + (y1 - y0) * k) / 2 + y0 * k;
  const P = (x, y) => [ox + x * k, oy - y * k];
  LY.tf = { k, ox, oy };
  const ink = cssVar('--ink'), muted = cssVar('--muted'), line = cssVar('--line'), accent = cssVar('--accent'), cyan = cssVar('--cyan'), panel = cssVar('--panel');
  // grid
  c.strokeStyle = line; c.lineWidth = 1;
  const gx0 = Math.floor(x0 / 25) * 25, gy0 = Math.floor(y0 / 25) * 25;
  for (let x = gx0; x <= x1; x += 25) { const [a] = P(x, 0); c.beginPath(); c.moveTo(a, P(0, y0)[1]); c.lineTo(a, P(0, y1)[1]); c.stroke(); }
  for (let y = gy0; y <= y1; y += 25) { const b = P(0, y)[1]; c.beginPath(); c.moveTo(P(x0, 0)[0], b); c.lineTo(P(x1, 0)[0], b); c.stroke(); }
  const path = (ring) => { c.beginPath(); ring.forEach((p, i) => { const q = P(p[0], p[1]); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath(); };
  if (L.view === 'front' && L.back) { path(L.back); c.fillStyle = panel; c.fill(); c.setLineDash([5, 4]); c.strokeStyle = muted; c.stroke(); c.setLineDash([]); }
  path(L.footprint); c.fillStyle = panel; c.fill(); c.strokeStyle = ink; c.lineWidth = 1.5; c.stroke();
  if (L.view === 'top') { path(L.back); c.fillStyle = muted; c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1; }
  for (const r of L.pocket) {
    c.beginPath();
    for (const ring of [r.outer, ...r.holes]) ring.forEach((p, i) => { const q = P(p[0], p[1]); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
    c.fillStyle = 'rgba(217,72,15,0.18)'; c.fill('evenodd'); c.strokeStyle = accent; c.lineWidth = 1.5; c.stroke();
  }
  if (L.notch) { const q = P(L.notch.x, L.notch.y); c.setLineDash([4, 3]); c.strokeStyle = accent; c.beginPath(); c.arc(q[0], q[1], L.notch.r * k, 0, 7); c.stroke(); c.setLineDash([]); }
  for (const sp of L.supports || []) {
    path(sp.ring); c.fillStyle = ink; c.globalAlpha = 0.3; c.fill(); c.globalAlpha = 1;
    const a = P(sp.x0, sp.lipTop), b = P(sp.x1, sp.lipTop); c.strokeStyle = ink; c.lineWidth = 2; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  }
  for (const cl of L.clips || []) { const a = P(cl.x0, cl.z1), b = P(cl.x1, cl.z0); c.fillStyle = ink; c.globalAlpha = 0.45; c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.globalAlpha = 1; }
  if (L.bar) { const a = P(0, L.bar.y1), b = P(L.W, L.bar.y0); c.fillStyle = ink; c.globalAlpha = 0.28; c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.globalAlpha = 1; }
  if (L.labelBox) { const a = P(L.labelBox.x0, L.labelBox.y1), b = P(L.labelBox.x1, L.labelBox.y0); c.setLineDash([3, 3]); c.strokeStyle = cyan; c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.setLineDash([]); c.fillStyle = cyan; c.font = '600 11px ' + cssVar('--mono'); c.fillText('label', a[0], a[1] - 4); }
  c.fillStyle = cyan; c.strokeStyle = cyan;
  for (const m of L.marks || []) {
    if (L.view === 'top') {
      const q = P(m.x !== undefined ? m.x : L.W / 2, 0);
      if (m.type === 'rail') { c.lineWidth = 3; const a = P(0, 0.8), b = P(L.W, 0.8); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
      else { c.beginPath(); c.arc(q[0], q[1] - 4, 4, 0, 7); c.fill(); }
    } else {
      if (m.type === 'slot') { const a = P(m.x - m.w / 2, m.z1), b = P(m.x + m.w / 2, m.z0); c.globalAlpha = 0.25; c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.globalAlpha = 1; const s = P(m.x, m.stopZ); c.beginPath(); c.arc(s[0], s[1], 3.5, 0, 7); c.fill(); }
      else if (m.type === 'bolt') { const s = P(m.x, m.z); c.lineWidth = 2; c.beginPath(); c.arc(s[0], s[1], m.r * k, 0, 7); c.stroke(); }
      else if (m.type === 'rail') { const a = P(0, m.z + m.h / 2), b = P(L.W, m.z - m.h / 2); c.globalAlpha = 0.25; c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.globalAlpha = 1; }
    }
  }
  // dimensions
  c.fillStyle = muted; c.font = '500 12px ' + cssVar('--mono'); c.textAlign = 'center';
  const bl = P(L.W / 2, L.y0);
  c.fillText(fmt(L.W, 1) + ' mm', bl[0], bl[1] + 22);
  c.textAlign = 'left';
  if (L.view === 'top') { const t = P(0, 0); c.fillText('board side ↑', t[0], t[1] - 10); }
  else { const t = P(L.W, L.y1); c.fillText(fmt(L.y1, 1) + ' mm tall', t[0] + 8, t[1] + 12); }
}
LY.canvas.addEventListener('click', e => {
  if (!S.result || !S.result.layout || S.d.mode !== 'horizontal' || !S.d.notchOn || !LY.tf) return;
  const r = LY.canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const x = (sx - LY.tf.ox) / LY.tf.k, y = (LY.tf.oy - sy) / LY.tf.k;
  const L = S.result.layout;
  S.d.notchAt = [x - L.sx, y - L.sy];
  requestBuild(true);
});

/* -------------------------------------------------------------- resize */
new ResizeObserver(() => {
  if (S.step === 4) { if (S.view === 'layout') drawLayout(); else glDraw(); }
  else drawIV();
}).observe(stage);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawIV(); glDraw(); if (S.view === 'layout') drawLayout(); });

/* --------------------------------------------------------------- start */
makeWorker();
$('paper').dispatchEvent(new Event('change'));
goStep(1);
const start = () => loadExample(true).catch(() => busy(false));
if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]).then(start); else start();
})();
