// A transparent three.js canvas laid over the page (pointer-events: none), shared by the "Lumen" pieces: the intro's spiral of papers, the
// turning covers of the gallery chooser and the paper that lifts under the pointer on a gallery photo. Each piece adds its objects to a named
// layer and gives them back when it is done; a layer with nothing in it does not draw, and disposeLayer() takes the whole canvas away
// (called from each piece's destroy, so a page swap leaves nothing behind).
//
// The camera stands 5 units in front of the z = 0 plane with a 75° field of view, so rectToWorld() can lay a plane exactly over any DOM rectangle.

import * as THREE from 'three';

export class Layer {
  readonly el: HTMLDivElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  width = 1;
  height = 1;
  private callbacks = new Set<(delta: number, time: number) => void>();
  private last = performance.now();
  private elapsed = 0;
  private wasEmpty = false;

  constructor(zIndex: number) {
    this.el = document.createElement('div');
    this.el.className = 'lumen-layer';
    this.el.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${zIndex};`;
    document.body.appendChild(this.el);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
    this.el.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0, 5);

    window.addEventListener('resize', this.resize);
    this.resize();

    this.renderer.setAnimationLoop(() => {
      const now = performance.now();
      const delta = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.elapsed += delta;
      this.callbacks.forEach((cb) => cb(delta, this.elapsed));
      const empty = this.scene.children.length === 0;
      if (empty && this.wasEmpty) return; // nothing to draw (but the frame that clears the last object is drawn once)
      this.renderer.render(this.scene, this.camera);
      this.wasEmpty = empty;
    });
  }

  private resize = () => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  };

  /** How many world units the screen spans at depth z. */
  viewSize(z = 0) {
    const distance = Math.abs(this.camera.position.z - z);
    const height = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * distance;
    return { width: height * this.camera.aspect, height };
  }

  /** Where a DOM rectangle (CSS pixels) sits in the 3D world at depth z. */
  rectToWorld(rect: { left: number; top: number; width: number; height: number }, z = 0) {
    const view = this.viewSize(z);
    const ux = view.width / this.width;
    const uy = view.height / this.height;
    return {
      x: (rect.left + rect.width / 2) * ux - view.width / 2,
      y: -(rect.top + rect.height / 2) * uy + view.height / 2,
      width: rect.width * ux,
      height: rect.height * uy,
    };
  }

  add(object: THREE.Object3D) {
    this.scene.add(object);
  }
  remove(object: THREE.Object3D) {
    this.scene.remove(object);
  }
  onFrame(cb: (delta: number, time: number) => void) {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.el.remove();
  }
}

const layers = new Map<string, Layer>();

export function getLayer(name: string, zIndex: number) {
  let layer = layers.get(name);
  if (!layer) {
    layer = new Layer(zIndex);
    layers.set(name, layer);
  }
  return layer;
}

export function disposeLayer(name: string) {
  layers.get(name)?.dispose();
  layers.delete(name);
}

// Textures are cached by address, so the same picture is decoded once. They are plain (no mipmaps, linear filter, raw sRGB values: the shaders
// here do not convert colours, they pass the picture through).
const textures = new Map<string, Promise<THREE.Texture>>();
let loader: THREE.TextureLoader | undefined;

export function loadTexture(src: string) {
  let texture = textures.get(src);
  if (!texture) {
    loader ??= new THREE.TextureLoader();
    texture = new Promise<THREE.Texture>((resolve, reject) => {
      loader!.load(
        src,
        (t) => {
          t.generateMipmaps = false;
          t.minFilter = THREE.LinearFilter;
          t.magFilter = THREE.LinearFilter;
          resolve(t);
        },
        undefined,
        reject,
      );
    });
    textures.set(src, texture);
  }
  return texture;
}

/** [repeat.x, repeat.y, offset.x, offset.y] that crop a picture to `aspect` (width / height) the way object-fit: cover does. */
export function coverCrop(texture: THREE.Texture, aspect: number): [number, number, number, number] {
  const image = texture.image as { width: number; height: number };
  const source = image.width / image.height;
  if (source > aspect) {
    const x = aspect / source;
    return [x, 1, (1 - x) / 2, 0];
  }
  const y = source / aspect;
  return [1, y, 0, (1 - y) / 2];
}

// The rotation helper the shaders share: rotate around any axis.
export const ROTATION_3D_GLSL = /* glsl */ `
mat4 rotation3d(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;
  return mat4(
    oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
    oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
    oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
    0.0,                                0.0,                                0.0,                                1.0
  );
}
`;
