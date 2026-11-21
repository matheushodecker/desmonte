// ---------------------------------------------------------------------------
// hero.js — entrada do título e a palavra que troca sozinha
//
// splitText quebra o título em letras (mantendo <br> e o ponto colorido). A
// Archivo é uma fonte VARIÁVEL: cada letra entra estreita e fina (largura 62%,
// peso 250) e se estica até 118% / 690 — as peças "se encaixam". Depois, cada
// letra tem um createAnimatable próprio e engorda perto do cursor.
//
// A palavra do subtítulo é re-quebrada a cada troca: as letras saem da última
// para a primeira enquanto o cursor âmbar recua, e entram da primeira para a
// última enquanto o cursor avança.
// ---------------------------------------------------------------------------
import { animate, createAnimatable, createTimeline, createTimer, splitText, stagger, utils } from 'animejs';

const WORDS = ['WebGL', 'SVG', 'o DOM', 'CSS 3D', 'shaders', 'o scroll', 'a web'];

export function createHero({ reducedMotion }) {
  const title = document.querySelector('.hero-title');
  const lede = document.querySelector('.hero-lede');
  const word = document.querySelector('.swap-word');
  const caret = document.querySelector('.swap-caret');

  const titleSplit = splitText(title, { chars: { class: 'char' }, accessible: true });
  const ledeSplit = splitText(lede, { words: { class: 'word' }, accessible: true });
  // a palavra que troca não entra no split do parágrafo
  const ledeWords = ledeSplit.words.filter((w) => !w.closest('.swap-wrap'));

  const chars = titleSplit.chars.filter((c) => !c.closest('.hero-dot'));
  const BASE = { weight: 690, stretch: 118 };

  const intro = createTimeline({ autoplay: false, defaults: { ease: 'out(4)' } })
    .add(titleSplit.chars, {
      y: ['.3em', '0em'],
      opacity: [0, 1],
      fontStretch: ['62%', `${BASE.stretch}%`],
      fontWeight: [250, BASE.weight],
      duration: 1100,
      delay: stagger(32),
    }, 0)
    .add(ledeWords, {
      y: ['.6em', '0em'],
      opacity: [0, 1],
      duration: 700,
      delay: stagger(30),
    }, 420)
    .add([word, caret], { opacity: [0, 1], duration: 400 }, 700)
    .add('.hero-dot', {
      color: ['#ffffff', utils.get(document.documentElement, '--amber')],
      duration: 1400,
      ease: 'out(2)',
    }, 500)
    // os filhos, não o .hero-foot: ele é animado pela timeline mestra no scroll
    .add(['.hero-actions', '.carimbo'], { y: ['1.5rem', '0rem'], opacity: [0, 1], duration: 700, delay: stagger(120) }, 650)
    .init(); // .init() manual aplica o estado inicial de todos os filhos (evita piscar)

  // ------------------------------------------------ troca de palavras
  let index = 0;
  let split = null;
  let loop = null;

  const resplit = (text) => {
    if (split) split.revert();
    if (text !== undefined) word.textContent = text;
    split = splitText(word, { chars: { class: 'char' } });
    return split.chars;
  };

  const cycle = () => {
    const outChars = resplit();
    const width = word.offsetWidth;
    loop = createTimeline({ delay: 1600 })
      .add(outChars, {
        opacity: 0,
        scaleX: 0,
        duration: 140,
        delay: stagger(26, { from: 'last' }),
        ease: 'in(2)',
      }, 0)
      .add(caret, {
        x: -width,
        scaleX: [1, 3.2, 1],
        duration: outChars.length * 26 + 160,
        ease: 'out(3)',
      }, 0)
      .call(() => {
        const next = WORDS[index++ % WORDS.length];
        const inChars = resplit(next);
        const w = word.offsetWidth;
        utils.set(inChars, { opacity: 0, scaleX: 0 });
        createTimeline({ onComplete: cycle })
          .add(inChars, {
            opacity: [0, 1],
            scaleX: [0, 1],
            x: ['.3em', '0em'],
            duration: 160,
            delay: stagger(28),
            ease: 'out(2)',
          }, 0)
          .add(caret, {
            x: [-w, 0],
            scaleX: [3.2, 1],
            duration: inChars.length * 28 + 180,
            ease: 'out(3)',
          }, 0);
      });
  };

  // --------------------------------- letras que engordam perto do cursor
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  function enableProximity() {
    if (!canHover || reducedMotion) return;
    const tweens = chars.map((c) => createAnimatable(c, {
      fontWeight: 320,
      fontStretch: { unit: '%', duration: 320 },
      y: { unit: 'em', duration: 420 },
      ease: 'out(3)',
    }));
    const zone = document.querySelector('.hero-text');
    let rects = [];
    const measure = () => { rects = chars.map((c) => c.getBoundingClientRect()); };
    zone.addEventListener('pointerenter', measure);
    zone.addEventListener('pointermove', (e) => {
      if (!rects.length) measure();
      rects.forEach((r, i) => {
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const f = Math.max(0, 1 - Math.hypot(dx, dy) / 170);
        tweens[i].fontWeight(BASE.weight + 210 * f);
        tweens[i].fontStretch(BASE.stretch + 7 * f);
        tweens[i].y(-0.06 * f);
      });
    });
    zone.addEventListener('pointerleave', () => {
      tweens.forEach((t) => { t.fontWeight(BASE.weight); t.fontStretch(BASE.stretch); t.y(0); });
      rects = [];
    });
    window.addEventListener('scroll', () => { rects = []; }, { passive: true });
  }

  let started = false;
  return {
    play() {
      if (reducedMotion) {
        intro.seek(intro.duration); // pula direto para o estado final
        document.documentElement.classList.remove('is-loading');
        return;
      }
      document.documentElement.classList.remove('is-loading');
      intro.then(enableProximity);
      intro.play();
      if (!started) {
        started = true;
        createTimer({ duration: 1400, onComplete: cycle });
      }
    },
    pauseSwap() { if (loop) loop.pause(); },
  };
}
