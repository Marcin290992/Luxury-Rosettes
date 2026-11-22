// The grid at the end of the Luxury Rosettes spiral: six photos arrive as sheets of paper, the same sheets as the gallery's (luxurybengal-sheet.ts): each
// comes in from the side (the middle column from above or below), turned over on a hinge at its outer edge, curls flat and lands in its place with a
// shadow that fades; a gold line is drawn between the rows. The camera and the size of the scene decide how many columns there are and how big a card is.

import * as THREE from 'three';
import { ASPECT, clamp01 } from './luxuryrosettes-spiral-common';
import { coverWindow, textureRatio } from './luxurybengal-layer';
import { createPictureSheet, createShadowSheet, type Sheet } from './luxurybengal-sheet';

const STEPS = 600; // points of a drawn line
const RADIUS = 10; // px, the rounding of the cards (the same as the photos of the site)
const TURN_CURL = 2.2; // radians a card bends through at the most while it turns (the same as the gallery's intro)

interface Card {
  group: THREE.Group;
  sheet: Sheet;
  shadow: Sheet;
  texture: THREE.Texture;
}

export interface Grid {
  /** Measures the scene again and builds the cards again (call when the scene changes size). */
  rebuild(): void;
  /** Lays the cards for `H` (0..1: how far the grid is laid). */
  update(H: number): void;
  dispose(): void;
}

export function createGrid(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  area: HTMLElement,
  textures: THREE.Texture[],
  photos: number[],
  lineMaterial: THREE.Material,
): Grid {
  const layout = () => {
    const w = area.clientWidth;
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
  let cards: Card[] = [];
  let rowLines: THREE.Line[] = [];

  const spot = (i: number) => {
    const col = i % U.cols;
    const row = Math.floor(i / U.cols);
    return new THREE.Vector2(
      -0.5 * (U.cols * U.width + (U.cols - 1) * U.gapX) + 0.5 * U.width + col * (U.width + U.gapX),
      0.5 * (U.rows * U.height + (U.rows - 1) * U.gapY) - 0.5 * U.height - row * (U.height + U.gapY),
    );
  };
  // where a card comes in from: the outer columns from the sides, the middle one from above or below
  const entry = (i: number, to: THREE.Vector2) => {
    const col = i % U.cols;
    const y = i < U.cols ? U.halfH + 2 * U.height : -U.halfH - 2 * U.height;
    const x = col === 0 ? -U.halfW - 2 * U.width : col === U.cols - 1 ? U.halfW + 2 * U.width : to.x;
    return new THREE.Vector2(x, y);
  };

  const drop = () => {
    cards.forEach((c) => {
      scene.remove(c.group);
      c.sheet.dispose();
      c.shadow.dispose();
    });
    cards = [];
    rowLines.forEach((l) => {
      scene.remove(l);
      l.geometry.dispose();
    });
    rowLines = [];
  };
  const build = () => {
    drop();
    U = layout();
    const px = area.clientHeight / (2 * U.halfH); // pixels in one unit
    cards = photos.map((n) => {
      const texture = textures[n % textures.length];
      const sheet = createPictureSheet(texture, [0, 0, 1, 1]);
      sheet.resize(U.width, U.height);
      sheet.setScreenSize(U.width * px, U.height * px, RADIUS);
      sheet.mesh.renderOrder = 3;
      sheet.mesh.frustumCulled = false;
      const shadow = createShadowSheet();
      shadow.mesh.renderOrder = 2;
      shadow.mesh.frustumCulled = false;
      const group = new THREE.Group();
      group.add(shadow.mesh, sheet.mesh);
      group.visible = false;
      scene.add(group);
      return { group, sheet, shadow, texture };
    });
    const margin = area.clientWidth < 768 ? 0 : U.halfW * (80 / area.clientWidth);
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
  build();

  return {
    rebuild: build,
    update(H) {
      // the photos fly in and settle in the grid
      cards.forEach((card, i) => {
        const r = clamp01((H - 0.08 * i) / 0.4);
        if (r <= 0) {
          card.group.visible = false;
          return;
        }
        card.group.visible = true;
        const e = 1 - Math.pow(1 - r, 3);
        const to = spot(i);
        const from = entry(i, to);
        // the hinge is the edge nearer the side the card comes from, so the turned-over sheet lies outside and swings in over its place
        const col = i % U.cols;
        const hinge: -1 | 1 = col === 0 ? -1 : col === U.cols - 1 ? 1 : i % 2 ? 1 : -1;
        const q = 1 - Math.pow(1 - r, 2.4);
        card.group.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e, 0);
        card.group.rotation.set(0, 0, 0.14 * hinge * Math.sin(Math.PI * r) * (1 - r));
        card.sheet.setCrop(coverWindow(textureRatio(card.texture), U.width / U.height));
        const state = { hinge, angle: Math.PI * (1 - q), curl: (TURN_CURL / U.width) * Math.sin(Math.PI * q), opacity: clamp01(r / 0.1) };
        card.sheet.apply(state);
        // the shadow sheet is a little larger, so its hinge edge lies a little further out: moved back
        card.shadow.resize(U.width * 1.14, U.height * 1.14);
        card.shadow.mesh.position.set(-hinge * U.width * 0.07 + U.width * 0.015, -U.height * 0.04, -0.03);
        card.shadow.apply({ ...state, opacity: 0.9 * Math.pow(1 - r, 1.4) * state.opacity });
      });
      rowLines.forEach((l, j) => {
        const f = 1 - Math.pow(1 - clamp01((H - 0.2 - 0.08 * j) / 0.8), 2.5);
        l.geometry.setDrawRange(0, Math.round((STEPS + 1) * f));
      });
    },
    dispose: drop,
  };
}
