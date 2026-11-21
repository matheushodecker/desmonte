// ---------------------------------------------------------------------------
// chart.js — "Quanto pesa cada peça": barra empilhada + contador
//
// Os números são reais: gzip -9 de cada arquivo que o navegador baixa nesta
// versão sem build (veja tools/medir.mjs). As fontes woff2 já vêm comprimidas.
// ---------------------------------------------------------------------------
import { animate, stagger, utils } from 'animejs';

export const WEIGHTS = [
  { name: 'three.js · núcleo', kb: 280.2, color: 'var(--c4)' },
  { name: 'three.js · módulo', kb: 128.1, color: 'var(--c5)' },
  { name: 'anime.js · 57 módulos', kb: 120.3, color: 'var(--c0)' },
  { name: 'fontes woff2', kb: 125.6, color: 'var(--c3)' },
  { name: 'addons three', kb: 11.5, color: 'var(--c6)' },
  { name: 'código do site', kb: 37.5, color: 'var(--c1)' },
  { name: 'CSS + HTML', kb: 14.1, color: 'var(--c2)' },
];

export function createChart() {
  const card = document.querySelector('.chart-card');
  const bar = card.querySelector('.chart-bar');
  const legend = card.querySelector('.chart-legend');
  const totalEl = card.querySelector('.chart-total-num');
  const total = WEIGHTS.reduce((sum, w) => sum + w.kb, 0);

  const segments = WEIGHTS.map((w) => {
    const seg = document.createElement('span');
    seg.style.setProperty('--seg', w.color);
    seg.style.flex = `${w.kb} 0 3px`;
    bar.append(seg);
    const li = document.createElement('li');
    li.style.setProperty('--seg', w.color);
    li.innerHTML = `<span class="dot"></span><span class="name">${w.name}</span><span class="kb">${w.kb.toFixed(1)}</span>`;
    legend.append(li);
    return seg;
  });

  const counter = { kb: 0 };
  const render = () => { totalEl.textContent = counter.kb.toFixed(1); };

  return {
    card,
    total,
    play() {
      animate(segments, {
        scaleX: [0, 1],
        duration: 650,
        delay: stagger(70),
        ease: 'out(3)',
      });
      animate(legend.children, {
        opacity: [0, 1],
        x: ['-.4rem', '0rem'],
        duration: 400,
        delay: stagger(50, { start: 150 }),
        ease: 'out(2)',
      });
      animate(counter, {
        kb: [0, total],
        duration: 1100,
        ease: 'out(3)',
        modifier: utils.round(1),
        onUpdate: render,
      });
    },
  };
}
