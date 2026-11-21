// ---------------------------------------------------------------------------
// reveals.js — o texto também é montado peça por peça
//
//   · capítulos: o "eyebrow" chega com scrambleText; o título é quebrado em
//     palavras com splitText({ wrap: 'clip' }) — cada palavra fica dentro de uma
//     máscara e sobe de baixo; o parágrafo aparece em seguida
//   · créditos: cartões em cascata e inclinação 3D seguindo o mouse
//     (um createAnimatable por cartão)
//   · começar: a grade de links entra em cascata
//   · rodapé: o "desmonte." gigante chega espalhado e se monta com mola; perto
//     do cursor, as letras se afastam
// ---------------------------------------------------------------------------
import {
  animate, createAnimatable, onScroll, scrambleText, spring, splitText, stagger, utils,
} from 'animejs';

const canHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function prepareChapter(block) {
  const eyebrow = block.querySelector('.eyebrow');
  const title = block.querySelector('.chapter-title');
  const lede = block.querySelector('.chapter-lede');
  const words = title
    ? splitText(title, { words: { class: 'word', wrap: 'clip' }, accessible: true }).words
    : [];
  return { eyebrow, eyebrowText: eyebrow ? eyebrow.textContent : '', words, lede };
}

function playChapter(r) {
  if (r.eyebrow) {
    animate(r.eyebrow, {
      innerHTML: scrambleText({ text: r.eyebrowText, chars: 'A-Z0-9', cursor: '_', settleDuration: 240 }),
    });
  }
  animate(r.words, {
    y: ['110%', '0%'],
    duration: 760,
    delay: stagger(70),
    ease: 'out(4)',
    composition: 'replace',
  });
  if (r.lede) {
    animate(r.lede, { opacity: [0, 1], y: ['.8rem', '0rem'], duration: 650, delay: 260, ease: 'out(3)', composition: 'replace' });
  }
}

export function createReveals({ reducedMotion }) {
  // ------------------------------------------ capítulos fixos (planta)
  const fixed = [...document.querySelectorAll('.fixed-section')].map((section) => ({
    section,
    shown: false,
    ...prepareChapter(section),
  }));

  // ------------------------------------------ créditos e começar
  const blocks = [...document.querySelectorAll('#creditos .block, #comecar .block')].map((block) => {
    const r = prepareChapter(block);
    const cardsEls = [...block.querySelectorAll('.credits a, .link-grid li')];
    utils.set(cardsEls, { opacity: 0 });
    onScroll({
      target: block,
      enter: 'bottom-=12% top', // quando o topo do bloco passa de 88% da altura da janela
      leave: 'top bottom',
      onEnter: () => {
        if (reducedMotion) { utils.set(cardsEls, { opacity: 1 }); return; }
        playChapter(r);
        animate(cardsEls, {
          opacity: [0, 1],
          y: ['1.2rem', '0rem'],
          duration: 600,
          delay: stagger(45, { start: 220 }),
          ease: 'out(3)',
          composition: 'replace',
        });
      },
    });
    return r;
  });

  // cartões de créditos inclinam na direção do mouse
  if (canHover() && !reducedMotion) {
    document.querySelectorAll('.credits a').forEach((card) => {
      const tilt = createAnimatable(card, { rotateX: 500, rotateY: 500, ease: 'out(3)' });
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        tilt.rotateY(px * 14);
        tilt.rotateX(-py * 12);
      });
      card.addEventListener('pointerleave', () => { tilt.rotateX(0); tilt.rotateY(0); });
    });
  }

  // ------------------------------------------ rodapé: a marca se monta
  const giant = document.querySelector('.footer-giant');
  if (giant) {
    // wrap: 'visible' cria um invólucro por letra: a montagem anima a letra,
    // o empurrão do cursor anima o invólucro — sem duas animações na mesma propriedade
    const { chars } = splitText(giant.querySelector('.footer-giant-letters'), { chars: { class: 'char', wrap: 'visible' } });
    const dot = giant.querySelector('.footer-giant-dot');
    const all = [...chars, dot];
    const wrappers = all.map((c) => c.parentElement);

    // "fit text": mede a palavra a 100 px e escala a fonte para ocupar a largura
    const letters = giant.querySelector('.footer-giant-letters');
    const dotWrap = giant.querySelector('.footer-giant-dotwrap');
    const fit = () => {
      giant.style.fontSize = '100px';
      const content = letters.getBoundingClientRect().width + dotWrap.getBoundingClientRect().width;
      const available = giant.clientWidth;
      if (content > 0 && available > 0) giant.style.fontSize = `${Math.min(260, (100 * available * 0.97) / content).toFixed(1)}px`;
    };
    fit();
    document.fonts?.ready.then(fit);
    window.addEventListener('resize', fit);
    const scatter = () => utils.set(all, {
      x: () => `${utils.random(-60, 60)}vw`,
      y: () => utils.random(-220, 160),
      rotate: () => utils.random(-120, 120),
      opacity: 0,
    });
    if (!reducedMotion) scatter();
    onScroll({
      target: giant,
      enter: 'bottom-=5% top',
      leave: 'top bottom',
      onEnter: () => {
        if (reducedMotion) return;
        animate(all, {
          x: '0vw',
          y: 0,
          rotate: 0,
          opacity: { to: 1, duration: 300, ease: 'linear' },
          delay: stagger(55),
          ease: spring({ stiffness: 55, damping: 9 }),
          composition: 'replace',
        });
      },
      onLeaveBackward: () => { if (!reducedMotion) scatter(); },
    });

    if (canHover() && !reducedMotion) {
      const push = wrappers.map((w) => createAnimatable(w, { x: 600, y: 600, ease: 'out(3)' }));
      giant.addEventListener('pointermove', (e) => {
        wrappers.forEach((c, i) => {
          const r = c.getBoundingClientRect();
          const dx = r.left + r.width / 2 - e.clientX;
          const dy = r.top + r.height / 2 - e.clientY;
          const d = Math.hypot(dx, dy) || 1;
          const f = Math.max(0, 1 - d / 260) * 34;
          push[i].x((dx / d) * f);
          push[i].y((dy / d) * f);
        });
      });
      giant.addEventListener('pointerleave', () => push.forEach((p) => { p.x(0); p.y(0); }));
    }
  }

  return {
    /** chamado a cada quadro: revela os capítulos fixos quando aparecem */
    update() {
      for (const r of fixed) {
        const o = parseFloat(r.section.style.opacity || '0');
        if (!r.shown && o > 0.5) {
          r.shown = true;
          if (!reducedMotion) playChapter(r);
        } else if (r.shown && o < 0.05) {
          r.shown = false;
        }
      }
    },
  };
}
