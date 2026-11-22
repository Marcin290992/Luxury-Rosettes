// "Paper" hover (mouse only). While the mouse is over a gallery photo, a WebGL copy of it (a plane of 60 x 60 segments) is laid over the <img>.
// The vertex shader lifts the paper towards the viewer around the mouse: the faster the mouse moves, the stronger the bulge, with a soft ripple
// ring going outwards. The pointer is smoothed (5 % per frame), so the bulge trails the cursor like cloth; a faint sheen crosses every 10 s.
// initPaperHover(images) returns { enter, move, leave, destroy }, wired to the photos' pointer events by the gallery.

import * as THREE from 'three';
import { getLayer, disposeLayer, loadTexture } from './lumen-layer';

const VERTEX = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform vec2 uPointer;
uniform float uPointerStrength;
uniform float uPointerAmplitude;
uniform float uDistortionStrength;
uniform float uPointerActive;

void main() {
  vUv = uv;
  vec3 p = position;
  float pointerDist = length(uv - uPointer);

  // a slow ripple ring around the pointer once it has moved
  float ripple = pow(smoothstep(0.35, 0.0, pointerDist), 2.0);
  float wave = sin(pointerDist * 12.0 - uTime * 0.3) * 0.5 + 0.5;
  float distortion = ripple * wave * uDistortionStrength * uPointerActive;

  // the bulge: strongest under the pointer, fading out over 0.6 of the picture
  float bend = pow(smoothstep(0.6, 0.0, pointerDist), 1.8);
  float lift = bend * uPointerStrength * uPointerAmplitude * 0.7;
  lift += bend * uPointerStrength * uPointerAmplitude * 0.2 * sin(pointerDist * 12.0 + uTime * 3.0);

  p.z = lift + distortion * 0.08;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uOpacity;
uniform float uTime;
uniform vec2 uSize; // the photo in pixels
uniform float uRadius;

float diagonalLine(vec2 uv, float fadeBottom, float fadeTop) {
  float center = uv.x;
  return smoothstep(center - fadeBottom, center, uv.y) - smoothstep(center, center + fadeTop, uv.y);
}

void main() {
  // rounded corners, like the photo under it (uRadius px)
  vec2 q = abs((vUv - 0.5) * uSize) - uSize * 0.5 + uRadius;
  float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - uRadius;
  float cornerMask = 1.0 - smoothstep(-0.5, 0.5, d);
  if (cornerMask <= 0.0) discard;
  vec4 color = texture2D(uTexture, vUv);
  vec2 uv1 = vUv - 0.5;
  float t = mod(uTime * 0.2, 2.0);
  uv1.y += t * 2.55 - 1.05;
  float sheen = diagonalLine(uv1, 0.05, 0.5) * 0.01;
  vec3 finalColor = mix(color.rgb, vec3(1.0), sheen);
  gl_FragColor = vec4(finalColor, color.a * uOpacity * cornerMask);
}
`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = THREE.MathUtils.clamp;

interface Entry {
  element: HTMLImageElement;
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
  active: boolean;
  pointer: { x: number; y: number } | null;
  lastPointer: { x: number; y: number } | null;
  lastTime: number | null;
  travelled: number;
  moved: boolean;
  strength: number;
  activeLerp: number;
  smoothPointer: THREE.Vector2;
}

export function initPaperHover() {
  let layer: ReturnType<typeof getLayer> | undefined;
  let stopFrame: (() => void) | undefined;
  let current: Entry | null = null;
  let fading: Entry[] = [];
  let pending: HTMLImageElement | null = null; // the picture whose texture is still loading

  const make = (element: HTMLImageElement, texture: THREE.Texture): Entry => {
    const uniforms = {
      uTexture: { value: texture },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uPointerStrength: { value: 0 },
      uPointerAmplitude: { value: 0 },
      uDistortionStrength: { value: 0.6 },
      uPointerActive: { value: 0 },
      uSize: { value: new THREE.Vector2(100, 100) },
      uRadius: { value: 10 },
    };
    const material = new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 60, 60), material);
    layer!.add(mesh);
    return {
      element,
      mesh,
      uniforms,
      active: true,
      pointer: null,
      lastPointer: null,
      lastTime: null,
      travelled: 0,
      moved: false,
      strength: 0,
      activeLerp: 0,
      smoothPointer: new THREE.Vector2(0.5, 0.5),
    };
  };

  const step = (entry: Entry, time: number) => {
    const u = entry.uniforms;
    u.uTime.value += 0.04;

    if (entry.active && entry.pointer) {
      if (entry.lastPointer && entry.lastTime !== null) {
        if (!entry.moved) entry.smoothPointer.set(entry.pointer.x, entry.pointer.y);
        const dt = Math.max(time - entry.lastTime, 0.001);
        const dx = entry.pointer.x - entry.lastPointer.x;
        const dy = entry.pointer.y - entry.lastPointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        entry.travelled += dist;
        if (entry.travelled > 0.01) entry.moved = true;
        const speed = clamp((dist / dt) * 1.2, 0, 1);
        entry.strength = lerp(entry.strength, speed, 0.18);
      } else {
        entry.strength = lerp(entry.strength, 0, 0.12);
      }
      entry.lastPointer = { ...entry.pointer };
      entry.lastTime = time;
      entry.smoothPointer.lerp(new THREE.Vector2(entry.pointer.x, entry.pointer.y), 0.05);
    } else {
      entry.strength = lerp(entry.strength, 0, 0.12);
      entry.lastPointer = null;
      entry.lastTime = null;
    }

    // the plane is glued to the picture
    const rect = entry.element.getBoundingClientRect();
    const world = layer!.rectToWorld(rect);
    entry.mesh.position.set(world.x, world.y, 0);
    entry.mesh.scale.set(world.width, world.height, 1);

    // bigger pictures bend a little more (k between 0.4 and 1)
    (u.uSize.value as THREE.Vector2).set(rect.width, rect.height);
    const k = clamp((Math.min(rect.width, rect.height) / Math.min(layer!.width, layer!.height)) * 2.2, 0.4, 1);
    (u.uPointer.value as THREE.Vector2).copy(entry.smoothPointer);
    u.uPointerStrength.value = entry.strength;
    u.uPointerAmplitude.value = 0.4 * k * 0.2;
    u.uOpacity.value = lerp(u.uOpacity.value as number, entry.active ? 1 : 0, 0.2);
    entry.activeLerp = lerp(entry.activeLerp, entry.active && entry.moved ? 1 : 0, 0.03);
    u.uPointerActive.value = entry.activeLerp;
  };

  const release = (entry: Entry) => {
    layer?.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    (entry.mesh.material as THREE.Material).dispose();
  };

  const start = () => {
    if (layer) return;
    layer = getLayer('paper', 30);
    stopFrame = layer.onFrame((_, time) => {
      if (current) step(current, time);
      fading = fading.filter((entry) => {
        step(entry, time);
        if ((entry.uniforms.uOpacity.value as number) < 0.01) {
          release(entry);
          return false;
        }
        return true;
      });
    });
  };

  const pointerOf = (event: PointerEvent, element: HTMLElement) => {
    const r = element.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: clamp((event.clientX - r.left) / r.width, 0, 1), y: 1 - clamp((event.clientY - r.top) / r.height, 0, 1) };
  };

  return {
    async enter(event: PointerEvent, element: HTMLImageElement) {
      if (event.pointerType !== 'mouse') return;
      start();
      pending = element;
      let texture: THREE.Texture;
      try {
        texture = await loadTexture(element.currentSrc || element.src);
      } catch {
        return;
      }
      if (pending !== element) return; // the mouse has already left
      pending = null;
      if (current?.element === element) return;
      if (current) {
        current.active = false;
        fading.push(current);
      }
      current = make(element, texture);
      current.pointer = pointerOf(event, element);
    },
    move(event: PointerEvent, element: HTMLImageElement) {
      if (event.pointerType !== 'mouse' || current?.element !== element) return;
      current.pointer = pointerOf(event, element);
    },
    leave(event?: PointerEvent, element?: HTMLImageElement) {
      if (event && event.pointerType !== 'mouse') return;
      if (!element || pending === element) pending = null;
      if (!current || (element && current.element !== element)) return;
      current.active = false;
      fading.push(current);
      current = null;
    },
    destroy() {
      stopFrame?.();
      if (current) release(current);
      fading.forEach(release);
      current = null;
      fading = [];
      pending = null;
      if (layer) disposeLayer('paper');
      layer = undefined;
    },
  };
}
