// ---------------------------------------------------------------------------
// tools/medir.mjs — mede (gzip -9) tudo o que a página baixa
//
//   npm i --no-save three@0.186.1 animejs@4.5.0 @fontsource-variable/archivo @fontsource-variable/martian-mono
//   node tools/medir.mjs
//
// Sem os pacotes instalados, mede só os arquivos do próprio site.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const at = (...p) => path.join(root, ...p);
const gz = (file) => zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;
const kb = (bytes) => +(bytes / 1024).toFixed(1);
const exists = (file) => fs.existsSync(file);

const out = {};
const siteJs = fs.readdirSync(at('js')).filter((f) => f.endsWith('.js'));
out['código do site'] = kb(siteJs.reduce((sum, f) => sum + gz(at('js', f)), 0));
out['CSS + HTML'] = kb(gz(at('css/style.css')) + gz(at('index.html')));

const nm = at('node_modules');
if (exists(path.join(nm, 'three'))) {
  out['three.js · núcleo'] = kb(gz(path.join(nm, 'three/build/three.core.js')));
  out['three.js · módulo'] = kb(gz(path.join(nm, 'three/build/three.module.js')));
  out['addons three'] = kb(
    gz(path.join(nm, 'three/examples/jsm/renderers/CSS3DRenderer.js')) +
    gz(path.join(nm, 'three/examples/jsm/utils/BufferGeometryUtils.js')),
  );
}

if (exists(path.join(nm, 'animejs'))) {
  // percorre o grafo de imports relativos: é o que o navegador baixa via import map
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/(?:import|export)[^'";]*?from\s*['"](\.[^'"]+)['"]|import\s*['"](\.[^'"]+)['"]/g)) {
      walk(path.resolve(path.dirname(file), m[1] || m[2]));
    }
  };
  walk(path.join(nm, 'animejs/dist/modules/index.js'));
  walk(path.join(nm, 'animejs/dist/modules/adapters/three/index.js'));
  out[`anime.js · ${seen.size} módulos`] = kb([...seen].reduce((sum, f) => sum + gz(f), 0));
}

const fonts = [
  '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2',
  '@fontsource-variable/martian-mono/files/martian-mono-latin-wdth-normal.woff2',
].map((f) => path.join(nm, f));
if (fonts.every(exists)) out['fontes woff2'] = kb(fonts.reduce((sum, f) => sum + fs.statSync(f).size, 0));

console.table(out);
console.log('total', kb(Object.values(out).reduce((a, b) => a + b, 0) * 1024), 'KB');
