// Cloud reveal: a sheet (a canvas we are given) dissolves in a cloud that rises as a dome from below the screen, and the page underneath
// shows through.
//
// The edge is not a line but a wide, feathered band whose position is pushed in and out by a warped noise, so it looks like a bank of
// cloud (or ink bleeding into water): the paper fades into the colour of the page under it, as a ragged, mottled fringe, and that colour
// in turn fades out to let the page show through. No glow, no seam, no sparks. (This replaced the "ember burn" adapted from React Bits'
// EmberReveal.)
//  - createCloudReveal(host, options) is `init` and returns an object whose destroy() is `destroy` (see docs/SCRIPTING.md, section 3),
//  - it is driven by a number (scroll progress, 0..1), so it can be scrubbed in both directions: everything is computed from the radius in
//    the shader, nothing accumulates, and it only draws when something changed,
//  - the noise does not change, so it is drawn once into a small texture (when the size changes) and the shader that runs for every frame
//    only reads it: a full-screen shader that worked the noise out for every pixel made the page stutter,
//  - the dissolved part is transparent (premultiplied alpha), so real DOM shows through instead of a second image,
//  - three.js is imported lazily, only when this is called.
//
// Sizes are in screen heights on a wide screen and in screen widths on a tall one: in "units" of the shorter side of the screen.
//
// All elements are looked up inside `host`; every observer and GL resource is released in destroy().

import type * as ThreeNS from 'three';

export interface CloudRevealOptions {
  paper: HTMLCanvasElement; // the sheet that dissolves, drawn at the size of the host
  centreX?: number; // where the cloud starts across the screen, 0..1 (default: the middle)
  centreBelow?: number; // how far below the bottom edge its centre lies, as a share of the screen's width (a low mound shows first, then a dome)
  color?: string; // the colour of the page under the sheet, as '#rrggbb': the fringe takes it
  softness?: number; // half the width of the feathered edge, in units
  billow?: number; // how far the edge puffs in and out, in units
  scale?: number; // how many puffs fit in a unit (lower = bigger clouds)
  maxPixelRatio?: number;
}

export interface CloudReveal {
  setPaper: (paper: HTMLCanvasElement) => void;
  setProgress: (progress: number) => void; // 0 = untouched, 1 = gone
  show: (visible: boolean) => void;
  resize: () => void;
  destroy: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// The noise, drawn once: red = the puffs (the edge of the paper), green = the wisps (the edge of the fringe), both as noise / 1.4 + 0.5.
const NOISE_FRAGMENT = `
uniform vec2 uAspect;
uniform float uScale;
uniform float uSeed;
varying vec2 vUv;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float gradientNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash2(i), f);
  float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.55;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    sum += amp * gradientNoise(p);
    p = turn * p * 2.03 + 11.7;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 q = (vUv - 0.5) * uAspect * uScale + uSeed;
  // the puffs: a noise bent by another one, so that the edge folds over itself like a bank of cloud. The fringe has wisps of its own,
  // finer, so that it does not follow the paper's edge exactly
  vec2 warp = vec2(fbm(q * 0.6 + 3.1), fbm(q * 0.6 - 5.3));
  float puffs = fbm(q + warp * 1.2);
  float wisps = fbm(q * 1.9 + warp * 1.7 + 7.0);
  gl_FragColor = vec4(clamp(vec2(puffs, wisps) / 1.4 + 0.5, 0.0, 1.0), 0.0, 1.0);
}
`;

// The sheet where it is still there, transparent where it has dissolved. The output is premultiplied: rgb = paper * cover, alpha = cover.
const FRAGMENT = `
uniform sampler2D uPaper;
uniform sampler2D uNoise;
uniform vec2 uAspect;
uniform vec2 uOrigin;
uniform float uRadius;
uniform vec3 uColor;
uniform float uSoft;
uniform float uBillow;
varying vec2 vUv;

void main() {
  vec3 paper = texture2D(uPaper, vUv).rgb;
  if (uRadius <= 0.0) {
    gl_FragColor = vec4(paper, 1.0);
    return;
  }
  vec2 noise = (texture2D(uNoise, vUv).rg - 0.5) * 1.4;
  float puffs = noise.r;
  float wisps = noise.g;
  // the band grows with the radius: it starts as a small soft spot and widens with the scroll (a fixed width would put a blob of that
  // size on the first pixel of scroll)
  float grow = clamp(uRadius / 0.35, 0.03, 1.0);
  float soft = uSoft * grow;
  float centre = length((vUv - uOrigin) * uAspect);
  // the paper fades out...
  float sheet = smoothstep(uRadius - soft * 0.6, uRadius + soft, centre + puffs * uBillow * grow);
  // ...into the colour of the page, which lies under it and in turn fades out further in (where it is the page itself that shows)
  float fringe = smoothstep(uRadius - soft * 2.0, uRadius - soft * 0.3, centre + wisps * uBillow * 1.25 * grow);
  fringe *= 0.75 + 0.25 * smoothstep(-0.3, 0.3, wisps);
  gl_FragColor = vec4(paper * sheet + uColor * fringe * (1.0 - sheet), sheet + fringe * (1.0 - sheet));
}
`;

export async function createCloudReveal(host: HTMLElement, options: CloudRevealOptions): Promise<CloudReveal | null> {
  let THREE: typeof ThreeNS;
  try {
    THREE = await import('three');
  } catch {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
    pointerEvents: 'none',
    visibility: 'hidden', // the caller shows it when it takes over from the real sheet
    zIndex: '4',
  } satisfies Partial<CSSStyleDeclaration>);
  host.appendChild(canvas);

  let renderer: ThreeNS.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'high-performance' });
  } catch {
    canvas.remove();
    return null;
  }
  renderer.setClearColor(0x000000, 0);

  const centreX = clamp(options.centreX ?? 0.5, 0, 1);
  const below = Math.max(0, options.centreBelow ?? 0.2);
  const soft = clamp(options.softness ?? 0.06, 0.01, 1);
  const billow = clamp(options.billow ?? 0.1, 0, 1);
  const [r, g, b] = hexToRgb(options.color ?? '#1a1410');
  const maxRatio = options.maxPixelRatio ?? 1.5;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const plane = new THREE.PlaneGeometry(2, 2);
  const noiseMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uAspect: { value: new THREE.Vector2(1, 1) },
      uScale: { value: clamp(options.scale ?? 2, 0.2, 12) },
      uSeed: { value: Math.random() * 40 },
    },
    vertexShader: VERTEX,
    fragmentShader: NOISE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPaper: { value: null as ThreeNS.Texture | null },
      uNoise: { value: null as ThreeNS.Texture | null },
      uAspect: { value: new THREE.Vector2(1, 1) },
      uOrigin: { value: new THREE.Vector2(centreX, 0) },
      uRadius: { value: 0 },
      uColor: { value: new THREE.Vector3(r, g, b) },
      uSoft: { value: soft },
      uBillow: { value: billow },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const noiseScene = new THREE.Scene();
  noiseScene.add(Object.assign(new THREE.Mesh(plane, noiseMaterial), { frustumCulled: false }));
  const scene = new THREE.Scene();
  scene.add(Object.assign(new THREE.Mesh(plane, material), { frustumCulled: false }));

  let destroyed = false;
  let raf = 0;
  let progress = 0;
  let reach = 1;
  let startRadius = 0;
  let paperTexture: ThreeNS.CanvasTexture | null = null;
  let noiseTarget: ThreeNS.WebGLRenderTarget | null = null;

  const aspectVector = (width: number, height: number) => {
    const aspect = width / height;
    return aspect >= 1 ? new THREE.Vector2(aspect, 1) : new THREE.Vector2(1, 1 / aspect);
  };

  // where the cloud starts, in the screen's own coordinates (0..1, the bottom edge at 0): below the bottom edge, at a distance that is a share of the width
  const centre = (aspect: ThreeNS.Vector2) => ({ x: centreX, y: (-below * aspect.x) / aspect.y });

  // how far the edge has to travel to leave nothing (not even the fringe): from the centre to the farthest corner, plus the feathered band and the puffs
  const farthest = (aspect: ThreeNS.Vector2) => {
    const from = centre(aspect);
    let best = 0;
    for (const corner of [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]) {
      best = Math.max(best, Math.hypot((corner.x - from.x) * aspect.x, (corner.y - from.y) * aspect.y));
    }
    return best + soft * 2 + billow * 1.1 + 0.02;
  };

  // the radius at which the first pixel of the sheet is touched: the distance from the centre to the nearest point of the screen, less the
  // feathered band and the puffs (before that nothing shows, and the scroll would be spent on nothing)
  const nearest = (aspect: ThreeNS.Vector2) => {
    const from = centre(aspect);
    const dx = (clamp(from.x, 0, 1) - from.x) * aspect.x;
    const dy = (clamp(from.y, 0, 1) - from.y) * aspect.y;
    return Math.max(0, Math.hypot(dx, dy) - soft - billow);
  };

  const draw = () => {
    raf = 0;
    if (destroyed) return;
    material.uniforms.uRadius.value = progress > 0.0005 ? startRadius + progress * (reach - startRadius) : 0;
    renderer.render(scene, camera);
  };
  const schedule = () => {
    if (!destroyed && !raf) raf = requestAnimationFrame(draw);
  };

  const setPaper = (paper: HTMLCanvasElement) => {
    paperTexture?.dispose();
    paperTexture = new THREE.CanvasTexture(paper);
    paperTexture.colorSpace = THREE.NoColorSpace;
    paperTexture.minFilter = THREE.LinearFilter;
    paperTexture.generateMipmaps = false;
    material.uniforms.uPaper.value = paperTexture;
    schedule();
  };

  const resize = () => {
    if (destroyed) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
    renderer.setSize(width, height, false);
    const aspect = aspectVector(width, height);
    material.uniforms.uAspect.value.copy(aspect);
    noiseMaterial.uniforms.uAspect.value.copy(aspect);
    const from = centre(aspect);
    material.uniforms.uOrigin.value.set(from.x, from.y);
    reach = farthest(aspect);
    startRadius = nearest(aspect);

    // the noise, once for this size (a small texture is enough: the puffs are many pixels wide, and it is read with a linear filter)
    const side = 512;
    noiseTarget?.dispose();
    noiseTarget = new THREE.WebGLRenderTarget(Math.round(side * Math.min(1, aspect.x / aspect.y)), Math.round(side * Math.min(1, aspect.y / aspect.x)), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    renderer.setRenderTarget(noiseTarget);
    renderer.render(noiseScene, camera);
    renderer.setRenderTarget(null);
    material.uniforms.uNoise.value = noiseTarget.texture;
    schedule();
  };

  const onLost = (event: Event) => {
    event.preventDefault(); // we stop rendering; the caller keeps its own fallback
    canvas.style.visibility = 'hidden';
  };
  canvas.addEventListener('webglcontextlost', onLost);

  setPaper(options.paper);
  resize();

  return {
    setPaper,
    resize,
    setProgress: (value: number) => {
      progress = clamp(value, 0, 1);
      schedule();
    },
    show: (visible: boolean) => {
      const wasHidden = canvas.style.visibility === 'hidden';
      canvas.style.visibility = visible ? 'visible' : 'hidden';
      // draw right now: the caller hides the real photo in the same tick, and waiting for the next frame would leave one empty frame
      if (visible && wasHidden && !destroyed) draw();
    },
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onLost);
      paperTexture?.dispose();
      noiseTarget?.dispose();
      plane.dispose();
      noiseMaterial.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
