// ---------------------------------------------------------------------------
// chrome.js — a interface em volta do palco
//   · menu do celular e links de âncora com destino calibrado por capítulo
//   · marca "desmonte" que se separa ao passar o mouse
//   · botões de copiar e cartões de código com realce de sintaxe
//   · régua de progresso: cursor arrastável (createDraggable) + fantasma
//     que segue o mouse (createAnimatable) + dica com o capítulo + número da
//     folha atual trocando com scrambleText
// ---------------------------------------------------------------------------
import { animate, createAnimatable, createDraggable, scrambleText, splitText, stagger, utils } from 'animejs';
import { highlight } from './highlight.js';

const COPY_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="10" height="10" rx="2"/><path d="M15.5 5.5h-8a2 2 0 0 0-2 2v8"/></svg>';

// onde cada âncora "aterrissa" dentro do capítulo (fração da altura)
const LANDING = { intro: 0, pecas: 0.4, tecnicas: 0.02, arquitetura: 0.3, creditos: 0, comecar: 1 };

export const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
export const pageTop = (el) => el.getBoundingClientRect().top + window.scrollY;

const CHAPTER_TITLES = {
  intro: 'início', pecas: 'peças', tecnicas: 'técnicas', arquitetura: 'arquitetura', creditos: 'créditos', comecar: 'começar',
};

/** Rola até um capítulo ou até uma técnica (que fica ativa no começo do seu trecho). */
export function scrollToTarget(el, reducedMotion = false) {
  const id = el.id;
  let top = pageTop(el);
  if (el.classList.contains('feature')) top += el.offsetHeight * 0.3;
  else if (id in LANDING) top += el.offsetHeight * LANDING[id];
  window.scrollTo({ top: Math.min(top, maxScroll()), behavior: reducedMotion ? 'auto' : 'smooth' });
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // alguns navegadores e visualizadores bloqueiam a área de transferência:
    // seleciona o texto para o visitante copiar à mão
    const target = button.closest('.install, .code-card')?.querySelector('code');
    if (target) {
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return;
  }
  button.classList.add('is-done');
  button.setAttribute('aria-label', 'Copiado');
  animate(button, { scale: [0.8, 1], duration: 400, ease: 'out(3)' });
  setTimeout(() => {
    button.classList.remove('is-done');
    button.setAttribute('aria-label', 'Copiar código');
  }, 1600);
}

export function setupChrome({ reducedMotion }) {
  // menu do celular
  const toggle = document.getElementById('menu-toggle');
  const menu = document.getElementById('site-menu');
  const closeMenu = () => {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => {
    const open = !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });

  // âncoras internas com aterrissagem por capítulo
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    const chapter = document.getElementById(id);
    if (!chapter) return;
    e.preventDefault();
    closeMenu();
    scrollToTarget(chapter, reducedMotion);
  });

  // a marca se desmonta no hover
  document.querySelectorAll('.wordmark:not(.static)').forEach((mark) => {
    const { chars } = splitText(mark.querySelector('.wordmark-letters'), { chars: { class: 'char' } });
    const dot = mark.querySelector('.wordmark-dot');
    const spread = () => {
      animate(chars, {
        x: stagger([-5, 5], { from: 'center' }),
        y: () => utils.random(-2, 2),
        rotate: () => utils.random(-8, 8),
        duration: 420,
        ease: 'out(3)',
      });
      animate(dot, { x: 7, scale: 1.4, duration: 420, ease: 'out(3)' });
    };
    const settle = () => {
      animate([...chars, dot], { x: 0, y: 0, rotate: 0, scale: 1, duration: 600, ease: 'out(4)' });
    };
    mark.addEventListener('mouseenter', spread);
    mark.addEventListener('focus', spread);
    mark.addEventListener('mouseleave', settle);
    mark.addEventListener('blur', settle);
  });

  // botão de copiar do comando de instalação
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', () => {
      const source = document.querySelector(button.dataset.copy);
      if (source) copyText(source.textContent.trim(), button);
    });
  });
}

/** Cartões de código: realce + botão de copiar + mostrar/esconder animados. */
export function createCodeCards() {
  const cards = {};
  document.querySelectorAll('.code-card').forEach((pre) => {
    const code = pre.querySelector('code');
    const raw = code.textContent;
    // uma <span> por linha: os cartões revelam o código linha a linha
    code.innerHTML = highlight(raw).split('\n').map((l) => `<span class="ln">${l || ' '}</span>`).join('');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn copy-btn';
    button.setAttribute('aria-label', 'Copiar código');
    button.innerHTML = COPY_ICON;
    button.addEventListener('click', () => copyText(raw, button));
    pre.append(button);
    cards[pre.dataset.card] = pre;
  });
  const chart = document.querySelector('.chart-card');
  if (chart) cards[chart.dataset.card] = chart;

  return {
    cards,
    show(key) {
      const el = cards[key];
      if (!el) return;
      el.classList.add('is-on');
      animate(el, { opacity: 1, y: 0, duration: 380, ease: 'inOut(3)', composition: 'replace' });
      const lines = el.querySelectorAll('.ln');
      if (lines.length) {
        animate(lines, {
          opacity: [0, 1],
          x: ['-.6em', '0em'],
          duration: 300,
          delay: stagger(24, { start: 120 }),
          ease: 'out(3)',
          composition: 'replace',
        });
      }
    },
    hide(key) {
      const el = cards[key];
      if (!el) return;
      animate(el, {
        opacity: 0,
        y: '1rem',
        duration: 240,
        ease: 'inOut(3)',
        composition: 'replace',
        onComplete: () => el.classList.remove('is-on'),
      });
    },
  };
}

/** Régua de progresso com cursor arrastável e número da folha. */
export function createRuler(chapters, { reducedMotion }) {
  const ruler = document.querySelector('.ruler');
  const marks = ruler.querySelector('.ruler-marks');
  const cursor = ruler.querySelector('.ruler-cursor');
  const ghostEl = ruler.querySelector('.ruler-ghost');
  const sheetEls = document.querySelectorAll('[data-sheet-now]');
  const tip = document.createElement('span');
  tip.className = 'ruler-tip';
  ruler.append(tip);
  const tipMove = createAnimatable(tip, { x: 160, opacity: 200 });

  const markEls = chapters.map((chapter) => {
    const m = document.createElement('span');
    m.className = 'ruler-mark';
    m.title = chapter.dataset.label;
    marks.append(m);
    return m;
  });

  let starts = [];
  const layout = () => {
    const max = maxScroll();
    starts = chapters.map((c) => pageTop(c));
    starts.forEach((top, i) => { markEls[i].style.left = `${((top / max) * 100).toFixed(2)}%`; });
    draggable.refresh();
  };

  const draggable = createDraggable(cursor, {
    y: false,
    container: ruler,
    containerFriction: 1,
    velocityMultiplier: 0,
    cursor: { onHover: 'grab', onGrab: 'grabbing' },
    onGrab: () => animate(cursor, { scaleY: 1.3, scaleX: 1.6, duration: 200, ease: 'out(3)' }),
    onRelease: () => animate(cursor, { scaleY: 1, scaleX: 1, duration: 200, ease: 'out(3)' }),
    onDrag: (self) => window.scrollTo(0, self.progressX * maxScroll()),
  });

  // o fantasma segue o mouse sobre a régua: createAnimatable mantém uma
  // animação viva por propriedade e só troca o destino a cada evento
  const ghost = createAnimatable(ghostEl, { x: 160, opacity: 160 });
  const pointerProgress = (e) => {
    const r = ruler.getBoundingClientRect();
    return utils.clamp((e.clientX - r.left) / r.width, 0, 1);
  };
  let tipText = '';
  ruler.addEventListener('pointermove', (e) => {
    if (draggable.grabbed) return;
    const p = pointerProgress(e);
    ghost.x(p * ruler.offsetWidth);
    ghost.opacity(0.5);
    // capítulo sob o ponteiro
    const y = p * maxScroll() + window.innerHeight * 0.5;
    let index = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= y) index = i;
    const chapter = chapters[index];
    const text = `${chapter.dataset.sheet} · ${CHAPTER_TITLES[chapter.id] || ''}`;
    if (text !== tipText) {
      tipText = text;
      animate(tip, { innerHTML: scrambleText({ text, chars: 'a-z0-9', settleDuration: 160 }), composition: 'replace' });
    }
    tipMove.x(p * ruler.offsetWidth);
    tipMove.opacity(1);
  });
  ruler.addEventListener('pointerleave', () => { ghost.opacity(0); tipMove.opacity(0); });
  ruler.addEventListener('click', (e) => {
    if (e.target === cursor) return;
    window.scrollTo({ top: pointerProgress(e) * maxScroll(), behavior: reducedMotion ? 'auto' : 'smooth' });
  });
  ruler.addEventListener('keydown', (e) => {
    const y = window.scrollY + 2;
    let index = starts.findLastIndex((top) => top <= y);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') index = Math.min(starts.length - 1, index + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') index = Math.max(0, y - 4 > starts[index] ? index : index - 1);
    else if (e.key === 'Home') index = 0;
    else if (e.key === 'End') index = starts.length - 1;
    else return;
    e.preventDefault();
    window.scrollTo({ top: starts[index], behavior: reducedMotion ? 'auto' : 'smooth' });
  });

  let lastSheet = '';
  return {
    layout,
    draggable,
    setProgress(progress) {
      if (!draggable.grabbed) draggable.progressX = progress;
      ruler.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      const probe = window.scrollY + window.innerHeight * 0.5;
      let index = 0;
      for (let i = 0; i < starts.length; i++) if (starts[i] <= probe) index = i;
      const sheet = chapters[index]?.dataset.sheet || '01';
      if (sheet !== lastSheet) {
        const first = !lastSheet;
        lastSheet = sheet;
        if (first || reducedMotion) sheetEls.forEach((el) => { el.textContent = sheet; });
        else animate(sheetEls, { innerHTML: scrambleText({ text: sheet, chars: '0-9', settleDuration: 220 }), composition: 'replace' });
      }
    },
  };
}
