// ---------------------------------------------------------------------------
// callouts.js — rótulos e cotas da vista explodida
//
// Rótulos: <li> fixos em duas colunas. A cada quadro, a âncora 3D de cada peça
// é projetada para pixels e a linha é refeita: um trecho horizontal saindo do
// rótulo e um trecho diagonal (45°) até a peça. O desenho das linhas usa
// createDrawable, que trabalha com pathLength — mudar o `d` a cada quadro é ok.
//
// Cotas: como num desenho técnico, duas medidas acompanham o motor: o
// comprimento total (L) e o diâmetro da moldura (Ø). O valor é calculado ao
// vivo a partir da distância 3D entre as âncoras, então L cresce enquanto o
// motor explode.
//
// Ao aparecer, os nomes chegam com scrambleText; passar o mouse acende a peça,
// clicar leva à técnica correspondente.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { animate, createDrawable, scrambleText, stagger } from 'animejs';
import { PART_LABELS } from './device.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

// para onde cada rótulo leva quando clicado
const TARGETS = {
  tela: '#tecnicas',
  arcos: '[data-feature="svg"]',
  foco: '[data-feature="scroll"]',
  engrenagem: '[data-feature="timeline"]',
  celulas: '[data-feature="stagger"]',
  carcaca: '#arquitetura',
  placa: '#intro',
  mola: '[data-feature="drag"]',
  tampa: '[data-feature="scope"]',
  conector: '#arquitetura',
};

export function createCallouts(stage, rig, { onHover, onNavigate } = {}) {
  const root = document.querySelector('.callouts');
  const left = root.querySelector('.callouts-left');
  const right = root.querySelector('.callouts-right');
  const svg = root.querySelector('.callout-lines');

  const defs = svgEl('defs');
  const arrow = svgEl('marker', {
    id: 'seta', viewBox: '0 0 10 10', refX: '9', refY: '5',
    markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
  });
  arrow.append(svgEl('path', { d: 'M0 1.5 L9 5 L0 8.5', class: 'seta' }));
  defs.append(arrow);
  svg.append(defs);

  const lineGroup = svgEl('g', { class: 'callout-paths' });
  const dimGroup = svgEl('g', { class: 'dims' });
  svg.append(lineGroup, dimGroup);

  // ------------------------------------------------------- rótulos
  const items = PART_LABELS.map((label) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="no">${label.no}</span><span class="name">${label.name}</span>`;
    li.dataset.key = label.key;
    if (TARGETS[label.key]) li.classList.add('is-link');
    (label.side === 'right' ? right : left).append(li);
    const path = svgEl('path');
    const dot = svgEl('circle', { r: '2.5' });
    lineGroup.append(path, dot);
    const item = {
      ...label, li, path, dot,
      name: li.querySelector('.name'),
      anchor: rig.anchors[label.key],
      rect: null,
      p: { x: 0, y: 0 },
    };
    li.addEventListener('mouseenter', () => {
      li.classList.add('is-hot');
      path.classList.add('is-hot');
      onHover?.(label.key, true);
    });
    li.addEventListener('mouseleave', () => {
      li.classList.remove('is-hot');
      path.classList.remove('is-hot');
      onHover?.(label.key, false);
    });
    li.addEventListener('click', () => {
      const target = TARGETS[label.key] && document.querySelector(TARGETS[label.key]);
      if (target) onNavigate?.(target);
    });
    return item;
  });

  const lines = createDrawable(items.map((i) => i.path), 0, 0);

  // --------------------------------------------------------- cotas
  const makeDim = (a, b, side) => {
    const ext1 = svgEl('line', { class: 'dim-ext' });
    const ext2 = svgEl('line', { class: 'dim-ext' });
    const line = svgEl('line', { class: 'dim-line', 'marker-start': 'url(#seta)', 'marker-end': 'url(#seta)' });
    const text = svgEl('text', { class: 'dim-text', 'text-anchor': 'middle' });
    dimGroup.append(ext1, ext2, line, text);
    return { a, b, side, ext1, ext2, line, text, pa: { x: 0, y: 0 }, pb: { x: 0, y: 0 } };
  };
  const dims = [
    makeDim(rig.anchors.frente, rig.anchors.fundo, 1),
    makeDim(rig.anchors.aroA, rig.anchors.aroB, -1),
  ];
  [dims[1].ext1, dims[1].ext2, dims[1].line, dims[1].text].forEach((el) => el.classList.add('dim-d'));
  dims[0].format = (mm) => `L ${mm.toFixed(0)} mm`;
  dims[1].format = (mm) => `Ø ${mm.toFixed(0)} mm`;

  const wa = new THREE.Vector3();
  const wb = new THREE.Vector3();
  const center = { x: 0, y: 0 };

  function updateDim(dim, offset) {
    stage.project(dim.a, dim.pa);
    stage.project(dim.b, dim.pb);
    const { pa, pb } = dim;
    let dx = pb.x - pa.x;
    let dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    // comprimento: a cota fica ao lado do motor, sempre para baixo na tela
    let nx = -dy;
    let ny = dx;
    if (ny < 0) { nx = -nx; ny = -ny; }
    if (dim.side < 0) {
      // diâmetro: a cota fica à frente da moldura, afastando-se do centro do motor
      nx = (pa.x + pb.x) / 2 - center.x;
      ny = (pa.y + pb.y) / 2 - center.y;
      const n = Math.hypot(nx, ny) || 1;
      nx /= n; ny /= n;
    }
    const ax = pa.x + nx * offset;
    const ay = pa.y + ny * offset;
    const bx = pb.x + nx * offset;
    const by = pb.y + ny * offset;
    const set = (el, x1, y1, x2, y2) => {
      el.setAttribute('x1', x1.toFixed(1)); el.setAttribute('y1', y1.toFixed(1));
      el.setAttribute('x2', x2.toFixed(1)); el.setAttribute('y2', y2.toFixed(1));
    };
    set(dim.ext1, pa.x + nx * 6, pa.y + ny * 6, ax + nx * 8, ay + ny * 8);
    set(dim.ext2, pb.x + nx * 6, pb.y + ny * 6, bx + nx * 8, by + ny * 8);
    set(dim.line, ax, ay, bx, by);

    // medida real, em mm (1 unidade do modelo = 10 mm), a partir das posições 3D
    dim.a.getWorldPosition(wa);
    dim.b.getWorldPosition(wb);
    const mm = (wa.distanceTo(wb) / rig.stageRig.scale.x) * 10;
    let angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    const tx = (ax + bx) / 2 + nx * 12;
    const ty = (ay + by) / 2 + ny * 12;
    dim.text.setAttribute('transform', `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) rotate(${angle.toFixed(1)})`);
    dim.text.textContent = dim.format(mm);
  }

  // ---------------------------------------------------------- quadro
  function measure() {
    items.forEach((item) => { item.rect = item.li.getBoundingClientRect(); });
  }

  let live = false;
  let revealed = false;

  function update() {
    const visible = parseFloat(root.style.opacity || '0');
    if (visible < 0.01) {
      root.style.visibility = 'hidden';
      if (live) { live = false; root.classList.remove('is-live'); }
      if (revealed && visible === 0) revealed = false;
      return;
    }
    root.style.visibility = 'visible';
    if (!items[0].rect || !items[0].rect.width) measure();

    // os nomes chegam embaralhados na primeira vez que os rótulos aparecem
    if (!revealed && visible > 0.3) {
      revealed = true;
      animate(items.map((i) => i.name), {
        innerHTML: scrambleText({ chars: 'a-z0-9_', cursor: '_', settleDuration: 260 }),
        delay: stagger(45),
      });
    }
    if (!live && visible > 0.6) { live = true; root.classList.add('is-live'); }
    if (live && visible < 0.6) { live = false; root.classList.remove('is-live'); }

    for (const item of items) {
      if (!item.anchor) continue;
      stage.project(item.anchor, item.p);
      const { rect, p } = item;
      const ly = rect.top + rect.height / 2;
      const isRight = item.side === 'right';
      const lx = isRight ? rect.left - 10 : rect.right + 10;
      const rise = Math.abs(p.y - ly);
      // ponto de quebra: daqui a linha desce/sobe a 45° até a âncora
      let kx = isRight ? p.x + rise : p.x - rise;
      kx = isRight ? Math.min(kx, lx - 16) : Math.max(kx, lx + 16);
      item.path.setAttribute('d', `M${lx.toFixed(1)} ${ly.toFixed(1)}H${kx.toFixed(1)}L${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
      item.dot.setAttribute('cx', p.x.toFixed(1));
      item.dot.setAttribute('cy', p.y.toFixed(1));
    }

    // o pivô do turnRig é o centro do motor
    stage.project(rig.turnRig, center);
    updateDim(dims[1], 30);
    const radius = Math.hypot(dims[1].pa.x - dims[1].pb.x, dims[1].pa.y - dims[1].pb.y) / 2;
    updateDim(dims[0], Math.max(40, radius) + 30);
  }

  window.addEventListener('resize', () => requestAnimationFrame(measure));

  return {
    root,
    items: items.map((i) => i.li),
    lines,
    dots: items.map((i) => i.dot),
    dims: dimGroup,
    update,
    measure,
  };
}
