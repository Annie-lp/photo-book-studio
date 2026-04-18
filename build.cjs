require('/root/.openclaw/agents/wechat-assistant/node_modules/esbuild').buildSync({
  entryPoints: ['/root/.openclaw/agents/wechat-assistant/photo-book-studio/src/renderer.js'],
  bundle: false,
  outfile: '/root/.openclaw/agents/wechat-assistant/photo-book-studio/src/bundle.js',
  platform: 'browser',
  format: 'iife',
  minify: false,
});
console.log('bundled');
