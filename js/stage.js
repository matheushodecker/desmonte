// ---------------------------------------------------------------------------
// stage.js — renderer WebGL + CSS3DRenderer compartilhando cena e câmera
//
// O canvas WebGL fica fixo no fundo (#engine). O CSS3DRenderer cuida de uma
// segunda camada (#screen-layer), acima do texto: ele aplica em elementos DOM
// a mesma matriz de projeção da câmera, e o DOM "gruda" nas peças 3D.
// Sem WebGL, a cena continua existindo: só a camada DOM é desenhada.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { createOutlinePass } from './toon.js';

export function createStage({ container, cssLayer }) {
  let renderer = null;
  let post = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    post = createOutlinePass(renderer);
  } catch (error) {
    console.warn('WebGL indisponível: seguindo só com a camada DOM.', error);
    renderer = null;
    post = null;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 600);
  camera.position.set(0, 0, 60);
  const css = new CSS3DRenderer({ element: cssLayer });

  const stage = {
    renderer, scene, camera, css, post,
    hasWebGL: !!renderer,
    width: 1, height: 1, pixelRatio: 1,
  };

  stage.resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // limita a densidade em telas grandes: o pós-processamento roda por pixel
    let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (width * height * pixelRatio * pixelRatio > 5e6) {
      pixelRatio = Math.max(1, Math.sqrt(5e6 / (width * height)));
    }
    stage.width = width;
    stage.height = height;
    stage.pixelRatio = pixelRatio;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    css.setSize(width, height);
    if (renderer) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      post.setSize(width, height, pixelRatio);
    }
  };

  stage.render = () => {
    if (renderer) post.render(scene, camera);
    else scene.updateMatrixWorld();
    css.render(scene, camera);
  };

  // projeta a posição de um objeto do mundo para pixels da janela
  const v = new THREE.Vector3();
  stage.project = (object, out = { x: 0, y: 0 }) => {
    v.setFromMatrixPosition(object.matrixWorld).project(camera);
    out.x = (v.x + 1) * 0.5 * stage.width;
    out.y = (1 - v.y) * 0.5 * stage.height;
    return out;
  };

  stage.resize();
  return stage;
}
