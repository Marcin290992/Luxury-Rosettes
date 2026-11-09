// Spin shutter: photos on a tilted ring in 3D that turns slowly, with a depth of field (the card in focus is sharp, the ones away from it
// are soft and fade into the background). Hover or click a card and the ring brings it forward; drag turns the ring; arrow keys step.
//
// Adapted from the React Bits "Spin Shutter" (React + three.js) to Vanilla TS with NO libraries: plain WebGL2, one instanced draw call
// for all the cards (a rounded rectangle each, drawn by a fragment shader that also does the blur, the haze and the shadow).
//  - the photos are read from the markup (see SpinShutter.astro): the <img> elements are uploaded straight into one texture array, no
//    second download; without WebGL2 (or the script) the same markup is a plain grid of photos with their names,
//  - the sizes live in settings.ts (SPIN_SHUTTER); the wheel is off by default so the page keeps scrolling over the ring,
//  - initSpinShutter(root) is `init` and returns destroy(); everything is looked up inside `root`; it only draws while on screen;
//    with reduced motion the ring stands still, no intro, no fades.
//
// Expected markup: root > .ss-stage (the canvas goes in), ul.ss-items > li[data-href] > (img, .ss-title, .ss-sub),
// .ss-caption > (.ss-caption-title, .ss-caption-sub), .ss-live. The centre of the ring is published as --ss-cx / --ss-cy on root.

import { SPIN_SHUTTER } from './settings';

type Options = { -readonly [K in keyof typeof SPIN_SHUTTER]: (typeof SPIN_SHUTTER)[K] extends boolean ? boolean : number };

interface Item {
  img: HTMLImageElement;
  title: string;
  subtitle: string;
  href: string;
}

interface Layer {
  ready: boolean;
  drawn: boolean;
  fade: number;
}

interface Card {
  alpha: number;
  phi: number;
  x: number;
  y: number;
  z: number;
  hw: number;
  hh: number;
  lift: number;
  order: number;
}

const MAX_CARDS = 48;
const MAX_LAYERS = 32;
const CAPTION_ROOM = 76; // px kept free under the ring for the caption
const TAU = Math.PI * 2;
const FLOATS = 12; // per card: rect (x, y, halfW, halfH), look (blur, alpha, layer, haze), shape (radius, shadow, 0, 0)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrapPi = (a: number) => (((a + Math.PI) % TAU) + TAU) % TAU - Math.PI;

// a damped spring, stepped in small slices so a long frame does not blow it up
const springTo = (value: number, velocity: number, target: number, dt: number, response: number, ratio: number) => {
  const w = TAU / Math.max(response, 0.02);
  const slices = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / slices;
  let v = velocity;
  let x = value;
  for (let i = 0; i < slices; i++) {
    v += (w * w * (target - x) - 2 * ratio * w * v) * h;
    x += v * h;
  }
  return [x, v] as const;
};

const VERTEX = `#version 300 es
in vec2 position;
in vec4 iRect;
in vec4 iLook;
in vec4 iShape;
uniform vec2 uView;
out vec2 vLocal;
flat out vec4 vRect;
flat out vec4 vLook;
flat out vec4 vShape;

void main() {
  float shadowReach = iShape.y > 0.001 ? iRect.w * 0.42 : 0.0;
  vec2 halfSize = iRect.zw + iLook.x * 1.4 + 2.0 + shadowReach;
  vec2 local = position * halfSize;
  vec2 px = iRect.xy + local;
  gl_Position = vec4(px / uView * 2.0 - 1.0, 0.0, 1.0);
  vLocal = local;
  vRect = iRect;
  vLook = iLook;
  vShape = iShape;
}
`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2DArray;

uniform sampler2DArray uImages;
uniform float uLayerSize;
uniform float uFade[${MAX_LAYERS}];
uniform vec3 uBackground;
uniform vec3 uPlaceholder;
uniform float uDpr;
in vec2 vLocal;
flat in vec4 vRect;
flat in vec4 vLook;
flat in vec4 vShape;
out vec4 outColor;

const vec2 DISC[8] = vec2[8](
  vec2(0.2500, 0.0000), vec2(-0.3193, 0.2925), vec2(0.0489, -0.5569), vec2(0.4024, 0.5249),
  vec2(-0.7385, -0.1306), vec2(0.6996, -0.4450), vec2(-0.2340, 0.8705), vec2(-0.4463, -0.8593)
);

float roundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 halfSize = vRect.zw;
  float radius = min(vShape.x, min(halfSize.x, halfSize.y));
  float blur = vLook.x;
  float alpha = vLook.y;
  int layer = int(vLook.z + 0.5);
  float soft = max(0.7 / uDpr, blur * 0.85);
  float sd = roundBox(vLocal, halfSize, radius);
  float coverage = 1.0 - smoothstep(-soft, soft, sd);

  vec2 uv = vLocal / (2.0 * halfSize);
  vec2 tuv = vec2(uv.x + 0.5, 0.5 - uv.y);
  vec3 color;
  if (blur < 0.45) {
    color = textureGrad(uImages, vec3(tuv, float(layer)), dFdx(tuv), dFdy(tuv)).rgb;
  } else {
    // a soft card: a ring of 8 taps of a blurry mip, averaged in squared colour so the highlights stay bright
    vec2 reach = blur / (2.0 * halfSize);
    float texels = blur / (2.0 * halfSize.y) * uLayerSize;
    float lod = log2(max(texels * 0.55, 1.0));
    vec3 c = textureLod(uImages, vec3(tuv, float(layer)), lod).rgb;
    vec3 sum = c * c * 0.2;
    for (int k = 0; k < 8; k++) {
      vec3 s = textureLod(uImages, vec3(tuv + DISC[k] * reach * vec2(1.0, -1.0), float(layer)), lod).rgb;
      sum += s * s * 0.1;
    }
    color = sqrt(sum);
  }
  color = mix(uPlaceholder, color, uFade[layer]);
  color = mix(color, uBackground, vLook.w);

  vec4 result = vec4(color, 1.0) * coverage * alpha;
  if (vShape.y > 0.001) {
    float drop = halfSize.y * 0.1 + 2.0;
    float spread = halfSize.y * 0.22 + blur;
    float shadowDistance = roundBox(vLocal + vec2(0.0, drop), halfSize * vec2(0.9, 0.86), radius);
    float shade = vShape.y * (1.0 - smoothstep(-spread, spread, shadowDistance)) * alpha * 0.5;
    result += vec4(0.0, 0.0, 0.0, shade) * (1.0 - result.a);
  }
  if (result.a < 0.002) discard;
  outColor = result;
}
`;

export function initSpinShutter(root: HTMLElement, o: Options = SPIN_SHUTTER as Options): (() => void) | undefined {
  const stage = root.querySelector<HTMLElement>('.ss-stage');
  const list = root.querySelector<HTMLElement>('.ss-items');
  const caption = root.querySelector<HTMLElement>('.ss-caption');
  const captionTitle = root.querySelector<HTMLElement>('.ss-caption-title');
  const captionSub = root.querySelector<HTMLElement>('.ss-caption-sub');
  const live = root.querySelector<HTMLElement>('.ss-live');
  if (!stage || !list || !caption || !captionTitle || !captionSub || !live) return;

  const entries = Array.from(list.querySelectorAll<HTMLElement>('li'));
  const items: Item[] = entries
    .slice(0, MAX_LAYERS)
    .map((li) => ({
      img: li.querySelector<HTMLImageElement>('img')!,
      title: li.querySelector('.ss-title')?.textContent?.trim() ?? '',
      subtitle: li.querySelector('.ss-sub')?.textContent?.trim() ?? '',
      href: li.dataset.href ?? '',
    }))
    .filter((it) => it.img);
  if (!items.length) return;

  const doc = root.ownerDocument;
  const view = doc.defaultView ?? window;

  // ---- WebGL2: the program, one quad, one buffer of per-card data ----
  const canvas = doc.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) return;

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
    return shader;
  };

  type Gpu = {
    program: WebGLProgram;
    vao: WebGLVertexArrayObject;
    quad: WebGLBuffer;
    cards: WebGLBuffer;
    uniforms: Record<'uImages' | 'uLayerSize' | 'uFade' | 'uBackground' | 'uPlaceholder' | 'uDpr' | 'uView', WebGLUniformLocation | null>;
    texture: WebGLTexture | null;
  };
  let gpu: Gpu;
  let layerSize = 512;
  let layerCount = 0;

  const buildGpu = () => {
    const program = gl.createProgram()!;
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'position');
    gl.bindAttribLocation(program, 1, 'iRect');
    gl.bindAttribLocation(program, 2, 'iLook');
    gl.bindAttribLocation(program, 3, 'iShape');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'program');
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const cardsBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cardsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_CARDS * FLOATS * 4, gl.DYNAMIC_DRAW);
    for (let a = 0; a < 3; a++) {
      gl.enableVertexAttribArray(a + 1);
      gl.vertexAttribPointer(a + 1, 4, gl.FLOAT, false, FLOATS * 4, a * 16);
      gl.vertexAttribDivisor(a + 1, 1);
    }
    gl.bindVertexArray(null);

    const u = (name: string) => gl.getUniformLocation(program, name);
    gpu = {
      program,
      vao,
      quad,
      cards: cardsBuffer,
      uniforms: {
        uImages: u('uImages'),
        uLayerSize: u('uLayerSize'),
        uFade: u('uFade[0]'),
        uBackground: u('uBackground'),
        uPlaceholder: u('uPlaceholder'),
        uDpr: u('uDpr'),
        uView: u('uView'),
      },
      texture: null,
    };
    gl.useProgram(program);
    gl.uniform1i(gpu.uniforms.uImages, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // the shader writes premultiplied colour
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    layerCount = 0; // the texture is made again on the next frame
  };

  try {
    buildGpu();
  } catch {
    return;
  }

  const background = [0, 0, 0];
  const placeholder = [0.5, 0.5, 0.5];
  const fades = new Float32Array(MAX_LAYERS);
  const data = new Float32Array(MAX_CARDS * FLOATS);

  // a 2D canvas: crops each photo to the card's shape (and later reads a CSS colour as RGB)
  const sampler = doc.createElement('canvas');
  const sctx = sampler.getContext('2d', { willReadFrequently: true });
  if (!sctx) return;

  const cards: Card[] = Array.from({ length: MAX_CARDS }, () => ({ alpha: 1, phi: 0, x: 0, y: 0, z: 1, hw: 0, hh: 0, lift: 0, order: 0 }));
  const phi0 = new Float64Array(MAX_CARDS);
  const sorted: number[] = [];
  const projected = { x: 0, y: 0, z: 1, hw: 0, hh: 0 };

  const layers: Layer[] = items.map(() => ({ ready: false, drawn: false, fade: 0 }));
  let layerAspect = 1;
  let reduced = view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let held = false; // the space bar stops the ring
  let width = 0;
  let height = 0;
  let dpr = 1;
  let sized = false;
  let theta = 0;
  let omega = 0;
  let aimTarget: number | null = null;
  let aimVelocity = 0;
  let aimResponse = 0.9;
  let brake = 0;
  let tiltOffset = 0;
  let tiltVelocity = 0;
  let dragTilt = 0;
  let focusDepth = 0;
  let focusVelocity = 0;
  let focusReady = false;
  let selected: number | null = null;
  let hovered: number | null = null;
  let featured = -1;
  let reportedFeature = -1;
  let captionShown = -1;
  let captionAlpha = 0;
  let paintedAlpha = -1;
  let pointerInside = false;
  let holdUntil = 0;
  let wheelAt = 0;
  let wheeling = false;
  let introState: 'waiting' | 'running' | 'done' = 'waiting';
  let introAt = 0;
  let waitedSince = 0;
  let startTheta = 0;
  let consumed = false;
  let raf = 0;
  let last = 0;
  let visible = false;
  let destroyed = false;
  let lost = false;
  let backgroundAt = -10;
  let press: { id: number; x: number; y: number; theta: number; moved: boolean; samples: { t: number; v: number }[] } | null = null;

  // The intro waits for the page transition to be over (Astro keeps data-astro-transition on <html> for its length), so the cards do not
  // open out while the page is still sliding in. The safety timer never holds it back for longer than 3 s.
  const html = doc.documentElement;
  let transitionOver = !html.hasAttribute('data-astro-transition');
  const transitionWatch = new MutationObserver(() => {
    transitionOver = !html.hasAttribute('data-astro-transition');
    schedule();
  });
  if (!transitionOver) transitionWatch.observe(html, { attributes: true, attributeFilter: ['data-astro-transition'] });
  const transitionSafety = view.setTimeout(() => {
    transitionOver = true;
    schedule();
  }, 3000);

  const startCard = Math.max(Math.round(o.startIndex), 0);
  const geo = { stretch: 1, F: 300, cx: 0, cy: 0, D: 3.4, tilt: 0.4, roll: 0, s: 0.34, aspect: 1, zFront: 2.4, zMin: 2.4, zMax: 4.4, frontHalf: 40, key: '' };

  const clock = () => performance.now() / 1000;
  const itemCount = items.length;
  const cardCount = () => {
    const wanted = Math.round(o.count);
    return clamp(wanted > 0 ? wanted : itemCount, 1, MAX_CARDS);
  };
  const itemOf = (card: number) => card % itemCount;

  // where each card stands on the ring (in groups of `cluster` when it is more than 1)
  const layoutAngles = () => {
    const n = cardCount();
    const size = clamp(Math.round(o.cluster), 1, n);
    const groups = Math.ceil(n / size);
    const even = TAU / n;
    const spread = clamp(o.spread, 0.05, 1);
    for (let i = 0; i < n; i++) {
      const group = Math.floor(i / size);
      const slot = i % size;
      const members = Math.min(size, n - group * size);
      phi0[i] = -((group / groups) * TAU + (slot - (members - 1) / 2) * even * spread);
    }
    return n;
  };

  // ---- the texture array: one layer per photo ----
  const ensureTexture = (n: number, wantedSize: number) => {
    const grow = wantedSize > layerSize * 1.25;
    if (layerCount === n && !grow && gpu.texture) return false;
    layerSize = layerCount === 0 || grow ? wantedSize : layerSize;
    layerCount = n;
    if (gpu.texture) gl.deleteTexture(gpu.texture);
    const tex = gl.createTexture()!;
    gpu.texture = tex;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.floor(Math.log2(layerSize)) + 1, gl.RGBA8, layerSize, layerSize, n);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    gl.uniform1f(gpu.uniforms.uLayerSize, layerSize);
    layers.forEach((l) => (l.drawn = false));
    return true;
  };

  // crop a photo to the shape of a card and upload it as one layer
  const drawLayer = (index: number) => {
    const layer = layers[index];
    if (!layer || !layer.ready || layer.drawn) return false;
    const image = items[index].img;
    const iw = image.naturalWidth;
    const ih = image.naturalHeight;
    if (!iw || !ih) return false;
    let sw = iw;
    let sh = ih;
    if (iw / ih > layerAspect) sw = ih * layerAspect;
    else sh = iw / layerAspect;
    sampler.width = layerSize;
    sampler.height = layerSize;
    try {
      sctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, layerSize, layerSize);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, gpu.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, index, layerSize, layerSize, 1, gl.RGBA, gl.UNSIGNED_BYTE, sampler);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    } catch {
      return false;
    }
    layer.drawn = true;
    return true;
  };

  // the photos come from the page's own <img> elements: ready when they have loaded and decoded
  const imageHandlers: [HTMLImageElement, () => void][] = [];
  items.forEach((item, i) => {
    const markReady = () => {
      if (destroyed || layers[i].ready) return;
      const done = () => {
        if (destroyed) return;
        layers[i].ready = true;
        schedule();
      };
      item.img.decode().then(done, done);
    };
    if (item.img.complete && item.img.naturalWidth) markReady();
    else {
      item.img.addEventListener('load', markReady);
      imageHandlers.push([item.img, markReady]);
    }
  });

  const readSize = () => {
    const nextWidth = Math.round(root.clientWidth);
    const nextHeight = Math.round(root.clientHeight);
    if (nextWidth < 2 || nextHeight < 2) {
      sized = false;
      return false;
    }
    const nextDpr = Math.min(view.devicePixelRatio || 1, Math.max(o.dpr, 0.5));
    if (sized && nextWidth === width && nextHeight === height && nextDpr === dpr) return false;
    sized = true;
    width = nextWidth;
    height = nextHeight;
    dpr = nextDpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    return true;
  };

  // any CSS colour as 0..1 RGB (and whether it is see-through), by painting one pixel
  const readColor = (css: string) => {
    sampler.width = 1;
    sampler.height = 1;
    sctx.clearRect(0, 0, 1, 1);
    sctx.fillStyle = '#000';
    sctx.fillStyle = css;
    sctx.fillRect(0, 0, 1, 1);
    const p = sctx.getImageData(0, 0, 1, 1).data;
    return { rgb: [p[0] / 255, p[1] / 255, p[2] / 255], clear: p[3] < 250 };
  };

  // the colour behind the ring (the first background up the tree), which the far cards fade into
  const syncColors = () => {
    let node: HTMLElement | null = root;
    let found = false;
    while (node && !found) {
      const fill = view.getComputedStyle(node).backgroundColor;
      if (fill && fill !== 'transparent') {
        const c = readColor(fill);
        if (!c.clear) {
          background[0] = c.rgb[0];
          background[1] = c.rgb[1];
          background[2] = c.rgb[2];
          found = true;
        }
      }
      node = node.parentElement;
    }
    if (!found) background[0] = background[1] = background[2] = 1;
    const light = background[0] * 0.2126 + background[1] * 0.7152 + background[2] * 0.0722 > 0.6;
    const to = light ? 0 : 1;
    for (let k = 0; k < 3; k++) placeholder[k] = background[k] + (to - background[k]) * 0.08;
  };

  // a card at angle `phi` round the ring, in pixels (y up from the bottom of the box)
  const project = (phi: number, lift: number, tilt: number) => {
    const st = Math.sin(tilt);
    const ct = Math.cos(tilt);
    let rx = Math.sin(phi);
    let ry = -geo.D * st;
    let rz = Math.cos(phi) - geo.D * ct;
    if (lift) {
      const length = Math.hypot(rx, ry, rz);
      rx -= (rx / length) * lift;
      ry -= (ry / length) * lift;
      rz -= (rz / length) * lift;
    }
    const z = -(ry * st + rz * ct);
    const yc = ry * ct - rz * st;
    const inv = geo.F / Math.max(z, 0.05);
    const sx = rx * inv * geo.stretch; // the ring can be stretched sideways (the cards keep their shape)
    const sy = yc * inv;
    const cr = Math.cos(geo.roll);
    const sr = Math.sin(geo.roll);
    projected.x = geo.cx + sx * cr - sy * sr;
    projected.y = geo.cy + sx * sr + sy * cr;
    projected.z = z;
    projected.hh = geo.s * 0.5 * inv;
    projected.hw = projected.hh * geo.aspect;
    return projected;
  };

  // fit the whole ring into the box (only when the box or the settings changed)
  const measure = () => {
    const captionRoom = o.captions ? CAPTION_ROOM : 0;
    const key = [width, height, captionRoom, o.size, o.aspect, o.tilt, o.roll, o.distance, o.scale, o.stretch, o.sizeTall, o.tiltTall].join('|');
    if (key === geo.key) return;
    geo.key = key;
    const margin = Math.min(width, height) * 0.06 + 8;
    const availableW = Math.max(width - margin * 2, 40);
    const availableH = Math.max(height - captionRoom - margin * 2, 40);
    // a tall room (phone, tablet upright): the ring leans more towards you and the cards are bigger, so it fills the height too
    const tall = clamp((1.25 - availableW / availableH) / 0.7, 0, 1);
    geo.s = clamp(o.size + (o.sizeTall - o.size) * tall, 0.08, 1.2);
    geo.aspect = clamp(o.aspect, 0.4, 2.5);
    geo.D = Math.max(clamp(o.distance, 1.5, 14), 1.25 + geo.s);
    geo.tilt = (clamp(o.tilt + (o.tiltTall - o.tilt) * tall, -80, 80) * Math.PI) / 180;
    geo.roll = (clamp(o.roll, -90, 90) * Math.PI) / 180;
    geo.F = 1;
    geo.cx = 0;
    geo.cy = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let zMin = Infinity;
    let zMax = -Infinity;
    const box = () => {
      minX = minY = zMin = Infinity;
      maxX = maxY = zMax = -Infinity;
      for (let k = 0; k < 96; k++) {
        const p = project((k / 96) * TAU, 0, geo.tilt);
        minX = Math.min(minX, p.x - p.hw);
        maxX = Math.max(maxX, p.x + p.hw);
        minY = Math.min(minY, p.y - p.hh);
        maxY = Math.max(maxY, p.y + p.hh);
        zMin = Math.min(zMin, p.z);
        zMax = Math.max(zMax, p.z);
      }
    };
    geo.stretch = 1;
    box();
    // a wide room: stretch the ring sideways until it fills the width the height has left over
    if (o.stretch > 1) {
      geo.stretch = clamp(availableW / availableH / ((maxX - minX) / (maxY - minY)), 1, o.stretch);
      box();
    }
    const overflow = clamp((1.1 - availableW / availableH) * 0.6, 0, 0.4);
    const fit = Math.min((availableW * (1 + overflow)) / (maxX - minX), availableH / (maxY - minY));
    geo.F = fit * clamp(o.scale, 0.2, 1.5);
    geo.cx = width / 2 - geo.F * ((minX + maxX) / 2);
    geo.cy = captionRoom + (height - captionRoom) / 2 - geo.F * ((minY + maxY) / 2);
    geo.zMin = zMin;
    geo.zMax = zMax;
    const front = project(0, 0, geo.tilt);
    geo.zFront = front.z;
    geo.frontHalf = front.hh;
    // the middle of the ring (what the page puts in the hollow of it, e.g. a heading) as CSS variables, in px from the top left
    root.style.setProperty('--ss-cx', `${geo.cx.toFixed(1)}px`);
    root.style.setProperty('--ss-cy', `${(height - geo.cy).toFixed(1)}px`);
    if (!focusReady) {
      focusDepth = geo.zFront;
      focusReady = true;
    }
  };

  const schedule = () => {
    if (destroyed || lost || !visible || raf) return;
    raf = requestAnimationFrame(frame);
  };

  const hold = (seconds = 2.4) => {
    if (!o.selectable && !o.draggable) return; // a ring nobody can touch never waits
    holdUntil = Math.max(holdUntil, clock() + seconds);
  };

  const aim = (value: number, response: number) => {
    if (aimTarget === null) aimVelocity = omega;
    aimTarget = value;
    aimResponse = response;
    schedule();
  };

  const frontCard = (angle: number) => {
    const n = cardCount();
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(wrapPi(phi0[i] + angle));
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    return best;
  };

  // ---- what the page learns about the ring (the hidden list and the live region) ----
  const onFeature = (index: number) => {
    entries.forEach((li, i) => (i === index ? li.setAttribute('aria-current', 'true') : li.removeAttribute('aria-current')));
  };
  const onPick = (index: number) => {
    const item = items[index];
    live.textContent = item ? item.title || item.img.alt : '';
  };
  const onSelect = (index: number) => {
    const href = items[index]?.href;
    if (!href) return;
    root.dispatchEvent(new CustomEvent('ss:select', { detail: { index, href }, bubbles: true }));
  };

  const show = (card: number) => {
    const n = layoutAngles();
    const index = ((Math.round(card) % n) + n) % n;
    selected = index;
    onPick(itemOf(index));
    const reference = aimTarget ?? theta;
    aim(reference - wrapPi(phi0[index] + reference), reduced ? 0.06 : 0.95);
    hold();
  };

  const step = (direction: number) => {
    const n = layoutAngles();
    const current = selected ?? frontCard(aimTarget ?? theta);
    show((current + (direction > 0 ? 1 : -1) + n) % n);
  };

  const release = () => {
    selected = null;
    hold(1.2);
    schedule();
  };

  const hitTest = (clientX: number, clientY: number) => {
    const rect = root.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = height - (clientY - rect.top);
    for (let k = sorted.length - 1; k >= 0; k--) {
      const card = cards[sorted[k]];
      if (Math.abs(x - card.x) <= card.hw && Math.abs(y - card.y) <= card.hh) return sorted[k];
    }
    return null;
  };

  // ---- one frame ----
  function frame(time: number) {
    raf = 0;
    if (destroyed || lost) return;
    if (!sized) {
      readSize();
      if (!sized) return;
    }
    const dt = last && time - last < 100 ? Math.min(Math.max((time - last) / 1000, 0), 0.05) : 1 / 60;
    last = time;
    const now = clock();
    let busy = false;

    if (now - backgroundAt > 1.2) {
      backgroundAt = now;
      syncColors();
    }
    readSize();
    measure();
    const n = layoutAngles();
    const itemTotal = Math.max(layers.length, 1);

    // the photos are cropped to the card's shape; a new shape means cropping them again
    const aspect = clamp(o.aspect, 0.4, 2.5);
    if (Math.abs(aspect - layerAspect) > 1e-3) {
      layerAspect = aspect;
      layers.forEach((l) => (l.drawn = false));
    }
    // texture size follows the size of the front card on screen
    const frontPixels = Math.max(geo.frontHalf * 2 * Math.max(aspect, 1), 1) * dpr;
    const wanted = clamp(Math.ceil(frontPixels / 128) * 128, 256, 1024);
    if (ensureTexture(itemTotal, wanted)) busy = true;
    // one photo uploaded per frame, starting with the one in front
    const centreItem = itemOf(frontCard(theta));
    let drew = false;
    for (let offset = 0; offset < layers.length && !drew; offset++) {
      const index = (centreItem + (offset % 2 ? -(offset + 1) / 2 : offset / 2) + layers.length * 4) % layers.length;
      const layer = layers[index];
      if (layer && layer.ready && !layer.drawn) drew = drawLayer(index);
    }
    if (drew) busy = true;
    let allDrawn = true;
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (!layer.drawn) allDrawn = false;
      else if (layer.fade < 1) {
        layer.fade = reduced || introState !== 'done' ? 1 : Math.min(1, layer.fade + dt / 0.45);
        busy = true;
      }
      fades[i] = layer.drawn ? layer.fade : 0;
    }

    // ---- intro: the cards open out of the first one along the ring ----
    const stacked = !reduced && o.intro; // the cards start as one stack (the first card) and open out into the ring
    if (introState === 'waiting') {
      // the stack is already on the screen while the page transition runs (it is part of the page); only the opening out waits for its end
      theta = -phi0[clamp(startCard, 0, n - 1)];
      startTheta = theta;
      if (!waitedSince && transitionOver) waitedSince = now;
      busy = true;
      if (transitionOver && (allDrawn || now - waitedSince > 2.2)) {
        omega = 0;
        brake = 0;
        if (reduced || !o.intro) introState = 'done';
        else {
          introState = 'running';
          introAt = now;
        }
      }
    }
    let open = 1;
    let appear = 1;
    let appearTop = 1;
    if (introState === 'running') {
      const elapsed = now - introAt;
      appearTop = 1; // the first card is already there
      appear = smooth(0.16, 0.46, elapsed);
      const x = clamp((elapsed - 0.22) / 1.9, 0, 1);
      open = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      open = 1 - Math.pow(1 - open, 1.35);
      busy = true;
      if (elapsed > 2.15) {
        introState = 'done';
        open = appear = appearTop = 1;
        hold(0.4);
      }
    } else if (introState === 'waiting') {
      const startReady = !!layers[clamp(startCard, 0, layers.length - 1)]?.drawn;
      appearTop = startReady ? 1 : 0;
      appear = stacked ? 0 : allDrawn ? 1 : 0;
      open = stacked ? 0 : 1;
    }

    // ---- the turning: cruise, brake when touched, spring to a chosen card, coast after a drag ----
    const cruise = (o.speed * TAU) / 60;
    const touching = !!press || (o.pauseOnHover && pointerInside);
    const stopped = held || reduced || introState !== 'done';
    const holding = touching || selected !== null || now < holdUntil;
    const brakeTarget = stopped || holding ? 0 : 1;
    brake += (brakeTarget - brake) * (1 - Math.exp(-dt / (brakeTarget > brake ? 1.1 : 0.35)));
    if (Math.abs(brakeTarget - brake) > 1e-3) busy = true;
    else brake = brakeTarget;

    if (wheeling && now - wheelAt > 0.16) {
      wheeling = false;
      if (aimTarget !== null) {
        const card = frontCard(aimTarget);
        aimTarget -= wrapPi(phi0[card] + aimTarget);
      }
    }

    if (press && press.moved) {
      busy = true;
    } else if (aimTarget !== null) {
      [theta, aimVelocity] = springTo(theta, aimVelocity, aimTarget, dt, reduced ? 0.06 : aimResponse, 0.94);
      omega = aimVelocity;
      if (Math.abs(theta - aimTarget) < 1e-4 && Math.abs(aimVelocity) < 1e-3) {
        theta = aimTarget;
        aimTarget = null;
        omega = 0;
      } else busy = true;
    } else if (introState === 'done') {
      const target = cruise * brake;
      omega += (target - omega) * (1 - Math.exp(-dt / 0.9));
      if (Math.abs(omega - target) < 1e-5) omega = target;
      theta += omega * dt;
      if (Math.abs(omega) > 1e-5 || Math.abs(target) > 1e-5) busy = true;
    }
    if (theta > 1e4 || theta < -1e4) {
      const shift = Math.round(theta / TAU) * TAU;
      theta -= shift;
      if (aimTarget !== null) aimTarget -= shift;
      if (press) press.theta -= shift;
    }

    // the ring leans a little further while it is dragged up or down
    const tiltGoal = press && press.moved ? dragTilt : 0;
    [tiltOffset, tiltVelocity] = springTo(tiltOffset, tiltVelocity, tiltGoal, dt, reduced ? 0.06 : 0.75, 0.96);
    if (Math.abs(tiltOffset - tiltGoal) < 1e-4 && Math.abs(tiltVelocity) < 1e-4) {
      tiltOffset = tiltGoal;
      tiltVelocity = 0;
    } else busy = true;
    const tilt = clamp(geo.tilt + (tiltOffset * Math.PI) / 180, -1.45, 1.45);

    // ---- where every card is ----
    const direction = o.speed < 0 ? -1 : 1;
    const startIdx = clamp(startCard, 0, n - 1);
    const lifted = selected !== null && selected < n ? selected : -1;
    sorted.length = 0;
    for (let i = 0; i < n; i++) {
      const card = cards[i];
      let phi = phi0[i] + theta;
      let order = 0;
      if (introState !== 'done') {
        const offset = phi0[i] - phi0[startIdx];
        const travel = direction > 0 ? ((offset % TAU) + TAU) % TAU : -((((-offset) % TAU) + TAU) % TAU);
        phi = startTheta + phi0[startIdx] + travel * open;
        order = Math.abs(travel) * 1e-4 * (1 - open);
      }
      const liftGoal = i === lifted ? 0.16 : 0;
      card.lift += (liftGoal - card.lift) * (reduced ? 1 : 1 - Math.exp(-dt / 0.22));
      if (Math.abs(card.lift - liftGoal) > 1e-4) busy = true;
      else card.lift = liftGoal;
      const p = project(phi, card.lift, tilt);
      const scaleIn = 0.94 + 0.06 * appearTop;
      card.phi = phi;
      card.x = p.x;
      card.y = p.y;
      card.z = p.z;
      card.hw = p.hw * scaleIn;
      card.hh = p.hh * scaleIn;
      card.order = p.z + order;
      card.alpha = i === startIdx ? appearTop : appear;
      sorted.push(i);
    }
    sorted.sort((a, b) => cards[b].order - cards[a].order); // far first

    // which card the caption is for: the chosen one, the hovered one, else the one in front (with a little hysteresis)
    let candidate = selected !== null && selected < n ? selected : hovered !== null && hovered < n ? hovered : -1;
    if (candidate < 0) {
      candidate = frontCard(theta);
      if (featured >= 0 && featured < n && candidate !== featured) {
        const current = Math.abs(wrapPi(cards[featured].phi));
        const next = Math.abs(wrapPi(cards[candidate].phi));
        if (current - next < 0.04) candidate = featured;
      }
    }
    featured = candidate;
    const featuredItem = itemOf(featured);
    if (featuredItem !== reportedFeature && introState === 'done') {
      reportedFeature = featuredItem;
      onFeature(featuredItem);
    }

    // ---- the focus: the depth that is sharp follows the hovered / chosen card ----
    const focusTarget =
      introState !== 'done' ? geo.zFront : selected !== null && selected < n ? cards[selected].z : hovered !== null && hovered < n ? cards[hovered].z : geo.zFront;
    [focusDepth, focusVelocity] = springTo(focusDepth, focusVelocity, focusTarget, dt, reduced ? 0.04 : 0.42, 1);
    if (Math.abs(focusDepth - focusTarget) > 1e-4 || Math.abs(focusVelocity) > 1e-4) busy = true;

    const aperture = clamp(o.aperture, 0, 1);
    const span = Math.max((geo.zMax - geo.zMin) / geo.zMax, 0.05);
    const frontHeight = geo.frontHalf * 2;
    const blurScale = (aperture * 0.17 * frontHeight) / span;
    const blurLimit = frontHeight * 0.2;
    const haze = clamp(o.haze, 0, 1);
    const shadow = clamp(o.shadow, 0, 1);
    const radius = Math.max(o.radius, 0);
    const depthRange = Math.max(geo.zMax - geo.zMin, 1e-3);
    for (let k = 0; k < n; k++) {
      const index = sorted[k];
      const card = cards[index];
      const depth = clamp((card.z - geo.zMin) / depthRange, 0, 1);
      const blur = Math.min((blurScale * Math.abs(card.z - focusDepth)) / card.z, blurLimit);
      const f = k * FLOATS;
      data[f] = card.x;
      data[f + 1] = card.y;
      data[f + 2] = card.hw;
      data[f + 3] = card.hh;
      data[f + 4] = blur;
      data[f + 5] = card.alpha;
      data[f + 6] = itemOf(index) % itemTotal;
      data[f + 7] = haze * Math.pow(depth, 1.25) * 0.85;
      data[f + 8] = (radius * card.hh) / Math.max(geo.frontHalf, 1);
      data[f + 9] = shadow * (1 - 0.55 * depth);
      data[f + 10] = 0;
      data[f + 11] = 0;
    }

    // ---- the caption under the ring ----
    const fast = Math.abs(omega) > 1.4 || (press !== null && press.moved);
    const showCaption = o.captions && introState === 'done' && !fast;
    if (captionShown !== featuredItem && captionAlpha < 0.02) {
      captionShown = featuredItem;
      const item = items[featuredItem];
      captionTitle!.textContent = item ? item.title || item.img.alt : '';
      captionSub!.textContent = item?.subtitle ?? '';
      captionSub!.style.display = item?.subtitle ? '' : 'none';
    }
    const captionGoal = showCaption && captionShown === featuredItem ? 1 : 0;
    captionAlpha += (captionGoal - captionAlpha) * (reduced ? 1 : 1 - Math.exp(-dt / (captionGoal > captionAlpha ? 0.2 : 0.09)));
    if (Math.abs(captionGoal - captionAlpha) < 0.003) captionAlpha = captionGoal;
    else busy = true;
    if (Math.abs(captionAlpha - paintedAlpha) > 0.002) {
      paintedAlpha = captionAlpha;
      caption!.style.opacity = captionAlpha.toFixed(3);
    }

    // ---- draw: every card in one instanced call ----
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.useProgram(gpu.program);
    gl!.bindVertexArray(gpu.vao);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, gpu.cards);
    gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, data, 0, n * FLOATS);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D_ARRAY, gpu.texture);
    const u = gpu.uniforms;
    gl!.uniform2f(u.uView, width, height);
    gl!.uniform1f(u.uDpr, dpr);
    gl!.uniform1fv(u.uFade, fades);
    gl!.uniform3f(u.uBackground, background[0], background[1], background[2]);
    gl!.uniform3f(u.uPlaceholder, placeholder[0], placeholder[1], placeholder[2]);
    gl!.drawArraysInstanced(gl!.TRIANGLE_STRIP, 0, 4, n);

    if (busy || press || (holdUntil > now && introState === 'done')) schedule();
  }

  // ---- input ----
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
      pointerInside = true;
      if (!press) {
        const hit = hitTest(event.clientX, event.clientY);
        if (hit !== hovered) hovered = hit;
        const cursor = hit !== null && o.selectable ? 'pointer' : o.draggable ? 'grab' : '';
        if (root.style.cursor !== cursor) root.style.cursor = cursor;
      }
    }
    if (press && press.id === event.pointerId) {
      const dx = event.clientX - press.x;
      const dy = press.y - event.clientY;
      if (!press.moved && Math.hypot(dx, dy) > 6 && o.draggable) {
        press.moved = true;
        aimTarget = null;
        selected = null;
        hovered = null;
        omega = 0;
        root.style.cursor = 'grabbing';
        try {
          stage.setPointerCapture(event.pointerId);
        } catch {
          /* the pointer is gone */
        }
      }
      if (press.moved) {
        const cr = Math.cos(geo.roll);
        const sr = Math.sin(geo.roll);
        const along = dx * cr + dy * sr;
        const across = -dx * sr + dy * cr;
        const radiusPixels = Math.max(geo.F / Math.max(geo.zFront, 0.1), 20);
        theta = press.theta + along / radiusPixels;
        dragTilt = clamp(-across / 5, -38, 38);
        const t = performance.now();
        press.samples.push({ t, v: theta });
        while (press.samples.length > 2 && t - press.samples[0].t > 110) press.samples.shift();
      }
    }
    schedule();
  };

  const onDown = (event: PointerEvent) => {
    if (!o.draggable || !event.isPrimary || event.button > 0) return;
    consumed = false;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, theta, moved: false, samples: [{ t: performance.now(), v: theta }] };
    hold();
    schedule();
  };

  const onUp = (event: PointerEvent) => {
    if (!press || press.id !== event.pointerId) return;
    const ended = press;
    press = null;
    try {
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    } catch {
      /* the pointer is gone */
    }
    if (ended.moved) {
      consumed = true; // the click that follows a drag is not a click on a card
      const t = performance.now();
      const recent = ended.samples.filter((s) => t - s.t < 110);
      let velocity = 0;
      if (recent.length > 1 && t - recent[recent.length - 1].t < 60) {
        const span = Math.max((recent[recent.length - 1].t - recent[0].t) / 1000, 1 / 120);
        velocity = (recent[recent.length - 1].v - recent[0].v) / span;
      }
      omega = reduced ? 0 : clamp(velocity, -5, 5);
      aimTarget = null;
      root.style.cursor = o.draggable ? 'grab' : '';
      hold();
    }
    schedule();
  };

  const onClick = (event: MouseEvent) => {
    if (!o.selectable) return;
    if (consumed) {
      consumed = false;
      return;
    }
    const card = hitTest(event.clientX, event.clientY);
    if (card === null) {
      if (selected !== null) release();
      return;
    }
    const atFront = Math.abs(wrapPi(cards[card].phi)) < 0.06;
    if (card === selected && atFront) onSelect(itemOf(card));
    else show(card);
  };

  const onLeave = (event: PointerEvent) => {
    if (press && press.id === event.pointerId) return;
    pointerInside = false;
    hovered = null;
    root.style.cursor = '';
    if (selected !== null) {
      selected = null;
      hold(1.6);
    } else hold(0.6);
    schedule();
  };

  const onWheel = (event: WheelEvent) => {
    if (!o.wheel) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    const delta = clamp((Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit, -240, 240);
    const n = layoutAngles();
    selected = null;
    aim((aimTarget ?? theta) + (delta / 100) * (TAU / n), reduced ? 0.06 : 0.55);
    wheeling = true;
    wheelAt = clock();
    hold();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.target !== root) return;
    if (event.key === ' ') {
      event.preventDefault();
      held = !held; // the one way to stop it (for those who need the page still)
      schedule();
      return;
    }
    if (!o.selectable) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      show(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      show(cardCount() - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onSelect(itemOf(selected ?? frontCard(theta)));
    } else if (event.key === 'Escape') {
      if (selected !== null) {
        event.preventDefault();
        release();
      }
    }
  };

  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotion = () => {
    reduced = motion.matches;
    schedule();
  };

  stage.appendChild(canvas);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('pointerleave', onLeave);
  stage.addEventListener('click', onClick);
  stage.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('keydown', onKey);
  motion.addEventListener('change', onMotion);

  const resizer = new ResizeObserver(() => {
    if (readSize()) schedule();
  });
  resizer.observe(root);

  // only draws while (nearly) on screen
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        last = 0;
        schedule();
      } else {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    { rootMargin: '80px' },
  );
  observer.observe(root);

  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const onRestored = () => {
    try {
      buildGpu();
    } catch {
      return;
    }
    layers.forEach((l) => (l.drawn = false));
    sized = false;
    geo.key = '';
    lost = false;
    schedule();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  root.dataset.live = ''; // the markup's own grid steps aside (visually hidden, still there for screen readers)
  readSize();
  syncColors();
  schedule();

  return () => {
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    observer.disconnect();
    resizer.disconnect();
    transitionWatch.disconnect();
    view.clearTimeout(transitionSafety);
    motion.removeEventListener('change', onMotion);
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerup', onUp);
    stage.removeEventListener('pointercancel', onUp);
    stage.removeEventListener('pointerleave', onLeave);
    stage.removeEventListener('click', onClick);
    stage.removeEventListener('wheel', onWheel);
    root.removeEventListener('keydown', onKey);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    imageHandlers.forEach(([img, handler]) => img.removeEventListener('load', handler));
    root.style.cursor = '';
    delete root.dataset.live;
    if (gpu.texture) gl.deleteTexture(gpu.texture);
    gl.deleteBuffer(gpu.quad);
    gl.deleteBuffer(gpu.cards);
    gl.deleteVertexArray(gpu.vao);
    gl.deleteProgram(gpu.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  };
}
