// "Fold-in": a picture arrives like a page being turned over. A WebGL copy of the picture is laid exactly over its <img>, then uFoldProgress goes
// 0 -> 1: each column of the sheet turns by up to 180° around a slightly tilted vertical axis, the left edge first and the right edge last (a
// smoothstep with an offset per uv.x). When it has finished the real <img> is shown and the copy is taken away. Used for the covers of the gallery chooser.

import * as THREE from 'three';
import gsap from 'gsap';
import { getLayer, loadTexture, ROTATION_3D_GLSL } from './lumen-layer';

const VERTEX = /* glsl */ `
varying vec2 vUv;
varying float vProgress;
uniform float uFoldProgress;
uniform float uDirection;
${ROTATION_3D_GLSL}

void main() {
  vUv = uv;
  vec2 uv2 = uv;
  if (uDirection == -1.0) {
    uv2.x = 1.0 - uv2.x; // the second cover folds in from the other side
  }
  vec3 p = position;
  float flipProgress = smoothstep(0.0 + uv2.x * 0.3, 0.8 + uv2.x * 0.2, uFoldProgress);
  p.x = -p.x;
  p = (rotation3d(vec3(0.5 * (1.0 - flipProgress), 1.0, 0.0), 3.14159265 * flipProgress) * vec4(p, 1.0)).xyz;
  vProgress = flipProgress;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying float vProgress;
uniform sampler2D uTexture;
uniform float uOpacity;

void main() {
  vec4 color = texture2D(uTexture, vUv);
  float alpha = vProgress * uOpacity; // the parts not yet turned are invisible
  if (alpha == 0.0) discard;
  gl_FragColor = vec4(color.rgb, alpha);
}
`;

interface FoldOptions {
  container: HTMLElement;
  image: HTMLImageElement;
  delay?: number;
  direction?: number;
  duration?: number;
  onComplete?: () => void;
}

/** Returns dispose(). The sheet follows `container` (it may move or resize) and takes the size of `image`. */
export async function foldIn({ container, image, delay = 0, direction = 1, duration = 1.4, onComplete }: FoldOptions) {
  const layer = getLayer('top', 10000);
  const texture = await loadTexture(image.currentSrc || image.src);
  const uniforms = {
    uTexture: { value: texture },
    uFoldProgress: { value: 0 },
    uOpacity: { value: 0 },
    uDirection: { value: direction },
  };
  const material = new THREE.ShaderMaterial({ side: THREE.DoubleSide, transparent: true, uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT });
  const geometry = new THREE.PlaneGeometry(1, 1, 32, 32);
  const mesh = new THREE.Mesh(geometry, material);
  layer.add(mesh);

  const stopFrame = layer.onFrame(() => {
    const world = layer.rectToWorld(container.getBoundingClientRect());
    const size = layer.rectToWorld(image.getBoundingClientRect());
    mesh.position.set(world.x, world.y, 0);
    mesh.scale.set(size.width, size.height, 1);
  });

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    timeline.kill();
    stopFrame();
    layer.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  const timeline = gsap.timeline({
    onComplete: () => {
      onComplete?.();
      requestAnimationFrame(dispose); // one frame for the real <img> to show before the copy goes
    },
  });
  timeline.to(uniforms.uFoldProgress, { value: 1, duration, delay, ease: 'sine.inOut' }, 0);
  timeline.to(uniforms.uOpacity, { value: 1, duration: 0.1, delay, ease: 'power2.out' }, 0);

  return dispose;
}
