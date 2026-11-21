// ---------------------------------------------------------------------------
// device.js — o "motor": um objeto mecânico gerado 100% em código
//
// O site original carrega 20 modelos .glb feitos no Blender. Aqui cada peça é
// montada com primitivas do three.js (cilindros, anéis extrudados, engrenagens,
// tubos). O eixo do motor é Z: a tela fica em +Z, virada para a câmera.
//
// Hierarquia (cada nível é animado por uma fonte diferente, sem conflito):
//   stageRig  -> x/y/z (enquadramento) e escala          ← timeline mestra
//   mouseRig  -> rotateX/rotateY pela posição do mouse     ← createAnimatable
//   spinRig   -> rotateY ao arrastar o motor no início     ← createDraggable
//   tiltRig   -> rotateZ (inclinação no plano da tela)    ← timeline mestra
//   turnRig   -> rotateX/rotateY (orientação do objeto)   ← timeline mestra
//   device    -> z (mantém o centro do motor no pivô) e as peças
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPartMaterial } from './toon.js';

const TAU = Math.PI * 2;

// cilindro com o eixo em Z (o three.js cria cilindros em Y)
function cylinder(radius, height, segments = 72, radiusTop = radius) {
  const g = new THREE.CylinderGeometry(radiusTop, radius, height, segments, 1);
  g.rotateX(Math.PI / 2);
  return g;
}

// anel (coroa circular) extrudado em Z e centrado na origem
function ring(rOuter, rInner, depth, segments = 96) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuter, 0, TAU, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rInner, 0, TAU, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: segments });
  g.translate(0, 0, -depth / 2);
  return g;
}

// arco grosso (um pedaço de anel), usado para o reflexo do vidro
function arcSlab(rOuter, rInner, a0, a1, depth) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuter, a0, a1, false);
  shape.absarc(0, 0, rInner, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 48 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// engrenagem de dentes trapezoidais
function gear(teeth, rRoot, rTip, rHole, depth) {
  const shape = new THREE.Shape();
  const step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [[rRoot, a], [rTip, a + step * 0.2], [rTip, a + step * 0.46], [rRoot, a + step * 0.66]];
    pts.forEach(([r, t], j) => {
      const x = Math.cos(t) * r;
      const y = Math.sin(t) * r;
      if (i === 0 && j === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, rHole, 0, TAU, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 64 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// repete uma geometria em volta do eixo Z e junta tudo numa malha só
function around(makeGeometry, count, radius, { startAngle = 0, arc = TAU, z = 0 } = {}) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const a = startAngle + (arc === TAU ? (i / count) * arc : (i / (count - 1)) * arc);
    const g = makeGeometry(i);
    g.rotateZ(a);
    g.translate(Math.cos(a) * radius, Math.sin(a) * radius, z);
    list.push(g);
  }
  return merge(list);
}

function merge(list) {
  const clean = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const key of Object.keys(n.attributes)) {
      if (key !== 'position' && key !== 'normal') n.deleteAttribute(key);
    }
    return n;
  });
  return mergeGeometries(clean);
}

/**
 * Peças e rótulos. `side` decide em que coluna o rótulo aparece na vista
 * explodida; a ordem do array é a ordem de cima para baixo em cada coluna.
 */
export const PART_LABELS = [
  // coluna da direita (topo): peças do fundo do motor, que ficam no alto à direita
  { key: 'conector', no: 'p-10', name: 'adaptador three', side: 'right' },
  { key: 'tampa', no: 'p-09', name: 'createScope', side: 'right' },
  { key: 'mola', no: 'p-08', name: 'spring', side: 'right' },
  { key: 'aletas', no: 'p-07', name: 'shader de contorno', side: 'right' },
  { key: 'placa', no: 'p-06', name: 'splitText', side: 'right' },
  { key: 'carcaca', no: 'p-05', name: 'WebGLRenderer', side: 'right' },
  // coluna da esquerda (base): peças da frente, embaixo à esquerda
  { key: 'celulas', no: 'p-04', name: 'stagger', side: 'left' },
  { key: 'engrenagem', no: 'p-03', name: 'createTimeline', side: 'left' },
  { key: 'foco', no: 'p-02', name: 'onScroll', side: 'left' },
  { key: 'tela', no: 'p-01', name: 'CSS3DRenderer', side: 'left' },
  { key: 'arcos', no: 'p-11', name: 'createDrawable', side: 'left' },
];

/** Diâmetro externo da moldura da tela, em unidades do mundo. */
export const BEZEL_DIAMETER = 20.8;

/** Distância do pivô até a tela: o centro do motor fica no pivô. */
export const PIVOT_Z = 17.5;

export function buildDevice() {
  const stageRig = new THREE.Group();
  const mouseRig = new THREE.Group();
  const spinRig = new THREE.Group();
  const tiltRig = new THREE.Group();
  const turnRig = new THREE.Group();
  const device = new THREE.Group();
  stageRig.add(mouseRig);
  mouseRig.add(spinRig);
  spinRig.add(tiltRig);
  tiltRig.add(turnRig);
  turnRig.add(device);
  device.position.z = PIVOT_Z;

  const parts = {};
  const anchors = {};
  const groups = [];

  const addPart = (key, z) => {
    const g = new THREE.Group();
    g.name = key;
    g.position.z = z;
    g.userData.baseZ = z;
    device.add(g);
    parts[key] = g;
    groups.push(g);
    return g;
  };

  const mesh = (geometry, parent, opts) => {
    const m = new THREE.Mesh(geometry, createPartMaterial(opts));
    parent.add(m);
    return m;
  };

  // grupo intermediário: a timeline mestra gira a malha, o laço de desenho gira o grupo
  const spinner = (parent) => {
    const g = new THREE.Group();
    parent.add(g);
    return g;
  };

  const anchor = (key, parent, x, y, z) => {
    const a = new THREE.Object3D();
    a.position.set(x, y, z);
    parent.add(a);
    anchors[key] = a;
    return a;
  };

  // ---------------------------------------------------------- p-01 tela
  const tela = addPart('tela', 0);
  mesh(ring(10.4, 8.9, 2.2), tela);
  mesh(around(() => new THREE.BoxGeometry(0.5, 0.36, 1.5), 40, 10.42), tela);
  mesh(ring(8.95, 8.2, 0.7), tela).position.z = 0.5;
  mesh(cylinder(8.3, 0.3), tela, { tone: 0.15 }).position.z = 0.22; // vidro escuro
  mesh(arcSlab(7.6, 6.9, Math.PI * 0.58, Math.PI * 0.9, 0.06), tela, { tone: 0.6 }).position.z = 0.42;
  mesh(cylinder(9.7, 0.9), tela).position.z = -1.45;
  anchor('tela', tela, -4, -4, 0.6);
  anchor('arcos', tela, 7.2, -7.2, 1.15);
  // pontas das cotas: frente do motor e bordas da moldura
  anchor('frente', tela, 0, 0, 1.1);
  anchor('aroA', tela, 0, 10.4, 1.1);
  anchor('aroB', tela, 0, -10.4, 1.1);

  // as duas superfícies onde o DOM da tela é "colado" pelo CSS3DRenderer
  const glassAnchor = new THREE.Object3D();
  glassAnchor.position.z = 0.42;
  tela.add(glassAnchor);
  const bezelAnchor = new THREE.Object3D();
  bezelAnchor.position.z = 1.13;
  tela.add(bezelAnchor);

  // ---------------------------------------------------------- p-02 anel de foco
  const foco = addPart('foco', -3.1);
  mesh(cylinder(9.45, 2.6), foco);
  const knurlSpin = spinner(foco);
  const knurl = mesh(around(() => new THREE.BoxGeometry(0.42, 0.42, 2.3), 72, 9.55), knurlSpin);
  knurl.name = 'serrilhado';
  anchor('foco', foco, 0, -9.6, 0);

  // ---------------------------------------------------------- p-03 engrenagem
  const engrenagem = addPart('engrenagem', -5.9);
  const gearSpin = spinner(engrenagem);
  const gearMesh = mesh(gear(40, 9.25, 10.15, 6.1, 1.3), gearSpin);
  gearMesh.name = 'dentes';
  mesh(ring(6.15, 3.9, 2.6), engrenagem);
  anchor('engrenagem', engrenagem, 0, -10, 0);

  // ---------------------------------------------------------- p-04 células
  const celulas = addPart('celulas', -10);
  mesh(ring(9.3, 3.1, 0.45), celulas).position.z = 2.45;
  mesh(ring(9.3, 3.1, 0.45), celulas).position.z = -2.45;
  mesh(cylinder(3.0, 5.4), celulas);
  const cells = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const cell = new THREE.Group();
    cell.userData.dir = new THREE.Vector2(Math.cos(a), Math.sin(a));
    cell.position.set(Math.cos(a) * 6.05, Math.sin(a) * 6.05, 0);
    mesh(cylinder(2.2, 4.1, 40), cell);
    mesh(ring(2.32, 2.0, 0.55, 40), cell).position.z = 0.9;
    mesh(cylinder(1.15, 0.6, 24), cell).position.z = 2.3;
    celulas.add(cell);
    cells.push(cell);
  }
  anchor('celulas', cells[4], 0, 0, 1.2);

  // ---------------------------------------------------------- p-05 carcaça + p-06 placa
  const carcaca = addPart('carcaca', -16);
  mesh(cylinder(10, 6.6), carcaca);
  mesh(ring(10.3, 9.2, 0.7), carcaca).position.z = 3.1;
  mesh(ring(10.3, 9.2, 0.7), carcaca).position.z = -3.1;
  mesh(around(() => new THREE.BoxGeometry(0.34, 0.62, 4.4), 9, 10.05, { startAngle: Math.PI * 0.95, arc: Math.PI * 0.42 }), carcaca);
  const placa = new THREE.Group();
  const plateAngle = Math.PI * 0.12;
  placa.userData.dir = new THREE.Vector2(Math.cos(plateAngle), Math.sin(plateAngle));
  placa.position.set(Math.cos(plateAngle) * 10.12, Math.sin(plateAngle) * 10.12, 0);
  placa.rotation.z = plateAngle;
  mesh(new THREE.BoxGeometry(0.3, 3.4, 5.2), placa);
  for (const [y, z] of [[-1.25, -2.1], [1.25, -2.1], [-1.25, 2.1], [1.25, 2.1]]) {
    const screw = mesh(cylinder(0.24, 0.2, 12), placa);
    screw.rotation.y = Math.PI / 2;
    screw.position.set(0.22, y, z);
  }
  carcaca.add(placa);
  anchor('carcaca', carcaca, -6, 6, 1.5);
  anchor('placa', placa, 0.4, 0, 0);

  // ---------------------------------------------------------- p-07 aletas
  const aletas = addPart('aletas', -22.4);
  mesh(cylinder(6.2, 6.8), aletas);
  const fins = [];
  for (let i = 0; i < 10; i++) {
    const z = -2.9 + i * 0.64;
    const fin = mesh(cylinder(9.7, 0.3, 72), aletas);
    fin.position.z = z;
    fin.userData.baseZ = z;
    fins.push(fin);
  }
  anchor('aletas', aletas, 0, 9.7, 0);

  // ---------------------------------------------------------- p-08 mola
  const mola = addPart('mola', -27.6);
  const turns = 6;
  const helix = new THREE.Curve();
  helix.getPoint = (t, target = new THREE.Vector3()) => {
    const a = t * turns * TAU;
    return target.set(Math.cos(a) * 5.8, Math.sin(a) * 5.8, (t - 0.5) * 3.8);
  };
  const spring = mesh(new THREE.TubeGeometry(helix, 360, 0.42, 10, false), mola);
  spring.name = 'espiral';
  mesh(ring(7.2, 2.4, 0.4), mola).position.z = 2.25;
  mesh(ring(7.2, 2.4, 0.4), mola).position.z = -2.25;
  mesh(cylinder(1.6, 4.9, 32), mola);
  anchor('mola', mola, 0, 5.8, 0);

  // ---------------------------------------------------------- p-09 tampa
  const tampa = addPart('tampa', -31.6);
  const profile = [
    new THREE.Vector2(0, -1.05), new THREE.Vector2(9.4, -1.05), new THREE.Vector2(10.2, -0.55),
    new THREE.Vector2(10.2, 0.6), new THREE.Vector2(9.7, 1.05), new THREE.Vector2(0, 1.05),
  ];
  const lathe = new THREE.LatheGeometry(profile, 72);
  lathe.rotateX(Math.PI / 2);
  mesh(lathe, tampa);
  const dome = new THREE.SphereGeometry(5.2, 48, 16, 0, TAU, 0, Math.PI / 2);
  dome.rotateX(-Math.PI / 2);
  dome.scale(1, 1, 0.42);
  mesh(dome, tampa).position.z = -1.05;
  const bolts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const bolt = new THREE.Group();
    bolt.position.set(Math.cos(a) * 7.7, Math.sin(a) * 7.7, -1.05);
    bolt.userData.baseZ = -1.05;
    mesh(cylinder(0.95, 0.16, 24), bolt).position.z = -0.08;
    mesh(cylinder(0.72, 0.62, 6), bolt).position.z = -0.45;
    tampa.add(bolt);
    bolts.push(bolt);
  }
  anchor('tampa', tampa, 0, -10.2, 0);

  // ---------------------------------------------------------- p-10 conector
  const conector = addPart('conector', -35.4);
  mesh(new THREE.BoxGeometry(6.6, 3.8, 2.6), conector);
  mesh(new THREE.BoxGeometry(5.4, 2.8, 0.5), conector).position.z = -1.5;
  for (const x of [-2.1, -0.7, 0.7, 2.1]) {
    mesh(cylinder(0.32, 2.4, 16), conector).position.set(x, 0, -2.6);
  }
  const cable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -1.9, 0.2), new THREE.Vector3(0, -4.5, -0.4),
    new THREE.Vector3(0, -6.5, -3.4), new THREE.Vector3(0, -7.4, -7.5),
  ]);
  mesh(new THREE.TubeGeometry(cable, 48, 0.75, 14, false), conector);
  anchor('conector', conector, 0, 1.9, -0.6);
  anchor('fundo', conector, 0, 0, -3.8);

  // malhas de cada peça (para o destaque ao passar o mouse nos rótulos)
  for (const [key, group] of Object.entries(parts)) {
    const list = [];
    group.traverse((o) => { if (o.isMesh) list.push(o); });
    group.userData.meshes = list;
  }
  parts.placa = placa;
  placa.userData.meshes = [];
  placa.traverse((o) => { if (o.isMesh) placa.userData.meshes.push(o); });
  const plateMeshes = new Set(placa.userData.meshes);
  carcaca.userData.meshes = carcaca.userData.meshes.filter((m) => !plateMeshes.has(m));
  parts.arcos = tela;

  return {
    stageRig, mouseRig, spinRig, tiltRig, turnRig, device,
    parts, groups, anchors,
    glassAnchor, bezelAnchor,
    cells, bolts, fins, placa, knurl, gearMesh, spring,
    knurlSpin, gearSpin,
  };
}
