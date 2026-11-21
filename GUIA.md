# Desmontando o animejs.com

Guia de engenharia reversa da página inicial do [animejs.com](https://animejs.com) e de como o **Desmonte** (este projeto) reproduz cada técnica com código e conteúdo próprios.

---

## 1. Resumo

O site do anime.js parece uma página com animações, mas por baixo é um **pequeno motor de jogo**:

| Camada | O que o original usa |
|---|---|
| HTML | Páginas estáticas geradas por um CMS (as URLs `/media/pages/...` com hash indicam Kirby) |
| JS | Um módulo `home.js` + 7 chunks gerados pelo **esbuild** (nomes `chunk-XXXXXXXX.js`) |
| 3D | **three.js** (build de 2024) + **postprocessing 6.36.6** (pmndrs) para bloom e aberração cromática |
| Animação | **anime.js 4.5.0**, com o **adaptador oficial para three.js** |
| Modelos | 20 arquivos `.glb` feitos no Blender, um por "módulo" do motor (`module-timer-01.glb`, `module-scroll-01.glb`...) |
| Fontes | DINish (variável, eixo de largura em 125), Berkeley Mono (comercial) e Digital-7 |

Os cinco truques que fazem a página funcionar:

1. **Um canvas WebGL fixo** atrás de todo o conteúdo. O texto rola por cima; o 3D nunca sai do lugar.
2. **Uma timeline mestra** escrita em milissegundos, com um *label* por capítulo, controlada pelo scroll através de um **objeto proxy**.
3. **Um shader de contorno em pós-processamento** que transforma modelos simples em "desenho técnico" e troca de tema animando *uniforms*.
4. **DOM real colado no 3D** com `CSS3DRenderer`: as demos que aparecem na "tela" do motor são `<div>` e `<svg>` animados pelo próprio anime.js.
5. **Capítulos feitos de espaçadores** (`height: 100lvh`) com seções `position: fixed` que só mudam de opacidade.

---

## 2. Como eu desmontei

```bash
# 1. HTML e a lista de tudo que ele carrega
curl -sL https://animejs.com/ -o index.html
grep -oE '(src|href)="[^"]+"' index.html | sort -u

# 2. CSS, JS e imagens (todos servidos pelo próprio animejs.com)
curl -sO https://animejs.com/assets/js/home.js
curl -sO https://animejs.com/assets/css/core.css
curl -sO https://animejs.com/assets/css/home.css

# 3. Os chunks importados por home.js, recursivamente
grep -oE '"\./chunks/[^"]+\.js"' home.js   # e repetir dentro de cada chunk

# 4. Formatar o código minificado para conseguir ler
npx prettier --parser babel home.js > home.pretty.js
```

Para saber o que é cada chunk, procure os **comentários de licença** que o esbuild preserva no fim de cada arquivo:

```
chunk-CPVC3KGU.js  ->  three/build/three.module.js   (546 KB, "Copyright 2010-2024 Three.js Authors")
chunk-WXAKRBIO.js  ->  animejs/dist/modules/...       ("Anime.js - ESM @version v4.5.0")
chunk-N6I4AEHZ.js  ->  animejs/dist/modules/adapters/three/...
home.js            ->  postprocessing v6.36.6 + o código da página
```

Os nomes estão minificados (`H`, `M`, `it`, `E`...). Para mapear, olhe o `export { ... }` do chunk e a definição de cada símbolo. Exemplos reais:

```js
Be = (s) => new As(s).init()      // createTimeline
xo = (s = {}) => new Ns(s)        // onScroll
ms = (s, t = {}) => { ... }       // stagger
ci = (s) => new Ls(s)             // createScope
fi = (s = 10, t) => { ... }       // steps
```

Depois disso, `H({...})` vira `createTimeline({...})`, `it({...})` vira `onScroll({...})`, e o código fica legível.

Para ver a página em movimento, usei o Chromium do Playwright com WebGL por software (`--use-angle=swiftshader --enable-unsafe-swiftshader`) e tirei capturas em várias posições de scroll.

---

## 3. A estrutura da página

### Camadas

```
┌─────────────────────────────────────────────┐
│ header (sticky)                             │  z alto
│ .sub-nav: régua de progresso + cartões      │
│ CSS3DRenderer: demos coladas na tela 3D     │
│ <main>: capítulos com texto e espaçadores   │
│ #engine: canvas WebGL (position: fixed)     │  z 0
└─────────────────────────────────────────────┘
```

### Capítulos

Cada capítulo é uma `<section>` com dois atributos que o JS lê:

```html
<section id="toolbox" class="section-container section-light"
         data-chapter="toolbox" data-label="TOOLBOX"
         data-enter-offset="-=100lvh" data-leave-offset="-=10lvh">
  <div class="section fixed-section">...texto...</div>
  <div class="section-spacer"></div>   <!-- height: 100lvh -->
  <div class="section-spacer"></div>
  <div class="section-spacer"></div>
  <div class="section-spacer"></div>
</section>
```

- `data-label` é o nome do label na timeline mestra (`TOOLBOX`, `TOOLBOX_END`).
- `data-enter-offset` e `data-leave-offset` ajustam onde o capítulo "começa" e "termina" para o `onScroll`.
- Os `.section-spacer` só existem para dar **altura de scroll**. Quatro espaçadores = quatro telas de rolagem para a vista explodida.
- `.fixed-section` é `position: fixed; opacity: .001` e só aparece quando o capítulo está ativo. (Opacidade `.001` em vez de `0` evita que o navegador descarte a camada.)

As unidades são `lvh` (*large viewport height*): no celular, a barra de endereço aparecendo e sumindo não muda a altura dos capítulos.

### Componentes

Patrocinadores, botão de apoio, barra de financiamento e newsletter são **Custom Elements** (`<sponsors-list>`, `<sponsor-button>`, `<funding-level>`, `<email-signup>`), cada um buscando seus dados via `fetch`.

---

## 4. O design system

### Cores

O `core.css` define **20 matizes × 8 tons**: `--hex-red-1` (o mais vivo) até `--hex-red-8` (quase o fundo). Cada módulo do anime.js tem uma classe que aponta um conjunto "atual":

```css
.color-timeline { --hex-current-1: var(--hex-yellow-1); /* ... até -8 */ }
.feature-section .section-text h2 { color: var(--hex-current-1); }
```

O JS lê essas variáveis com `utils.get(el, '--hex-current-1')` e repassa ao WebGL, então **as cores do 3D também vêm do CSS**:

```css
:root {
  --backgroundColor: var(--hex-bg-1);  /* #252423 */
  --rimColor: #ffc7a8;
  --shadowColor: #212121;
  --worldColor1: #423d3d;
  --outlineColor: #101010;
  --worldColorLight1: #dad5d0;         /* o "papel" da seção clara */
}
```

### Tipografia

- **DINish** variável com `font-variation-settings: "wdth" 125` (DIN expandida).
- **Berkeley Mono** para código e rótulos em caixa alta.
- Escala em tokens (`--text-xxxxl` a `--text-xxxs`) que mudam em `900px`.

---

## 5. O motor 3D

### Modelos

20 arquivos `.glb` carregados com `GLTFLoader`, um por peça (`module-engine-01.glb`, `module-spring-01.glb`...). As peças vêm com **vertex colors** pintadas no Blender: elas não são a cor final, são **identificadores** para o detector de bordas.

### O material (passada 1)

Um `MeshLambertMaterial` modificado com `onBeforeCompile`. A saída não é a cor final:

```glsl
// RGB = cor de identificação misturada com a normal codificada em cor
vec3 normalColor = vec3(.5 * (1. + n.x), .5 * (1. + n.y), .5 * (1. + n.z));
vec3 diffuse = mix(vColor.rgb, normalColor, mixNormal);
// A = luz quantizada: 1 aceso, 0 sombra (com um termo de borda)
gl_FragColor = vec4(diffuse, shadowsColor);
```

### O contorno (passada 2)

Um shader de tela cheia lê essa imagem e faz **detecção de bordas de Roberts** (quatro amostras na diagonal):

```glsl
vec3 d0 = sample(+1,+1) - sample(-1,-1);
vec3 d1 = sample(-1,+1) - sample(+1,-1);
float edge = sqrt(dot(d0, d0) + dot(d1, d1));
float outline = edge > threshold ? 1. : 0.;   // threshold = .035
```

Se o pixel é branco puro, é fundo. Senão, o alfa escolhe entre tinta, sombra e brilho de borda. Bordas aparecem entre peças (cores de ID diferentes) e em quinas da mesma peça (normais diferentes). Depois disso, o `EffectComposer` do pacote `postprocessing` aplica **bloom** e **aberração cromática**, tudo renderizado a 2× (3× em telas com DPR > 2).

### Trocar de tema = animar uniforms

A seção clara ("The complete animator's toolbox") não troca de cena nem de material. Ela anima uniforms:

```js
createTimeline({ defaults: { duration: 250, ease: 'inOutQuad' } })
  .add(document.body, { backgroundColor: colors.worldColorLight1 }, 0)
  .add(outlineShaderMaterial, {
    outlineBlend: .35, contourBlend: .35,
    rimColor: colors.worldColorLight1,
    worldColor1: colors.worldColorLight1,
    shadowColor: colors.worldColorLight1,
    backgroundColor: colors.worldColorLight1,
    outlineColor: colors.outlineColorLight,
  }, 0);
```

Isso só funciona porque o **adaptador three do anime.js** (`import 'animejs/adapters/three'`) ensina o motor a animar:

- `x`, `y`, `z`, `rotateX/Y/Z` (em graus), `scale`, `opacity` em qualquer `Object3D`;
- uniforms de um `ShaderMaterial` pelo nome, inclusive cores (`'#dad5d0'`).

### DOM dentro do 3D

A "tela" circular do motor é um `<div>` de 400 × 400 px transformado pelo `CSS3DRenderer`, que usa a mesma câmera do WebGL. As demos (`.square`, `.shape`, os SVGs) são DOM real animado com `animate()`. O anel colorido em volta é um SVG com 8 arcos desenhados por `createDrawable`.

A exceção é a demo de arraste: ela fica numa camada plana fixa, porque o `Draggable` mapeia o ponteiro invertendo as matrizes dos pais e ignora a propriedade CSS `perspective` que o `CSS3DRenderer` usa.

---

## 6. A coreografia: scroll vira tempo

Esta é a parte mais importante. O código abaixo é o do original, simplificado e com os nomes reais no lugar dos minificados:

```js
// 1. A timeline mestra, escrita em ms, com labels
const master = createTimeline({ autoplay: false, defaults: { ease: 'inOut(3)' } })
  .label('INTRO')
  // ... animações de abertura ...
  .label('INTRO_END')
  .label('HEADING')
  .add(scene, { z: 15, rotateX: 90, rotateY: -135 }, 'HEADING')
  // ... explosão do motor, rótulos, etc ...
  .label('HEADING_END')
  .label('TOOLBOX')
  // ...
  .label('TOOLBOX_END');

// 2. Um proxy e uma timeline ligada ao scroll do documento inteiro
const proxy = { currentTime: 0 };
const scroller = createTimeline({
  defaults: { ease: 'linear' },
  autoplay: onScroll({
    target: document.body,
    sync: .9,        // segue o scroll com suavização
    enter: 'max',    // cobre do scroll 0...
    leave: 'min',    // ...ao scroll máximo
    onUpdate: () => master.seek(proxy.currentTime),
  }),
});

// 3. Cada capítulo anima o proxy de LABEL até LABEL_END,
//    com duração igual à altura do capítulo EM PIXELS
let offset = 0;
document.querySelectorAll('[data-label]').forEach((chapter) => {
  const label = chapter.dataset.label;
  scroller.add(proxy, {
    currentTime: [master.labels[label], master.labels[label + '_END']],
    duration: chapter.offsetHeight,
    composition: 'none',
  }, offset);
  offset += chapter.offsetHeight;
});
```

Por que isso é bom:

- A animação é pensada em **tempo** e o layout em **altura**. Para alongar um capítulo, basta mais um `.section-spacer`; nenhuma animação muda.
- A abertura (`INTRO` até `INTRO_END`) é **tocada por tempo** no carregamento; o resto é dirigido pelo scroll. É a mesma timeline.
- Voltar a rolagem roda tudo de trás para frente, de graça.

### As features têm a própria timeline

A galeria de recursos usa uma segunda timeline, ligada só ao trecho `#features-gallery`:

```js
onScroll({
  target: '#features-gallery',
  sync: .9,
  enter: () => 'top top-=1',
  leave: () => 'bottom bottom+=100lvh',
}).link(features);
```

Dentro dela, trechos **sincronizados** (o arco do anel desenhando com `draw: '0 1'`) convivem com **gatilhos** `.call()` nas fronteiras, que disparam animações por tempo (mostrar a demo, trocar o texto). O callback recebe o timer e usa `backwards` para saber a direção:

```js
features.call(({ backwards }) => {
  backwards ? demo.onLeave() : demo.onEnter();
});
```

### Thresholds do onScroll

O formato é **"container alvo"**:

| Valor | Significado |
|---|---|
| `enter: 'end start'` (padrão) | o fim do container (base da janela) encontra o início do alvo |
| `leave: 'start end'` (padrão) | o início do container (topo da janela) encontra o fim do alvo |
| `'top top-=100lvh'` | o topo da janela encontra um ponto 100lvh acima do topo do alvo |
| `'max'` / `'min'` | limitam ao scroll máximo/mínimo possível |

### Responsivo

Tudo que depende de breakpoint é construído dentro de um `createScope`:

```js
createScope({ mediaQueries: { minM: '(min-width: 900px)' } })
  .add(({ matches }) => {
    camera.position.z = matches.minM ? 120 : 180;
    // ... reconstrói a timeline mestra ...
  });
```

Quando a media query muda, o escopo reverte tudo que criou e roda a função de novo.

---

## 7. Detalhes de interface

- **Título do hero**: `splitText` em letras + `stagger(25, { ease: 'outIn(2)' })`.
- **Palavra que troca**: "the web" → `['HTML', 'WebGL', 'CSS', 'Canvas 2D', 'SVG', 'anything']`. As letras somem da última para a primeira (`stagger(25, { from: 'last' })`) enquanto o ponto vermelho estica (`scaleX: [4, 1]`) e corre até o início da palavra.
- **Régua de progresso**: o cursor é um `createDraggable` com `y: false` dentro de `.scroll-bar`; arrastar rola a página. Um segundo cursor, "fantasma", segue o mouse com `createAnimatable`.
- **Cartões de código**: `<pre data-card="...">` fixos no canto, mostrados e escondidos por `onScroll` com `onEnter`/`onLeave` de cada seção.
- **Gráfico de módulos**: barras com `data-size` e um contador de KB.

---

## 8. Como o Desmonte reproduz cada técnica

| Técnica do original | No Desmonte | Arquivo |
|---|---|---|
| Canvas WebGL fixo + texto por cima | igual | `index.html`, `css/style.css` |
| 20 modelos `.glb` do Blender | 10 peças geradas em código (cilindros, anéis, engrenagem, tubos) | `js/device.js` |
| Vertex colors como ID | uma cor de ID aleatória (com semente) por malha | `js/toon.js` |
| Material Lambert + `onBeforeCompile` | `ShaderMaterial` próprio, mais fácil de ler | `js/toon.js` |
| Contorno de Roberts em pós-processamento | igual, num quad de tela cheia sem bibliotecas extras | `js/toon.js` |
| Tema claro animando uniforms | tema "planta azul" (cianotipo) animando os mesmos uniforms | `js/main.js` |
| Timeline mestra + proxy + `onScroll` | igual | `js/main.js` |
| Timeline das features com `.link()` | igual; a demo ativa é calculada a partir do tempo (em vez de `.call()`) | `js/main.js` |
| `CSS3DRenderer` para as demos | igual, com moldura e vidro em dois planos | `js/screen.js` |
| Demo de arraste em camada plana | igual, alinhada por projeção a cada quadro | `js/screen.js` |
| Rótulos da vista explodida com linhas | projeção 3D → pixels, linha horizontal + 45°, `createDrawable` | `js/callouts.js` |
| `splitText` e palavra que troca | igual, com outras palavras | `js/hero.js` |
| Régua com `createDraggable` + `createAnimatable` | igual, com número da folha | `js/chrome.js` |
| Cartões de código | igual, com realce de sintaxe próprio | `js/chrome.js`, `js/highlight.js` |
| Gráfico de tamanho dos módulos | peso real de tudo que a página baixa | `js/chart.js` |
| `createScope` com media queries | igual (e uma demo própria com `scope.refresh()`) | `js/main.js`, `js/demos.js` |

O que **não** foi copiado: modelos, textos, marca, ilustrações e fontes do original. As demos são outras, a paleta é outra e a geometria nasce do código.

---

## 9. Rodando e adaptando

### Rodar

O projeto não tem etapa de build. Ele precisa de um servidor HTTP (módulos ES não carregam por `file://`):

```bash
cd desmonte
npx serve .
```

ou

```bash
python3 -m http.server 8080
```

As bibliotecas vêm do jsDelivr pelo **import map** do `index.html`. O adaptador three e o core do anime.js precisam vir **da mesma base de URL**: o core consulta um registro de adaptadores (`adapters/registry.js`), e duas cópias desse módulo não se enxergam.

### Depurar

- `?nosmooth` na URL desliga a suavização do scroll.
- No console: `__desmonte.master.currentTime`, `__desmonte.master.labels`, `__desmonte.proxy.time`.

### Acrescentar um capítulo

1. Crie a seção com `data-chapter`, `data-label="NOVO"` e espaçadores.
2. Em `buildMaster()`, entre os labels do capítulo anterior e do seguinte:
   ```js
   .label('NOVO', 9000)
   .add(rig.turnRig, { rotateY: 45, duration: 600 }, 'NOVO')
   .label('NOVO_END', 10000)
   ```
3. O scroller encontra o capítulo sozinho pelo `data-label`.

### Acrescentar uma demo

Escreva uma função em `js/demos.js` que receba o elemento raiz e devolva `{ enter, leave }` (e `syncable`, se o progresso deve seguir o scroll). Registre em `BUILDERS` e crie o `<article class="feature" data-feature="...">` e o `<pre class="code-card" data-card="...">` correspondentes.

### Para produção

Sem build, o navegador baixa o three.js inteiro (cerca de 408 KB com gzip) e os 57 módulos do anime.js separados. Com esbuild ou Vite, o *tree-shaking* corta o three.js para o que é usado (o chunk do original tem 546 KB minificado, 133 KB com gzip):

```bash
npm i three animejs
npx esbuild js/main.js --bundle --format=esm --minify --splitting --outdir=dist
```

---

## 10. Armadilhas que encontrei

- **`createSpring()` está obsoleto** no anime.js 4.5. Use `spring({ stiffness, damping })`.
- **Easing em string com parâmetros foi removido** para `steps`, `irregular`, `linear` e `cubicBezier`: `ease: 'steps(8)'` vira `ease: steps(8)` (importado).
- **Labels não estendem a duração** de uma timeline, e `seek()` além da duração é ignorado. Coloque uma animação (ou `.add({ duration: 1 }, 'FIM-=1')`) até o último label.
- **`timeline.init()` manual** renderiza o estado inicial de todos os filhos. Sem isso, tweens com atraso só aplicam o valor inicial quando começam, e o elemento pisca.
- **Duas timelines no mesmo elemento brigam** pela mesma propriedade. Separe: a abertura anima os filhos de `.hero-foot`; a timeline mestra anima o próprio `.hero-foot`.
- **`Draggable` dentro de `CSS3DRenderer`** erra a posição do ponteiro (a perspectiva não entra na conta). Use uma camada plana alinhada.
- **Animações criadas dentro de um `createScope` morrem quando ele é revertido**. A abertura e o laço de desenho ficam fora do escopo.
- **`opacity: 0` em seções fixas sem fallback** deixa a página vazia se o JS falhar. O Desmonte marca `html.js` no `<head>` e volta ao layout estático se o módulo não carregar em 8 s.

---

## 11. Rodada 2: as animações novas

Depois de reproduzir a base, a segunda rodada acrescentou camadas de animação e interação. Cada uma usa uma API diferente do anime.js ou um truque de shader.

### A planta que "varre" a tela

Antes, a troca de tema animava sete cores de uma vez. Agora o shader tem **as duas paletas ao mesmo tempo** e um único número decide o que aparece em cada pixel:

```glsl
// 0 no canto inferior esquerdo, 1 no canto superior direito
float d = (vUv.x * aspect + vUv.y) / (aspect + 1.0);
float front = printMix * (1.0 + 2.0 * band) - band;
float m = smoothstep(front + band, front - band, d);       // 0 = escuro, 1 = planta
float scan = exp(-pow((d - front) / (band * 0.12), 2.0));  // linha de luz na frente
vec3 color = mix(dark, print, m) + printLineColor * scan * 0.38;
```

Na timeline mestra, a transição inteira virou uma linha, e ela é dirigida pelo scroll:

```js
.add(shader, { printMix: [0, 1], duration: 450, ease: 'linear' }, 'PECAS+=30')
```

A **grade de prancheta** é desenhada no mesmo shader, só nos pixels de fundo da planta: linhas a cada 24 px e linhas mais fortes a cada 120 px, calculadas a partir de `gl_FragCoord`.

### O motor se monta na abertura

As peças começam explodidas e deslizam até o lugar, do fundo para a frente, com valores iniciais calculados por peça:

```js
.add(rig.groups, {
  z: { from: (g) => g.userData.baseZ * 2.3, to: (g) => g.userData.baseZ },
  delay: stagger(70, { from: 'last' }),
  ease: 'out(4)',
}, 100)
.add(rig.bolts, { z: { from: (b) => b.userData.baseZ - 3 }, rotateZ: { from: -540 } }, 900) // parafusos "rosqueando"
```

### Interação sem conflito: um nível de rig para cada fonte

O objeto 3D recebe movimento de quatro lugares: a timeline mestra, o mouse, o arraste e o laço de desenho. Se dois deles mexessem na mesma propriedade, um apagaria o outro. A solução é uma hierarquia em que **cada nível tem um dono**:

```
stageRig  -> enquadramento (timeline mestra)
mouseRig  -> paralaxe (createAnimatable)
spinRig   -> arraste (createDraggable)
tiltRig   -> inclinação (timeline mestra)
turnRig   -> orientação (timeline mestra)
```

- **Paralaxe e luz**: um `createAnimatable({ x: 0, y: 0 }, { x: 1400, y: 1400 })` persegue o mouse. A cada quadro, o valor atual inclina o `mouseRig` e desloca o uniform da direção da luz, então as faixas de sombra andam pela peça.
- **Arrastar para girar**: uma alça invisível sobre o motor é um `createDraggable` com `snap: [0]` e `releaseEase: spring(...)`. O `x` do arraste vira `rotateY`, e a mola traz o motor de volta balançando.
- **Mecânica**: a engrenagem e o anel serrilhado giram sozinhos, e a velocidade do scroll (diferença de `scrollY` entre quadros, suavizada) soma rotação. Para não brigar com a timeline, eles giram um grupo intermediário, não a malha.

### Cotas com medida ao vivo

Na vista explodida, duas cotas de desenho técnico acompanham o motor: o comprimento total (L) e o diâmetro da moldura (Ø). Os pontos são âncoras 3D projetadas para pixels a cada quadro; o valor vem da distância 3D entre elas, então **L cresce enquanto o motor explode** (de 403 para cerca de 597 mm):

```js
dim.a.getWorldPosition(wa);
dim.b.getWorldPosition(wb);
const mm = (wa.distanceTo(wb) / rig.stageRig.scale.x) * 10; // 1 unidade = 10 mm
```

Passar o mouse num rótulo acende a peça (um uniform `highlight` no material vira um tom especial que o pós-processamento pinta de âmbar) e a peça pula com uma mola; clicar leva à técnica correspondente.

### scrambleText

O anime.js 4.5 embaralha texto como uma propriedade animável:

```js
animate(label, { innerHTML: scrambleText({ text: 'createTimeline', chars: 'a-z0-9_', cursor: '_' }) });
```

Ele aparece nos nomes da vista explodida, nos sobretítulos dos capítulos, no número da folha, na dica da régua e no "motor pronto" do carregador.

### Fonte variável animada

A Archivo tem eixos de largura e peso. As letras do título entram estreitas e finas e se esticam:

```js
animate(chars, {
  fontStretch: ['62%', '118%'],
  fontWeight: [250, 690],
  delay: stagger(32),
});
```

Depois, cada letra ganha um `createAnimatable` próprio e engorda conforme a distância até o cursor. Os títulos das técnicas fazem o mesmo ao entrar.

### A tela troca de canal como uma TV

A demo antiga colapsa numa linha (`scaleY: 0.012`) e some; a nova se abre a partir de uma linha, e um traço de luz atravessa o vidro. Embaixo da demo, um HUD mostra valores ao vivo: `x`, `y` e `rotate` lidos com `utils.get(el, 'x', false)`, `progress` da animação sincronizada com o scroll, `velocity` do Draggable, `iterationCurrentTime` da timeline.

### Texto que se monta

- `splitText(title, { words: { wrap: 'clip' } })` põe cada palavra dentro de uma máscara; animar `y: ['110%', '0%']` faz a palavra subir de dentro dela.
- `wrap: 'visible'` cria um invólucro sem máscara. No rodapé, a montagem anima a letra e o empurrão do cursor anima o invólucro, sem duas animações na mesma propriedade.
- O "desmonte." gigante do rodapé chega espalhado e se monta com `spring()`. O tamanho da fonte é calculado medindo a palavra a 100 px e escalando para a largura disponível ("fit text").

### Carregador de verdade

Antes dos módulos chegarem, um script comum (não-módulo) observa os recursos com `PerformanceObserver` e conta cada arquivo do jsDelivr que termina de baixar. Quando o `main.js` roda, ele troca o texto por "motor pronto" com scrambleText e dissolve o carregador.

### Armadilhas desta rodada

- **Camadas fixas invisíveis roubam o ponteiro.** Os textos dos capítulos fixos ficam com opacidade 0,001 no mesmo lugar do título do hero. Com `pointer-events: auto`, eles capturavam o mouse e o efeito de proximidade não funcionava. Só o que está visível deve receber eventos.
- **Uma animação com atraso pode "ressuscitar".** Se uma animação de entrada tem `delay: 600` e a de saída começa antes, a de entrada substitui a de saída quando finalmente começa. Guarde a referência e chame `.cancel()` antes de iniciar outra.
- **Transform fora da tela aumenta a área rolável.** As letras do rodapé espalhadas com `translateX(60vw)` faziam o Chrome do celular reduzir o zoom da página inteira. `overflow-x: clip` no rodapé resolve.
- **`backface-visibility` não basta no CSS3DRenderer.** Ao girar o motor, o DOM da tela aparecia espelhado. A cada quadro, o código compara a normal da tela com a direção da câmera e esconde a camada quando ela fica de costas.
- **`.then()` de timeline** é a forma limpa de encadear algo ao fim de uma animação (o efeito de proximidade só liga depois que o título terminou de entrar).
