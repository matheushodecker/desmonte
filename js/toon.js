// ---------------------------------------------------------------------------
// toon.js — o visual de "desenho técnico" em duas passadas
//
// Passada 1: cada peça é desenhada com um material que NÃO produz a cor final.
//   RGB  = cor de identificação da peça, misturada com a normal codificada em cor
//          (assim, bordas aparecem entre peças diferentes E em quinas da mesma peça)
//   A    = tom de luz quantizado: 0.15 sombra · 0.6 meio-tom · 0.8 destaque · 1.0 brilho
//
// Passada 2: um quad de tela cheia lê essa imagem, detecta bordas com o operador
//   de Roberts (4 amostras na diagonal) e pinta com DUAS paletas ao mesmo tempo:
//   a escura e a "planta" azul. O uniform printMix move uma frente de varredura
//   diagonal entre elas, com uma linha de scan na borda, e a planta ganha a
//   grade de prancheta. O anime.js só anima números: printMix, cores, etc.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

// Uniforms compartilhados por todos os materiais: mover a luz move tudo.
export const sharedUniforms = {
  lightDir: { value: new THREE.Vector3(-0.55, 0.78, 0.62).normalize() },
};

// Gerador pseudoaleatório com semente: as cores de identificação são sempre as mesmas.
let seed = 7;
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const partVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const partFragment = /* glsl */ `
  uniform vec3 idColor;
  uniform vec3 lightDir;
  uniform float normalMix;
  uniform float toneOverride;
  uniform float highlight;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    float ndl = dot(n, normalize(lightDir));
    float rim = 1.0 - max(dot(n, normalize(vViewW)), 0.0);
    float tone = ndl > 0.18 ? 0.6 : 0.15;
    if (ndl > 0.4 && rim > 0.66) tone = 1.0;
    if (toneOverride >= 0.0) tone = toneOverride;
    if (highlight > 0.5) tone = 0.8;
    vec3 normalColor = n * 0.5 + 0.5;
    gl_FragColor = vec4(mix(idColor, normalColor, normalMix), tone);
  }
`;

/**
 * Material da passada 1. Cada chamada recebe uma cor de identificação única.
 * @param {{ tone?: number }} [opts] tom fixo (ex.: 0.15 para o vidro escuro da tela)
 */
export function createPartMaterial({ tone = -1 } = {}) {
  const c = new THREE.Color(0.08 + rand() * 0.84, 0.08 + rand() * 0.84, 0.08 + rand() * 0.84);
  return new THREE.ShaderMaterial({
    vertexShader: partVertex,
    fragmentShader: partFragment,
    side: THREE.DoubleSide,
    uniforms: {
      idColor: { value: c },
      lightDir: sharedUniforms.lightDir,
      normalMix: { value: 0.24 },
      toneOverride: { value: tone },
      highlight: { value: 0 },
    },
  });
}

const postVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const postFragment = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 texel;
  uniform float thickness;
  uniform float threshold;
  uniform float aspect;
  uniform float pixelRatio;

  // paleta escura
  uniform vec3 backgroundColor;
  uniform vec3 paintColor;
  uniform vec3 shadowColor;
  uniform vec3 rimColor;
  uniform vec3 outlineColor;
  uniform float outlineBlend;
  uniform float contourBlend;

  // paleta da planta + transição
  uniform vec3 printColor;
  uniform vec3 printLineColor;
  uniform float printMix;
  uniform float gridOpacity;
  uniform vec3 highlightColor;

  varying vec2 vUv;

  vec3 at(vec2 o) { return texture2D(tScene, vUv + o * texel * thickness).rgb; }

  // distância (em px) até a linha de grade mais próxima -> 1 em cima da linha
  float gridLine(vec2 p, float spacing) {
    vec2 f = abs(fract(p / spacing - 0.5) - 0.5) * spacing;
    return 1.0 - smoothstep(0.35 * pixelRatio, 1.1 * pixelRatio, min(f.x, f.y));
  }

  void main() {
    vec4 c = texture2D(tScene, vUv);

    // Roberts cross: diferenças nas duas diagonais
    vec3 d0 = at(vec2( 1.0,  1.0)) - at(vec2(-1.0, -1.0));
    vec3 d1 = at(vec2(-1.0,  1.0)) - at(vec2( 1.0, -1.0));
    float edge = sqrt(dot(d0, d0) + dot(d1, d1));
    float line = smoothstep(threshold * 0.6, threshold * 1.4, edge);

    bool isBackground = c.r > 0.996 && c.g > 0.996 && c.b > 0.996;
    float tone = c.a;
    bool isHighlight = tone > 0.74 && tone < 0.86;

    // ---- paleta escura (tinta, sombra, brilho de borda e traço)
    vec3 surface = tone > 0.9 ? rimColor : (tone < 0.3 ? shadowColor : paintColor);
    if (isHighlight) surface = highlightColor;
    vec3 darkBase = isBackground ? backgroundColor : surface;
    vec3 darkStroke = isBackground
      ? mix(outlineColor, backgroundColor, contourBlend)
      : mix(outlineColor, surface, outlineBlend);
    vec3 dark = mix(darkBase, darkStroke, line);

    // ---- planta: papel azul, grade só no fundo, traço claro
    vec2 px = gl_FragCoord.xy;
    float grid = gridLine(px, 24.0 * pixelRatio) * 0.03 + gridLine(px, 120.0 * pixelRatio) * 0.06;
    vec3 printBase = isBackground ? mix(printColor, printLineColor, grid * gridOpacity) : printColor;
    if (isHighlight) printBase = mix(printColor, highlightColor, 0.55);
    vec3 print = mix(printBase, printLineColor, line);

    // ---- frente de varredura diagonal (de baixo/esquerda para cima/direita)
    float d = (vUv.x * aspect + vUv.y) / (aspect + 1.0);
    float band = 0.06;
    float front = printMix * (1.0 + 2.0 * band) - band;
    float m = smoothstep(front + band, front - band, d);
    float scan = exp(-pow((d - front) / (band * 0.12), 2.0)) * step(0.002, printMix) * step(printMix, 0.998);

    vec3 color = mix(dark, print, m) + printLineColor * scan * 0.38;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Paleta escura (valores de destino da abertura) e a paleta "desligada". */
export const DARK = {
  backgroundColor: '#121417',
  paintColor: '#3a3f47',
  shadowColor: '#23262c',
  rimColor: '#ffcf8a',
  outlineColor: '#07080a',
};

export const OFF = {
  paintColor: '#000000',
  shadowColor: '#000000',
  rimColor: '#000000',
  outlineColor: '#000000',
};

/** Cria a passada de pós-processamento (quad de tela cheia + render target). */
export function createOutlinePass(renderer) {
  const target = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
  });

  const color = (hex) => ({ value: new THREE.Color(hex) });
  const material = new THREE.ShaderMaterial({
    vertexShader: postVertex,
    fragmentShader: postFragment,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tScene: { value: target.texture },
      texel: { value: new THREE.Vector2(1, 1) },
      thickness: { value: 1 },
      threshold: { value: 0.11 },
      aspect: { value: 1 },
      pixelRatio: { value: 1 },
      backgroundColor: color(DARK.backgroundColor),
      paintColor: color(OFF.paintColor),
      shadowColor: color(OFF.shadowColor),
      rimColor: color(OFF.rimColor),
      outlineColor: color(OFF.outlineColor),
      outlineBlend: { value: 0.38 },
      contourBlend: { value: 0.62 },
      printColor: color('#1c4c8c'),
      printLineColor: color('#dfe9ff'),
      printMix: { value: 0 },
      gridOpacity: { value: 1 },
      highlightColor: color('#ffb224'),
    },
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    material,
    setSize(width, height, pixelRatio) {
      const w = Math.max(2, Math.round(width * pixelRatio));
      const h = Math.max(2, Math.round(height * pixelRatio));
      target.setSize(w, h);
      material.uniforms.texel.value.set(1 / w, 1 / h);
      material.uniforms.aspect.value = width / height;
      material.uniforms.pixelRatio.value = pixelRatio;
      // ~1 px de CSS de espessura em qualquer densidade de tela
      material.uniforms.thickness.value = Math.max(1, pixelRatio * 0.75);
    },
    render(sceneToDraw, cameraToUse) {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear();
      renderer.render(sceneToDraw, cameraToUse);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
  };
}
