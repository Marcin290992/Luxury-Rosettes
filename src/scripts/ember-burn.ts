// Ember burn-through: a sheet (a canvas we are given) burns away from a point and the page underneath shows through.
//
// Adapted from React Bits' EmberReveal (three.js) to Vanilla TS for this site (see docs/SCRIPTING.md, section 3):
//  - no React: createEmberBurn(host, options) is `init` and returns an object whose destroy() is `destroy`,
//  - the burn is driven by a number (scroll progress, 0..1) instead of time, clicks or hovering, so it can be scrubbed
//    in both directions (the front is recomputed from the radius each frame, nothing accumulates),
//  - the burnt hole is transparent (premultiplied alpha), so real DOM shows through instead of a second image,
//  - three.js is imported lazily, only when this is called.
//
// All elements are looked up inside `host`; every listener, observer and GL resource is released in destroy().

import type * as ThreeNS from 'three';

export interface EmberBurnOptions {
  paper: HTMLCanvasElement; // the sheet that burns, drawn at the size of the host
  origin?: { x: number; y: number }; // where it starts, 0..1 (default: the middle)
  emberColor?: string;
  charColor?: string;
  glow?: number;
  edge?: number;
  roughness?: number;
  detail?: number;
  scorch?: number; // how much the paper browns before the edge reaches it
  charWidth?: number; // width of the charred strip behind the edge (1 = as burnt paper, small = a thin line)
  speckle?: number; // 0..1: glowing specks inside the charred strip
  flicker?: number; // 0..1: 1 = a flame, 0 = a steady line of light
  gold?: number; // 0..1: 0 = fire (white-hot core, rust halo), 1 = gold leaf (gold core, faint gold wash)
  lobes?: number; // 0..1: how far the whole front wanders from a circle (large, slow irregularity of the shape)
  sparks?: number; // 0..1: flying sparks
  maxPixelRatio?: number;
}

export interface EmberBurn {
  setPaper: (paper: HTMLCanvasElement) => void;
  setProgress: (progress: number) => void; // 0 = untouched, 1 = burnt away
  show: (visible: boolean) => void;
  resize: () => void;
  destroy: () => void;
}

const SPARKS = 220;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

let colorContext: CanvasRenderingContext2D | null = null;
const parseColor = (value: string, fallback: [number, number, number]): [number, number, number] => {
  if (!colorContext) colorContext = document.createElement('canvas').getContext('2d');
  if (!colorContext) return fallback;
  colorContext.fillStyle = '#010203';
  colorContext.fillStyle = value;
  const read = String(colorContext.fillStyle);
  if (read === '#010203' && value.trim().toLowerCase() !== '#010203') return fallback;
  if (read.startsWith('#')) {
    const hex = read.slice(1);
    return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
  }
  const parts = read.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return fallback;
  return [Number(parts[0]) / 255, Number(parts[1]) / 255, Number(parts[2]) / 255];
};

const QUAD_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const NOISE = `
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
  for (int i = 0; i < 5; i++) {
    sum += amp * gradientNoise(p);
    p = turn * p * 2.03 + 11.7;
    amp *= 0.5;
  }
  return sum;
}

float fbm3(vec2 p) {
  float sum = 0.0;
  float amp = 0.6;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    sum += amp * gradientNoise(p);
    p = turn * p * 2.07 + 5.3;
    amp *= 0.5;
  }
  return sum;
}

vec4 bicubic(sampler2D map, vec2 uv, vec2 size) {
  vec2 st = uv * size - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = (w1 / g0 - 1.0 + i + 0.5) / size;
  vec2 h1 = (w3 / g1 + 1.0 + i + 0.5) / size;
  return g0.y * (g0.x * texture2D(map, vec2(h0.x, h0.y)) + g1.x * texture2D(map, vec2(h1.x, h0.y))) +
    g1.y * (g0.x * texture2D(map, vec2(h0.x, h1.y)) + g1.x * texture2D(map, vec2(h1.x, h1.y)));
}
`;

// The field: g = how burnt each point is (a soft disc around the origin with ragged lobes, recomputed from the radius
// every frame), b = "something is happening here" (the moving front while scrolling), which the sparks follow.
const FIELD_FRAGMENT = `
uniform sampler2D uPrevious;
uniform vec2 uAspect;
uniform vec2 uOrigin;
uniform float uRadius;
uniform float uBurning;
uniform float uMoving;
uniform float uFade;
uniform float uLobes;
uniform float uSeed;
varying vec2 vUv;
${NOISE}

void main() {
  vec4 previous = texture2D(uPrevious, vUv);
  vec2 p = (vUv - 0.5) * uAspect;
  vec2 away = p - (uOrigin - 0.5) * uAspect;
  float lobes = fbm(away * 2.2 + uSeed) * uLobes;
  float dist = length(away) * (1.0 + lobes);
  float front = uBurning * (1.0 - smoothstep(uRadius - 0.16, uRadius + 0.16, dist));
  float band = (1.0 - smoothstep(0.0, 0.12, abs(dist - uRadius))) * uBurning * uMoving;
  float activity = max(previous.b * uFade, band);
  gl_FragColor = vec4(0.0, front, activity, 1.0);
}
`;

// The sheet with a ragged, scorched, glowing edge. Unlike the original the burnt part is transparent, so the output is
// premultiplied: rgb = paper where it is still there + the glow, alpha = how much of the page is still covered.
const DISPLAY_FRAGMENT = `
uniform sampler2D uField;
uniform vec2 uFieldSize;
uniform sampler2D uPaper;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uEmber;
uniform vec3 uChar;
uniform float uGlow;
uniform float uEdge;
uniform float uRough;
uniform float uDetail;
uniform float uScorch;
uniform float uCharWidth;
uniform float uSpeckle;
uniform float uFlicker;
uniform float uGold;
uniform float uSeed;
uniform float uPixelRatio;
varying vec2 vUv;
${NOISE}

void main() {
  vec2 pixel = vUv * uResolution;
  float unit = min(uResolution.x, uResolution.y);
  vec2 q = pixel / unit * uDetail + uSeed;
  vec4 field = bicubic(uField, vUv, uFieldSize);
  float heat = clamp(field.g, 0.0, 1.0);
  float touched = smoothstep(0.0005, 0.04, heat);
  float w = max(0.3, uEdge) * uPixelRatio * clamp(unit / uPixelRatio / 520.0, 0.6, 1.6);
  float shape = 0.0;
  vec2 warp = vec2(0.0);
  if (heat > 0.0004) {
    warp = vec2(fbm3(q * 0.6 + 3.1), fbm3(q * 0.6 - 5.3));
    shape = fbm3(q + warp * 1.1);
  }
  float v = heat + uRough * shape * touched - 0.5;
  float slope = max(fwidth(v), 1e-5);
  float d = v / slope;
  float jag = gradientNoise(q * 8.0 + warp * 2.0) * 0.65 + gradientNoise(q * 19.0 + warp) * 0.35;
  d += jag * (2.0 + 5.0 * uRough) * w * (1.0 - smoothstep(20.0 * w, 60.0 * w, abs(d)));

  vec3 a = texture2D(uPaper, vUv).rgb;
  float toast = pow(smoothstep(-0.22, 0.0, v), 2.0) * (1.0 - smoothstep(0.0, 0.02, v)) * touched;
  toast = max(toast, (1.0 - smoothstep(0.0, 16.0 * w, max(-d, 0.0))) * step(d, 0.5) * touched * 0.8);
  float luma = dot(a, vec3(0.299, 0.587, 0.114));
  vec3 browned = vec3(luma) * vec3(1.0, 0.68, 0.4) * 0.8 + vec3(0.05, 0.025, 0.0);
  vec3 paper = mix(a, browned, toast * uScorch * 0.9);
  paper *= 1.0 - toast * uScorch * 0.4;
  float mottle = 0.55 + 0.9 * (0.5 + 0.5 * gradientNoise(q * 12.0 + warp * 4.0));
  float charZone = smoothstep(-10.0 * w * uCharWidth, -2.2 * w * uCharWidth, d);
  paper = mix(paper, uChar * mottle, charZone * 0.96);
  float cut = smoothstep(-0.6 * uPixelRatio, 0.6 * uPixelRatio, d);
  float soot = max(exp(-max(d, 0.0) / (5.0 * w)), 1.0 - smoothstep(0.0, 0.14, v)) * touched;

  float crawl = gradientNoise(q * 1.4 + vec2(uTime * 0.7, -uTime * 1.1)) + 0.5 * gradientNoise(q * 3.7 - vec2(uTime * 1.9, 0.0));
  float flicker = smoothstep(-0.6, 0.7, crawl);
  // uFlicker 1 = a flame (the glow comes and goes along the edge), 0 = a steady line of light
  float burning = mix(1.0, 0.12 + 1.25 * flicker * flicker, uFlicker);
  float thick = 0.7 + 0.7 * smoothstep(-0.4, 0.6, gradientNoise(q * 3.3 - vec2(uTime * 0.5, 0.0)));
  float line = exp(-pow((d + 1.4 * w) / (1.5 * w * thick), 2.0)) * burning;
  float core = exp(-pow((d + 1.1 * w) / (0.7 * w * thick), 2.0)) * burning;
  float embers = smoothstep(0.55, 0.85, gradientNoise(q * 18.0 + warp * 3.0 + vec2(0.0, uTime * 0.4))) * charZone * (1.0 - cut) * smoothstep(-8.0 * w * uCharWidth, -3.5 * w * uCharWidth, d) * uSpeckle;
  float halo = exp(-abs(d + 1.5 * w) / (11.0 * w));
  // uGold 0 = fire (a white-hot core, a rust-red halo), 1 = gold leaf (the core stays gold, the halo is a faint gold wash)
  vec3 hot = mix(uEmber, vec3(1.0, 0.92, 0.7), mix(0.8, 0.3, uGold));
  vec3 deep = uEmber * mix(vec3(0.75, 0.32, 0.16), vec3(0.6), uGold);
  float haloStrength = mix(1.0, 0.4, uGold);
  vec3 emit = uEmber * line * 1.1 + hot * core * 0.95 + deep * halo * (0.25 + 0.5 * flicker) * haloStrength + mix(uEmber, hot, 0.4) * embers * (0.35 + 0.65 * flicker);
  emit = clamp(emit * uGlow * touched, 0.0, 1.0);

  // what is still covered: the sheet, plus a soft dark smudge of soot on the page right behind the edge
  float alpha = (1.0 - cut) + cut * soot * 0.5;
  alpha = clamp(max(alpha, max(max(emit.r, emit.g), emit.b)), 0.0, 1.0);
  vec3 rgb = paper * (1.0 - cut) + emit;
  gl_FragColor = vec4(min(rgb, vec3(alpha)), alpha);
}
`;

const SPARK_VERTEX = `
uniform sampler2D uField;
uniform float uTime;
uniform vec2 uOrigin;
uniform float uRadius;
uniform float uBurning;
uniform vec2 uAspect;
uniform float uAmount;
uniform float uScale;
attribute float aSeed;
varying float vAlpha;
varying float vHeat;

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

void main() {
  float period = 0.55 + hash(aSeed * 3.1) * 0.6;
  float phase = hash(aSeed * 7.7);
  float clock = uTime / period + phase;
  float cycle = floor(clock);
  float age = fract(clock);
  float seed = aSeed * 13.1 + cycle * 1.618;
  vec2 spawn = vec2(-1.0);
  float best = 0.0;
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float angle = hash(seed + fk * 3.7) * 6.2831853;
    float r = uRadius * (0.62 + 0.76 * hash(seed + 4.0 + fk));
    vec2 candidate = uOrigin + vec2(cos(angle), sin(angle)) * r / uAspect;
    vec4 probe = texture2D(uField, candidate);
    float edge = 1.0 - smoothstep(0.08, 0.2, abs(probe.g - 0.5));
    float score = probe.b * edge * step(0.0, candidate.x) * step(candidate.x, 1.0) * step(0.0, candidate.y) * step(candidate.y, 1.0);
    if (score > best) {
      best = score;
      spawn = candidate;
    }
  }
  float live = smoothstep(0.25, 0.7, best) * step(0.5, uBurning);
  float keep = step(hash(seed + 9.0), uAmount);
  vec2 velocity = vec2((hash(seed + 5.0) - 0.5) * 0.16, 0.08 + hash(seed + 6.0) * 0.2);
  vec2 drift = vec2(sin(age * 9.0 + seed) * 0.012, 0.0);
  vec2 at = spawn + (velocity * age - vec2(0.0, 0.1) * age * age + drift) * vec2(1.0 / uAspect.x, 1.0);
  vAlpha = live * keep * smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.35, 1.0, age));
  vHeat = 1.0 - age;
  gl_Position = vec4(at * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = vAlpha > 0.0 ? (2.0 + 2.6 * hash(seed + 8.0)) * uScale * (1.0 - age * 0.55) : 0.0;
}
`;

const SPARK_FRAGMENT = `
uniform vec3 uEmber;
varying float vAlpha;
varying float vHeat;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float falloff = exp(-dot(c, c) * 18.0);
  vec3 hot = mix(uEmber, vec3(1.0, 0.86, 0.52), vHeat * 0.55);
  gl_FragColor = vec4(hot * 1.2, falloff * vAlpha);
}
`;

export async function createEmberBurn(host: HTMLElement, options: EmberBurnOptions): Promise<EmberBurn | null> {
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

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const plane = new THREE.PlaneGeometry(2, 2);
  const targetOptions = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  };
  let fields = [new THREE.WebGLRenderTarget(4, 4, targetOptions), new THREE.WebGLRenderTarget(4, 4, targetOptions)];

  const seed = Math.random() * 40;
  const fieldMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uPrevious: { value: null as ThreeNS.Texture | null },
      uAspect: { value: new THREE.Vector2(1, 1) },
      uOrigin: { value: new THREE.Vector2(0.5, 0.5) },
      uRadius: { value: 0 },
      uBurning: { value: 0 },
      uMoving: { value: 0 },
      uFade: { value: 1 },
      uLobes: { value: 0.3 },
      uSeed: { value: seed },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: FIELD_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const displayMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uField: { value: null as ThreeNS.Texture | null },
      uFieldSize: { value: new THREE.Vector2(1, 1) },
      uPaper: { value: null as ThreeNS.Texture | null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uEmber: { value: new THREE.Vector3(1, 0.42, 0.1) },
      uChar: { value: new THREE.Vector3(0.1, 0.06, 0.04) },
      uGlow: { value: 1 },
      uEdge: { value: 1 },
      uRough: { value: 0.35 },
      uDetail: { value: 5 },
      uScorch: { value: 0.7 },
      uCharWidth: { value: 1 },
      uSpeckle: { value: 1 },
      uFlicker: { value: 1 },
      uGold: { value: 0 },
      uSeed: { value: seed },
      uPixelRatio: { value: 1 },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: DISPLAY_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });

  const seeds = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i++) seeds[i] = i + 1;
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
  sparkGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const sparkMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uField: { value: null as ThreeNS.Texture | null },
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector2(0.5, 0.5) },
      uRadius: { value: 0 },
      uBurning: { value: 0 },
      uAspect: { value: new THREE.Vector2(1, 1) },
      uAmount: { value: 0.5 },
      uScale: { value: 1 },
      uEmber: { value: new THREE.Vector3(1, 0.42, 0.1) },
    },
    vertexShader: SPARK_VERTEX,
    fragmentShader: SPARK_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });

  const fieldScene = new THREE.Scene();
  fieldScene.add(new THREE.Mesh(plane, fieldMaterial));
  const displayScene = new THREE.Scene();
  const displayMesh = new THREE.Mesh(plane, displayMaterial);
  displayMesh.frustumCulled = false;
  const sparkPoints = new THREE.Points(sparkGeometry, sparkMaterial);
  sparkPoints.frustumCulled = false;
  sparkPoints.renderOrder = 1;
  displayScene.add(displayMesh, sparkPoints);

  const origin = { x: options.origin?.x ?? 0.5, y: options.origin?.y ?? 0.5 };
  const roughness = clamp(options.roughness ?? 0.5, 0, 1);
  const maxRatio = options.maxPixelRatio ?? 1.5;

  let destroyed = false;
  let raf = 0;
  let last = 0;
  let clock = 0;
  let width = 1;
  let height = 1;
  let ratio = 1;
  let progress = 0;
  let lastProgress = 0;
  let moving = 0;
  let reach = 1;
  let paperTexture: ThreeNS.CanvasTexture | null = null;

  const aspectVector = () => {
    const aspect = width / height;
    return aspect >= 1 ? new THREE.Vector2(aspect, 1) : new THREE.Vector2(1, 1 / aspect);
  };

  // how far the front has to travel to leave nothing: from the origin to the farthest corner, plus room for the ragged edge
  const farthest = () => {
    const aspect = aspectVector();
    let best = 0;
    for (const corner of [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]) {
      best = Math.max(best, Math.hypot((corner.x - origin.x) * aspect.x, (corner.y - origin.y) * aspect.y));
    }
    return best + 0.25 + roughness * 0.4;
  };

  const setColors = () => {
    const [er, eg, eb] = parseColor(options.emberColor ?? '#e3a130', [0.89, 0.63, 0.19]);
    const [cr, cg, cb] = parseColor(options.charColor ?? '#1a1410', [0.1, 0.08, 0.06]);
    displayMaterial.uniforms.uEmber.value.set(er, eg, eb);
    sparkMaterial.uniforms.uEmber.value.set(er, eg, eb);
    displayMaterial.uniforms.uChar.value.set(cr, cg, cb);
  };

  const applyLook = () => {
    const display = displayMaterial.uniforms;
    display.uGlow.value = clamp(options.glow ?? 1, 0, 3);
    display.uEdge.value = clamp(options.edge ?? 1, 0.2, 4);
    display.uRough.value = roughness * 1.1;
    display.uDetail.value = clamp(options.detail ?? 5, 0.5, 20);
    display.uScorch.value = clamp(options.scorch ?? 0.7, 0, 1);
    display.uCharWidth.value = clamp(options.charWidth ?? 1, 0.05, 2);
    display.uSpeckle.value = clamp(options.speckle ?? 1, 0, 1);
    display.uFlicker.value = clamp(options.flicker ?? 1, 0, 1);
    display.uGold.value = clamp(options.gold ?? 0, 0, 1);
    fieldMaterial.uniforms.uLobes.value = clamp(options.lobes ?? roughness * 0.55, 0, 1);
    sparkMaterial.uniforms.uAmount.value = clamp(options.sparks ?? 0.5, 0, 1);
    fieldMaterial.uniforms.uOrigin.value.set(origin.x, 1 - origin.y);
    sparkMaterial.uniforms.uOrigin.value.set(origin.x, 1 - origin.y);
  };

  const setPaper = (paper: HTMLCanvasElement) => {
    paperTexture?.dispose();
    paperTexture = new THREE.CanvasTexture(paper);
    paperTexture.colorSpace = THREE.NoColorSpace;
    paperTexture.minFilter = THREE.LinearFilter;
    paperTexture.generateMipmaps = false;
    displayMaterial.uniforms.uPaper.value = paperTexture;
    wake();
  };

  const resize = () => {
    if (destroyed) return;
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    const scale = Math.min(1, 640 / Math.max(width, height));
    const fieldWidth = Math.max(8, Math.round(width * scale));
    const fieldHeight = Math.max(8, Math.round(height * scale));
    fields.forEach((target) => target.dispose());
    fields = [new THREE.WebGLRenderTarget(fieldWidth, fieldHeight, targetOptions), new THREE.WebGLRenderTarget(fieldWidth, fieldHeight, targetOptions)];
    fields.forEach((target) => {
      renderer.setRenderTarget(target);
      renderer.clear();
    });
    renderer.setRenderTarget(null);
    const aspect = aspectVector();
    fieldMaterial.uniforms.uAspect.value.copy(aspect);
    sparkMaterial.uniforms.uAspect.value.copy(aspect);
    displayMaterial.uniforms.uFieldSize.value.set(fieldWidth, fieldHeight);
    displayMaterial.uniforms.uResolution.value.set(width * ratio, height * ratio);
    displayMaterial.uniforms.uPixelRatio.value = ratio;
    sparkMaterial.uniforms.uScale.value = ratio;
    reach = farthest();
    wake();
  };

  const render = (dt: number) => {
    const burning = progress > 0.0005 && progress < 0.9995;
    const radius = progress * reach;
    const field = fieldMaterial.uniforms;
    field.uPrevious.value = fields[0].texture;
    field.uRadius.value = radius;
    field.uBurning.value = progress > 0.0005 ? 1 : 0;
    field.uMoving.value = moving;
    field.uFade.value = Math.exp(-dt / 0.45);
    renderer.setRenderTarget(fields[1]);
    renderer.render(fieldScene, camera);
    renderer.setRenderTarget(null);
    fields = [fields[1], fields[0]];

    const display = displayMaterial.uniforms;
    display.uField.value = fields[0].texture;
    display.uTime.value = clock;
    const spark = sparkMaterial.uniforms;
    spark.uField.value = fields[0].texture;
    spark.uTime.value = clock;
    spark.uRadius.value = radius;
    spark.uBurning.value = burning ? 1 : 0;
    sparkPoints.visible = spark.uAmount.value > 0;
    renderer.render(displayScene, camera);
  };

  const frame = (now: number) => {
    raf = 0;
    if (destroyed) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)) || 1 / 60;
    last = now;
    clock += dt;
    // how fast the front is travelling right now: the sparks only fly while the page is being scrolled
    const speed = Math.abs(progress - lastProgress) / dt;
    lastProgress = progress;
    moving += (clamp(speed * 6, 0, 1) - moving) * (1 - Math.exp(-dt / 0.12));
    render(dt);
    // keep animating while it burns (the glow flickers); stop when nothing is left to see or nothing has started
    if ((progress > 0.0005 && progress < 0.9995) || moving > 0.01) raf = requestAnimationFrame(frame);
  };

  const wake = () => {
    if (destroyed || raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const onLost = (event: Event) => {
    event.preventDefault(); // we stop rendering; the caller keeps its own fallback
    canvas.style.visibility = 'hidden';
  };
  canvas.addEventListener('webglcontextlost', onLost);

  setColors();
  applyLook();
  setPaper(options.paper);
  resize();

  return {
    setPaper,
    resize,
    setProgress: (value: number) => {
      progress = clamp(value, 0, 1);
      wake();
    },
    show: (visible: boolean) => {
      canvas.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) wake();
    },
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onLost);
      fields.forEach((target) => target.dispose());
      paperTexture?.dispose();
      plane.dispose();
      sparkGeometry.dispose();
      fieldMaterial.dispose();
      displayMaterial.dispose();
      sparkMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
