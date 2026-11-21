// ---------------------------------------------------------------------------
// demos.js — as oito demonstrações exibidas na tela do motor
//
// Cada demo devolve { el, enter(), leave(), syncable? }:
//   enter/leave  -> tocam e pausam os loops (nada roda fora de vista)
//   syncable     -> animação pausada cujo `progress` é dirigido pelo scroll
// O código mostrado nos cartões do canto é a essência de cada função abaixo.
// ---------------------------------------------------------------------------
import {
  animate, createTimer, createTimeline, createDraggable, createScope, spring,
  createDrawable, createMotionPath, morphTo, stagger, steps, utils,
} from 'animejs';

const el = (tag, className, html = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
};

// 1 · animate() com parâmetros por propriedade ------------------------------
function demoApi(root) {
  root.append(el('div', 'trilho'), el('div', 'bloco'));
  const bloco = root.querySelector('.bloco');
  const anim = animate(bloco, {
    x: [{ to: -80 }, { to: 80 }, { to: 0 }],
    y: [{ to: -60, ease: 'out(3)' }, { to: 0 }],
    rotate: { to: 360, ease: 'inOutBack' },
    borderRadius: ['18%', '50%'],
    duration: 2400,
    loop: true,
    alternate: true,
    autoplay: false,
  });
  const n = (prop) => Math.round(utils.get(bloco, prop, false));
  return {
    enter: () => anim.play(),
    leave: () => anim.pause(),
    hud: () => `x ${n('x')} · y ${n('y')} · rotate ${n('rotate')}°`,
  };
}

// 2 · composition: 'blend' ---------------------------------------------------
function demoBlend(root) {
  const kinds = ['', 'anel', 'quad'];
  for (let i = 0; i < 15; i++) root.append(el('div', `ponto ${kinds[i % 3]}`));
  const pontos = [...root.querySelectorAll('.ponto')];

  const embaralhar = () => animate(pontos, {
    x: () => utils.random(-110, 110),
    y: () => utils.random(-110, 110),
    scale: () => utils.random(0.5, 1.3, 2),
    duration: () => utils.random(700, 1400),
    ease: 'inOut(2)',
    composition: 'blend',
  });

  const timer = createTimer({ duration: 900, loop: true, autoplay: false, onLoop: embaralhar });

  // o ponteiro atrai os pontos; com 'blend' isso soma com o embaralhamento
  let last = 0;
  let target = null;
  root.addEventListener('pointerleave', () => { target = null; });
  root.addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (now - last < 90) return;
    last = now;
    const r = root.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 400 - 200;
    const y = ((e.clientY - r.top) / r.height) * 400 - 200;
    target = [Math.round(x), Math.round(y)];
    animate(pontos, {
      x: () => x + utils.random(-30, 30),
      y: () => y + utils.random(-30, 30),
      duration: 650,
      ease: 'out(3)',
      delay: stagger(12),
      composition: 'blend',
    });
  });

  return {
    enter: () => { embaralhar(); timer.play(); },
    leave: () => timer.pause(),
    hud: () => (target ? `alvo x ${target[0]} · y ${target[1]} · blend` : 'novo destino a cada 900 ms · blend'),
  };
}

// 3 · onScroll: a animação é "sincronizável" ---------------------------------
function demoScroll(root) {
  let orbits = '';
  for (let i = 0; i < 7; i++) {
    const rx = 34 + i * 18;
    orbits += `<ellipse class="orbita" cx="0" cy="0" rx="${rx}" ry="${(rx * 0.42).toFixed(1)}" transform="rotate(${-26 + i * 4})"/>`;
  }
  root.append(el('div', '', `<svg viewBox="-150 -150 300 300">${orbits}<circle class="astro" r="15"/></svg>`));
  const syncable = animate(createDrawable(root.querySelectorAll('.orbita')), {
    draw: ['0 0', '0 1', '1 1'],
    delay: stagger(70),
    ease: 'inOut(3)',
    duration: 1000,
    autoplay: false,
  });
  const pulse = animate(root.querySelector('.astro'), {
    scale: [1, 1.25],
    duration: 900,
    ease: 'inOut(2)',
    loop: true,
    alternate: true,
    autoplay: false,
  });
  return {
    enter: () => pulse.play(),
    leave: () => pulse.pause(),
    syncable,
    hud: () => `progress ${syncable.progress.toFixed(2)} · role a página`,
  };
}

// 4 · stagger em grade -------------------------------------------------------
function demoStagger(root) {
  const grid = el('div', 'grade');
  for (let i = 0; i < 121; i++) {
    const c = el('div', 'celula');
    c.dataset.index = String(i);
    grid.append(c);
  }
  root.append(grid);
  const cells = [...grid.children];
  let active = false;
  let wave = null;
  let wait = null;
  let origin = 'center';

  const onda = (origem) => {
    origin = origem;
    if (wave) wave.pause();
    if (wait) wait.pause();
    wave = animate(cells, {
      scale: [{ to: 0.2 }, { to: 1 }],
      rotate: { from: -90, to: 0 },
      delay: stagger(45, { grid: [11, 11], from: origem }),
      duration: 700,
      ease: 'inOut(2)',
      onComplete: () => {
        if (!active) return;
        wait = createTimer({ duration: 650, onComplete: () => active && onda(utils.random(0, 120)) });
      },
    });
  };

  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('.celula');
    if (cell) onda(+cell.dataset.index);
  });

  return {
    enter: () => { active = true; onda('center'); },
    leave: () => { active = false; if (wait) wait.pause(); },
    hud: () => `from: ${typeof origin === 'number' ? origin : `'${origin}'`} · grid [11, 11]`,
  };
}

// 5 · SVG: traço, caminho e transformação ------------------------------------
function lemniscate(a = 122, n = 96) {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const s = 1 + Math.sin(t) ** 2;
    const x = (a * Math.cos(t)) / s;
    const y = (a * Math.sin(t) * Math.cos(t)) / s;
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d + 'Z';
}

function polygon(points, rOuter, rInner, rotation = -90) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? rInner : rOuter;
    const a = ((rotation + (i * 180) / points) * Math.PI) / 180;
    d += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  }
  return d + 'Z';
}

function demoSvg(root) {
  const track = lemniscate();
  root.append(el('div', '', `
    <svg viewBox="-150 -150 300 300">
      <path class="pista-bg" d="${track}"/>
      <path class="pista" d="${track}"/>
      <path class="forma-a" d="${polygon(6, 34, 15)}"/>
      <path class="forma-b" d="${polygon(6, 27, 27, -60)}"/>
      <circle class="carro" r="6"/>
    </svg>`));
  const pista = root.querySelector('.pista');
  const draw = animate(createDrawable(pista), {
    draw: ['0 0', '0 1', '1 1'],
    duration: 3200,
    ease: 'inOut(2)',
    loop: true,
    autoplay: false,
  });
  const car = animate(root.querySelector('.carro'), {
    ...createMotionPath(pista),
    ease: 'linear',
    duration: 3200,
    loop: true,
    autoplay: false,
  });
  const morph = animate(root.querySelector('.forma-a'), {
    d: morphTo(root.querySelector('.forma-b')),
    rotate: 60,
    duration: 1200,
    ease: 'inOut(3)',
    loop: true,
    alternate: true,
    loopDelay: 500,
    autoplay: false,
  });
  return {
    enter: () => { draw.play(); car.play(); morph.play(); },
    leave: () => { draw.pause(); car.pause(); morph.pause(); },
    hud: () => `caminho ${car.iterationProgress.toFixed(2)} · morph ${morph.iterationProgress.toFixed(2)}`,
  };
}

// 6 · createDraggable + mola (na camada plana) ---------------------------------
function demoDrag(root) {
  const arena = el('div', 'arena');
  const dots = el('div', 'grade-pontos');
  const points = [];
  for (let gy = 0; gy < 11; gy++) {
    for (let gx = 0; gx < 11; gx++) {
      const x = (gx - 5) * 22;
      const y = (gy - 5) * 22;
      if (Math.hypot(x, y) > 118) continue;
      const d = document.createElement('i');
      d.style.left = `${125 + x}px`;
      d.style.top = `${125 + y}px`;
      dots.append(d);
      points.push({ d, x, y });
    }
  }
  const peca = el('div', 'peca');
  arena.append(dots, peca);
  root.append(arena);

  const react = (px, py) => {
    for (const p of points) {
      const dist = Math.hypot(p.x - px, p.y - py);
      const s = 1 + 2.2 * Math.max(0, 1 - dist / 80);
      p.d.style.transform = `scale(${s.toFixed(2)})`;
    }
  };

  const draggable = createDraggable(peca, {
    container: arena,
    snap: [0],
    releaseEase: spring({ stiffness: 140, damping: 7 }),
    onUpdate: (self) => react(self.x, self.y),
  });
  draggable.disable();
  react(0, 0);

  return {
    enter: () => draggable.enable(),
    leave: () => draggable.disable(),
    refresh: () => draggable.refresh(),
    hud: () => `x ${Math.round(draggable.x)} · y ${Math.round(draggable.y)} · vel ${draggable.velocity.toFixed(1)}`,
  };
}

// 7 · timeline como sequenciador ---------------------------------------------
function demoTimeline(root) {
  const pattern = [
    [1, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 1, 0, 1, 0, 1],
  ];
  const seq = el('div', 'seq');
  const head = el('div', 'cabeca');
  seq.append(head);
  pattern.forEach((row) => {
    const line = el('div', 'linha');
    row.forEach((on, step) => {
      const pad = el('div', on ? 'pad on' : 'pad');
      pad.dataset.step = String(step);
      line.append(pad);
    });
    seq.append(line);
  });
  const labels = el('div', 'rotulos', '<span>0</span><span>500</span><span>1000</span><span>1500 ms</span>');
  seq.append(labels);
  root.append(seq);

  const tl = createTimeline({ loop: true, autoplay: false })
    .label('compasso')
    .add(head, { x: ['0%', '800%'], ease: steps(8), duration: 2000 }, 'compasso')
    .add(seq.querySelectorAll('.pad.on'), {
      scale: [1.4, 1],
      opacity: [1, 0.45],
      duration: 220,
    }, stagger(250, { use: 'data-step' }));

  return {
    enter: () => tl.play(),
    leave: () => tl.pause(),
    hud: () => {
      const t = Math.round(tl.iterationCurrentTime);
      return `t ${String(t).padStart(4, '0')} ms · passo ${Math.min(8, Math.floor(t / 250) + 1)}/8`;
    },
  };
}

// 8 · createScope com media query -------------------------------------------
function demoScope(root) {
  const palco = el('div', 'palco');
  for (let i = 0; i < 7; i++) palco.append(el('div', 'barra'));
  const button = el('button', 'alternar');
  button.type = 'button';
  root.append(palco, button);

  let active = false;
  let flipped = false;
  let anim = null;
  let state = '';

  const scope = createScope({ mediaQueries: { retrato: '(orientation: portrait)' } })
    .add(({ matches }) => {
      const vertical = matches.retrato !== flipped;
      root.classList.toggle('is-retrato', vertical);
      button.textContent = vertical ? 'ver em paisagem' : 'ver em retrato';
      const eixo = vertical ? 'x' : 'y';
      state = `retrato: ${matches.retrato ? 'sim' : 'não'} · eixo ${eixo}${flipped ? ' · simulado' : ''}`;
      anim = animate(palco.querySelectorAll('.barra'), {
        [eixo]: [-46, 46],
        delay: stagger(90),
        duration: 700,
        ease: 'inOut(2)',
        loop: true,
        alternate: true,
        autoplay: active,
      });
    });

  button.addEventListener('click', () => {
    flipped = !flipped;
    scope.refresh();
  });

  return {
    enter: () => { active = true; if (anim) anim.play(); },
    leave: () => { active = false; if (anim) anim.pause(); },
    hud: () => state,
  };
}

const BUILDERS = {
  api: demoApi,
  blend: demoBlend,
  scroll: demoScroll,
  stagger: demoStagger,
  svg: demoSvg,
  drag: demoDrag,
  timeline: demoTimeline,
  scope: demoScope,
};

/**
 * Monta as demos. A de arraste vai para a camada plana; as outras ficam no
 * vidro (CSS3D). Devolve um mapa chave -> { el, enter, leave, syncable? }.
 */
export function createDemos(screen, keys) {
  const demos = {};
  keys.forEach((key, index) => {
    const root = el('div', `demo demo-${key}`);
    root.style.setProperty('--part', `var(--c${index})`);
    (key === 'drag' ? screen.flat : screen.demos).append(root);
    const api = BUILDERS[key](root);
    demos[key] = { el: root, enter() {}, leave() {}, hud: () => '', ...api };
  });
  return demos;
}
