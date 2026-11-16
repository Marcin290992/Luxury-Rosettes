// Gallery dome: an endless wall of photos seen through a lens (the middle is flat, the edges bend away). Drag to move it, a flick keeps gliding,
// it also slides slowly by itself. A tap on a photo opens it large.
//
// Adapted from the "Inverted Dome" component (React + three.js + motion) to plain TypeScript with NO libraries: plain WebGL2, one instanced draw
// call for all the photos; the lens is done in the vertex shader, the rounded corners and the fade at the edges in the fragment shader.
//  - the photos are read from the markup (see GalleryDome.astro): the <img> elements are cut to one shape and put into one atlas texture,
//    no second download; without WebGL2 (or the script) the same markup is a plain grid of photos,
//  - touch: a finger moves the wall sideways only (touch-action: pan-y), so a vertical swipe still scrolls the page and nobody gets stuck on it;
//    the wheel is the same: only a sideways one is taken, the vertical wheel scrolls the page,
//  - initGalleryDome(root) returns destroy(); everything is looked up inside `root`; it only draws while on screen; with reduced motion the wall
//    does not slide by itself and does not glide after a flick.
//
// Expected markup: root > .gd-stage (the canvas goes in), ul.gd-list > li > img[data-full], .gd-hint, .gd-box (lightbox) > (img, button.gd-close).

import { GALLERY_DOME } from './settings';
import { getLenis } from './lenis';
import { clamp } from './math';

const o = GALLERY_DOME;

const MAX_ATLAS = 4096; // px: the longest side of the atlas
const MAX_ATLAS_PIXELS = 12e6; // and how many pixels in all (a phone's memory)
const CELL_WIDTH = 640; // px of one photo in the atlas, at most
const MAX_INSTANCES = 900;
const TAP_TRAVEL = 6; // px: a press that moved less than this, and was short, is a tap
const TAP_TIME = 500; // ms
const MAX_FLICK = 3500; // px/s
const WALL_FROM = 0.3; // share of the page's entrance (0..1) that is the heading's alone, before the wall begins to come in

const VERTEX = `#version 300 es
in vec2 aUv;
in vec2 aCell;
uniform vec2 uView;
uniform vec2 uOffset;
uniform vec2 uTile;
uniform vec2 uPitch;
uniform vec2 uHalfCount;
uniform vec2 uAtlasGrid;
uniform vec2 uInset;
uniform float uCurve;
uniform float uCurveRadius;
uniform float uZoom;
uniform float uImageCount;
uniform float uIntro;
out vec2 vUv;
out vec2 vLocal;
out float vEdge;

vec2 lens(vec2 screen) {
  vec2 n = screen / uView - 0.5;
  float aspect = uView.x / uView.y;
  n.x *= aspect;
  float t = length(n) / uCurveRadius;
  float z = sqrt(max(0.5 - t * t, 0.0004));
  n *= (uZoom + uCurve / z) * mix(0.88, 1.0, uIntro); // the wall opens out from a smaller one while it comes in
  n.x /= aspect;
  return (n + 0.5) * uView;
}

void main() {
  vec2 cell = aCell - uHalfCount + floor(uOffset / uPitch);
  // every other column stands half a photo lower: a staggered wall, not a grid
  vec2 origin = cell * uPitch - uOffset + uView * 0.5 + vec2(0.0, mod(cell.x, 2.0) * uPitch.y * 0.5);
  vec2 local = aUv * uTile;
  vec2 screen = lens(origin + local);

  vec2 n = screen / uView - 0.5;
  n.x *= uView.x / uView.y;
  vEdge = length(n);

  // neighbours always differ (for more than three photos): the photo follows a slanted pattern of the cell
  float index = mod(cell.x * 3.0 + cell.y * 2.0, uImageCount);
  vec2 slot = vec2(mod(index, uAtlasGrid.x), floor(index / uAtlasGrid.x));
  vec2 padded = mix(uInset, 1.0 - uInset, vec2(aUv.x, 1.0 - aUv.y));
  vUv = (slot + padded) / uAtlasGrid;
  vLocal = local;

  gl_Position = vec4(screen / uView * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
uniform vec2 uTile;
uniform float uRadius;
uniform float uVignette;
uniform float uReach;
uniform float uIntro;
in vec2 vUv;
in vec2 vLocal;
in float vEdge;
out vec4 outColor;

float roundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 ext = uTile * 0.5;
  float r = min(uRadius, min(ext.x, ext.y));
  float d = roundBox(vLocal - ext, ext, r);
  float aa = max(fwidth(d), 0.0001);
  float shape = 1.0 - smoothstep(-aa, aa, d);
  // the edges fade into the page (the canvas is see-through), not into black
  float fade = smoothstep(uReach * 0.35, uReach, vEdge);
  // the entrance: the photos appear from the middle outwards
  float bloom = 1.0 - smoothstep(uIntro * 1.9 * uReach - 0.9 * uReach, uIntro * 1.9 * uReach, vEdge);
  float alpha = shape * (1.0 - uVignette * fade) * bloom;
  if (alpha < 0.003) discard;
  outColor = vec4(texture(uAtlas, vUv).rgb * alpha, alpha);
}
`;

const mod = (a: number, b: number) => ((a % b) + b) % b;
const lensRadius = (width: number, height: number) => {
  const shortest = Math.max(Math.min(width, height), 1);
  return Math.hypot(width / shortest, height / shortest) * 0.72 * Math.max(o.curveRadius, 1);
};

// where on the flat wall a point of the screen is (the lens turned back, found by halving); null = outside of the lens
const unlens = (x: number, y: number, width: number, height: number) => {
  const radius = lensRadius(width, height);
  const aspect = width / height;
  const nx = (x / width - 0.5) * aspect;
  const ny = y / height - 0.5;
  const target = Math.hypot(nx, ny);
  if (target < 1e-6) return { x: width * 0.5, y: height * 0.5 };
  const stretch = (r: number) => {
    const t = r / radius;
    const z = Math.sqrt(Math.max(0.5 - t * t, 0.0004));
    return r * (Math.max(o.zoom, 0.05) + o.curve / z);
  };
  let low = 0;
  let high = radius * Math.SQRT1_2;
  if (stretch(high) < target) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (stretch(mid) < target) low = mid;
    else high = mid;
  }
  const k = (low + high) / 2 / target;
  return { x: ((nx * k) / aspect + 0.5) * width, y: (ny * k + 0.5) * height };
};

// `onCancelled`: the wall gave its GPU memory back for a page transition that then did not happen; the caller builds it again.
export function initGalleryDome(root: HTMLElement, onCancelled?: () => void): (() => void) | undefined {
  const stage = root.querySelector<HTMLElement>('.gd-stage');
  const list = root.querySelector<HTMLElement>('.gd-list');
  const box = root.querySelector<HTMLElement>('.gd-box');
  const boxImage = box?.querySelector<HTMLImageElement>('img');
  const boxClose = box?.querySelector<HTMLButtonElement>('.gd-close');
  const boxPrev = box?.querySelector<HTMLButtonElement>('.gd-prev');
  const boxNext = box?.querySelector<HTMLButtonElement>('.gd-next');
  const boxText = box?.querySelector<HTMLElement>('.gd-caption-text');
  const boxCount = box?.querySelector<HTMLElement>('.gd-count');
  if (!stage || !list || !box || !boxImage || !boxClose || !boxPrev || !boxNext || !boxText || !boxCount) return;

  const images = Array.from(list.querySelectorAll<HTMLImageElement>('img'));
  if (!images.length) return;

  const doc = root.ownerDocument;
  const view = doc.defaultView ?? window;

  const canvas = doc.createElement('canvas');
  canvas.className = 'gd-canvas';
  const context = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!context) return;
  const gl: WebGL2RenderingContext = context; // (a const of the plain type: the null check does not carry into the functions below)

  // ---- the atlas: every photo cut to the shape of a tile, side by side on one canvas ----
  const columns = Math.ceil(Math.sqrt(images.length));
  const rows = Math.ceil(images.length / columns);
  let cellWidth = Math.min(CELL_WIDTH, Math.floor(MAX_ATLAS / columns), Math.floor((MAX_ATLAS * o.aspect) / rows));
  while (columns * rows * cellWidth * (cellWidth / o.aspect) > MAX_ATLAS_PIXELS && cellWidth > 128) cellWidth -= 32;
  const cellHeight = Math.round(cellWidth / o.aspect);
  const atlas = doc.createElement('canvas');
  atlas.width = cellWidth * columns;
  atlas.height = cellHeight * rows;
  // willReadFrequently keeps the atlas in the main memory: a canvas this big is otherwise kept on the GPU (Chrome on Android), next to the
  // WebGL texture made from it, and a phone's GPU memory is what the page transition needs for its pictures
  const actx = atlas.getContext('2d', { willReadFrequently: true });
  if (!actx) return;
  let painted = 0;

  const paintCell = (index: number) => {
    const image = images[index];
    const iw = image.naturalWidth;
    const ih = image.naturalHeight;
    if (!iw || !ih) return;
    const x = (index % columns) * cellWidth;
    const y = Math.floor(index / columns) * cellHeight;
    const scale = Math.max(cellWidth / iw, cellHeight / ih);
    actx.drawImage(image, x + (cellWidth - iw * scale) / 2, y + (cellHeight - ih * scale) / 2, iw * scale, ih * scale);
    painted++;
  };

  // ---- the GPU side (made again after a lost context) ----
  type Gpu = {
    program: WebGLProgram;
    vao: WebGLVertexArrayObject;
    buffers: WebGLBuffer[];
    cells: WebGLBuffer;
    texture: WebGLTexture;
    indexCount: number;
    u: Record<string, WebGLUniformLocation | null>;
  };
  let gpu: Gpu | undefined;
  let instances = 0;
  let uploaded = false; // the atlas on the GPU is up to date

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
    return shader;
  };

  const buildGpu = () => {
    const program = gl.createProgram()!;
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'aUv');
    gl.bindAttribLocation(program, 1, 'aCell');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'program');
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // one tile as a fine grid (the lens bends it, so it needs points inside)
    const steps = Math.round(clamp(o.segments, 2, 40));
    const points = new Float32Array((steps + 1) * (steps + 1) * 2);
    for (let j = 0; j <= steps; j++) {
      for (let i = 0; i <= steps; i++) {
        points[(j * (steps + 1) + i) * 2] = i / steps;
        points[(j * (steps + 1) + i) * 2 + 1] = j / steps;
      }
    }
    const order = new Uint16Array(steps * steps * 6);
    let k = 0;
    for (let j = 0; j < steps; j++) {
      for (let i = 0; i < steps; i++) {
        const a = j * (steps + 1) + i;
        const b = a + 1;
        const c = a + steps + 1;
        order.set([a, b, c, b, c + 1, c], k);
        k += 6;
      }
    }

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const grid = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, grid);
    gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const index = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, order, gl.STATIC_DRAW);
    const cells = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cells);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);

    const texture = gl.createTexture()!;
    const names = ['uView', 'uOffset', 'uTile', 'uPitch', 'uHalfCount', 'uAtlasGrid', 'uInset', 'uCurve', 'uCurveRadius', 'uZoom', 'uImageCount', 'uIntro', 'uAtlas', 'uRadius', 'uVignette', 'uReach'];
    const u: Gpu['u'] = {};
    names.forEach((name) => (u[name] = gl.getUniformLocation(program, name)));
    gpu = { program, vao, buffers: [grid, index, cells], cells, texture, indexCount: order.length, u };

    gl.useProgram(program);
    gl.uniform1i(u.uAtlas, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // the shader writes premultiplied colour
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    instances = 0;
    uploaded = false;
  };

  try {
    buildGpu();
  } catch {
    return;
  }

  const uploadAtlas = () => {
    if (!gpu) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    uploaded = true;
  };

  // ---- state ----
  const reducedQuery = view.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedQuery.matches;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let tileW = 0;
  let tileH = 0;
  let pitchX = 0;
  let pitchY = 0;
  let cols = 0;
  let rowsCount = 0;
  const offset = { x: 0, y: 0 };
  const velocity = { x: 0, y: 0 };
  let press: { id: number; x: number; y: number; last: { x: number; y: number; t: number }; at: number; touch: boolean } | null = null;
  let raf = 0;
  let last = 0;
  let visible = false;
  let destroyed = false;
  let lost = false;
  let shown = false; // the first frame has been drawn
  let frozen = false; // a still picture lies over the canvas (a page transition is starting): the wall stops drawing
  let lightboxOpen = false;
  // the page can play the wall's entrance (StripeReveal publishes 0..1 on its track); without one the wall is simply there
  const host = root.closest<HTMLElement>('[data-stripe-reveal]');
  const startIntro = host ? parseFloat(host.style.getPropertyValue('--sr-intro')) : NaN;
  let intro = Number.isNaN(startIntro) ? 1 : startIntro;
  const onIntro = (event: Event) => {
    intro = clamp((event as CustomEvent<number>).detail, 0, 1);
    schedule();
  };

  const readSize = () => {
    const w = Math.round(root.clientWidth);
    const h = Math.round(root.clientHeight);
    if (w < 2 || h < 2) return false;
    const nextDpr = Math.min(view.devicePixelRatio || 1, Math.max(o.dpr, 0.5));
    if (w === width && h === height && nextDpr === dpr) return false;
    width = w;
    height = h;
    dpr = nextDpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    tileW = clamp(Math.min(width, height) * o.tileShare, o.tileMin, o.tileMax);
    tileH = tileW / o.aspect;
    pitchX = tileW + tileW * o.gap;
    pitchY = tileH + tileW * o.gap;
    cols = Math.min(Math.ceil((width * 1.35) / pitchX) + 3, 60);
    rowsCount = Math.min(Math.ceil((height * 1.35) / pitchY) + 3, 60);
    return true;
  };

  const syncInstances = () => {
    if (!gpu) return;
    const count = Math.min(cols * rowsCount, MAX_INSTANCES);
    if (count === instances) return;
    instances = count;
    const data = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      data[i * 2] = i % cols;
      data[i * 2 + 1] = Math.floor(i / cols);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.cells);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  };

  const schedule = () => {
    if (destroyed || lost || frozen || !visible || raf) return;
    raf = requestAnimationFrame(frame);
  };

  function frame(time: number) {
    raf = 0;
    if (destroyed || lost || !gpu) return;
    readSize();
    if (!width) return;
    const dt = last && time - last < 100 ? clamp((time - last) / 1000, 0, 0.05) : 1 / 60;
    last = time;

    if (!uploaded && painted > 0) uploadAtlas();

    // ---- motion: a flick glides and dies down; the wall also slides by itself when nobody holds it ----
    let moving = false;
    if (!press) {
      if (reduced) {
        velocity.x = velocity.y = 0;
      } else {
        const keep = Math.exp(-dt * o.friction);
        velocity.x *= keep;
        velocity.y *= keep;
        if (Math.abs(velocity.x) < 1) velocity.x = 0;
        if (Math.abs(velocity.y) < 1) velocity.y = 0;
        offset.x += velocity.x * dt;
        offset.y += velocity.y * dt;
        if (!lightboxOpen) {
          offset.x += o.drift.x * dt;
          offset.y -= o.drift.y * dt;
        }
        moving = true; // the slow slide never stops
      }
    } else moving = true;

    syncInstances();
    const half = (n: number) => Math.floor(n / 2);
    const u = gpu.u;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(gpu.program);
    gl.bindVertexArray(gpu.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
    gl.uniform2f(u.uView, width, height);
    gl.uniform2f(u.uOffset, offset.x, offset.y);
    gl.uniform2f(u.uTile, tileW, tileH);
    gl.uniform2f(u.uPitch, pitchX, pitchY);
    gl.uniform2f(u.uHalfCount, half(cols), half(rowsCount));
    gl.uniform2f(u.uAtlasGrid, columns, rows);
    gl.uniform2f(u.uInset, 1.5 / cellWidth, 1.5 / cellHeight);
    gl.uniform1f(u.uCurve, Math.max(o.curve, 0));
    gl.uniform1f(u.uCurveRadius, lensRadius(width, height));
    gl.uniform1f(u.uZoom, Math.max(o.zoom, 0.05));
    gl.uniform1f(u.uImageCount, Math.max(painted, 1));
    const wall = clamp((intro - WALL_FROM) / (1 - WALL_FROM), 0, 1); // the heading comes first, the wall after it
    gl.uniform1f(u.uIntro, 1 - Math.pow(1 - wall, 2));
    gl.uniform1f(u.uRadius, o.radius);
    gl.uniform1f(u.uVignette, clamp(o.vignette, 0, 1));
    gl.uniform1f(u.uReach, 0.5 * Math.hypot(width / height, 1));
    if (painted > 0 && instances > 0) {
      gl.drawElementsInstanced(gl.TRIANGLES, gpu.indexCount, gl.UNSIGNED_SHORT, 0, instances);
      if (!shown) {
        shown = true;
        root.dataset.ready = '';
      }
    }
    if (moving || painted < images.length) schedule();
  }

  // ---- the photos come from the page's own <img> elements: painted into the atlas when they have loaded and decoded ----
  const handlers: [HTMLImageElement, () => void][] = [];
  const painters = images.map((image, index) => {
    // photos that are not ready yet are skipped by the shader (it picks among the painted ones: they are painted in order, see below)
    return { image, index, done: false };
  });
  // the shader picks index = hash % imageCount among 0..imageCount-1, so the cells must be filled from 0 without gaps
  const settle = () => {
    let changed = false;
    for (const p of painters) {
      if (p.done) continue;
      if (!(p.image.complete && p.image.naturalWidth)) break;
      paintCell(p.index);
      p.done = true;
      changed = true;
    }
    if (changed) {
      uploaded = false;
      schedule();
    }
  };
  images.forEach((image) => {
    const ready = () => {
      if (destroyed) return;
      const done = () => settle();
      image.decode().then(done, done);
    };
    if (image.complete && image.naturalWidth) ready();
    else {
      image.addEventListener('load', ready);
      handlers.push([image, ready]);
    }
  });

  // ---- which photo is under a point of the screen (the lens turned back) ----
  const resolveTile = (clientX: number, clientY: number) => {
    const bounds = root.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !painted) return null;
    const flat = unlens(clientX - bounds.left, bounds.height - (clientY - bounds.top), bounds.width, bounds.height);
    if (!flat) return null;
    const worldX = flat.x - bounds.width * 0.5 + offset.x;
    const worldY = flat.y - bounds.height * 0.5 + offset.y;
    const cellX = Math.floor(worldX / pitchX);
    const stagger = mod(cellX, 2) * pitchY * 0.5; // every other column stands half a photo lower
    const cellY = Math.floor((worldY - stagger) / pitchY);
    const inX = worldX - cellX * pitchX;
    const inY = worldY - stagger - cellY * pitchY;
    if (inX > tileW || inY > tileH) return null; // in the gap
    return mod(cellX * 3 + cellY * 2, painted);
  };

  // ---- the lightbox ----
  const lenisWas = { stopped: false };
  let current = 0;
  const showPhoto = (index: number) => {
    current = mod(index, images.length);
    const image = images[current];
    boxImage.src = image.dataset.full || image.currentSrc || image.src;
    boxImage.alt = image.alt;
    boxText.textContent = image.alt;
    boxCount.textContent = `${String(current + 1).padStart(2, '0')} / ${String(images.length).padStart(2, '0')}`;
  };
  const step = (direction: number) => showPhoto(current + direction);
  const open = (index: number) => {
    if (!images[index]) return;
    showPhoto(index);
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('is-open'));
    lightboxOpen = true;
    getLenis()?.stop();
    lenisWas.stopped = true;
    boxClose.focus({ preventScroll: true });
  };
  const close = () => {
    if (!lightboxOpen) return;
    lightboxOpen = false;
    box.classList.remove('is-open');
    view.setTimeout(() => {
      if (!lightboxOpen) box.hidden = true;
    }, 300);
    if (lenisWas.stopped) getLenis()?.start();
    lenisWas.stopped = false;
    root.focus({ preventScroll: true });
    schedule();
  };

  // ---- input ----
  const touched = () => {
    root.dataset.touched = '';
  };

  const onDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button > 0 || lightboxOpen) return;
    const touch = event.pointerType === 'touch';
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, last: { x: event.clientX, y: event.clientY, t: performance.now() }, at: performance.now(), touch };
    velocity.x = velocity.y = 0;
    if (!touch) {
      try {
        stage.setPointerCapture(event.pointerId);
      } catch {
        /* the pointer is gone */
      }
      root.style.cursor = 'grabbing';
    }
    schedule();
  };

  const onMove = (event: PointerEvent) => {
    if (!press || press.id !== event.pointerId) return;
    const now = performance.now();
    const dt = Math.max(now - press.last.t, 1) / 1000;
    const dx = event.clientX - press.last.x;
    const dy = press.touch ? 0 : event.clientY - press.last.y; // a finger only moves it sideways: the up-down belongs to the page
    press.last = { x: event.clientX, y: event.clientY, t: now };
    offset.x -= dx;
    offset.y += dy;
    velocity.x = velocity.x * 0.6 + (-dx / dt) * 0.4;
    velocity.y = velocity.y * 0.6 + (dy / dt) * 0.4;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_TRAVEL) touched();
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
    root.style.cursor = '';
    const travelled = Math.hypot(event.clientX - ended.x, event.clientY - ended.y);
    if (event.type === 'pointerup' && travelled < TAP_TRAVEL && performance.now() - ended.at < TAP_TIME) {
      const index = resolveTile(event.clientX, event.clientY);
      if (index !== null) {
        velocity.x = velocity.y = 0;
        touched();
        open(index);
      }
      return;
    }
    // a stale last move (the finger rested before it lifted) is not a flick
    if (performance.now() - ended.last.t > 80) velocity.x = velocity.y = 0;
    velocity.x = clamp(velocity.x, -MAX_FLICK, MAX_FLICK);
    velocity.y = clamp(velocity.y, -MAX_FLICK, MAX_FLICK);
    schedule();
  };

  const onWheel = (event: WheelEvent) => {
    if (reduced || lightboxOpen) return;
    // only a sideways wheel (trackpad swipe, shift + wheel) moves the wall; the vertical one scrolls the page
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? width : 1;
    velocity.x += clamp(event.deltaX * unit, -240, 240) * o.wheel * 6;
    velocity.x = clamp(velocity.x, -MAX_FLICK, MAX_FLICK);
    touched();
    schedule();
  };

  const onKey = (event: KeyboardEvent) => {
    if (lightboxOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        step(event.key === 'ArrowRight' ? 1 : -1);
      }
      return;
    }
    if (event.target !== root) return;
    if (event.key === 'Enter') {
      // the photo in the middle of the screen (the way to open one without a pointer)
      const bounds = root.getBoundingClientRect();
      const index = resolveTile(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      if (index !== null) {
        event.preventDefault();
        open(index);
      }
      return;
    }
    const push = 900;
    if (event.key === 'ArrowLeft') velocity.x -= push;
    else if (event.key === 'ArrowRight') velocity.x += push;
    else if (event.key === 'ArrowUp') velocity.y -= push;
    else if (event.key === 'ArrowDown') velocity.y += push;
    else return;
    event.preventDefault();
    touched();
    schedule();
  };

  const onBoxClick = (event: MouseEvent) => {
    const target = event.target as Element;
    if (target !== boxImage && !target.closest('.gd-nav, .gd-close')) close();
  };
  const onPrev = () => step(-1);
  const onNext = () => step(1);

  const onMotion = () => {
    reduced = reducedQuery.matches;
    schedule();
  };

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
    lost = false;
    schedule();
  };

  stage.appendChild(canvas);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('keydown', onKey);
  box.addEventListener('click', onBoxClick);
  boxClose.addEventListener('click', close);
  boxPrev.addEventListener('click', onPrev);
  boxNext.addEventListener('click', onNext);
  reducedQuery.addEventListener('change', onMotion);
  host?.addEventListener('sr:intro', onIntro);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

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

  // When a page transition starts while the wall is on the screen, the live WebGL canvas is swapped for a still picture of its last frame.
  // A WebGL canvas inside the transition's snapshot is composited on its own and, on phones (Chrome and Safari), comes out with another
  // height than the rest of the page, which breaks the transition (the same thing as on the Awards spiral, see awards-spiral.ts `freeze`).
  // A plain image is part of the page like everything else. Only the picture is lost: the page is leaving. The order matters:
  //  1. all of it in the same task as the event (the router reads `loader` right after it, and the buffer still holds the frame);
  //  2. the picture goes OVER the canvas and the canvas is hidden once the picture is decoded, so no frame has neither;
  //  3. the wall stops drawing from the moment of the picture, so the two stay the same picture.
  // 4. Then the wall gives its GPU memory back (the WebGL context, the texture, the canvas's buffers, the atlas): on a phone the transition's
  //    pictures of the old and the new page did not fit next to it, and the transition did not play (to the gallery and from it).
  let still: HTMLImageElement | undefined;
  let unfreeze = 0;
  let released = false;
  const freeGpu = () => {
    if (gpu) {
      gl.deleteTexture(gpu.texture);
      gpu.buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteVertexArray(gpu.vao);
      gl.deleteProgram(gpu.program);
      gpu = undefined;
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  const release = () => {
    if (released) return;
    released = true;
    lost = true; // nothing draws any more
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    freeGpu();
    canvas.width = canvas.height = 0;
    atlas.width = atlas.height = 0;
    canvas.style.visibility = 'hidden';
  };
  const thaw = () => {
    if (released) {
      onCancelled?.(); // the wall is gone: it is built again from the start
      return;
    }
    frozen = false;
    still?.remove();
    still = undefined;
    canvas.style.visibility = '';
    schedule();
  };
  const freeze = (event: Event) => {
    if (still || lost || destroyed) return;
    if (!shown || !visible) {
      // the wall is not on the screen: nothing to keep, but the canvas stays out of the transition's picture and the wall stops drawing
      frozen = true;
      release();
      unfreeze = window.setTimeout(thaw, 5000);
      return;
    }
    try {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      frozen = true; // first, so that the frame below does not schedule another one
      frame(performance.now()); // draws now, in this task: the buffer holds this frame until the task ends
      const img = new Image();
      img.alt = '';
      img.src = canvas.toDataURL('image/webp', 0.92);
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
      canvas.after(img);
      still = img;
      const nav = event as Event & { loader: () => Promise<void> };
      const original = nav.loader;
      nav.loader = async () => {
        await img.decode().catch(() => {});
        if (still === img) release();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await original();
      };
      unfreeze = window.setTimeout(thaw, 5000); // the navigation never happened (cancelled): the live canvas comes back
    } catch {
      thaw();
    }
  };
  document.addEventListener('astro:before-preparation', freeze);

  root.dataset.live = ''; // the markup's own grid steps aside (visually hidden, still there for screen readers)
  readSize();
  settle();
  schedule();

  return () => {
    destroyed = true;
    document.removeEventListener('astro:before-preparation', freeze);
    window.clearTimeout(unfreeze);
    still?.remove();
    if (raf) cancelAnimationFrame(raf);
    observer.disconnect();
    resizer.disconnect();
    reducedQuery.removeEventListener('change', onMotion);
    host?.removeEventListener('sr:intro', onIntro);
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerup', onUp);
    stage.removeEventListener('pointercancel', onUp);
    stage.removeEventListener('wheel', onWheel);
    root.removeEventListener('keydown', onKey);
    box.removeEventListener('click', onBoxClick);
    boxClose.removeEventListener('click', close);
    boxPrev.removeEventListener('click', onPrev);
    boxNext.removeEventListener('click', onNext);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    handlers.forEach(([image, handler]) => image.removeEventListener('load', handler));
    if (lenisWas.stopped) getLenis()?.start();
    root.style.cursor = '';
    delete root.dataset.live;
    delete root.dataset.ready;
    if (!released) freeGpu();
    canvas.remove();
    box.hidden = true;
  };
}
