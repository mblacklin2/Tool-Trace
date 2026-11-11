/* AI segmentation worker (module): SlimSAM through Transformers.js, loaded from the jsDelivr and
   Hugging Face CDNs on first use and cached by the browser afterwards. */
import { SamModel, AutoProcessor, RawImage, Tensor, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

const MODEL_ID = 'Xenova/slimsam-77-uniform';
env.allowLocalModels = false;
let model = null, processor = null, device = null, loading = null;
let cache = { id: null, processed: null, emb: null };

function progress(p) {
  if (p && p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded || 0, total: p.total || 0 });
}
async function load() {
  if (model) return;
  if (loading) return loading;
  loading = (async () => {
    let want = 'wasm';
    try { if (self.navigator && navigator.gpu) { const a = await navigator.gpu.requestAdapter(); if (a) want = 'webgpu'; } } catch (e) { /* no WebGPU */ }
    const tryLoad = async (dev) => SamModel.from_pretrained(MODEL_ID, { device: dev, dtype: dev === 'webgpu' ? 'fp16' : 'fp32', progress_callback: progress });
    try { model = await tryLoad(want); device = want; }
    catch (e) { if (want === 'wasm') throw e; model = await tryLoad('wasm'); device = 'wasm'; }
    processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback: progress });
  })();
  try { await loading; } finally { loading = null; }
}
async function embed(m) {
  const img = new RawImage(new Uint8ClampedArray(m.data), m.width, m.height, 4).rgb();
  cache.processed = await processor(img);
  cache.emb = await model.get_image_embeddings(cache.processed);
  cache.id = m.imageId;
}
async function decode(m) {
  if (cache.id !== m.imageId) throw new Error('image not embedded');
  const reshaped = cache.processed.reshaped_input_sizes[0]; // [h, w]
  const pts = m.points; // [[x, y, label]] in pixels of the embedded image
  const flat = [], labels = [];
  for (const [x, y, l] of pts) { flat.push(x / m.width * reshaped[1], y / m.height * reshaped[0]); labels.push(BigInt(l)); }
  const input_points = new Tensor('float32', flat, [1, 1, pts.length, 2]);
  const input_labels = new Tensor('int64', labels, [1, 1, pts.length]);
  const { pred_masks, iou_scores } = await model({ ...cache.emb, input_points, input_labels });
  const masks = await processor.post_process_masks(pred_masks, cache.processed.original_sizes, cache.processed.reshaped_input_sizes);
  const t = masks[0][0];                 // [n, H, W] booleans
  const [n, H, W] = t.dims;
  const scores = Array.from(iou_scores.data);
  let best = 0; for (let i = 1; i < n; i++) if (scores[i] > scores[best]) best = i;
  const out = new Uint8Array(H * W);
  const src = t.data;
  for (let i = 0, o = best * H * W; i < H * W; i++) out[i] = src[o + i] ? 1 : 0;
  return { mask: out, w: W, h: H, score: scores[best] };
}
self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'load') { await load(); self.postMessage({ type: 'ready', reqId: m.reqId, device }); }
    else if (m.type === 'embed') { await load(); await embed(m); self.postMessage({ type: 'embedded', reqId: m.reqId }); }
    else if (m.type === 'decode') { const r = await decode(m); self.postMessage({ type: 'mask', reqId: m.reqId, ...r }, [r.mask.buffer]); }
  } catch (err) {
    self.postMessage({ type: 'error', reqId: m.reqId, error: String((err && err.message) || err) });
  }
};
