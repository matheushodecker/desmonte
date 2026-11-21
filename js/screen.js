// ---------------------------------------------------------------------------
// screen.js — a tela do motor feita de DOM real
//
// Dois CSS3DObjects ficam presos à peça "tela":
//   bezel -> anel com 8 arcos (um por técnica) e régua de marcas, na moldura
//   glass -> mostrador da abertura e as demos, rente ao vidro
// Mais uma camada PLANA (#flat-layer), alinhada por projeção ao vidro: o
// Draggable do anime.js precisa de coordenadas sem perspectiva para arrastar.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { BEZEL_DIAMETER } from './device.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const C = 200; // centro do quadro de 400 px

function polar(r, deg) {
  const a = (deg * Math.PI) / 180;
  return [C + Math.cos(a) * r, C + Math.sin(a) * r];
}

function ticks(count, r0, r1, extra = '') {
  let out = '';
  for (let i = 0; i < count; i++) {
    const deg = (i / count) * 360 - 90;
    const [x0, y0] = polar(r0, deg);
    const [x1, y1] = polar(r1, deg);
    out += `<line ${extra} x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}"/>`;
  }
  return out;
}

function arcs(count, r, gap) {
  let bg = '';
  let fg = '';
  const span = 360 / count;
  for (let i = 0; i < count; i++) {
    const a0 = -90 + i * span + gap / 2;
    const a1 = a0 + span - gap;
    const [x0, y0] = polar(r, a0);
    const [x1, y1] = polar(r, a1);
    const d = `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    bg += `<path class="arc-bg" style="--arc: var(--c${i})" d="${d}"/>`;
    fg += `<path class="arc" style="--arc: var(--c${i})" d="${d}"/>`;
  }
  return { bg, fg };
}

export function createScreen(stage, rig) {
  const scale = BEZEL_DIAMETER / 400;

  // --------------------------------------------------- moldura (bezel)
  const bezel = document.createElement('div');
  bezel.className = 'screen screen-bezel';
  const ring = arcs(8, 186, 3);
  bezel.innerHTML = `
    <svg class="screen-ring" viewBox="0 0 400 400" fill="none" stroke-width="6" stroke-linecap="round">
      <g>${ring.bg}</g><g>${ring.fg}</g>
    </svg>
    <svg class="screen-ticks" viewBox="0 0 400 400" stroke-width="1.2">
      ${ticks(120, 171, 177, 'class="tick"')}
    </svg>`;

  // --------------------------------------------------- vidro (glass)
  const glass = document.createElement('div');
  glass.className = 'screen screen-glass';
  glass.innerHTML = `
    <div class="screen-hero">
      <svg class="dial" viewBox="0 0 400 400" stroke-width="1.5" stroke-linecap="round">
        ${ticks(72, 130, 141, 'class="dial-tick"')}
        <circle cx="200" cy="200" r="118" fill="none" stroke="currentColor" stroke-opacity=".12"/>
        <line class="hand" x1="200" y1="200" x2="200" y2="86"/>
      </svg>
      <span class="readout-pulse"></span>
      <div class="readout">
        <span class="readout-label">linha do tempo</span>
        <span class="readout-time"><span class="readout-num">0000</span><small>ms</small></span>
        <span class="readout-label readout-chapter">abertura</span>
      </div>
    </div>
    <div class="demos"></div>
    <div class="screen-hud" aria-hidden="true"></div>
    <div class="screen-scan" aria-hidden="true"></div>`;

  // --------------------------------------------------- camada plana
  const flatLayer = document.createElement('div');
  flatLayer.id = 'flat-layer';
  flatLayer.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden';
  const flat = document.createElement('div');
  flat.className = 'screen screen-flat';
  flat.style.cssText = 'left:0;top:0;transform-origin:200px 200px;will-change:transform';
  flatLayer.appendChild(flat);
  document.body.appendChild(flatLayer);

  // --------------------------------------------------- objetos CSS3D
  const bezelObject = new CSS3DObject(bezel);
  bezelObject.scale.setScalar(scale);
  rig.bezelAnchor.add(bezelObject);

  const glassObject = new CSS3DObject(glass);
  glassObject.scale.setScalar(scale);
  rig.glassAnchor.add(glassObject);

  // o CSS3DObject liga pointer-events; só as demos ativas devem receber eventos
  bezel.style.pointerEvents = 'none';
  glass.style.pointerEvents = 'none';

  // ponto de referência para medir o raio projetado do vidro
  const edge = new THREE.Object3D();
  edge.position.x = BEZEL_DIAMETER / 2;
  rig.glassAnchor.add(edge);

  const center = { x: 0, y: 0 };
  const rim = { x: 0, y: 0 };
  let lastTransform = '';

  /** Alinha a camada plana com o vidro projetado (chamado a cada quadro). */
  function alignFlat() {
    stage.project(rig.glassAnchor, center);
    stage.project(edge, rim);
    const radius = Math.hypot(rim.x - center.x, rim.y - center.y);
    const s = radius / 200;
    const t = `translate3d(${(center.x - C).toFixed(1)}px, ${(center.y - C).toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    if (t !== lastTransform) {
      flat.style.transform = t;
      lastTransform = t;
    }
  }

  // backface-visibility não basta dentro do CSS3DRenderer: quando a tela fica
  // de costas para a câmera (motor girado), as duas camadas DOM são escondidas
  const normal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  let facing = true;
  function updateFacing() {
    rig.glassAnchor.getWorldPosition(position);
    rig.glassAnchor.getWorldQuaternion(rotation);
    normal.set(0, 0, 1).applyQuaternion(rotation);
    toCamera.copy(stage.camera.position).sub(position).normalize();
    const now = normal.dot(toCamera) > 0.06;
    if (now !== facing) {
      facing = now;
      stage.css.domElement.style.visibility = now ? '' : 'hidden';
      flatLayer.style.visibility = now ? '' : 'hidden';
    }
  }

  const q = (sel, root = glass) => root.querySelector(sel);
  const qa = (sel, root = glass) => [...root.querySelectorAll(sel)];

  return {
    bezel, glass, flat,
    bezelObject, glassObject,
    arcs: qa('.arc', bezel),
    arcsBg: qa('.arc-bg', bezel),
    bezelTicks: qa('.tick', bezel),
    hero: q('.screen-hero'),
    dialTicks: qa('.dial-tick'),
    hand: q('.hand'),
    pulse: q('.readout-pulse'),
    readoutNum: q('.readout-num'),
    readoutChapter: q('.readout-chapter'),
    demos: q('.demos'),
    hud: q('.screen-hud'),
    scan: q('.screen-scan'),
    alignFlat,
    updateFacing,
  };
}
