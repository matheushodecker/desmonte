// ---------------------------------------------------------------------------
// interaction.js — o motor reage a você
//
//   · paralaxe: um createAnimatable persegue a posição do mouse e inclina o
//     mouseRig; a direção da luz do shader segue junto (as faixas de sombra
//     andam pela peça)
//   · mecânica: o anel serrilhado e a engrenagem giram sozinhos, mais rápido
//     quando você rola a página depressa
//   · arraste: no início, uma alça invisível sobre o motor é um createDraggable;
//     o deslocamento vira rotação do spinRig e uma mola traz tudo de volta
//   · destaque: os rótulos da vista explodida acendem a peça correspondente
// ---------------------------------------------------------------------------
import { animate, createAnimatable, createDraggable, spring, utils } from 'animejs';
import { sharedUniforms } from './toon.js';

const DEG = Math.PI / 180;

export function createInteraction({ stage, rig, reducedMotion }) {
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ------------------------------------------------ paralaxe e luz
  const pointer = createAnimatable({ x: 0, y: 0 }, { x: 1400, y: 1400, ease: 'out(4)' });
  if (canHover && !reducedMotion) {
    window.addEventListener('pointermove', (e) => {
      pointer.x((e.clientX / window.innerWidth) * 2 - 1);
      pointer.y((e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { pointer.x(0); pointer.y(0); });
  }
  const baseLight = sharedUniforms.lightDir.value.clone();

  // ------------------------------------------- velocidade do scroll
  let lastY = window.scrollY;
  let velocity = 0;
  let knurl = 0;
  let gear = 0;

  // ------------------------------------------------ arrastar o motor
  const handle = document.createElement('div');
  handle.className = 'spin-handle';
  handle.setAttribute('aria-hidden', 'true');
  const hint = document.createElement('div');
  hint.className = 'spin-hint';
  hint.innerHTML = '<span class="spin-hint-arrows">&#8592; &#8594;</span> arraste para girar';
  document.body.append(handle, hint);

  let dragged = false;
  let enabled = false;
  let hintShown = false;
  let hintAnim = null;
  // uma animação com atraso ainda não começou: se outra começar antes, a atrasada
  // a substituiria depois. Cancelar a anterior evita o balão "voltar" sozinho.
  const animateHint = (params) => {
    if (hintAnim) hintAnim.cancel();
    hintAnim = animate(hint, params);
  };

  const spin = createDraggable(handle, {
    y: false,
    snap: [0],
    releaseEase: spring({ stiffness: 70, damping: 7 }),
    cursor: { onHover: 'grab', onGrab: 'grabbing' },
    onGrab: () => {
      if (!dragged) {
        dragged = true;
        animateHint({ opacity: 0, y: 8, duration: 300, ease: 'in(2)' });
      }
    },
    onUpdate: (self) => { rig.spinRig.rotation.y = self.x * 0.55 * DEG; },
  });
  spin.disable();

  const center = { x: 0, y: 0 };
  const rim = { x: 0, y: 0 };

  function setSpinEnabled(on) {
    if (on === enabled) return;
    enabled = on;
    handle.style.pointerEvents = on ? 'auto' : 'none';
    if (on) spin.enable(); else spin.disable();
    if (on && !dragged && !hintShown) {
      hintShown = true;
      animateHint({ opacity: [0, 1], y: [8, 0], duration: 500, delay: 600, ease: 'out(3)' });
    } else if (!on && hintShown && !dragged) {
      hintShown = false;
      animateHint({ opacity: 0, duration: 200, ease: 'linear' });
    }
  }

  function placeHandle() {
    if (spin.grabbed || !stage.hasWebGL) return;
    stage.project(rig.glassAnchor, center);
    stage.project(rig.anchors.aroA, rim);
    const r = Math.max(40, Math.hypot(rim.x - center.x, rim.y - center.y));
    const hs = handle.style;
    hs.width = hs.height = `${(2 * r).toFixed(1)}px`;
    hs.left = `${(center.x - r).toFixed(1)}px`;
    hs.top = `${(center.y - r).toFixed(1)}px`;
    hint.style.left = `${center.x.toFixed(1)}px`;
    hint.style.top = `${(center.y + r + 18).toFixed(1)}px`;
  }

  // ------------------------------------------------ destaque de peça
  function highlightPart(key, on) {
    const part = rig.parts[key];
    if (!part) return;
    part.userData.meshes.forEach((m) => { m.material.uniforms.highlight.value = on ? 1 : 0; });
    animate(part, {
      scale: on ? 1.07 : 1,
      duration: on ? 700 : 400,
      ease: on ? spring({ stiffness: 220, damping: 12 }) : 'out(3)',
      composition: 'replace',
    });
  }

  return {
    highlightPart,
    setSpinEnabled,
    refresh: () => spin.refresh(),
    update() {
      // mecânica: velocidade do scroll vira rotação extra
      const y = window.scrollY;
      velocity += (y - lastY - velocity) * 0.18;
      lastY = y;
      const idle = reducedMotion ? 0 : 1;
      knurl += idle * 0.06 + velocity * 0.1;
      gear -= idle * 0.09 + velocity * 0.07;
      rig.knurlSpin.rotation.z = knurl * DEG;
      rig.gearSpin.rotation.z = gear * DEG;

      // paralaxe e luz
      const px = pointer.x();
      const py = pointer.y();
      rig.mouseRig.rotation.y = px * 7 * DEG;
      rig.mouseRig.rotation.x = py * 5 * DEG;
      sharedUniforms.lightDir.value
        .set(baseLight.x + px * 0.55, baseLight.y - py * 0.45, baseLight.z)
        .normalize();

      if (enabled) placeHandle();
    },
  };
}

