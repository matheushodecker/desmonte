// ---------------------------------------------------------------------------
// main.js — o orquestrador
//
// A ideia central (a mesma do site do anime.js):
//
//   1. UMA timeline mestra, escrita em milissegundos, com um label por capítulo
//      (HERO, PECAS, TECNICAS...) e um label _END para cada um.
//   2. Uma timeline "scroller" ligada ao scroll da página inteira. Para cada
//      capítulo ela anima um objeto proxy { time } de LABEL até LABEL_END, com
//      duração igual à altura do capítulo em pixels.
//   3. A cada atualização do scroller: master.seek(proxy.time).
//
// Resultado: a animação é escrita em tempo, o layout é escrito em altura, e um
// capítulo pode ficar mais longo ou mais curto sem reescrever nenhuma animação.
// ---------------------------------------------------------------------------
import 'animejs/adapters/three'; // registra o adaptador: x, rotateY, uniforms...
import {
  animate, createDrawable, createScope, createTimeline, createTimer, onScroll,
  scrambleText, splitText, stagger, utils,
} from 'animejs';
import { createStage } from './stage.js';
import { buildDevice, PIVOT_Z } from './device.js';
import { DARK, OFF } from './toon.js';
import { createScreen } from './screen.js';
import { createDemos } from './demos.js';
import { createCallouts } from './callouts.js';
import { createHero } from './hero.js';
import { createChart } from './chart.js';
import { createInteraction } from './interaction.js';
import { createReveals } from './reveals.js';
import {
  setupChrome, createCodeCards, createRuler, maxScroll, pageTop, scrollToTarget,
} from './chrome.js';

// avisa o script de segurança do <head> que o módulo carregou; expõe o estado para depurar no console
window.__desmonte = { get master() { return master; }, get proxy() { return proxy; } };

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?nosmooth desliga a suavização do scroll (útil para depurar e testar)
const SYNC = reducedMotion || /[?&]nosmooth/.test(window.location.search) ? true : 0.9;
const startHash = window.location.hash.slice(1);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const chapters = [...document.querySelectorAll('[data-chapter]')];
const features = [...document.querySelectorAll('.feature')];
const featureKeys = features.map((f) => f.dataset.feature);

// ------------------------------------------------------------- montagem
const stage = createStage({
  container: document.getElementById('engine'),
  cssLayer: document.getElementById('screen-layer'),
});
if (!stage.hasWebGL) document.body.classList.add('no-webgl');

const rig = buildDevice();
stage.scene.add(rig.stageRig);

const screen = createScreen(stage, rig);
const demos = createDemos(screen, featureKeys);
const interaction = createInteraction({ stage, rig, reducedMotion });
const callouts = createCallouts(stage, rig, {
  onHover: interaction.highlightPart,
  onNavigate: (el) => scrollToTarget(el, reducedMotion),
});
const hero = createHero({ reducedMotion });
const chart = createChart();
const cards = createCodeCards();
const ruler = createRuler(chapters, { reducedMotion });
const reveals = createReveals({ reducedMotion });
setupChrome({ reducedMotion });

const arcs = createDrawable(screen.arcs, 0, 0);
// os títulos das técnicas viram letras: entram esticando a largura da fonte
const featureChars = features.map((f) => splitText(f.querySelector('h2'), { chars: { class: 'char' }, accessible: true }).chars);
// sem WebGL, as cores do shader viram um objeto comum (o anime.js anima igual)
const shader = stage.post ? stage.post.material : { ...DARK, ...OFF, printMix: 0 };

const CELL_R = 6.05;
const PLATE_R = 10.12;
const CHAPTER_NAMES = {
  INTRO: 'abertura', HERO: 'início', PECAS: 'peças', TECNICAS: 'técnicas',
  ARQUITETURA: 'arquitetura', CREDITOS: 'créditos', COMECAR: 'montagem',
};

// início de cada capítulo na timeline mestra (ms)
const T = {
  INTRO: 0, HERO: 2200, PECAS: 3200, TECNICAS: 6200,
  ARQUITETURA: 7200, CREDITOS: 9200, COMECAR: 10200, END: 11200,
};

// enquadramentos do motor (x, y, z do stageRig) para tela larga e estreita
function framing(md) {
  return md ? {
    hero: [5.5, 0, -PIVOT_Z], heroOut: [0, 0.5, -PIVOT_Z - 6],
    side: [0, -0.5, -42], tilt: 22,
    tech: [0, 0.4, -23.5],
    arq: [2.5, 0, -66], cred: [16, -1, -50], end: [27, 7, -70],
  } : {
    hero: [0, -5.5, -62], heroOut: [0, -3, -70],
    side: [0, -1, -165], tilt: 52,
    tech: [0, 4.6, -58],
    arq: [0, 3, -230], cred: [0, -12, -100], end: [0, 9, -124],
  };
}

const xyz = ([x, y, z]) => ({ x, y, z });
const cellPos = (k) => ({
  x: (c) => c.userData.dir.x * CELL_R * k,
  y: (c) => c.userData.dir.y * CELL_R * k,
});
const platePos = (extra) => ({
  x: rig.placa.userData.dir.x * (PLATE_R + extra),
  y: rig.placa.userData.dir.y * (PLATE_R + extra),
});

function resetScene(F) {
  utils.set(rig.stageRig, { ...xyz(F.hero), scale: 1 });
  utils.set(rig.tiltRig, { rotateZ: 0 });
  utils.set(rig.turnRig, { rotateX: 0, rotateY: 0 });
  utils.set(rig.device, { z: PIVOT_Z });
  rig.groups.forEach((g) => utils.set(g, { z: g.userData.baseZ }));
  rig.fins.forEach((f) => utils.set(f, { z: f.userData.baseZ }));
  rig.bolts.forEach((b) => utils.set(b, { z: b.userData.baseZ, rotateZ: 0 }));
  utils.set(rig.cells, cellPos(1));
  utils.set(rig.placa, platePos(0));
  utils.set([rig.knurl, rig.gearMesh], { rotateZ: 0 });
  utils.set(rig.spring, { scaleZ: 1 });
  utils.set(shader, { ...OFF, printMix: 0 });
}

// --------------------------------------------------------- timeline mestra
function buildMaster(F) {
  const tl = createTimeline({ autoplay: false, defaults: { ease: 'inOut(3)' } });
  const screenLayers = [screen.bezel, screen.glass];

  // ABERTURA — tocada por tempo no carregamento: o motor se monta e "liga".
  // As peças chegam explodidas e deslizam até o lugar, do fundo para a frente,
  // enquanto o motor vira de frente para você.
  tl.label('INTRO', T.INTRO)
    .add(rig.turnRig, { rotateY: [-68, 0], rotateX: [-14, 0], duration: 2000 }, 0)
    .add(rig.stageRig, { scale: [0.86, 1], duration: 2000, ease: 'out(3)' }, 0)
    .add(rig.device, { z: [PIVOT_Z * 2.3, PIVOT_Z], duration: 1500, ease: 'out(4)' }, 150)
    .add(rig.groups, {
      z: { from: (g) => g.userData.baseZ * 2.3, to: (g) => g.userData.baseZ },
      duration: 1200,
      delay: stagger(70, { from: 'last' }),
      ease: 'out(4)',
    }, 100)
    .add(rig.fins, { z: { from: (f) => f.userData.baseZ * 2.2 }, duration: 900, delay: stagger(25, { from: 'center' }), ease: 'out(4)' }, 450)
    .add(rig.cells, {
      x: { from: (c) => c.userData.dir.x * CELL_R * 1.9 },
      y: { from: (c) => c.userData.dir.y * CELL_R * 1.9 },
      duration: 900,
      delay: stagger(60),
      ease: 'out(4)',
    }, 500)
    .add(rig.placa, {
      x: { from: rig.placa.userData.dir.x * (PLATE_R + 5) },
      y: { from: rig.placa.userData.dir.y * (PLATE_R + 5) },
      duration: 800,
      ease: 'out(4)',
    }, 800)
    .add(rig.bolts, { z: { from: (b) => b.userData.baseZ - 3 }, rotateZ: { from: -540 }, duration: 800, delay: stagger(40), ease: 'out(3)' }, 900)
    .add(rig.spring, { scaleZ: [2.4, 1], duration: 1100, ease: 'out(4)' }, 250)
    .add(rig.knurl, { rotateZ: { from: -120 }, duration: 1600, ease: 'out(3)' }, 300)
    .add(rig.gearMesh, { rotateZ: { from: 60 }, duration: 1600, ease: 'out(3)' }, 300)
    .add(shader, { paintColor: DARK.paintColor, shadowColor: DARK.shadowColor, duration: 1800, ease: 'out(2)' }, 0)
    .add(shader, { outlineColor: DARK.outlineColor, duration: 700 }, 200)
    .add(shader, { rimColor: DARK.rimColor, duration: 1400, ease: 'out(2)' }, 600)
    .add(screenLayers, { opacity: [0, 1], duration: 300, ease: 'linear' }, 1300)
    .add(screen.bezelTicks, { opacity: [0, 0.35], duration: 260, delay: stagger(5), ease: 'out(2)' }, 1300)
    .add(screen.arcsBg, { opacity: [0, 1], duration: 260, delay: stagger(70), ease: 'out(2)' }, 1500)
    .add(screen.hero, { opacity: [0, 1], duration: 400, ease: 'linear' }, 1600)
    .add(screen.dialTicks, { opacity: [0, 0.22], duration: 200, delay: stagger(6), ease: 'out(2)' }, 1500)
    .label('INTRO_END', T.HERO)

  // INÍCIO — o mostrador conta o tempo, o motor gira para a vista 3/4
    .label('HERO', T.HERO)
    .add(screen.dialTicks, { opacity: [0.22, 1], duration: 60, delay: stagger(10), ease: 'linear' }, 'HERO')
    .add(screen.hand, { rotate: [0, 360], duration: 1000, ease: 'linear' }, 'HERO')
    .add('.hero-foot', { y: [0, 160], opacity: [1, 0], duration: 350, ease: 'in(2)' }, 'HERO')
    .add(rig.turnRig, { rotateY: -24, rotateX: 14, duration: 800 }, 'HERO+=150')
    .add(rig.tiltRig, { rotateZ: 6, duration: 800 }, 'HERO+=150')
    .add(rig.stageRig, { ...xyz(F.heroOut), duration: 800 }, 'HERO+=150')
    .add('.progress-card', { opacity: [0, 1], y: ['100%', '0%'], duration: 250, ease: 'out(2)' }, 'HERO+=650')
    .add(screenLayers, { opacity: 0, duration: 230, ease: 'linear' }, 'HERO+=740')
    .label('HERO_END', T.PECAS)

  // PEÇAS — a planta azul varre a tela, o motor explode, rótulos e cotas, remonta
    .label('PECAS', T.PECAS)
    .add(screen.hero, { opacity: 0, duration: 10, ease: 'linear' }, 'PECAS+=300')
    .add(shader, { printMix: [0, 1], duration: 450, ease: 'linear' }, 'PECAS+=30')
    .add('#pecas .fixed-section', { opacity: [0.001, 1], duration: 200, ease: 'linear' }, 'PECAS+=250')
    .add(rig.turnRig, { rotateY: -90, rotateX: 10, duration: 900 }, 'PECAS')
    .add(rig.tiltRig, { rotateZ: F.tilt, duration: 900 }, 'PECAS')
    .add(rig.stageRig, { ...xyz(F.side), duration: 900 }, 'PECAS')
    .add(rig.groups, { z: (g) => g.userData.baseZ * 1.55, duration: 900, delay: stagger(40) }, 'PECAS+=350')
    .add(rig.device, { z: PIVOT_Z * 1.55, duration: 1260 }, 'PECAS+=350')
    .add(rig.cells, { ...cellPos(1.45), duration: 700, delay: stagger(40) }, 'PECAS+=600')
    .add(rig.fins, { z: (f) => f.userData.baseZ * 1.8, duration: 700, delay: stagger(20, { from: 'center' }) }, 'PECAS+=600')
    .add(rig.bolts, { z: (b) => b.userData.baseZ - 2.4, duration: 600, delay: stagger(30) }, 'PECAS+=700')
    .add(rig.placa, { ...platePos(2.6), duration: 600 }, 'PECAS+=750')
    .add(rig.spring, { scaleZ: 1.7, duration: 700 }, 'PECAS+=650')
    .add(callouts.root, { opacity: [0, 1], duration: 150, ease: 'linear' }, 'PECAS+=1150')
    .add(callouts.items, { opacity: [0, 1], duration: 250, delay: stagger(25), ease: 'out(2)' }, 'PECAS+=1150')
    .add(callouts.lines, { draw: ['0 0', '0 1'], duration: 300, delay: stagger(25), ease: 'out(3)' }, 'PECAS+=1200')
    .add(callouts.dots, { scale: [0, 1], duration: 200, delay: stagger(25), ease: 'out(3)' }, 'PECAS+=1380')
    .add(callouts.dims, { opacity: [0, 1], duration: 220, ease: 'linear' }, 'PECAS+=1300')
    .add(rig.turnRig, { rotateY: -116, rotateX: 24, duration: 1000, ease: 'inOut(2)' }, 'PECAS+=1450')
    .add(callouts.lines, { draw: '1 1', duration: 250, delay: stagger(20), ease: 'in(2)' }, 'PECAS+=2450')
    .add(callouts.items, { opacity: 0, duration: 200, delay: stagger(20), ease: 'in(2)' }, 'PECAS+=2450')
    .add(callouts.dots, { scale: 0, duration: 150, ease: 'in(2)' }, 'PECAS+=2450')
    .add(callouts.dims, { opacity: 0, duration: 150, ease: 'linear' }, 'PECAS+=2400')
    .add(callouts.root, { opacity: 0, duration: 100, ease: 'linear' }, 'PECAS+=2720')
    .add('#pecas .fixed-section', { opacity: 0.001, duration: 200, ease: 'linear' }, 'PECAS+=2450')
    .add(shader, { printMix: 0, duration: 450, ease: 'linear' }, 'PECAS+=2380')
    .add(rig.groups, { z: (g) => g.userData.baseZ, duration: 500, delay: stagger(25, { from: 'last' }) }, 'PECAS+=2450')
    .add(rig.device, { z: PIVOT_Z, duration: 700 }, 'PECAS+=2450')
    .add(rig.cells, { ...cellPos(1), duration: 400 }, 'PECAS+=2450')
    .add(rig.fins, { z: (f) => f.userData.baseZ, duration: 400 }, 'PECAS+=2450')
    .add(rig.bolts, { z: (b) => b.userData.baseZ, duration: 400 }, 'PECAS+=2450')
    .add(rig.placa, { ...platePos(0), duration: 400 }, 'PECAS+=2450')
    .add(rig.spring, { scaleZ: 1, duration: 400 }, 'PECAS+=2450')
    .add(rig.turnRig, { rotateY: 0, rotateX: 0, duration: 550 }, 'PECAS+=2450')
    .add(rig.tiltRig, { rotateZ: 0, duration: 550 }, 'PECAS+=2450')
    .add(rig.stageRig, { ...xyz(F.tech), duration: 550 }, 'PECAS+=2450')
    .add(screenLayers, { opacity: 1, duration: 180, ease: 'linear' }, 'PECAS+=2820')
    .label('PECAS_END', T.TECNICAS)

  // TÉCNICAS — as demos são guiadas pela timeline própria; aqui só mecânica
    .label('TECNICAS', T.TECNICAS)
    .add(rig.knurl, { rotateZ: -140, duration: 1000, ease: 'linear' }, 'TECNICAS')
    .add(rig.gearMesh, { rotateZ: 100, duration: 1000, ease: 'linear' }, 'TECNICAS')
    .add(rig.stageRig, { z: F.tech[2] + 1.6, duration: 1000, ease: 'linear' }, 'TECNICAS')
    .label('TECNICAS_END', T.ARQUITETURA)

  // ARQUITETURA — a planta varre de novo, vista de cima, "lista de materiais"
    .label('ARQUITETURA', T.ARQUITETURA)
    .add(screenLayers, { opacity: 0, duration: 200, ease: 'linear' }, 'ARQUITETURA')
    .add(shader, { printMix: 1, duration: 450, ease: 'linear' }, 'ARQUITETURA+=40')
    .add('#arquitetura .fixed-section', { opacity: [0.001, 1], duration: 200, ease: 'linear' }, 'ARQUITETURA+=260')
    .add(rig.turnRig, { rotateX: -40, rotateY: 38, duration: 900 }, 'ARQUITETURA')
    .add(rig.tiltRig, { rotateZ: -18, duration: 900 }, 'ARQUITETURA')
    .add(rig.stageRig, { ...xyz(F.arq), duration: 900 }, 'ARQUITETURA')
    .add(rig.groups, { z: (g) => g.userData.baseZ * 1.6, duration: 900, delay: stagger(30, { from: 'last' }) }, 'ARQUITETURA+=200')
    .add(rig.device, { z: PIVOT_Z * 1.6, duration: 1170 }, 'ARQUITETURA+=200')
    .add(rig.cells, { ...cellPos(1.6), duration: 600, delay: stagger(30) }, 'ARQUITETURA+=400')
    .add(rig.turnRig, { rotateY: 70, duration: 900, ease: 'inOut(2)' }, 'ARQUITETURA+=1000')
    .add('#arquitetura .fixed-section', { opacity: 0.001, duration: 200, ease: 'linear' }, 'ARQUITETURA+=1300')
    .add(shader, { printMix: 0, duration: 450, ease: 'linear' }, 'ARQUITETURA+=1280')
    .label('ARQUITETURA_END', T.CREDITOS)

  // CRÉDITOS — remonta e mostra o fundo do motor
    .label('CREDITOS', T.CREDITOS)
    .add(rig.groups, { z: (g) => g.userData.baseZ, duration: 600, delay: stagger(20) }, 'CREDITOS')
    .add(rig.device, { z: PIVOT_Z, duration: 700 }, 'CREDITOS')
    .add(rig.cells, { ...cellPos(1), duration: 500 }, 'CREDITOS')
    .add(rig.turnRig, { rotateX: 8, rotateY: 200, duration: 1000, ease: 'inOut(2)' }, 'CREDITOS')
    .add(rig.tiltRig, { rotateZ: 0, duration: 800 }, 'CREDITOS')
    .add(rig.stageRig, { ...xyz(F.cred), duration: 800 }, 'CREDITOS')
    .label('CREDITOS_END', T.COMECAR)

  // COMEÇAR — de frente outra vez, com o anel completo aceso
    .label('COMECAR', T.COMECAR)
    .add(rig.turnRig, { rotateX: 0, rotateY: 360, duration: 800 }, 'COMECAR')
    .add(rig.stageRig, { ...xyz(F.end), duration: 800 }, 'COMECAR')
    .add(screenLayers, { opacity: 1, duration: 300, ease: 'linear' }, 'COMECAR+=450')
    .add(screen.hero, { opacity: 1, duration: 300, ease: 'linear' }, 'COMECAR+=450')
    .label('COMECAR_END', T.END)
    // labels não estendem a duração: um timer vazio garante que ela chegue ao fim
    .add({ duration: 1 }, 'COMECAR_END-=1');

  return tl.init(); // renderiza o estado inicial de todos os filhos
}

// ------------------------------------------- scroll -> tempo da mestra
const proxy = { time: 0 };
let master = null;
let introDone = false;
const seekMaster = (t) => master.seek(utils.clamp(t, 0, master.duration));

function buildScroller() {
  const max = maxScroll();
  const scroller = createTimeline({
    autoplay: onScroll({
      target: document.body,
      enter: 'max', // o observador cobre do scroll 0 ao scroll máximo
      leave: 'min',
      sync: SYNC, // 0.9: segue o scroll com leve suavização
      onUpdate: (self) => ruler.setProgress(self.progress),
    }),
    defaults: { ease: 'linear', composition: 'none' },
    onUpdate: () => { if (introDone) seekMaster(proxy.time); },
  });
  chapters.forEach((chapter, i) => {
    const start = i === 0 ? 0 : pageTop(chapter);
    const end = i < chapters.length - 1 ? pageTop(chapters[i + 1]) : max;
    const label = chapter.dataset.label;
    scroller.add(proxy, {
      time: [master.labels[label], master.labels[`${label}_END`]],
      duration: Math.max(1, end - start),
    }, start);
  });
  return scroller;
}

// ------------------------------------------ técnicas: timeline própria
let activeFeature = -1;
let featuresTl = null;

// a tela troca de demo como um tubo de TV: a antiga colapsa numa linha,
// a nova se abre a partir de uma linha, e um traço de luz atravessa o vidro
function crtOn(el) {
  createTimeline({ defaults: { composition: 'replace' } })
    .add(screen.scan, {
      opacity: [{ to: 1, duration: 60 }, { to: 0, duration: 320 }],
      scaleX: [0.15, 1],
      duration: 380,
      ease: 'out(3)',
    }, 0)
    .add(el, { opacity: [0, 1], scaleX: [0.03, 1], scaleY: [0.012, 0.012], duration: 170, ease: 'out(3)' }, 40)
    .add(el, { scaleY: [0.012, 1], duration: 320, ease: 'out(4)' }, 210);
}

function crtOff(el) {
  createTimeline({ defaults: { composition: 'replace' } })
    .add(el, { scaleY: 0.012, duration: 140, ease: 'in(3)' })
    .add(el, { scaleX: 0, opacity: 0, duration: 120, ease: 'in(2)' });
}

function enterFeature(i) {
  const key = featureKeys[i];
  const demo = demos[key];
  const color = `var(--c${i})`;
  features[i].classList.add('is-active');
  animate(features[i].querySelector('.feature-text'), {
    opacity: [0, 1], y: ['1rem', '0rem'], duration: 380, ease: 'out(3)', composition: 'replace',
  });
  if (!reducedMotion) {
    animate(featureChars[i], {
      opacity: [0, 1],
      fontStretch: ['70%', '116%'],
      x: ['-.12em', '0em'],
      duration: 560,
      delay: stagger(16),
      ease: 'out(3)',
      composition: 'replace',
    });
  }
  demo.el.classList.add('is-active');
  if (reducedMotion) utils.set(demo.el, { opacity: 1, scaleX: 1, scaleY: 1 });
  else crtOn(demo.el);
  demo.enter();
  cards.show(key);
  screen.bezel.style.setProperty('--part', color);
  screen.glass.style.setProperty('--part', color);
  animate(screen.hud, { opacity: 0.9, duration: 300, delay: 250, ease: 'linear', composition: 'replace' });
  animate(screen.bezelTicks, {
    opacity: [{ to: 1, duration: 90 }, { to: 0.35, duration: 420 }],
    delay: stagger(3, { from: i * 15 }),
    ease: 'out(2)',
    composition: 'replace',
  });
  animate(screen.arcs[i], { strokeWidth: 9, duration: 220, ease: 'out(3)' });
  animate(features[i].querySelectorAll('.feature-links li'), {
    opacity: [0, 1],
    x: ['-.5rem', '0rem'],
    duration: 280,
    delay: stagger(70, { start: 120 }),
    ease: 'out(3)',
  });
}

function leaveFeature(i) {
  const key = featureKeys[i];
  const demo = demos[key];
  features[i].classList.remove('is-active');
  animate(features[i].querySelector('.feature-text'), {
    opacity: 0, y: '-.75rem', duration: 220, ease: 'in(2)', composition: 'replace',
  });
  demo.el.classList.remove('is-active');
  if (reducedMotion) utils.set(demo.el, { opacity: 0 });
  else crtOff(demo.el);
  demo.leave();
  cards.hide(key);
  animate(screen.hud, { opacity: 0, duration: 150, ease: 'linear', composition: 'replace' });
  animate(screen.arcs[i], { strokeWidth: 6, duration: 220, ease: 'out(3)' });
}

function syncActiveFeature(tl) {
  const t = tl.currentTime;
  const index = t <= 0 || t >= tl.duration ? -1 : Math.min(features.length - 1, Math.floor(t / 1000));
  if (index === activeFeature) return;
  if (activeFeature >= 0) leaveFeature(activeFeature);
  activeFeature = index;
  if (index >= 0) enterFeature(index);
}

function buildFeatures() {
  // a demo ativa é decidida no laço de desenho a partir de tl.currentTime:
  // onUpdate não dispara no tempo 0, e voltar ao topo precisa desligar a demo
  const tl = createTimeline({
    autoplay: false,
    defaults: { ease: 'linear', composition: 'none' },
  });
  features.forEach((section, i) => {
    tl.add(arcs[i], { draw: ['0 0', '0 1'], duration: 1000 }, i * 1000);
    const { syncable } = demos[featureKeys[i]];
    if (syncable) tl.add(syncable, { progress: [0, 1], duration: 1000 }, i * 1000);
  });
  onScroll({
    target: '#tecnicas',
    enter: 'top top', // começa quando o topo da seção encosta no topo da janela
    leave: 'top bottom', // termina quando a base da seção encosta no topo
    sync: SYNC,
  }).link(tl);
  return tl;
}

// ----------------------------------------------- escopo responsivo
const site = createScope({ mediaQueries: { md: '(min-width: 900px)' } })
  .add(({ matches }) => {
    const F = framing(matches.md);
    resetScene(F);
    master = buildMaster(F);
    buildScroller();
    featuresTl = buildFeatures();

    // o cartão do gráfico usa um observador com callbacks de entrada e saída
    onScroll({
      target: '#arquitetura',
      enter: 'top top+=40lvh',
      leave: 'top top+=185lvh',
      onEnter: () => { cards.show('arquitetura'); chart.play(); },
      onLeave: () => cards.hide('arquitetura'),
    });

    ruler.layout();
    callouts.measure();
    if (introDone) seekMaster(proxy.time);
    else seekMaster(0);

    return () => {
      if (activeFeature >= 0) leaveFeature(activeFeature);
      activeFeature = -1;
    };
  });

// ------------------------------------------------- carregador e abertura
function hideLoader(next) {
  const loader = document.getElementById('loader');
  window.__loaderObserver?.disconnect();
  if (!loader || reducedMotion) {
    loader?.remove();
    next();
    return;
  }
  animate(loader.querySelector('.loader-label'), {
    innerHTML: scrambleText({ text: 'motor pronto', chars: 'a-z', settleDuration: 200 }),
  });
  animate(loader, {
    opacity: 0,
    scale: 1.3,
    duration: 520,
    delay: 280,
    ease: 'in(3)',
    onComplete: () => loader.remove(),
  });
  createTimer({ duration: 360, onComplete: next });
}

function startIntro() {
  hero.play();
  const finish = () => {
    introDone = true;
    seekMaster(proxy.time);
    if (startHash) document.querySelector(`a[href="#${startHash}"]`)?.click();
  };
  if (reducedMotion) {
    seekMaster(master.labels.INTRO_END);
    finish();
    return;
  }
  const clock = { t: 0 };
  animate(clock, {
    t: master.labels.INTRO_END,
    duration: master.labels.INTRO_END,
    ease: 'linear',
    onUpdate: () => seekMaster(clock.t),
    onComplete: finish,
  });
}

// ------------------------------------------------ laço de desenho
let printOn = false;
let lastReadout = '';
let frame = 0;
const printRanges = () => {
  const L = master.labels;
  return [[L.PECAS + 300, L.PECAS + 2600], [L.ARQUITETURA + 310, L.ARQUITETURA + 1500]];
};

function chapterAt(t) {
  const L = master.labels;
  let name = 'INTRO';
  for (const key of Object.keys(CHAPTER_NAMES)) if (L[key] !== undefined && t >= L[key]) name = key;
  return CHAPTER_NAMES[name];
}

createTimer({
  onUpdate: () => {
    frame++;
    interaction.update();
    rig.stageRig.updateMatrixWorld();
    screen.updateFacing();
    screen.alignFlat();
    callouts.update();
    reveals.update();
    if (featuresTl) syncActiveFeature(featuresTl);
    if (activeFeature >= 0 && frame % 3 === 0) {
      screen.hud.textContent = demos[featureKeys[activeFeature]].hud();
    }
    if (master) {
      const t = master.currentTime;
      const readout = String(Math.round(t)).padStart(5, '0');
      if (readout !== lastReadout) {
        lastReadout = readout;
        screen.readoutNum.textContent = readout;
        screen.readoutChapter.textContent = chapterAt(t);
      }
      const print = printRanges().some(([a, b]) => t >= a && t <= b);
      if (print !== printOn) {
        printOn = print;
        document.body.classList.toggle('is-print', print);
      }
      interaction.setSpinEnabled(introDone && stage.hasWebGL && t <= master.labels.HERO + 120);
    }
    stage.render();
  },
});

hideLoader(startIntro);

// --------------------------------------------------------- resize
let lastSize = [window.innerWidth, window.innerHeight];
let resizeTimer = null;
window.addEventListener('resize', () => {
  stage.resize();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const [w, h] = lastSize;
    const changed = window.innerWidth !== w || Math.abs(window.innerHeight - h) / h > 0.2;
    lastSize = [window.innerWidth, window.innerHeight];
    callouts.measure();
    demos.drag.refresh?.();
    interaction.refresh();
    if (changed) site.refresh(); // refaz mestra e scroller com as novas alturas
    else ruler.layout();
  }, 200);
});
