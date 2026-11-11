/* Geometry worker: builds holder meshes off the main thread. */
importScripts('kernel.js', 'builder.js');
self.onmessage = e => {
  const r = B.runJob(e.data);
  self.postMessage(r.msg, r.transfer);
};
