// Split reveal between photos (after a WebGL demo): the photo on the screen splits down the middle, the halves slide apart and the next
// photo is underneath. The farther the scroll has gone, the wider the gap; the faster the scroll, the longer the stripes that trail
// from the edges; the half that leaves is shown as a negative (the darkest places turn first).
// The section is a tall track with a sticky screen; ScrollTrigger scrubs one number (0..1) and everything is drawn from it.
//
// PARKED: not used by any page now. To use it, copy AwardsSplit.astro and this file back into src/components and src/scripts
// (point the <script> import of the component at the new place) and put <AwardsSplit photos={[...]} /> on a page.
//
// Expected markup (see AwardsSplit.astro): root(data-photos="url|url|...") > .as-pin > canvas.as-canvas, .as-count

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// ---- awards split (the photo splits down the middle and the next one is under it; stripes follow the speed of the scroll) ----
export const AWARDS_SPLIT = {
  length: 1.2, // screens of scrolling for each change of photo
  smoothing: 0.1, // 0.05 = very soft, 0.3 = quick
  negative: 0.6, // 0 = no negative on the leaving halves, 1 = full
  negativeEdge: 0.25, // little = sharp border of the negative, much = soft
  stripeReach: 0.12, // how far the stripes trail from the edges (part of the screen) at full speed
  stripeCount: 7, // stripes at each edge
  stripeThick: 0.55, // part of each step that is stripe (the rest is gap)
  stripeTaper: 0.7, // how much thinner the last stripe is than the first
  stripesAt: 2.0, // photos per second at which the stripes are full
};

const VERT = `
attribute vec2 p; varying vec2 vUv;
void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uA, uB;
uniform vec2 uSA, uSB;
uniform float uP, uSpeed, uInvAmt, uInvEdge, uStrLen, uStrN, uStrThick, uStrTaper;

vec3 tex(sampler2D t, vec2 uv, vec2 s) {
  vec2 c = (uv - 0.5) * s + 0.5;
  return texture2D(t, vec2(c.x, 1.0 - c.y)).rgb;
}
float stripe(float d) {
  if (d < 0.0 || d >= 1.0) return 0.0;
  float k = floor(d * uStrN);
  float w = uStrThick * (1.0 - uStrTaper * k / max(uStrN - 1.0, 1.0));
  return step(fract(d * uStrN), w);
}
vec3 negative(vec3 c) {
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float e = max(uInvEdge, 0.001);
  float t = uP * uInvAmt * (1.0 + 2.0 * e) - e;
  return mix(c, 1.0 - c, smoothstep(lum - e, lum + e, t));
}
void main() {
  float h = uP * 0.5;
  float L = 0.5 - h, R = 0.5 + h;
  float x = vUv.x;
  bool isA = false; vec2 aUv = vUv;
  if (x <= L)      { isA = true; aUv = vec2(x + h, vUv.y); }
  else if (x >= R) { isA = true; aUv = vec2(x - h, vUv.y); }
  else if (uSpeed > 0.001) {
    float W = max(uStrLen * uSpeed, 0.0001);
    if (stripe((x - L) / W) > 0.5)      { isA = true; aUv = vec2(x + h, vUv.y); }
    else if (stripe((R - x) / W) > 0.5) { isA = true; aUv = vec2(x - h, vUv.y); }
  }
  vec3 col = isA ? negative(tex(uA, aUv, uSA)) : tex(uB, vUv, uSB);
  gl_FragColor = vec4(col, 1.0);
}`;

type Tex = { tex: WebGLTexture; w: number; h: number };

export function initAwardsSplit(root: HTMLElement, o = AWARDS_SPLIT) {
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const canvas = root.querySelector<HTMLCanvasElement>('.as-canvas')!;
    const count = root.querySelector<HTMLElement>('.as-count')!;
    const urls = (root.dataset.photos ?? '').split('|').filter(Boolean);
    const gl = canvas.getContext('webgl', { antialias: false, powerPreference: 'low-power' });
    if (!gl || urls.length < 2) return; // stays the static first photo (see the CSS)

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const n of ['uA', 'uB', 'uSA', 'uSB', 'uP', 'uSpeed', 'uInvAmt', 'uInvEdge', 'uStrLen', 'uStrN', 'uStrThick', 'uStrTaper'])
      u[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(u.uA, 0);
    gl.uniform1i(u.uB, 1);

    const textures: Tex[] = urls.map((url) => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([24, 24, 24, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const t: Tex = { tex, w: 1, h: 1 };
      const img = new Image();
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        t.w = img.naturalWidth;
        t.h = img.naturalHeight;
      };
      img.src = url;
      return t;
    });

    root.style.setProperty('--as-length', String(o.length * (urls.length - 1)));
    root.dataset.live = '';

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const cover = (t: Tex): [number, number] => {
      const screen = canvas.width / canvas.height;
      const photo = t.w / t.h;
      return photo > screen ? [screen / photo, 1] : [1, photo / screen];
    };
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    let target = 0; // the scroll position of the track, in photos (0..n-1)
    let shown = 0; // the smoothed one that is drawn
    let speed = 0; // 0..1, how fast it is moving

    const trigger = ScrollTrigger.create({
      trigger: root,
      start: 'top top',
      end: 'bottom bottom',
      invalidateOnRefresh: true,
      onUpdate: (self) => (target = self.progress * (urls.length - 1)),
    });

    ScrollTrigger.refresh(); // the track has just grown, so the triggers after it need their places again

    const draw = () => {
      const dt = Math.min(0.05, gsap.ticker.deltaRatio(60) / 60);
      const before = shown;
      shown += (target - shown) * (1 - Math.pow(1 - o.smoothing, dt * 60));
      speed += (Math.min(1, Math.abs(shown - before) / Math.max(dt, 0.0001) / o.stripesAt) - speed) * 0.2;

      const i = Math.max(0, Math.min(Math.floor(shown), urls.length - 2));
      const p = ease(Math.min(1, Math.max(0, shown - i)));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[i].tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textures[i + 1].tex);
      gl.uniform2fv(u.uSA, cover(textures[i]));
      gl.uniform2fv(u.uSB, cover(textures[i + 1]));
      gl.uniform1f(u.uP, p);
      gl.uniform1f(u.uSpeed, speed);
      gl.uniform1f(u.uInvAmt, o.negative);
      gl.uniform1f(u.uInvEdge, o.negativeEdge);
      gl.uniform1f(u.uStrLen, o.stripeReach);
      gl.uniform1f(u.uStrN, o.stripeCount);
      gl.uniform1f(u.uStrThick, o.stripeThick);
      gl.uniform1f(u.uStrTaper, o.stripeTaper);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      count.textContent = `${String(Math.round(shown) + 1).padStart(2, '0')} — ${String(urls.length).padStart(2, '0')}`;
    };
    gsap.ticker.add(draw);

    return () => {
      gsap.ticker.remove(draw);
      window.removeEventListener('resize', resize);
      trigger.kill();
      textures.forEach((t) => gl.deleteTexture(t.tex));
      delete root.dataset.live;
      root.style.removeProperty('--as-length');
    };
  });

  return () => mm.revert();
}
