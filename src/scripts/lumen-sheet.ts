// A sheet of paper that can turn over and curl, drawn on the shared layer (used by the intro's flying sheets and by the turning pictures).
//
// The sheet is a strip of vertices that follows an arc: starting at the hinge edge, its direction is rotated by `uAngle` (0 = lying flat in the
// page, PI = turned over to the other side of the hinge) and keeps turning by `uCurl` radians per world unit along the sheet. Integrating that
// direction gives the shape in closed form, so a flat sheet, a half-turned one and a curled one are all the same few numbers.

import * as THREE from 'three';

const VERTEX = /* glsl */ `
uniform vec2 uSize;   // world width and height of the sheet
uniform float uHinge; // -1: the hinge is the left edge, 1: the right edge
uniform float uAngle;
uniform float uCurl;
varying vec2 vUv;
varying float vTurn;

void main() {
  vUv = uv;
  float along = (uHinge < 0.0 ? uv.x : 1.0 - uv.x) * uSize.x;
  float turn = uAngle + uCurl * along;
  float dx;
  float dz;
  if (abs(uCurl) < 0.0001) {
    dx = cos(uAngle) * along;
    dz = sin(uAngle) * along;
  } else {
    dx = (sin(turn) - sin(uAngle)) / uCurl;
    dz = (cos(uAngle) - cos(turn)) / uCurl;
  }
  float x = uHinge * 0.5 * uSize.x - uHinge * dx;
  float y = (uv.y - 0.5) * uSize.y;
  vTurn = turn;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, dz, 1.0);
}
`;

const PICTURE_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec4 uCrop;
uniform float uOpacity;
uniform vec2 uPx;      // size on the screen in pixels (for the rounded corners)
uniform float uRadius; // px; 0 = square corners
varying vec2 vUv;
varying float vTurn;

void main() {
  vec3 print = texture2D(uMap, uCrop.xy + vUv * uCrop.zw).rgb;
  // seen from behind, the sheet is pale paper with the picture only showing through
  vec3 colour = gl_FrontFacing ? print : mix(vec3(0.94, 0.93, 0.9), print, 0.2);
  float facing = abs(cos(vTurn));
  float light = gl_FrontFacing ? mix(0.62, 1.0, facing) : mix(0.88, 1.0, facing); // the back of the paper stays pale, not grey
  float cover = 1.0;
  if (uRadius > 0.5) {
    vec2 q = abs((vUv - 0.5) * uPx) - (uPx * 0.5 - uRadius);
    cover = 1.0 - smoothstep(-0.8, 0.8, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius);
  }
  gl_FragColor = vec4(colour * light, uOpacity * cover);
}
`;

const SHADOW_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uOpacity;
varying vec2 vUv;
varying float vTurn;

void main() {
  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  gl_FragColor = vec4(0.0, 0.0, 0.0, 0.3 * (1.0 - exp(-edge * 9.0)) * uOpacity);
}
`;

// one strip of vertices across the width is enough: the sheet only bends along it
const strip = new THREE.PlaneGeometry(1, 1, 56, 1);

export interface BendState {
  hinge: -1 | 1;
  angle: number;
  curl: number;
  opacity: number;
}

export interface Sheet {
  mesh: THREE.Mesh;
  /** The size of the sheet in world units. */
  resize(width: number, height: number): void;
  apply(state: BendState): void;
  /** Changes which part of the texture is shown (picture sheets only). */
  setCrop(crop: [number, number, number, number]): void;
  /** The size of the sheet on the screen and the rounding of its corners, in pixels (picture sheets only). */
  setScreenSize(width: number, height: number, radius: number): void;
  dispose(): void;
}

function makeMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader,
    uniforms: {
      uSize: { value: new THREE.Vector2(1, 1) },
      uHinge: { value: -1 },
      uAngle: { value: 0 },
      uCurl: { value: 0 },
      uOpacity: { value: 1 },
      ...uniforms,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function wrap(mesh: THREE.Mesh): Sheet {
  const material = mesh.material as THREE.ShaderMaterial;
  const u = material.uniforms;
  return {
    mesh,
    resize(width, height) {
      (u.uSize.value as THREE.Vector2).set(width, height);
    },
    apply(state) {
      u.uHinge.value = state.hinge;
      u.uAngle.value = state.angle;
      u.uCurl.value = state.curl;
      u.uOpacity.value = state.opacity;
    },
    setCrop(crop) {
      (u.uCrop?.value as THREE.Vector4 | undefined)?.set(...crop);
    },
    setScreenSize(width, height, radius) {
      (u.uPx?.value as THREE.Vector2 | undefined)?.set(width, height);
      if (u.uRadius) u.uRadius.value = radius;
    },
    dispose() {
      material.dispose();
    },
  };
}

/** A sheet that shows a picture. `crop` is [offsetU, offsetV, scaleU, scaleV] into the texture. */
export function createPictureSheet(texture: THREE.Texture, crop: [number, number, number, number]): Sheet {
  const material = makeMaterial(PICTURE_FRAGMENT, {
    uMap: { value: texture },
    uCrop: { value: new THREE.Vector4(...crop) },
    uPx: { value: new THREE.Vector2(1, 1) },
    uRadius: { value: 0 },
  });
  return wrap(new THREE.Mesh(strip, material));
}

/** A soft dark shape that bends the same way as a sheet; lay it behind one. */
export function createShadowSheet(): Sheet {
  return wrap(new THREE.Mesh(strip, makeMaterial(SHADOW_FRAGMENT, {})));
}
