// Awards spiral: photos ride a spiral ribbon up the screen (three.js) while two huge words slide in from the sides around a small line;
// then six of the photos fly in and settle above and below the words (the words stay clear), and one of them grows to fill the screen:
// it is the first photo of the list of the awards (AwardsList), the same picture, so the hand-over from this scene to the list shows no seam.
//
// Adapted from a "photo vortex" demo to Vanilla TS for this site (see docs/SCRIPTING.md, section 3):
//  - initAwardsSpiral(root) is `init` and returns destroy(); everything is looked up inside `root`,
//  - the scene is a CSS sticky screen in a tall track, ScrollTrigger gives the scroll position (0..1) and it is smoothed here,
//  - the photos are cropped to cover (a photo of any shape fills the ribbon and the cards), the words are the page's own,
//  - the numbers are in settings.ts (AWARDS_SPIRAL); the ones of the shape of the spiral are below.
//
// Expected markup (see AwardsSpiral.astro): root(data-photos="url|url|...") > .sp-scene > .sp-words (.sp-top, .sp-line, .sp-bottom),
// canvas.sp-canvas, img.sp-hero.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import * as THREE from 'three';
import { AWARDS_SPIRAL, WEBGL_ENABLED } from './settings';

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
// the photos of the ribbon: rounded corners (uRound), and haze: a photo on the far side of the spiral fades towards the colour of the page (uHaze),
// which gives the spiral depth, like air between you and what is far away. (vUv is the strip's own 0..1: a photo's width is 1 and its height 0.7.)
const VERT_RIBBON = 'varying vec2 vUv; varying float vDepth; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }';
const FRAG_RIBBON = `
uniform sampler2D map; uniform vec4 uCrop; uniform vec3 uPaper; uniform float uRound; uniform float uHaze; uniform vec2 uHazeRange; varying vec2 vUv; varying float vDepth;
void main(){
  vec2 uv = vUv;
  if (gl_FrontFacing) uv.x = 1.0 - uv.x;
  vec3 c = texture2D(map, uv * uCrop.xy + uCrop.zw).rgb;
  vec2 p = (vUv - 0.5) * vec2(1.0, 0.7);
  vec2 q = abs(p) - vec2(0.5, 0.35) + uRound;
  float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - uRound;
  float a = 1.0 - smoothstep(-0.004, 0.004, d);
  if (a <= 0.0) discard;
  float haze = smoothstep(uHazeRange.x, uHazeRange.y, vDepth) * uHaze;
  gl_FragColor = vec4(mix(c, uPaper, haze), a);
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
const growEase = gsap.parseEase('power3.inOut');

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

// ---- the track the photos ride: where a point at distance s along it is, and which way the photo's height points there ----
interface Track {
  length: number; // the whole path
  ribbonW: number; // a photo's width along the path
  ribbonH: number;
  gap: number; // the distance between two photos
  start: number; // where the first photo begins (a head start on the path)
  at(s: number, p: THREE.Vector3, u: THREE.Vector3): void;
  // A track of CARDS (the dragon): each photo is a flat card standing on the path (not a strip bent along it), turned a little with the path.
  // `pose` gives the centre of the card at distance s and the two directions of the card (its width and its height); `update` moves the
  // track's wave with the progress; `spine` is a thin line along the body, drawn from the last photo to the first.
  pose?(s: number, p: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void;
  update?(progress: number): void;
  spine?: boolean;
}

// the spiral: the photos ride a helix that climbs round the middle of the screen (the original)
const helixTrack = (): Track => ({
  length: LENGTH,
  ribbonW: RIBBON_W,
  ribbonH: RIBBON_H,
  gap: GAP,
  start: 25,
  at(s, p, u) {
    const t = s / L;
    p.copy(point(t));
    u.copy(up(t));
  },
});

// the coil: the spiral of the original (the photos are one chain of strips that winds round the middle of the screen as it climbs), set to the
// screen: the coil is narrower than the screen, so the photos near the viewer are not huge, the coils climb the whole height of the screen,
// and the photos stand close together, so it reads as one band of photos winding upward (the climb and the unhurried winding of the dragon,
// the pattern of the original spiral).
const coilTrack = (halfW: number, halfH: number): Track => {
  const portrait = halfW < halfH;
  const R2 = portrait ? Math.min(halfW * 0.95, 9) : Math.min(halfH * 0.8, halfW * 0.5, 10);
  const turns = portrait ? 2.6 : 2.25;
  const T2 = turns * 2 * Math.PI;
  const y0 = -halfH * 1.25;
  const y1 = halfH * 1.25;
  const slope = (y1 - y0) / T2;
  const L2 = Math.hypot(R2, slope);
  const dip = halfH * 0.16; // the climb dips a little in the middle, as the original's does
  const pt = (t: number, out: THREE.Vector3) => {
    const d = (t - T2 / 2) / 2;
    return out.set(R2 * Math.cos(t), y0 + t * slope - dip * Math.exp(-d * d), R2 * Math.sin(t));
  };
  const tangent = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const ribbonW = R2 * 0.55;
  return {
    length: T2 * L2,
    ribbonW,
    ribbonH: ribbonW * 0.7,
    gap: ribbonW * 1.1,
    start: T2 * L2 * 0.1,
    at(sDist, p, u) {
      const t = sDist / L2;
      pt(t, p);
      const d = (t - T2 / 2) / 2;
      tangent.set(-R2 * Math.sin(t), slope + dip * d * Math.exp(-d * d), R2 * Math.cos(t)).normalize();
      radial.set(Math.cos(t), 0, Math.sin(t));
      u.crossVectors(tangent, radial).normalize();
      u.y += 0.6;
      u.normalize();
    },
  };
};

// the dragon (after the dragon that rises into the sky in Dragon Ball): the photos are the scales of a long body that climbs the screen from below
// in big S-curves, swinging from side to side and passing in front of and behind the line of the climb. Each photo is a flat card that
// leans with the body; the waves of the body travel along it as it rises (the wave's phase follows the scroll), so it winds upward. A thin gold
// line runs through the body, from the last photo to the first.
const dragonTrack = (halfW: number, halfH: number): Track => {
  const portrait = halfW < halfH;
  const ribbonW = portrait ? halfW * 0.62 : Math.min(halfW * 0.42, halfH * 0.62);
  const ribbonH = ribbonW * 0.7;
  const Y = halfH * 1.3;
  const length = 2 * Y;
  const A = halfW * (portrait ? 0.3 : 0.38); // how far the body swings to each side
  const B = 3.4; // how far it comes in front of and goes behind the line of the climb
  const waves = portrait ? 1.15 : 1.4; // S-curves on the screen
  let phi = 0;
  const TAU = 2 * Math.PI;
  const dummyU = new THREE.Vector3();
  const track: Track = {
    length,
    ribbonW,
    ribbonH,
    gap: ribbonH * 1.22,
    start: 0,
    spine: true,
    update(progress) {
      phi = progress * TAU * 0.85;
    },
    pose(sDist, p, r, u) {
      const a = Math.min(1, Math.max(0, sDist / length));
      const ph = a * waves * TAU + phi;
      p.set(A * Math.sin(ph), -Y + 2 * Y * a, B * Math.cos(ph));
      const slope = (A * waves * TAU * Math.cos(ph)) / (2 * Y); // dx/dy of the body here
      const roll = Math.atan(slope) * 0.5; // the card leans with the body (less than the body itself: the photos stay readable)
      const yaw = 0.45 * Math.sin(ph + 1.0); // and turns a little, as a body does when it coils
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cr = Math.cos(roll);
      const sr = Math.sin(roll);
      // width: (cos yaw, 0, -sin yaw) turned by the lean; height: (0, 1, 0) turned by the lean
      r.set(cy * cr, sr, -sy * cr).normalize();
      u.set(-cy * sr, cr, sy * sr).normalize();
    },
    at(sDist, p) {
      track.pose!(sDist, p, dummyU, dummyU);
    },
  };
  return track;
};

// the wave: the photos flow across the screen along a soft S-curve that rises from the lower left to the upper right, turning a little
// round the path as they go (a ribbon in a current), so they stay readable and face the viewer, no half-turns and no back sides.
// The curve is measured once into a table so that the photos are spaced evenly along it (distance, not parameter).
const waveTrack = (halfW: number, halfH: number): Track => {
  const portrait = halfW < halfH; // a phone or a tablet upright: a narrow screen, so the curve is longer and shallower (the photos stay upright)
  const spanX = halfW * (portrait ? 2.7 : 1.45);
  const rise = halfH * (portrait ? 0.42 : 0.8);
  const sway = halfH * (portrait ? 0.2 : 0.34);
  const waves = 1.45;
  const f = (a: number, out: THREE.Vector3) =>
    out.set(-spanX + 2 * spanX * a, -rise + 2 * rise * a + sway * Math.sin(a * waves * 2 * Math.PI + 0.5), 2.2 * Math.cos(a * waves * 2 * Math.PI));
  const N = 900;
  const cum = new Float32Array(N + 1);
  const a0 = new THREE.Vector3();
  const a1 = new THREE.Vector3();
  f(0, a0);
  for (let i = 1; i <= N; i++) {
    f(i / N, a1);
    cum[i] = cum[i - 1] + a1.distanceTo(a0);
    a0.copy(a1);
  }
  const length = cum[N];
  const ribbonW = Math.max(halfW * 0.4, halfH * 0.3);
  const t = new THREE.Vector3();
  const q = new THREE.Vector3();
  return {
    length,
    ribbonW,
    ribbonH: ribbonW * 0.7,
    gap: ribbonW * 1.22,
    start: 0,
    at(s, p, u) {
      const d = Math.min(length, Math.max(0, s));
      let lo = 0;
      let hi = N;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= d) lo = mid;
        else hi = mid;
      }
      const a = (lo + (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo])) / N;
      f(a, p);
      f(Math.min(1, a + 0.002), t);
      f(Math.max(0, a - 0.002), q);
      t.sub(q).normalize();
      // the height of the photo: the normal of the curve in the plane of the screen, turned round the path by a slow twist
      const theta = 0.55 * Math.sin(a * waves * 2 * Math.PI + 1.2);
      u.set(-t.y * Math.cos(theta), t.x * Math.cos(theta), Math.sin(theta)).normalize();
    },
  };
};

export function initAwardsSpiral(root: HTMLElement, o = AWARDS_SPIRAL) {
  if (!WEBGL_ENABLED) return; // WebGL is switched off (settings.ts): the plain words, line and grid stay
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const scene3 = root.querySelector<HTMLElement>('.sp-scene')!;
    const canvas = root.querySelector<HTMLCanvasElement>('.sp-canvas')!;
    const top = root.querySelector<HTMLElement>('.sp-top')!;
    const bottom = root.querySelector<HTMLElement>('.sp-bottom')!;
    const line = root.querySelector<HTMLElement>('.sp-line')!;
    const hero = root.querySelector<HTMLImageElement>('.sp-hero')!;
    const urls = (root.dataset.photos ?? '').split('|').filter(Boolean);
    if (urls.length < 2) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return; // no WebGL: the page stays as the plain words, line and grid
    }

    const total = o.spinScreens + o.exitScreens;
    root.dataset.live = '';
    root.style.setProperty('--sp-length', String(total));

    // ---- the words: the two big ones come out of a blur (the small line is plain text and is simply there) ----
    const big = [top, bottom].map((el) => SplitText.create(el, { type: 'chars', charsClass: 'sp-lit' }));
    big.forEach((split) => (split.chars as HTMLElement[]).forEach((el, i) => (el.style.transitionDelay = `${i * 0.05}s`)));
    // `is-in` starts the blur-in. It needs two things: the section is in view, and the page transition is over (Astro keeps
    // data-astro-transition on <html> for its length), so the letters do not come out while the page is still sliding in, reduced in size.
    const html = document.documentElement;
    let inView = false;
    let transitionOver = !html.hasAttribute('data-astro-transition');
    const showWords = () => root.classList.toggle('is-in', inView && transitionOver);
    const watch = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        showWords();
      },
      { rootMargin: '-30% 0px' },
    );
    watch.observe(root);
    const transitionWatch = new MutationObserver(() => {
      transitionOver = !html.hasAttribute('data-astro-transition');
      showWords();
      revealIfReady();
    });
    if (!transitionOver) transitionWatch.observe(html, { attributes: true, attributeFilter: ['data-astro-transition'] });
    const transitionSafety = window.setTimeout(() => {
      transitionOver = true; // never hold the words (or the canvas) back for longer than this
      showWords();
      revealIfReady();
    }, 3000);

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
    const setCrop = (i: number, img: { width: number; height: number }) => {
      const photo = img.width / img.height;
      const want = 1 / ASPECT;
      if (photo > want) crops[i].value.set(want / photo, 1, (1 - want / photo) / 2, 0);
      else crops[i].value.set(1, photo / want, 0, (1 - photo / want) / 2);
    };

    // The canvas stays invisible until every photo is loaded, decoded and uploaded to the GPU, and then fades in. On a first visit (nothing
    // cached) the nine 1200px photos used to be decoded and uploaded all at once in the first frames, and on a phone that heavy moment
    // showed as a blurred, doubled picture. So each photo is decoded off the main thread and the uploads are one per frame.
    canvas.style.opacity = '0';
    let gone = false; // set when the scene is taken down: nothing may touch the renderer after that
    let revealed = false;
    let photosReady = false;
    // The canvas comes up when the photos are ready AND the page transition is over (the same moment as the big words). During the transition
    // the page is scaled (it grows from 85% to full size), and a canvas that comes up in the middle of that is rasterised small and then
    // enlarged: it looked slightly soft for a moment, once, on the way back to the page.
    function revealIfReady() {
      if (revealed || !photosReady || !transitionOver) return;
      revealed = true;
      // two frames: one to draw, one so that the picture is on the screen before it is shown
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (gone || still) return; // the page is already leaving: the still picture is on screen
          canvas.style.transition = 'opacity 0.3s ease-out';
          canvas.style.opacity = '1';
        }),
      );
    }
    const reveal = () => {
      photosReady = true;
      revealIfReady();
    };
    // Safety only, for a request that never finishes: it must be much longer than the photos can take on a slow mobile connection (nine photos of
    // ~150 KB on a first visit). With 1.5 s here the canvas came up on a phone before the photos had arrived, and they popped in over each other.
    const revealTimer = window.setTimeout(reveal, 10000);
    const upload = (list: THREE.Texture[]) => {
      let i = 0;
      const step = () => {
        if (gone) return;
        if (i >= list.length) return reveal();
        try {
          renderer.initTexture(list[i++]); // uploads this one texture now, so the first real frame has nothing left to upload
        } catch {
          /* it is drawn (and uploaded) by the first frame instead */
        }
        requestAnimationFrame(step);
      };
      step();
    };
    const textures: THREE.Texture[] = [];
    let waiting = urls.length;
    const loader = new THREE.TextureLoader();
    urls.forEach((url, i) => {
      const done = () => {
        if (--waiting === 0) upload(textures);
      };
      const texture = loader.load(
        url,
        (t) => {
          const img = t.image as HTMLImageElement;
          setCrop(i, img);
          Promise.resolve(img.decode?.()).catch(() => {}).then(done); // decoded off the main thread before it is uploaded
        },
        undefined,
        done,
      );
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      textures[i] = texture;
    });

    // the finer variant (rounded photos, haze with distance, gold lines, an unhurried pace, a slight turn of the view with the pointer); ?premium=0 shows the plain one
    const premiumParam = new URLSearchParams(location.search).get('premium');
    const premium = premiumParam === '1' ? true : premiumParam === '0' ? false : o.premium;
    const lineMaterial = new THREE.LineBasicMaterial(premium ? { color: 0xba8e47, transparent: true, opacity: 0.7 } : { color: 0x9e9e9e });

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
            uniforms: {
              map: { value: textures[nr] },
              uCrop: crops[nr],
              uPaper: { value: new THREE.Vector3(0.98, 0.973, 0.953) }, // --paper
              uRound: { value: premium ? 0.04 : 0 },
              uHaze: { value: premium ? 0.5 : 0 },
              uHazeRange: { value: new THREE.Vector2(camera.position.z - 2, camera.position.z + 14) },
            },
            vertexShader: VERT_RIBBON,
            fragmentShader: FRAG_RIBBON,
            side: THREE.DoubleSide,
            // not blended: the photos must hide each other by their DISTANCE (a near photo over a far one), which blending without a depth sort gets
            // wrong; the rounded edges are smoothed by the multisampling instead
            alphaToCoverage: true,
          }),
        );
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.renderOrder = 1;
        mesh.userData = { scale: 1 };
        scene.add(mesh);
        return mesh;
      });
    // the track the photos ride (the way is chosen by ?path=helix | wave in the address; the wave is rebuilt when the screen changes shape)
    const variant = new URLSearchParams(location.search).get('path') ?? o.path;
    const makeTrack = (): Track => {
      if (variant === 'helix') return helixTrack(); // the original, exactly
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.position.z;
      if (variant === 'dragon') return dragonTrack(halfH * camera.aspect, halfH);
      if (variant === 'wave') return waveTrack(halfH * camera.aspect, halfH);
      return coilTrack(halfH * camera.aspect, halfH);
    };
    let track = makeTrack();
    let chain = 0;
    let endOfSpin = 0;
    const measureTrack = () => {
      chain = (urls.length - 1) * track.gap + track.ribbonW;
      endOfSpin = ((0.5 * track.length + chain + 10) / (track.length + chain)) * (2 / 3);
    };
    measureTrack();

    const tp = new THREE.Vector3();
    const tu = new THREE.Vector3();
    const tr = new THREE.Vector3();
    const layRibbon = (mesh: THREE.Mesh, s: number, scale: number) => {
      const pos = mesh.geometry.attributes.position;
      const w = track.ribbonW * scale;
      const h = track.ribbonH * scale;
      if (track.pose) {
        // a flat card at the centre of the photo's place on the path
        track.pose(s + track.ribbonW / 2, tp, tr, tu);
        for (let i = 0; i <= SEGMENTS; i++) {
          const x = (i / SEGMENTS - 0.5) * w;
          for (let r = 0; r < 2; r++) {
            const y = (r === 0 ? -0.5 : 0.5) * h;
            pos.setXYZ(r * (SEGMENTS + 1) + i, tp.x + tr.x * x + tu.x * y, tp.y + tr.y * x + tu.y * y, tp.z + tr.z * x + tu.z * y);
          }
        }
        pos.needsUpdate = true;
        return;
      }
      const s0 = s + track.ribbonW / 2 - w / 2;
      for (let i = 0; i <= SEGMENTS; i++) {
        track.at(s0 + (i / SEGMENTS) * w, tp, tu);
        for (let r = 0; r < 2; r++) {
          const off = (r === 0 ? -0.5 : 0.5) * h;
          pos.setXYZ(r * (SEGMENTS + 1) + i, tp.x + tu.x * off, tp.y + tu.y * off, tp.z + tu.z * off);
        }
      }
      pos.needsUpdate = true;
    };

    // the two rails along the track
    let rails: THREE.BufferGeometry[] = [];
    let railLines: THREE.Line[] = [];
    const buildRails = () => {
      railLines.forEach((l) => {
        scene.remove(l);
        l.geometry.dispose();
      });
      railLines = [];
      if (track.spine) {
        // one thin line through the body, behind the photos; its points follow the body as its waves travel (see drawSpine)
        const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: STEPS + 1 }, () => new THREE.Vector3()));
        geo.setDrawRange(0, 0);
        const l = new THREE.Line(geo, lineMaterial);
        l.frustumCulled = false;
        l.renderOrder = 0;
        scene.add(l);
        railLines.push(l);
        rails = [geo];
        return;
      }
      rails = [1, -1].map((sign) => {
        const pts: THREE.Vector3[] = [];
        const away = track.ribbonH / 2 + 0.12 * track.ribbonH;
        for (let k = STEPS; k >= 0; k--) {
          track.at((k / STEPS) * track.length, tp, tu);
          pts.push(tp.clone().addScaledVector(tu, sign * away));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        geo.setDrawRange(0, 0);
        const l = new THREE.Line(geo, lineMaterial);
        l.frustumCulled = false;
        l.renderOrder = 5;
        scene.add(l);
        railLines.push(l);
        return geo;
      });
    };
    buildRails();

    // ---- the grid at the end ----
    // The photos stand in two rows, one above and one below the words, and the middle of the screen stays clear for them: the height of the
    // words (and the small line) is measured, the rows take what is left above and below, and the top row stays under the menu pill.
    const layout = () => {
      const w = scene3.clientWidth;
      const phone = w < 768;
      const tablet = w >= 768 && w < 1200;
      const big = w >= 1440;
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.position.z;
      const halfW = halfH * camera.aspect;
      const cols = phone ? 2 : 3;
      const rows = 2;
      const gapX = phone ? 0.18 : tablet ? 0.28 : big ? 0.5 : 0.38;
      const fillX = phone ? 0.88 : tablet ? 0.84 : big ? 0.7 : 0.72;
      const perUnit = scene3.clientHeight / (2 * halfH); // pixels in one unit
      const bandPx = (top.offsetHeight + bottom.offsetHeight + line.offsetHeight + 28) * 1.25; // the words' band, with a margin of air
      const topSafe = halfH * (phone ? 0.24 : 0.23); // under the menu pill
      const botSafe = halfH * 0.07;
      const fromHeight = (2 * halfH - topSafe - botSafe - bandPx / perUnit) / rows;
      const fromWidth = (2 * halfW * fillX - (cols - 1) * gapX) / cols;
      const width = Math.max(1, Math.min(fromWidth, fromHeight / ASPECT, phone ? 99 : tablet ? 8.5 : 9.2));
      const height = width * ASPECT;
      return { halfH, halfW, cols, rows, gapX, gapY: 0, width, height, rowTop: halfH - topSafe - height / 2, rowBottom: -halfH + botSafe + height / 2 };
    };
    let U = layout();
    let cards: THREE.Mesh[] = [];
    let rowLines: THREE.Line[] = [];

    const spot = (i: number) => {
      const col = i % U.cols;
      const row = Math.floor(i / U.cols);
      return new THREE.Vector2(-0.5 * (U.cols * U.width + (U.cols - 1) * U.gapX) + 0.5 * U.width + col * (U.width + U.gapX), row === 0 ? U.rowTop : U.rowBottom);
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
      cards = o.grid.slice(0, U.cols * U.rows).map((n) => {
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
      rowLines = []; // no line between the rows: the words stand there
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
      track = makeTrack();
      measureTrack();
      buildRails();
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
    const view = { x: 0, y: 0 };
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

    let frozen = false; // the still picture is on the canvas (see `freeze`): the scene stops, so the two are always the same picture
    const draw = () => {
      if (!near || hold || frozen) return;
      const dt = Math.min(gsap.ticker.deltaRatio(60) / 60, 0.05);
      const k = 1 - Math.pow(0.001, dt);
      shown += (target - shown) * k;

      const vh = scene3.clientHeight;
      const spin = o.spinScreens;
      const whole = shown;
      const spinPart = spin / total;
      const g = Math.min(whole / spinPart, 1);
      const exit = clamp01((whole - spinPart) / (1 - spinPart));
      const growEnd = Math.max(0.2, (o.exitScreens - 1) / o.exitScreens); // the last screen of the end belongs to the list sliding over it
      const P0 = Math.min(1, g / (2 / 3));
      const P = premium ? 0.45 * P0 + 0.55 * (P0 * P0 * (3 - 2 * P0)) : P0; // an unhurried pace: slow at the start and at the end
      const H = clamp01((g - endOfSpin) / (1 - endOfSpin)); // 0..1: how far the grid is laid

      // the view turns a little with the pointer (a laptop), and settles to the middle as the photos land (the end must be exactly centred)
      if (premium) {
        const calm = 1 - H;
        view.x += ((over ? mouse.x * 1.1 : 0) * calm - view.x) * k * 0.6;
        view.y += ((over ? mouse.y * 0.7 : 0) * calm - view.y) * k * 0.6;
        camera.position.x = view.x;
        camera.position.y = view.y;
        camera.lookAt(0, 0, 0);
      }

      // the photos ride the track
      track.update?.(P);
      const head = P * (track.length + chain) - chain + track.start;
      ribbons.forEach((m, e) => {
        const s = head + track.gap * e;
        m.visible = P < 1 && s > 0 && s < track.length;
        if (m.visible) layRibbon(m, Math.min(s, track.length - 0.001), m.userData.scale);
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
      if (track.spine && track.pose) {
        // the body's line: from the last photo to the first, along the body as it is now
        const attr = rails[0].attributes.position as THREE.BufferAttribute;
        for (let k = 0; k <= STEPS; k++) {
          track.pose((k / STEPS) * track.length, tp, tr, tu);
          attr.setXYZ(k, tp.x, tp.y, tp.z - 0.05);
        }
        attr.needsUpdate = true;
        const last = head + track.ribbonW / 2;
        const first = head + track.gap * (ribbons.length - 1) + track.ribbonW / 2;
        const idx = (v: number) => Math.min(STEPS, Math.max(0, Math.round((v / track.length) * STEPS)));
        const a = idx(last);
        rails[0].setDrawRange(a, Math.max(0, idx(first) - a + 1));
      } else {
        const headLine = Math.floor(P * (STEPS + 1 + TAIL));
        const from = Math.max(0, headLine - TAIL);
        rails.forEach((geo) => geo.setDrawRange(from, Math.max(0, Math.min(headLine, STEPS + 1) - from + 1)));
      }

      // the photos fly in and settle above and below the words
      cards.forEach((card, i) => {
        const r = clamp01((H - 0.08 * i) / 0.4);
        if (r <= 0 || (i === o.hero && exit > 0.0005)) {
          card.visible = false; // (the hero card is replaced by the picture that grows, from the first moment of the end)
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
      line.style.opacity = '1'; // the small line stays: the photos stand around it, not over it

      // the photo of the hero card grows to fill the whole screen (it is the first photo of the list)
      if (exit > 0.0005 && cards[o.hero]) {
        const to = spot(o.hero);
        const perUnit = scene3.clientHeight / (2 * U.halfH);
        const w0 = U.width * perUnit;
        const h0 = U.height * perUnit;
        const l0 = (to.x / (2 * U.halfW) + 0.5) * scene3.clientWidth - w0 / 2;
        const t0 = (0.5 - to.y / (2 * U.halfH)) * scene3.clientHeight - h0 / 2;
        const g = growEase(clamp01(exit / growEnd));
        hero.hidden = false;
        hero.style.left = `${l0 * (1 - g)}px`;
        hero.style.top = `${t0 * (1 - g)}px`;
        hero.style.width = `${w0 + (scene3.clientWidth - w0) * g}px`;
        hero.style.height = `${h0 + (scene3.clientHeight - h0) * g}px`;
        hero.style.borderRadius = `${8 * (1 - g)}px`;
      } else if (!hero.hidden) {
        hero.hidden = true;
      }

      if (!document.hidden) renderer.render(scene, camera); // a page that is not on the screen is not drawn (a white canvas on iOS Safari)
    };
    gsap.ticker.add(draw);

    // When a page transition starts while the scene is on the screen, the live WebGL canvas is swapped for a still picture of its last
    // frame: a WebGL canvas inside the transition's snapshot is composited on its own (on phones it came out with another height than the
    // rest of the page, and on iOS it blinked), while a plain image is part of the page like everything else. Only the picture is lost:
    // the page is leaving. The order matters (this was the iOS blink):
    //  1. all of it in the same task as the event, because the router reads `loader` right after it and the buffer still holds the frame;
    //  2. the picture goes OVER the canvas, and the canvas is hidden only once the picture is decoded, so no frame has neither;
    //  3. one more frame, so that this is painted before the browser takes the picture of the old page;
    //  4. the scene stops drawing from the moment of the picture. The picture lies over the live canvas for a few frames, and a scene that
    //     went on easing towards the scroll position showed under it as a second, slightly shifted copy of the photos.
    let still: HTMLImageElement | undefined;
    let unfreeze = 0;
    const thaw = () => {
      frozen = false;
      still?.remove();
      still = undefined;
      canvas.style.opacity = '1';
      canvas.style.pointerEvents = '';
    };
    const freeze = (e: Event) => {
      if (!near || still) return;
      try {
        renderer.render(scene, camera);
        frozen = true;
        const img = new Image();
        img.alt = '';
        img.src = canvas.toDataURL('image/webp', 0.92);
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;';
        canvas.after(img);
        canvas.style.pointerEvents = 'none';
        still = img;
        const nav = e as Event & { loader: () => Promise<void> };
        const original = nav.loader;
        nav.loader = async () => {
          await img.decode().catch(() => {});
          if (still === img) canvas.style.opacity = '0';
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          await original();
        };
        unfreeze = window.setTimeout(thaw, 5000); // the navigation never happened (cancelled): the live canvas comes back
      } catch {
        thaw();
      }
    };
    document.addEventListener('astro:before-preparation', freeze);

    return () => {
      gone = true;
      document.removeEventListener('astro:before-preparation', freeze);
      document.removeEventListener('nav-menu', onMenu);
      window.clearTimeout(release);
      window.clearTimeout(unfreeze);
      window.clearTimeout(revealTimer);
      window.clearTimeout(transitionSafety);
      thaw();
      gsap.ticker.remove(draw);
      window.removeEventListener('resize', onResize);
      scene3.removeEventListener('pointermove', onMove);
      scene3.removeEventListener('pointerleave', onLeave);
      trigger.kill();
      watch.disconnect();
      transitionWatch.disconnect();
      range.disconnect();
      big.forEach((split) => split.revert());
      dropGrid();
      ribbons.forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      railLines.forEach((l) => l.geometry.dispose());
      lineMaterial.dispose();
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      [top, bottom, line, hero].forEach((el) => el.removeAttribute('style'));
      hero.hidden = true;
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
