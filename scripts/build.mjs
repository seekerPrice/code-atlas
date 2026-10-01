import { build } from 'esbuild';
await build({entryPoints:['src/app.js'],bundle:true,outfile:'public/app.js',format:'esm',minify:true,target:['es2022'],sourcemap:false});
console.log('Code Atlas browser app built.');
