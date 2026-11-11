// Regenerates the calibration mat PDFs in /assets from js/vision.js.  Usage: node tools/make-mats.js
const fs = require('fs'), path = require('path');
const V = require('../js/vision.js');
for (const key of ['letter', 'a4']) {
  const out = path.join(__dirname, '..', 'assets', `calibration-mat-${key}.pdf`);
  fs.writeFileSync(out, V.matPDF(key), 'latin1');
  console.log('wrote', out);
}
