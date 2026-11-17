// The intro's spiral of papers. 21 bendable sheets (planes of 20 x 20 segments) travel along a widening spiral from deep in the scene towards the
// camera, each one starting 0.2 s after the one before. Each sheet:
//  - is curled at first (bend 2 -> 0) and straightens out,
//  - is turned over like a page (flip 1 -> 0), the turn sweeping across it from left to right,
//  - spins around its own centre as it goes round (the angle follows its place on the spiral),
//  - fades in, and out again at about 5 s,
//  - has a soft shadow under it (a larger plane behind it, bent and turned by the same numbers).
// At 3 s the whole spiral is pushed towards the viewer (cameraZ 0 -> 1). The motion and the times are the original's; what this site adds is the
// start from below the screen's bottom edge (nothing appears in mid-air), the shadow, and the last two sheets: they show the two
// gallery covers, they are not faded out, and landOn() brings them to the places where the chooser's covers are, straightening and growing to
// the covers' size, so that they ARE the covers.
// A rewrite for this site of the idea of such an intro (three.js + GSAP, no React).

import * as THREE from 'three';
import gsap from 'gsap';
import { getLayer, loadTexture, coverCrop, ROTATION_3D_GLSL } from './lumen-layer';

const VERTEX = /* glsl */ `
varying vec2 vUv;
uniform float uBend;
uniform float uFlip;
uniform float uAngle;
${ROTATION_3D_GLSL}

float quadraticOut(float t) { return -t * (t - 2.0); }

void main() {
  vUv = uv;
  vec3 pos = position;

  // curl: the further down the sheet, the more it bends backwards
  float bend = (quadraticOut(uv.y) - 1.0) * uBend;

  // the turn sweeps across the sheet from left to right, like a page
  float flipProgress = smoothstep(0.0 + uv.x * 0.4, 0.8 + uv.x * 0.2, uFlip);

  // spin in the screen plane, then turn around a tilted axis
  pos = (rotation3d(vec3(0.0, 0.0, 1.0), uAngle * 3.14 * 4.0) * vec4(pos, 1.0)).xyz;
  pos = (rotation3d(vec3(1.6, 1.0, 0.5), 3.14 * flipProgress + uAngle * 3.14 * 4.0) * vec4(pos, 1.0)).xyz;
  pos.z += bend * 6.0;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uMap;
uniform vec4 uCrop;
uniform float uOpacity;

void main() {
  vec3 image = texture2D(uMap, vUv * uCrop.xy + uCrop.zw).rgb;
  gl_FragColor = vec4(image, uOpacity);
}
`;

// the shadow: a soft box, darkest in the middle and gone at the plane's edge (the plane is bigger than the sheet)
const FRAGMENT_SHADOW = /* glsl */ `
varying vec2 vUv;
uniform float uOpacity;

void main() {
  vec2 p = abs(vUv - 0.5) * 2.0;
  float d = max(p.x, p.y);
  float soft = 1.0 - smoothstep(0.55, 1.0, d);
  gl_FragColor = vec4(0.0, 0.0, 0.0, soft * soft * 0.26 * uOpacity);
}
`;

const COUNT = 21;
const HEROES = 2; // the last sheets: the covers
const PLANE_W = 1.6;
const PLANE_H = 2;
const PLANE_ASPECT = PLANE_W / PLANE_H;
const RISE = 45; // world units a sheet starts below its place on the spiral (well under the bottom edge)
const SHADOW_SCALE = 1.28;

const smooth = (t: number) => t * t * (3 - 2 * t);
const range01 = (a: number, b: number, v: number) => Math.min(Math.max((v - a) / (b - a), 0), 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Rect = { left: number; top: number; width: number; height: number };

export interface Spiral {
  /** Runs the flight; `onLand` is called at 4.7 s, when the chooser should come up. */
  play(onLand?: () => void): void;
  /** The two cover sheets fly to these rectangles (CSS pixels, one per cover) and become the covers; `onDone` when both are there. */
  landOn(rects: Rect[], onDone?: () => void): void;
  /** Hides the cover sheets (the real covers are in their place). */
  hideHeroes(): void;
  dispose(): void;
}

interface Sheet {
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
  shadowUniforms: Record<string, THREE.IUniform>;
  // the tweened values (written to the uniforms every frame, so that a landing can take the bend, turn and spin out of them)
  bend: number;
  flip: number;
  opacity: number;
  land: number; // 0..1: how far the landing has come (cover sheets only)
  target?: { x: number; y: number; width: number; height: number };
  from?: { x: number; y: number; spin: number };
  crop: THREE.Vector4;
  cropFlight: THREE.Vector4;
}

export async function createSpiral(sources: string[], covers: string[] = []): Promise<Spiral> {
  const heroCount = covers.length ? HEROES : 0; // without covers every sheet is an ordinary one that fades out
  const layer = getLayer('top', 10000);
  const urls = Array.from({ length: COUNT }, (_, i) => (i >= COUNT - heroCount ? covers[i - (COUNT - heroCount)] ?? sources[i % sources.length] : sources[i % sources.length]));
  const textures = await Promise.all(urls.map((u) => loadTexture(u)));

  const geometry = new THREE.PlaneGeometry(PLANE_W, PLANE_H, 20, 20);
  const group = new THREE.Group();
  const state = {
    startAngle: Math.PI / 2,
    angles: Array.from({ length: COUNT }, () => 0),
    amplitude: 30,
    stretchX: 1.4,
    stretchY: 1.5,
    cameraZ: 0,
  };

  const sheets: Sheet[] = textures.map((texture, index) => {
    const hero = index >= COUNT - heroCount;
    const cropFlight = new THREE.Vector4(...coverCrop(texture, PLANE_ASPECT));
    const crop = cropFlight.clone();
    const uniforms = {
      uMap: { value: texture },
      uCrop: { value: crop },
      uBend: { value: 1 },
      uFlip: { value: 0 },
      uAngle: { value: 0 },
      uOpacity: { value: 0 },
    };
    const shadowUniforms = { uBend: { value: 1 }, uFlip: { value: 0 }, uAngle: { value: 0 }, uOpacity: { value: 0 } };
    const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT }));
    mesh.scale.set(8, 8, 1);
    const shadow = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, uniforms: shadowUniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT_SHADOW }),
    );
    shadow.renderOrder = -1;
    group.add(shadow, mesh);
    return { mesh, shadow, uniforms, shadowUniforms, bend: 1, flip: 0, opacity: 0, land: 0, crop, cropFlight };
  });
  layer.add(group);

  // every frame: each sheet is put on the spiral from its current angle (a cover sheet that is landing moves from there to its cover)
  const stopFrame = layer.onFrame(() => {
    sheets.forEach((sheet, index) => {
      const { mesh, shadow } = sheet;
      let angle = -state.angles[index];
      const y = Math.sin(angle) * state.amplitude * state.stretchY;
      const x = Math.cos(angle) * state.amplitude * state.stretchX;
      angle += state.startAngle;
      const turn = angle / (3 * Math.PI);
      const travelled = -((angle - state.startAngle) / (3.5 * Math.PI)); // 0 -> about 1 along the path
      const radiusFade = 1 - range01(0.5, 1, travelled); // the spiral closes in at the end
      const radiusGrow = -(0.5 * range01(0, 0.3, travelled)) + 1.5;
      // each sheet comes up from below the screen's bottom edge onto the spiral, so nothing is seen appearing in mid-air
      const rise = 1 - smooth(range01(0, 0.4, travelled));

      // the path is the original's turned half a round about the middle of the screen: the small end of the spiral is low, and the big sheets
      // pass over the top of the screen instead of cutting across its bottom edge
      const bx = -x * radiusFade * radiusGrow;
      const by = y * radiusFade * radiusGrow + (1 - radiusFade) * 20;
      let px = -bx;
      let py = -by - RISE * rise;
      let pz = 350 * turn - 150 - 0.01 * index + 100 + 380 * state.cameraZ;
      let sx = 8 * state.cameraZ + 8 + (1 - range01(0, 0.3, travelled)) * 16;
      let sy = sx;
      let k = 1; // how much of the flight is left in the sheet's bend, turn and spin
      let angleExtra = 0;
      let bendValue = sheet.bend;
      let flipValue = sheet.flip;
      let opacityValue = sheet.opacity;
      let shadowOpacity = sheet.opacity;
      if (sheet.land > 0 && sheet.target && sheet.from) {
        // a cover sheet that is landing leaves the spiral (which has pushed it behind the camera by now): it comes up from below the screen's
        // bottom edge, curled and half turned, and flattens onto its cover
        const t = sheet.target;
        const e = smooth(sheet.land);
        px = lerp(sheet.from.x, t.x, e);
        py = lerp(sheet.from.y, t.y, e);
        pz = 0;
        sx = t.width / PLANE_W;
        sy = t.height / PLANE_H;
        k = 0;
        bendValue = 1.6 * (1 - e);
        flipValue = 0.55 * (1 - e);
        angleExtra = sheet.from.spin * (1 - e);
        opacityValue = 1;
        shadowOpacity = (1 - e) * (1 - e); // the real cover has no shadow: it goes as the sheet lands
        sheet.crop.set(lerp(sheet.cropFlight.x, 1, e), lerp(sheet.cropFlight.y, 1, e), lerp(sheet.cropFlight.z, 0, e), lerp(sheet.cropFlight.w, 0, e));
      }
      mesh.position.set(px, py, pz);
      mesh.scale.set(sx, sy, 1);
      const angleValue = -turn * k + angleExtra;
      sheet.uniforms.uAngle.value = angleValue;
      sheet.uniforms.uBend.value = bendValue;
      sheet.uniforms.uFlip.value = flipValue;
      sheet.uniforms.uOpacity.value = opacityValue;

      // the shadow: a larger plane a little behind and below, bent and turned by the same numbers
      shadow.position.set(px, py - 0.07 * sy * PLANE_H, pz - 0.05);
      shadow.scale.set(sx * SHADOW_SCALE, sy * SHADOW_SCALE, 1);
      sheet.shadowUniforms.uAngle.value = angleValue;
      sheet.shadowUniforms.uBend.value = bendValue;
      sheet.shadowUniforms.uFlip.value = flipValue;
      sheet.shadowUniforms.uOpacity.value = shadowOpacity;
    });
  });

  let timeline: gsap.core.Timeline | undefined;
  const landTweens: gsap.core.Tween[] = [];

  const play = (onLand?: () => void) => {
    timeline = gsap.timeline();
    timeline.add(() => onLand?.(), 4.7);
    sheets.forEach((sheet, index) => {
      const hero = index >= COUNT - heroCount;
      const one = gsap.timeline();
      timeline!.add(one, 0);
      one.to(state.angles, { [index]: 3.5 * Math.PI - ((2.5 * Math.PI) / COUNT) * index, duration: 6, ease: 'sine.inOut' }, 0.2 * index);
      one.fromTo(sheet, { flip: 1 }, { flip: 0, delay: 0.2 * index, duration: 7, ease: 'sine.inOut' }, 0);
      // the cover sheets are below the screen when they start, so they are simply there; the others fade in as in the original
      if (hero) one.fromTo(sheet, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'none' }, 0.2 * index);
      else one.fromTo(sheet, { opacity: 0 }, { opacity: 1, duration: 1, ease: 'power2.out' }, 1 + 0.2 * index);
      if (!hero) one.to(sheet, { opacity: 0, duration: 0.5, ease: 'power2.out' }, 0.05 * index + 5); // the covers stay
      one.to(state, { cameraZ: 1, duration: 3, ease: 'power2.inOut' }, 3);
      one.fromTo(sheet, { bend: 2 }, { bend: 0, delay: 0.2 * index, duration: 2, ease: 'power2.inOut' }, 0);
    });
  };

  const landOn: Spiral['landOn'] = (rects, onDone) => {
    const heroes = sheets.slice(COUNT - heroCount);
    heroes.forEach((sheet, i) => {
      const rect = rects[i];
      if (!rect) return;
      const world = layer.rectToWorld(rect);
      sheet.target = { x: world.x, y: world.y, width: world.width, height: world.height };
      // it starts below the bottom edge (half the screen's height and the cover's own height under its place), a little to the side
      sheet.from = { x: world.x + (i ? 1 : -1) * world.width * 0.35, y: world.y - layer.viewSize().height / 2 - world.height * 1.2, spin: (i ? 1 : -1) * 0.025 };
      landTweens.push(
        gsap.to(sheet, { land: 1, duration: 1.5, delay: 0.18 * i, ease: 'power2.inOut', onComplete: i === heroes.length - 1 ? onDone : undefined }),
      );
    });
  };

  const hideHeroes = () => {
    sheets.slice(COUNT - heroCount).forEach((sheet) => {
      sheet.mesh.visible = false;
      sheet.shadow.visible = false;
    });
  };

  const dispose = () => {
    timeline?.kill();
    landTweens.forEach((t) => t.kill());
    stopFrame();
    layer.remove(group);
    sheets.forEach((s) => {
      (s.mesh.material as THREE.Material).dispose();
      (s.shadow.material as THREE.Material).dispose();
    });
    geometry.dispose();
  };

  return { play, landOn, hideHeroes, dispose };
}
