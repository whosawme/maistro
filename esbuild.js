const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: true,
  minify: !watch,
};

if (watch) {
  esbuild.context(options).then((ctx) => {
    ctx.watch();
    console.log('Watching for changes...');
  });
} else {
  esbuild.build(options).then(() => {
    console.log('Build complete.');
  });
}
