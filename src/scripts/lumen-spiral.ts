// The intro's spiral of papers. 21 bendable sheets (planes of 20 x 20 segments) travel along a widening spiral from deep in the scene towards the
// camera, each one starting 0.2 s after the one before. Each sheet:
//  - is curled at first (uBend 2 -> 0) and straightens out,
//  - is turned over like a page (uFlip 1 -> 0), the turn sweeping across it from left to right,
//  - spins around its own centre as it goes round (uAngle follows its place on the spiral),
//  - fades in, and out again at about 5 s.
// At 3 s the whole spiral is pushed towards the viewer (cameraZ 0 -> 1); the caller shows the next thing at 4.7 s (onComplete of play()).
// A rewrite for this site of the idea of such an intro (three.js + GSAP, no React).

import * as THREE from 'three';
import gsap from 'gsap';
import { getLayer, loadTexture, coverCrop, ROTATION_3D_GLSL } from './lumen-layer';

const VERTEX = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
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

  vDepth = abs(pos.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
uniform sampler2D uMap;
uniform vec4 uCrop;
uniform float uOpacity;

void main() {
  vec4 image = texture2D(uMap, vUv * uCrop.xy + uCrop.zw);
  // a hint of shade where the sheet curls away; on the white page a stronger one showed as grey shapes
  vec3 color = image.rgb - image.rgb * clamp(pow(vDepth, 2.0) * 0.8, 0.0, 0.12);
  gl_FragColor = vec4(color, uOpacity);
}
`;

const COUNT = 21;
const PLANE_ASPECT = 1.6 / 2; // width / height of a sheet

const RISE = 45; // world units a sheet starts below its place on the spiral (well under the bottom edge)
const smooth = (t: number) => t * t * (3 - 2 * t);
const range01 = (a: number, b: number, v: number) => Math.min(Math.max((v - a) / (b - a), 0), 1);

export interface Spiral {
  play(onComplete?: () => void): void;
  dispose(): void;
}

export async function createSpiral(sources: string[]): Promise<Spiral> {
  const layer = getLayer('top', 10000);
  const textures = await Promise.all(Array.from({ length: COUNT }, (_, i) => loadTexture(sources[i % sources.length])));

  const geometry = new THREE.PlaneGeometry(1.6, 2, 20, 20);
  const group = new THREE.Group();
  const state = {
    startAngle: Math.PI / 2,
    angles: Array.from({ length: COUNT }, () => 0),
    amplitude: 30,
    stretchX: 1.4,
    stretchY: 1.5,
    cameraZ: 0,
  };

  const meshes = textures.map((texture) => {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        uMap: { value: texture },
        uCrop: { value: new THREE.Vector4(...coverCrop(texture, PLANE_ASPECT)) },
        uBend: { value: 1 },
        uFlip: { value: 0 },
        uAngle: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(8, 8, 1);
    group.add(mesh);
    return mesh;
  });
  layer.add(group);

  // every frame: each sheet is put on the spiral from its current angle
  const stopFrame = layer.onFrame(() => {
    meshes.forEach((mesh, index) => {
      let angle = -state.angles[index];
      const y = Math.sin(angle) * state.amplitude * state.stretchY;
      const x = Math.cos(angle) * state.amplitude * state.stretchX;
      angle += state.startAngle;
      const turn = angle / (3 * Math.PI);
      (mesh.material as THREE.ShaderMaterial).uniforms.uAngle.value = -turn;

      const travelled = -((angle - state.startAngle) / (3.5 * Math.PI)); // 0 -> about 1 along the path
      const radiusFade = 1 - range01(0.5, 1, travelled); // the spiral closes in at the end
      const radiusGrow = -(0.5 * range01(0, 0.3, travelled)) + 1.5;

      // each sheet comes up from below the screen's bottom edge onto the spiral, so nothing is seen appearing in mid-air
      const rise = 1 - smooth(range01(0, 0.4, travelled));
      mesh.position.y = y * radiusFade * radiusGrow + (1 - radiusFade) * 20 - RISE * rise;
      mesh.position.x = -x * radiusFade * radiusGrow;
      mesh.position.z = 350 * turn - 150 - 0.01 * index + 100 + 380 * state.cameraZ;
      mesh.scale.setScalar(8 * state.cameraZ + 8 + (1 - range01(0, 0.3, travelled)) * 16);
    });
  });

  let timeline: gsap.core.Timeline | undefined;

  const play = (onComplete?: () => void) => {
    timeline = gsap.timeline();
    timeline.add(() => onComplete?.(), 4.4);
    meshes.forEach((mesh, index) => {
      const u = (mesh.material as THREE.ShaderMaterial).uniforms;
      const sheet = gsap.timeline();
      timeline!.add(sheet, 0);
      sheet.to(state.angles, { [index]: 3.5 * Math.PI - ((2.5 * Math.PI) / COUNT) * index, duration: 6, ease: 'sine.inOut' }, 0.2 * index);
      sheet.fromTo(u.uFlip, { value: 1 }, { value: 0, delay: 0.2 * index, duration: 7, ease: 'sine.inOut' }, 0);
      sheet.fromTo(u.uOpacity, { value: 0 }, { value: 1, duration: 0.3, ease: 'none' }, 0.2 * index);
      sheet.to(u.uOpacity, { value: 0, duration: 0.9, ease: 'power1.inOut' }, 0.04 * index + 3.4); // gone before the sheets grow huge: on the white page they would fill the screen with a wash
      sheet.to(state, { cameraZ: 0.4, duration: 3, ease: 'power2.inOut' }, 2.6);
      sheet.fromTo(u.uBend, { value: 2 }, { value: 0, delay: 0.2 * index, duration: 2, ease: 'power2.inOut' }, 0);
    });
  };

  const dispose = () => {
    timeline?.kill();
    stopFrame();
    layer.remove(group);
    meshes.forEach((m) => (m.material as THREE.Material).dispose());
    geometry.dispose();
  };

  return { play, dispose };
}
