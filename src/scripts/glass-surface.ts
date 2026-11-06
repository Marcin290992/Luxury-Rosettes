// Liquid glass for any element that has a `backdrop-filter`, without a framework (a port of the React GlassSurface, SVG renderer only).
//
// An SVG filter is used as the element's backdrop-filter: feDisplacementMap shifts the pixels behind the element along its border, once
// per colour channel (a slightly different amount each, so the edge splits into colours). How far each pixel moves is read from a
// "displacement map": two gradients plus a soft neutral rectangle inside, drawn here for the element's size.
//
// Only Chromium accepts an SVG filter as a backdrop-filter. Anywhere else (Safari, Firefox, touch screens, where the glass is solid anyway)
// this does nothing and the element keeps its plain CSS blur.
//
// Usage: add a class with the plain look, call `glassSurface(el)` and style `.glass-refract` (see NavPill.astro):
//   .glass-refract { backdrop-filter: blur(8px) var(--glass-filter) saturate(140%); }

export interface GlassOptions {
  edge?: number; // px: width of the bent band along the border
  softness?: number; // blur of the map's neutral rectangle (px): how smoothly the band fades inwards
  brightness?: number; // 0-100: lightness of the neutral rectangle (50 = no shift)
  opacity?: number; // 0-1: its strength
  distortion?: number; // displacement scale; negative bends the edge outwards
  offsets?: [number, number, number]; // extra scale for red, green and blue (the colour split)
  smooth?: number; // blur of the result (stdDeviation, 0 = none)
}

const DEFAULTS: Required<GlassOptions> = {
  edge: 3,
  softness: 11,
  brightness: 50,
  opacity: 0.93,
  distortion: -180,
  offsets: [0, 10, 20],
  smooth: 0.5,
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const CHANNELS = [
  { name: 'red', matrix: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0' },
  { name: 'green', matrix: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0' },
  { name: 'blue', matrix: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0' },
];

let counter = 0;

export function supportsRefraction() {
  const chromium = /Chrome|Chromium|Edg\//.test(navigator.userAgent); // Safari and Firefox have no "Chrome" in theirs
  return chromium && !matchMedia('(pointer: coarse)').matches && CSS.supports('backdrop-filter', 'blur(1px)');
}

// The displacement map for an element of w x h whose glass shape is the top `shapeH` px of it (a rounded rectangle of radius r).
function displacementMap(w: number, h: number, shapeH: number, r: number, o: Required<GlassOptions>) {
  const inner = { x: o.edge, y: o.edge, w: w - o.edge * 2, h: shapeH - o.edge * 2 };
  const svg = `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="${SVG_NS}">
      <defs>
        <linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>
        <linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>
        <filter id="s" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${o.softness}"/></filter>
      </defs>
      <rect width="${w}" height="${h}" fill="black"/>
      <rect width="${w}" height="${shapeH}" rx="${r}" fill="url(#r)"/>
      <rect width="${w}" height="${shapeH}" rx="${r}" fill="url(#b)" style="mix-blend-mode: difference"/>
      <rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}" rx="${r}" fill="hsl(0 0% ${o.brightness}% / ${o.opacity})" filter="url(#s)"/>
    </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function glassSurface(el: HTMLElement, options: GlassOptions = {}) {
  const none = { shape() {}, destroy() {} };
  if (!supportsRefraction()) return none;

  const o = { ...DEFAULTS, ...options };
  const id = `glass-filter-${++counter}`;

  // the filter lives in a zero-sized SVG inside the element; its x/y/width/height refer to the element that uses it
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  svg.innerHTML = `
    <filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
      <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>
      ${CHANNELS.map(
        ({ name, matrix }, i) => `
        <feDisplacementMap in="SourceGraphic" in2="map" scale="${o.distortion + o.offsets[i]}" xChannelSelector="R" yChannelSelector="G" result="${name}-shifted"/>
        <feColorMatrix in="${name}-shifted" type="matrix" values="${matrix}" result="${name}"/>`,
      ).join('')}
      <feBlend in="red" in2="green" mode="screen" result="rg"/>
      <feBlend in="rg" in2="blue" mode="screen" result="rgb"/>
      <feGaussianBlur in="rgb" stdDeviation="${o.smooth}"/>
    </filter>`;
  el.prepend(svg);
  const image = svg.querySelector('feImage')!;

  // the shape the glass has now: its height (the element may be taller and only partly revealed) and its corner radius
  let shape = { height: Infinity, radius: 20 };
  const maps = new Map<string, string>();
  const apply = () => {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return;
    const shapeH = Math.min(shape.height, h);
    const key = `${w}x${h}x${shapeH}x${shape.radius}`;
    if (!maps.has(key)) maps.set(key, displacementMap(w, h, shapeH, shape.radius, o));
    image.setAttribute('href', maps.get(key)!);
    el.style.setProperty('--glass-filter', `url(#${id})`);
    el.classList.add('glass-refract');
  };

  const resize = new ResizeObserver(() => {
    maps.clear();
    apply();
  });
  resize.observe(el);

  return {
    // tell the glass what shape it has (call when the visible part of the element changes, e.g. a menu that opens)
    shape(height: number, radius: number) {
      shape = { height, radius };
      apply();
    },
    destroy() {
      resize.disconnect();
      svg.remove();
      el.classList.remove('glass-refract');
      el.style.removeProperty('--glass-filter');
    },
  };
}
