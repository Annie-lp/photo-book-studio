// build.js - Bundle all JS into one file
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const libs = [
  // fabric.js UMD browser build
  { input: 'node_modules/fabric/dist/index.js', out: 'src/lib/fabric.js' },
  // jsPDF UMD build (attaches to window.jspdf)
  { input: 'node_modules/jspdf/dist/jspdf.umd.min.js', out: 'src/lib/jspdf.js' },
  // html2canvas (attaches to window.html2canvas)
  { input: 'node_modules/html2canvas/dist/html2canvas.min.js', out: 'src/lib/html2canvas.js' },
];

// Copy lib files to src/lib/
fs.mkdirSync('src/lib', { recursive: true });
libs.forEach(({ input, out }) => {
  fs.copyFileSync(input, out);
  console.log('Copied:', out);
});

// Bundle renderer code (no external deps - uses globals from script tags)
esbuild.buildSync({
  entryPoints: ['src/renderer.js'],
  bundle: false,
  outfile: 'src/bundle.js',
  platform: 'browser',
  format: 'iife',
  minify: false,
  sourcemap: false,
});

console.log('Bundle: src/bundle.js');
