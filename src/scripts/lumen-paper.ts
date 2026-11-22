// "Paper" hover (mouse only): while the pointer is over a gallery photo, a WebGL copy of the photo is laid exactly over it and lifts gently
// towards the viewer around the pointer. The faster the pointer moves, the higher the lift (never much); the edges of the picture stay flat.
// A faint sheen crosses the picture every ten seconds. The pointer is followed with a little delay, so the lift trails it like cloth.
//
// const paper = initPaperHover();   paper.enter(event, img) / paper.move(event, img) / paper.leave(event?, img?) / paper.dismiss() / paper.destroy()

import * as THREE from 'three';
import { getLayer, loadTexture, textureRatio, coverWindow } from './lumen-layer';

const VERTEX = /* glsl */ `
uniform vec2 uPointer;   // in the picture's own 0..1 space, y up
uniform float uAspect;   // width / height of the picture
uniform float uHeight;   // world height of the picture
uniform float uLift;     // world units the bulge rises at its highest
uniform float uStrength; // 0..1, fades the whole effect in and out
varying vec2 vUv;
varying float vLight;

const float WIDTH = 0.3;

void main() {
  vUv = uv;
  vec2 q = (uv - uPointer) * vec2(uAspect, 1.0);
  float d = max(length(q), 0.0001);

  // the edges are held flat, so the outline of the picture never moves and never shows the page's own picture around it
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float hold = smoothstep(0.0, 0.14, edge);

  float bump = exp(-(d * d) / (WIDTH * WIDTH));
  float rise = uStrength * uLift * bump * hold;

  // slope of the surface along the direction away from the pointer, for a little shading
  float slope = uStrength * uLift * bump * hold * (-2.0 * d / (WIDTH * WIDTH));
  vec2 away = q / d;
  vec3 normal = normalize(vec3(-away * slope / uHeight, 1.0));
  vLight = clamp(dot(normal, normalize(vec3(-0.35, 0.45, 0.8))) / 0.8, 0.9, 1.1);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, rise, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec4 uCrop;
uniform float uTime;
uniform float uStrength;
uniform vec2 uPx;   // size of the picture on the screen, in pixels
varying vec2 vUv;
varying float vLight;

const float CORNER = 10.0; // px, the rounding of the photos on the page

void main() {
  vec3 colour = texture2D(uMap, uCrop.xy + vUv * uCrop.zw).rgb;
  colour *= mix(1.0, vLight, uStrength);
  float t = fract(uTime / 10.0);
  float across = (vUv.x + vUv.y) * 0.5 - (t * 1.6 - 0.3);
  colour += exp(-(across * across) / 0.004) * 0.05 * uStrength;
  vec2 q = abs((vUv - 0.5) * uPx) - (uPx * 0.5 - CORNER);
  float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - CORNER;
  // fades with the strength, so a copy that is going away dissolves into the page's own picture instead of sitting over it
  gl_FragColor = vec4(colour, (1.0 - smoothstep(-0.8, 0.8, outside)) * smoothstep(0.0, 0.35, uStrength));
}
`;

const grid = new THREE.PlaneGeometry(1, 1, 56, 56);

interface Hover {
  img: HTMLImageElement;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  ratio: number;
  goal: number; // strength it is heading for: 1 while hovered, 0 while leaving
  strength: number;
  target: THREE.Vector2; // pointer in the picture's 0..1 space, y up
  eased: THREE.Vector2; // the same, followed with a delay
  speed: number; // how fast the pointer moves, smoothed (picture heights per second)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function pointerIn(event: PointerEvent, img: HTMLElement, into: THREE.Vector2) {
  const r = img.getBoundingClientRect();
  return into.set(clamp01((event.clientX - r.left) / r.width), 1 - clamp01((event.clientY - r.top) / r.height));
}

export function initPaperHover() {
  let layer: ReturnType<typeof getLayer> | undefined;
  let stopFrames: (() => void) | undefined;
  let current: Hover | null = null;
  const leaving = new Set<Hover>();
  let loading: HTMLImageElement | null = null;

  const discard = (h: Hover) => {
    layer?.scene.remove(h.mesh);
    h.material.dispose();
    leaving.delete(h);
  };

  const step = (h: Hover, dt: number) => {
    const rect = h.img.getBoundingClientRect();
    h.mesh.visible = rect.width > 1 && rect.height > 1;
    if (!h.mesh.visible || !layer) return;

    h.strength += (h.goal - h.strength) * (1 - Math.exp(-dt * (h.goal ? 7 : 9)));
    const before = h.eased.clone();
    h.eased.lerp(h.target, 1 - Math.exp(-dt * 2.4));
    const moved = h.eased.distanceTo(before) / Math.max(dt, 0.001);
    h.speed += (moved - h.speed) * 0.12;

    const box = layer.fromDom(rect);
    h.mesh.position.set(box.x, box.y, 0);
    h.mesh.scale.set(box.width, box.height, 1);
    const u = h.material.uniforms;
    u.uPointer.value.copy(h.eased);
    u.uAspect.value = rect.width / rect.height;
    u.uHeight.value = box.height;
    u.uLift.value = box.height * 0.07 * (0.5 + 0.5 * clamp01(h.speed / 1.2));
    u.uStrength.value = h.strength;
    (u.uPx.value as THREE.Vector2).set(rect.width, rect.height);
    (u.uCrop.value as THREE.Vector4).set(...coverWindow(h.ratio, rect.width / rect.height));
  };

  const frame = (dt: number, elapsed: number) => {
    if (current) {
      current.material.uniforms.uTime.value = elapsed;
      step(current, dt);
    }
    leaving.forEach((h) => {
      h.material.uniforms.uTime.value = elapsed;
      step(h, dt);
      if (h.strength < 0.01) discard(h);
    });
  };

  const release = (h: Hover) => {
    h.goal = 0;
    leaving.add(h);
  };

  return {
    async enter(event: PointerEvent, img: HTMLImageElement) {
      if (current?.img === img) return;
      if (current) {
        release(current);
        current = null;
      }
      loading = img;
      const texture = await loadTexture(img.currentSrc || img.src);
      if (loading !== img) return; // the pointer has left in the meantime
      loading = null;

      layer ??= getLayer('top', 900);
      stopFrames ??= layer.every(frame);
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uMap: { value: texture },
          uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
          uPointer: { value: new THREE.Vector2(0.5, 0.5) },
          uAspect: { value: 1 },
          uHeight: { value: 1 },
          uLift: { value: 0 },
          uStrength: { value: 0 },
          uTime: { value: 0 },
          uPx: { value: new THREE.Vector2(1, 1) },
        },
        transparent: true,
      });
      const mesh = new THREE.Mesh(grid, material);
      const start = pointerIn(event, img, new THREE.Vector2());
      current = {
        img,
        mesh,
        material,
        ratio: textureRatio(texture),
        goal: 1,
        strength: 0,
        target: start.clone(),
        eased: start.clone(),
        speed: 0,
      };
      layer.scene.add(mesh);
    },

    move(event: PointerEvent, img: HTMLImageElement) {
      if (current?.img === img) pointerIn(event, img, current.target);
    },

    leave(_event?: PointerEvent, img?: HTMLImageElement) {
      if (img && loading === img) loading = null;
      if (img && current?.img !== img) return;
      loading = null;
      if (current) {
        release(current);
        current = null;
      }
    },

    /** Takes the copy away at once, without fading (when a picture opens: a fading copy would hang over it for a moment). */
    dismiss() {
      loading = null;
      if (current) discard(current);
      current = null;
      [...leaving].forEach(discard);
    },

    destroy() {
      loading = null;
      stopFrames?.();
      stopFrames = undefined;
      if (current) discard(current);
      current = null;
      [...leaving].forEach(discard);
    },
  };
}
