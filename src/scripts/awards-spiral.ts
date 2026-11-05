// Awards spiral: photos ride a spiral ribbon up the screen (three.js) while two huge words slide in from the sides around a small line;
// then six of the photos fly into a grid, a line is drawn between the rows and stripes rise to cover the scene.
//
// Adapted from a "photo vortex" demo to Vanilla TS for this site (see docs/SCRIPTING.md, section 3):
//  - initAwardsSpiral(root) is `init` and returns destroy(); everything is looked up inside `root`,
//  - the scene is a CSS sticky screen in a tall track, ScrollTrigger gives the scroll position (0..1) and it is smoothed here,
//  - the photos are cropped to cover (a photo of any shape fills the ribbon and the cards), the words are the page's own,
//  - the numbers are in settings.ts (AWARDS_SPIRAL); the ones of the shape of the spiral are below.
//
// Expected markup (see AwardsSpiral.astro): root(data-photos="url|url|...") > .sp-scene > .sp-words (.sp-top, .sp-line, .sp-bottom),
// canvas.sp-canvas, .sp-stripes > div x n.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import * as THREE from 'three';
import { AWARDS_SPIRAL, WEBGL_ENABLED } from './settings';
import { dbg, debugOn } from './debug-log';

gsap.registerPlugin(ScrollTrigger, SplitText);

// the spiral: radius, turns, how far it climbs, where it starts (world units)
const R = 12;
const T = 2 * 2 * Math.PI;
const LIFT = 28;
const START_Y = -16;
const SLOPE = LIFT / T;
const L = Math.hypot(R, SLOPE);
const LENGTH = T * L;
const RIBBON_W = 5.8;
const RIBBON_H = RIBBON_W * 0.7;
const GAP = 6.2;
const SEGMENTS = 116;
const ASPECT = 568 / 812; // height / width of a photo in the grid (and of the ribbon)
const STEPS = 600; // points of a drawn line
const TAIL = 86; // points of the spiral lines that are drawn behind the head

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FRAG_RIBBON = `
uniform sampler2D map; uniform vec4 uCrop; varying vec2 vUv;
void main(){
  vec2 uv = vUv;
  if (gl_FrontFacing) uv.x = 1.0 - uv.x;
  gl_FragColor = texture2D(map, uv * uCrop.xy + uCrop.zw);
}`;
const FRAG_CARD = `
uniform sampler2D map; uniform vec4 uCrop; uniform vec2 uSize; uniform float uRadius; varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * uSize;
  vec2 q = abs(p) - uSize * 0.5 + uRadius;
  float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - uRadius;
  float a = 1.0 - smoothstep(-0.5, 0.5, d);
  if (a <= 0.0) discard;
  vec4 c = texture2D(map, vUv * uCrop.xy + uCrop.zw);
  gl_FragColor = vec4(c.rgb, c.a * a);
}`;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function point(t: number) {
  const d = (t - T / 2) / 2;
  return new THREE.Vector3(R * Math.cos(t), START_Y + t * SLOPE - 2.5 * Math.exp(-d * d), R * Math.sin(t));
}
function up(t: number) {
  const d = (t - T / 2) / 2;
  const tangent = new THREE.Vector3(-R * Math.sin(t), SLOPE + 2.5 * d * Math.exp(-d * d), R * Math.cos(t)).normalize();
  const radial = new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
  const u = new THREE.Vector3().crossVectors(tangent, radial).normalize();
  u.y += 0.6;
  return u.normalize();
}

export function initAwardsSpiral(root: HTMLElement, o = AWARDS_SPIRAL) {
  if (!WEBGL_ENABLED) return; // WebGL is switched off (settings.ts): the plain words, line and grid stay
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const scene3 = root.querySelector<HTMLElement>('.sp-scene')!;
    const canvas = root.querySelector<HTMLCanvasElement>('.sp-canvas')!;
    const top = root.querySelector<HTMLElement>('.sp-top')!;
    const bottom = root.querySelector<HTMLElement>('.sp-bottom')!;
    const line = root.querySelector<HTMLElement>('.sp-line')!;
    const stripes = Array.from(root.querySelectorAll<HTMLElement>('.sp-stripes div'));
    const urls = (root.dataset.photos ?? '').split('|').filter(Boolean);
    if (urls.length < 2) return;

    let renderer: THREE.WebGLRenderer;
    try {
      // preserveDrawingBuffer: Safari takes the picture of the old page for the page transition from the canvas as it is composited, and a WebGL
      // canvas without it is empty at that moment (the spiral blinked out when leaving the page)
      // On iOS Safari, we also need to prevent canvas from being composited in the transition snapshot
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      renderer = new THREE.WebGLRenderer({ 
        canvas, 
        antialias: true, 
        alpha: true, 
        preserveDrawingBuffer: !isIOS // iOS has issues with preserveDrawingBuffer, handle differently
      });
    } catch {
      return; // no WebGL: the page stays as the plain words, line and grid
    }

    const total = o.spinScreens + o.exitScreens;
    root.dataset.live = '';
    root.style.setProperty('--sp-length', String(total));

    // ---- the words: letters come out of a blur once the section is on the screen ----
    const splits = [
      SplitText.create(top, { type: 'chars', charsClass: 'sp-lit' }),
      SplitText.create(line, { type: 'words', wordsClass: 'sp-lit' }),
      SplitText.create(bottom, { type: 'chars', charsClass: 'sp-lit' }),
    ];
    splits.forEach((s, k) => {
      const parts = (s.chars.length ? s.chars : s.words) as HTMLElement[];
      const offset = k === 2 ? 0 : k === 1 ? splits[0].chars.length : 0;
      if (k === 1) return; // the small line has no animation and so no delays (they made its words appear one by one)
      parts.forEach((el, i) => (el.style.transitionDelay = `${(offset + i) * 0.05}s`));
    });
    // `is-in` (the blur-in of the big words) starts only when the section is in view AND the page transition is over, so it does not run
    // while the page is still sliding in at a reduced size. Astro keeps data-astro-transition on <html> for the length of the transition.
    let seen = false;
    let settled = !document.documentElement.hasAttribute('data-astro-transition');
    const showWords = () => root.classList.toggle('is-in', seen && settled);
    const watch = new IntersectionObserver(
      ([entry]) => {
        seen = entry.isIntersecting;
        showWords();
      },
      { rootMargin: '-30% 0px' },
    );
    watch.observe(root);
    let settleTimer = 0;
    let transitionWatch: MutationObserver | undefined;
    if (!settled) {
      const done = () => {
        if (settled) return;
        settled = true;
        transitionWatch?.disconnect();
        window.clearTimeout(settleTimer);
        showWords();
      };
      transitionWatch = new MutationObserver(() => {
        if (!document.documentElement.hasAttribute('data-astro-transition')) done();
      });
      transitionWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-astro-transition'] });
      settleTimer = window.setTimeout(done, 3000); // safety: never hold the words back longer than this
    }

    // ---- three.js ----
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);
    const fit = () => {
      const w = scene3.clientWidth;
      const h = scene3.clientHeight;
      const phone = w < 768;
      const tablet = w >= 768 && w < 1200;
      camera.fov = phone ? 58 : tablet ? 54 : 52;
      camera.position.set(0, 0, phone ? 28 : tablet ? 24 : 22);
      camera.lookAt(0, 0, 0);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    fit();

    // the photos, cropped to cover: uCrop = (scale x, scale y, offset x, offset y) in the photo's own uv
    const crops = urls.map(() => ({ value: new THREE.Vector4(1, 1, 0, 0) }));
    const loader = new THREE.TextureLoader();
    // The canvas stays invisible until every photo has loaded and been drawn once, and then fades in. The photos load a moment after the
    // scene is built, so the first frames showed them without their crop (and without their picture) and they twitched into place while
    // the page was still arriving (a returning visitor, with the photos in the cache, saw it as a slight jump at the start).
    canvas.style.opacity = '0';
    let waiting = urls.length;
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      // two frames: one to upload the textures and draw, one so that the picture is on the screen before it is shown
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (still) return; // the page is already leaving: the still picture is on screen
          canvas.style.transition = 'opacity 0.3s ease-out';
          canvas.style.opacity = '1';
        }),
      );
    };
    const arrived = () => {
      if (--waiting <= 0) reveal();
    };
    const revealTimer = window.setTimeout(reveal, 1500); // safety: a photo that never loads must not keep the spiral away
    const textures = urls.map((url, i) =>
      loader.load(
        url,
        (t) => {
          const img = t.image as { width: number; height: number };
          const photo = img.width / img.height;
          const want = 1 / ASPECT;
          if (photo > want) crops[i].value.set(want / photo, 1, (1 - want / photo) / 2, 0);
          else crops[i].value.set(1, photo / want, 0, (1 - photo / want) / 2);
          arrived();
        },
        undefined,
        arrived,
      ),
    );
    textures.forEach((t) => {
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
    });

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x9e9e9e });

    // the ribbons on the spiral
    const ribbons = urls
      .map((_, i) => urls.length - 1 - i)
      .map((nr) => {
        const geo = new THREE.PlaneGeometry(1, 1, SEGMENTS, 1);
        const uv = geo.attributes.uv;
        for (let r = 0; r < 2; r++) for (let i = 0; i <= SEGMENTS; i++) uv.setXY(r * (SEGMENTS + 1) + i, i / SEGMENTS, r);
        uv.needsUpdate = true;
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
        const mesh = new THREE.Mesh(
          geo,
          new THREE.ShaderMaterial({
            uniforms: { map: { value: textures[nr] }, uCrop: crops[nr] },
            vertexShader: VERT,
            fragmentShader: FRAG_RIBBON,
            side: THREE.DoubleSide,
          }),
        );
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.renderOrder = 1;
        mesh.userData = { scale: 1 };
        scene.add(mesh);
        return mesh;
      });
    const chain = (urls.length - 1) * GAP + RIBBON_W;
    const endOfSpin = ((0.5 * LENGTH + chain + 10) / (LENGTH + chain)) * (2 / 3);

    const layRibbon = (mesh: THREE.Mesh, s: number, scale: number) => {
      const pos = mesh.geometry.attributes.position;
      const w = RIBBON_W * scale;
      const h = RIBBON_H * scale;
      const s0 = s + RIBBON_W / 2 - w / 2;
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = (s0 + (i / SEGMENTS) * w) / L;
        const p = point(t);
        const u = up(t);
        for (let r = 0; r < 2; r++) {
          const off = (r === 0 ? -0.5 : 0.5) * h;
          pos.setXYZ(r * (SEGMENTS + 1) + i, p.x + u.x * off, p.y + u.y * off, p.z + u.z * off);
        }
      }
      pos.needsUpdate = true;
    };

    // the two rails along the spiral
    const rail = (sign: number) => {
      const pts: THREE.Vector3[] = [];
      const away = RIBBON_H / 2 + 0.12 * RIBBON_H;
      for (let k = STEPS; k >= 0; k--) {
        const t = (k / STEPS) * T;
        pts.push(point(t).addScaledVector(up(t), sign * away));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      geo.setDrawRange(0, 0);
      const l = new THREE.Line(geo, lineMaterial);
      l.frustumCulled = false;
      l.renderOrder = 5;
      scene.add(l);
      return geo;
    };
    const rails = [rail(1), rail(-1)];

    // ---- the grid at the end ----
    const layout = () => {
      const w = scene3.clientWidth;
      const phone = w < 768;
      const tablet = w >= 768 && w < 1200;
      const big = w >= 1440;
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.position.z;
      const halfW = halfH * camera.aspect;
      const cols = phone ? 2 : 3;
      const rows = phone ? 3 : 2;
      const gapX = phone ? 0.18 : tablet ? 0.28 : big ? 0.5 : 0.38;
      const gapY = phone ? 0.22 : tablet ? 0.36 : big ? 0.7 : 0.55;
      const fillX = phone ? 0.88 : tablet ? 0.84 : big ? 0.78 : 0.8;
      const fillY = phone || tablet ? 0.82 : big ? 0.78 : 0.8;
      const width = Math.min(
        (2 * halfW * fillX - (cols - 1) * gapX) / cols,
        (2 * halfH * fillY - (rows - 1) * gapY) / rows / ASPECT,
        phone ? 99 : tablet ? 8.5 : 9.2,
      );
      return { halfH, halfW, cols, rows, gapX, gapY, width, height: width * ASPECT };
    };
    let U = layout();
    let cards: THREE.Mesh[] = [];
    let rowLines: THREE.Line[] = [];

    const spot = (i: number) => {
      const col = i % U.cols;
      const row = Math.floor(i / U.cols);
      return new THREE.Vector2(
        -0.5 * (U.cols * U.width + (U.cols - 1) * U.gapX) + 0.5 * U.width + col * (U.width + U.gapX),
        0.5 * (U.rows * U.height + (U.rows - 1) * U.gapY) - 0.5 * U.height - row * (U.height + U.gapY),
      );
    };
    const entry = (i: number, to: THREE.Vector2) => {
      const col = i % U.cols;
      const y = i < U.cols ? U.halfH + 2 * U.height : -U.halfH - 2 * U.height;
      const x = col === 0 ? -U.halfW - 2 * U.width : col === U.cols - 1 ? U.halfW + 2 * U.width : to.x;
      return new THREE.Vector2(x, y);
    };
    // a card waves while it flies
    const wave = (card: THREE.Mesh, strength: number, time: number, i: number) => {
      const pos = card.geometry.attributes.position;
      const { rx, ry } = card.userData as { rx: Float32Array; ry: Float32Array };
      const col = i % U.cols;
      const row = Math.floor(i / U.cols);
      const middle = col > 0 && col < U.cols - 1;
      for (let v = 0; v < pos.count; v++) {
        const x = rx[v];
        const y = ry[v];
        const fx = x / U.width + 0.5;
        const fy = 1 - (y / U.height + 0.5);
        const f = middle ? fy : ((col === 0 ? fx : 1 - fx) + (row === 0 ? fy : 1 - fy)) * 0.5;
        pos.setXYZ(v, x, y, strength * f * Math.sin(f * Math.PI * 0.9 - 2 * time) * U.width * 0.12);
      }
      pos.needsUpdate = true;
    };

    const dropGrid = () => {
      cards.forEach((c) => {
        scene.remove(c);
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      });
      rowLines.forEach((l) => {
        scene.remove(l);
        l.geometry.dispose();
      });
    };
    const buildGrid = () => {
      dropGrid();
      U = layout();
      const px = scene3.clientHeight / (2 * U.halfH); // pixels in one unit
      cards = o.grid.map((n) => {
        const nr = n % urls.length;
        const geo = new THREE.PlaneGeometry(U.width, U.height, 20, 12);
        const card = new THREE.Mesh(
          geo,
          new THREE.ShaderMaterial({
            uniforms: {
              map: { value: textures[nr] },
              uCrop: crops[nr],
              uSize: { value: new THREE.Vector2(U.width * px, U.height * px) },
              uRadius: { value: 8 },
            },
            vertexShader: VERT,
            fragmentShader: FRAG_CARD,
            transparent: true,
            side: THREE.DoubleSide,
          }),
        );
        card.visible = false;
        card.renderOrder = 3;
        card.frustumCulled = false;
        const a = geo.attributes.position.array;
        const n3 = a.length / 3;
        const rx = new Float32Array(n3);
        const ry = new Float32Array(n3);
        for (let i = 0; i < n3; i++) {
          rx[i] = a[3 * i];
          ry[i] = a[3 * i + 1];
        }
        card.userData = { rx, ry, wave: 1, time: 0, flat: false };
        scene.add(card);
        return card;
      });
      rowLines = [];
      const margin = scene3.clientWidth < 768 ? 0 : U.halfW * (80 / scene3.clientWidth);
      const left = -U.halfW + margin;
      const right = U.halfW - margin;
      for (let j = 0; j < U.rows - 1; j++) {
        const y = spot(j * U.cols).y - U.height / 2 - U.gapY / 2; // the gap between two rows
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= STEPS; k++) {
          const f = k / STEPS;
          pts.push(new THREE.Vector3(j % 2 ? right - f * (right - left) : left + f * (right - left), y, 0));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        geo.setDrawRange(0, 0);
        const l = new THREE.Line(geo, lineMaterial);
        l.renderOrder = 5;
        l.frustumCulled = false;
        scene.add(l);
        rowLines.push(l);
      }
    };
    buildGrid();

    // Only a real change of the scene's size rebuilds it. On a phone or tablet the address bar sliding in or out (it does that when
    // a page transition starts) fires a resize too, and rebuilding the grid then reset the photos' state: the ribbon and the grid jumped.
    let sceneW = scene3.clientWidth;
    let sceneH = scene3.clientHeight;
    const onResize = () => {
      if (scene3.clientWidth === sceneW && scene3.clientHeight === sceneH) return;
      sceneW = scene3.clientWidth;
      sceneH = scene3.clientHeight;
      fit();
      buildGrid();
    };
    window.addEventListener('resize', onResize);

    // ---- the mouse: the photo under it grows ----
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let over = false;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      over = true;
    };
    const onLeave = () => (over = false);
    scene3.addEventListener('pointermove', onMove);
    scene3.addEventListener('pointerleave', onLeave);

    // ---- the scroll: ScrollTrigger gives 0..1 over the track, smoothed here ----
    let target = 0;
    let shown = 0;
    let near = true;
    const trigger = ScrollTrigger.create({
      trigger: root,
      start: 'top top',
      end: 'bottom bottom',
      invalidateOnRefresh: true,
      onUpdate: (self) => (target = self.progress),
      onRefresh: (self) => (target = shown = self.progress),
    });
    const range = new IntersectionObserver(([entry]) => (near = entry.isIntersecting), { rootMargin: '100% 0px' });
    range.observe(root);
    ScrollTrigger.refresh(); // the track has just grown, so the triggers after it need their places again

    // While the menu is open, and from the tap on a link until the page is gone, the scene holds still. On a phone the browser
    // may shift the scroll position by the height of its address bar when the menu or the transition starts; the ribbon follows the
    // scroll (the rest of the scene is pinned), so it was the one thing that visibly moved.
    let hold = false;
    let release = 0;
    const onMenu = (e: Event) => {
      const { open, leaving } = (e as CustomEvent<{ open: boolean; leaving: boolean }>).detail;
      window.clearTimeout(release);
      hold = open || leaving;
      if (leaving) release = window.setTimeout(() => (hold = false), 5000); // the navigation never happened
    };
    document.addEventListener('nav-menu', onMenu);

    // ---- ?debug=1: what the scene and the window measure while the menu is open and the page leaves (see debug-log.ts) ----
    let watching = 0;
    let lastSig = '';
    const probe = () => {
      if (!debugOn() || !(hold || performance.now() < watching)) return;
      const sig = [
        `scene ${scene3.clientHeight}`,
        `canvasBox ${Math.round(canvas.getBoundingClientRect().height)}`,
        `buf ${canvas.height}`,
        `inner ${innerHeight}`,
        `vv ${Math.round(window.visualViewport?.height ?? 0)}`,
        `scrollY ${Math.round(scrollY)}`,
        `top ${Math.round(scene3.getBoundingClientRect().top)}`,
        `target ${target.toFixed(3)}`,
        `shown ${shown.toFixed(3)}`,
      ].join(' | ');
      if (sig !== lastSig) {
        lastSig = sig;
        dbg(sig);
      }
    };
    const onLeaveStart = () => {
      watching = performance.now() + 4000;
      dbg('--- before-preparation');
    };
    const onMenuLog = (e: Event) => dbg(`--- nav-menu ${JSON.stringify((e as CustomEvent).detail)}`);
    document.addEventListener('astro:before-preparation', onLeaveStart);
    document.addEventListener('nav-menu', onMenuLog);
    gsap.ticker.add(probe);
    dbg(`spiral ready: scene ${scene3.clientHeight} canvas ${canvas.width}x${canvas.height}`);

    const draw = () => {
      if (!near || hold) return;
      const dt = Math.min(gsap.ticker.deltaRatio(60) / 60, 0.05);
      const k = 1 - Math.pow(0.001, dt);
      shown += (target - shown) * k;

      const vh = scene3.clientHeight;
      const spin = o.spinScreens;
      const whole = shown;
      const spinPart = spin / total;
      const g = Math.min(whole / spinPart, 1);
      const exit = clamp01((whole - spinPart) / (1 - spinPart));
      const P = Math.min(1, g / (2 / 3));
      const H = clamp01((g - endOfSpin) / (1 - endOfSpin)); // 0..1: how far the grid is laid

      // the photos ride the spiral
      const head = P * (LENGTH + chain) - chain + 25;
      ribbons.forEach((m, e) => {
        const s = head + GAP * e;
        m.visible = P < 1 && s > 0 && s < LENGTH;
        if (m.visible) layRibbon(m, Math.min(s, LENGTH - 0.001), m.userData.scale);
      });

      // the photo under the mouse grows
      let hovered: THREE.Object3D | null = null;
      if (over) {
        ray.setFromCamera(mouse, camera);
        const hit = ray.intersectObjects(ribbons.filter((m) => m.visible), false);
        if (hit.length) hovered = hit[0].object;
      }
      ribbons.forEach((m) => {
        m.userData.scale += ((m === hovered ? o.hover : 1) - m.userData.scale) * k;
      });

      // the lines along the spiral
      const headLine = Math.floor(P * (STEPS + 1 + TAIL));
      const from = Math.max(0, headLine - TAIL);
      rails.forEach((geo) => geo.setDrawRange(from, Math.max(0, Math.min(headLine, STEPS + 1) - from + 1)));

      // the photos fly in and settle in the grid
      cards.forEach((card, i) => {
        const r = clamp01((H - 0.08 * i) / 0.4);
        if (r <= 0) {
          card.visible = false;
          return;
        }
        card.visible = true;
        const e = 1 - Math.pow(1 - r, 3);
        const to = spot(i);
        const from2 = entry(i, to);
        card.position.set(from2.x + (to.x - from2.x) * e, from2.y + (to.y - from2.y) * e, 0);
        const d = card.userData;
        d.time += 1.08 * dt;
        d.wave = r < 1 ? Math.min(1, d.wave + 1.8 * dt) : Math.max(0, d.wave - 0.72 * dt);
        if (d.wave > 0) {
          wave(card, d.wave, d.time, i);
          d.flat = false;
        } else if (!d.flat) {
          wave(card, 0, 0, i);
          d.flat = true;
        }
      });
      rowLines.forEach((l, j) => {
        const f = 1 - Math.pow(1 - clamp01((H - 0.2 - 0.08 * j) / 0.8), 2.5);
        l.geometry.setDrawRange(0, Math.round((STEPS + 1) * f));
      });

      // the words slide in from the sides, the line fades out as the grid arrives
      const px = whole * vh * total; // px scrolled in the track
      // the big words slide in from the sides with the scroll; at the very top they are fully out of the screen (before, they started a
      // sixth of the way in, so the first screen showed only the tail of the top word and the head of the bottom one)
      const slide = clamp01(px / (vh * 3.2));
      top.style.transform = `translateX(calc(-100% + ${slide * 100}vw))`;
      bottom.style.transform = `translateX(calc(100% - ${slide * 100}vw))`;
      line.style.opacity = String(Math.max(0, 1 - 4 * H));

      // the stripes rise from the bottom
      const n = stripes.length;
      stripes.forEach((s, i) => {
        const start = (0.3 * (n - 1 - i)) / Math.max(n - 1, 1);
        s.style.transform = `scaleY(${clamp01((exit * 0.7 - start) / 0.3)})`;
      });

      // Only render if the page is visible (prevent white canvas on iOS Safari page transitions)
      if (document.visibilityState === 'visible') {
        renderer.render(scene, camera);
      }
    };
    gsap.ticker.add(draw);

    // When a page transition starts while the scene is on the screen, the live WebGL canvas is swapped for a still picture of its last
    // frame. A WebGL canvas inside the transition's snapshot is composited on its own (on phones it came out with another height
    // than the rest of the page); a plain image is part of the page like everything else. Only the picture is lost: the page is leaving.
    let still: HTMLImageElement | undefined;
    let unfreeze = 0;
    const thaw = () => {
      still?.remove();
      still = undefined;
      canvas.style.opacity = '1';
      canvas.style.pointerEvents = '';
    };
    const freeze = (e: Event) => {
      if (!near || still) return;
      try {
        // all in the same task as the event: the router reads `loader` right after it, and the buffer still holds the last frame
        // (an earlier version did this inside requestAnimationFrame: `loader` was then replaced too late and the transition did not wait
        // for the picture, so the snapshot of the old page could hold an empty canvas on iOS)
        renderer.render(scene, camera);
        const img = new Image();
        img.alt = '';
        img.src = canvas.toDataURL('image/webp', 0.92);
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;';
        canvas.after(img); // lies over the canvas: the canvas is hidden only once the picture is decoded, so there is never a frame with neither
        canvas.style.pointerEvents = 'none';
        still = img;
        // the transition waits (a few ms) until the picture is decoded, so it is in the snapshot
        const nav = e as Event & { loader: () => Promise<void> };
        const original = nav.loader;
        nav.loader = async () => {
          await img.decode().catch(() => {});
          if (still === img) canvas.style.opacity = '0'; // the picture is ready and on screen: now the canvas can go
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); // and one frame so that the swap is painted before the snapshot
          await original();
        };
        // if the navigation never happens (cancelled), the live canvas comes back
        unfreeze = window.setTimeout(thaw, 5000);
      } catch {
        thaw();
      }
    };
    document.addEventListener('astro:before-preparation', freeze);
    
    // On iOS Safari, after page transition (especially back navigation), force render the canvas
    // to restore WebGL scene immediately when page becomes visible again
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && document.querySelector('.sp[data-live]') === root) {
        // Re-render immediately to restore scene
        try {
          renderer.render(scene, camera);
        } catch {}
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    
    // Also force render on astro page transitions
    const forceRenderOnRestore = () => {
      if (document.querySelector('.sp[data-live]') === root) {
        requestAnimationFrame(() => {
          try {
            renderer.render(scene, camera);
          } catch {}
        });
      }
    };
    document.addEventListener('astro:after-swap', forceRenderOnRestore);

    return () => {
      document.removeEventListener('astro:before-preparation', freeze);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('astro:after-swap', forceRenderOnRestore);
      document.removeEventListener('nav-menu', onMenu);
      document.removeEventListener('nav-menu', onMenuLog);
      document.removeEventListener('astro:before-preparation', onLeaveStart);
      gsap.ticker.remove(probe);
      window.clearTimeout(release);
      window.clearTimeout(unfreeze);
      window.clearTimeout(revealTimer);
      thaw();
      gsap.ticker.remove(draw);
      window.removeEventListener('resize', onResize);
      scene3.removeEventListener('pointermove', onMove);
      scene3.removeEventListener('pointerleave', onLeave);
      trigger.kill();
      watch.disconnect();
      transitionWatch?.disconnect();
      window.clearTimeout(settleTimer);
      range.disconnect();
      splits.forEach((s) => s.revert());
      dropGrid();
      ribbons.forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      rails.forEach((g) => g.dispose());
      lineMaterial.dispose();
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      [top, bottom, line, ...stripes].forEach((el) => el.removeAttribute('style'));
      root.classList.remove('is-in');
      delete root.dataset.live;
      root.style.removeProperty('--sp-length');
    };
  });

  // the words are shown (or the plain fallback is) once the scene is built and the fonts are in, so that nothing flashes unstyled
  const lift = () => document.documentElement.classList.remove('sp-pending');
  Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2500))]).then(lift);

  return () => {
    lift();
    mm.revert();
  };
}
