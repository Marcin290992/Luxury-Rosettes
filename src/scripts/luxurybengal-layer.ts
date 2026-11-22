// One transparent WebGL canvas laid over the page, shared by the gallery effects (the intro's flying sheets, the turning pictures and the
// paper hover). Effects ask for a layer by name, put meshes in it and take them out again; disposeLayer() removes the canvas.
// The camera looks at the z = 0 plane from a fixed distance, so a DOM rectangle can be turned into a world rectangle and a plane laid over it.

import * as THREE from 'three';

const CAMERA_DISTANCE = 5;
const FIELD_OF_VIEW = 75;

type Tick = (dt: number, elapsed: number) => void;
type DomRect = { left: number; top: number; width: number; height: number };

export interface Layer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** World size of the visible area on the plane at depth z. */
  visibleSize(z?: number): { width: number; height: number };
  /** World centre and size of a DOM rectangle (CSS pixels) laid on the plane at depth z. */
  fromDom(rect: DomRect, z?: number): { x: number; y: number; width: number; height: number };
  /** Calls fn every frame; returns a function that stops it. */
  every(fn: Tick): () => void;
  destroy(): void;
}

function buildLayer(zIndex: number): Layer {
  const host = document.createElement('div');
  host.className = 'luxurybengal-layer';
  host.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${zIndex}`;
  // On touch devices the page lives in #scroll-root, a box with its own stacking context (the menu is inside it): a layer in <body> would be
  // drawn over the open menu, so there it goes into the same box.
  const box = document.getElementById('scroll-root');
  (box && getComputedStyle(box).display !== 'contents' ? box : document.body).append(host);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 200);
  camera.position.z = CAMERA_DISTANCE;
  const view = { w: 1, h: 1 };
  const ticks = new Set<Tick>();

  const fit = () => {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    renderer.setSize(view.w, view.h, false);
    camera.aspect = view.w / view.h;
    camera.updateProjectionMatrix();
  };
  fit();
  window.addEventListener('resize', fit);

  let raf = 0;
  let before = performance.now();
  let elapsed = 0;
  let drewSomething = false;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min((now - before) / 1000, 0.1);
    before = now;
    elapsed += dt;
    ticks.forEach((fn) => fn(dt, elapsed));
    const has = scene.children.length > 0;
    // an empty scene is not drawn, except once to clear what was there
    if (has || drewSomething) renderer.render(scene, camera);
    drewSomething = has;
  };
  raf = requestAnimationFrame(loop);

  const visibleSize = (z = 0) => {
    const height = 2 * Math.tan(THREE.MathUtils.degToRad(FIELD_OF_VIEW / 2)) * Math.abs(camera.position.z - z);
    return { width: height * camera.aspect, height };
  };

  return {
    scene,
    camera,
    visibleSize,
    fromDom(rect, z = 0) {
      const size = visibleSize(z);
      const perPx = size.width / view.w;
      return {
        x: (rect.left + rect.width / 2) * perPx - size.width / 2,
        y: size.height / 2 - (rect.top + rect.height / 2) * perPx,
        width: rect.width * perPx,
        height: rect.height * perPx,
      };
    },
    every(fn) {
      ticks.add(fn);
      return () => void ticks.delete(fn);
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      renderer.dispose();
      renderer.forceContextLoss();
      host.remove();
    },
  };
}

const layers = new Map<string, Layer>();

export function getLayer(name: string, zIndex: number) {
  let layer = layers.get(name);
  if (!layer) {
    layer = buildLayer(zIndex);
    layers.set(name, layer);
  }
  return layer;
}

export function disposeLayer(name: string) {
  layers.get(name)?.destroy();
  layers.delete(name);
}

// Textures are kept by address, so one picture is decoded once. The shaders pass the colours straight through (no colour conversion).
const textureCache = new Map<string, Promise<THREE.Texture>>();

export function loadTexture(src: string) {
  let found = textureCache.get(src);
  if (!found) {
    found = new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        src,
        (tex) => {
          // mipmaps and anisotropy: a big picture drawn small stays as clean as the browser's own scaling, so there is no jump in sharpness when
          // the page's picture takes over from the sheet
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = 8;
          resolve(tex);
        },
        undefined,
        reject,
      );
    });
    // a failed load must not stay in the cache
    found.catch(() => textureCache.delete(src));
    textureCache.set(src, found);
  }
  return found;
}

/** Picture size of a loaded texture as width / height. */
export function textureRatio(tex: THREE.Texture) {
  const img = tex.image as { width: number; height: number } | undefined;
  return img && img.height ? img.width / img.height : 1;
}

/**
 * How a picture of the given ratio fills a box of another ratio without stretching and cropping the overflow (like object-fit: cover):
 * returns [offsetU, offsetV, scaleU, scaleV] for sampling at offset + uv * scale.
 */
export function coverWindow(pictureRatio: number, boxRatio: number): [number, number, number, number] {
  if (pictureRatio > boxRatio) {
    const s = boxRatio / pictureRatio;
    return [(1 - s) / 2, 0, s, 1];
  }
  const s = pictureRatio / boxRatio;
  return [0, (1 - s) / 2, 1, s];
}
