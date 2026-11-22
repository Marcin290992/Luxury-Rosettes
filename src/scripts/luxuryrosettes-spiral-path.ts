// The spiral itself, as in the original: a ribbon of photos that rides a spiral up the screen (the head of the chain climbs as the scroll goes on)
// between two gold rails. The numbers of the spiral's shape are below (world units).

import * as THREE from 'three';
import { VERT, FRAG_RIBBON } from './luxuryrosettes-spiral-common';

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
const STEPS = 600; // points of a drawn line
const TAIL = 86; // points of the spiral lines that are drawn behind the head

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

export interface Spiral {
  /** The photos on the ribbon (the mesh under the pointer can be found with a raycaster; `userData.scale` is its size). */
  ribbons: THREE.Mesh[];
  /** Where the spiral stops turning, as a share of the whole: the grid is laid from here. */
  endOfSpin: number;
  /** Lays the ribbons and the rails for `P` (0..1: how far the chain has climbed). */
  update(P: number): void;
  dispose(): void;
}

export function createSpiral(scene: THREE.Scene, textures: THREE.Texture[], crops: Array<{ value: THREE.Vector4 }>, lineMaterial: THREE.Material): Spiral {
  const count = textures.length;
  const ribbons = textures
    .map((_, i) => count - 1 - i)
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
  const chain = (count - 1) * GAP + RIBBON_W;
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

  return {
    ribbons,
    endOfSpin,
    update(P) {
      // the photos ride the spiral
      const head = P * (LENGTH + chain) - chain + 25;
      ribbons.forEach((m, e) => {
        const s = head + GAP * e;
        m.visible = P < 1 && s > 0 && s < LENGTH;
        if (m.visible) layRibbon(m, Math.min(s, LENGTH - 0.001), m.userData.scale);
      });
      // the lines along the spiral
      const headLine = Math.floor(P * (STEPS + 1 + TAIL));
      const from = Math.max(0, headLine - TAIL);
      rails.forEach((geo) => geo.setDrawRange(from, Math.max(0, Math.min(headLine, STEPS + 1) - from + 1)));
    },
    dispose() {
      ribbons.forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      rails.forEach((g) => g.dispose());
    },
  };
}
