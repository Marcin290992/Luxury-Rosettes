// The beginning of the Luxury Rosettes opening: the photos are sheets of paper (the same as the gallery's, luxurybengal-sheet.ts) that fall. One after
// another, at an even beat, they drop from the top left corner along the same diagonal of the screen like loose sheets (tumbling, turned over, curling)
// and fall out of the bottom of the screen. When the last one is gone the screen is empty, and the spiral (luxuryrosettes-spiral-path.ts) rises.
// A function of one number, `f` (0..1), so scrolling back undoes it exactly.

import * as THREE from 'three';
import { coverWindow, textureRatio } from './luxurybengal-layer';
import { createPictureSheet, createShadowSheet, type Sheet } from './luxurybengal-sheet';
import { clamp01 } from './luxuryrosettes-spiral-common';

const RADIUS = 10; // px, the rounding of the cards (the same as the photos of the site)
const WIDTH = 5; // world size of a card
const HEIGHT = WIDTH * 0.7;
const LENGTH = 0.55; // how long (of f) a card takes to fall
const TURN = 2.2; // radians a falling card bends through at the most
const TO = -24; // where a card is when it is gone: below the screen

interface Card {
  group: THREE.Group;
  sheet: Sheet;
  shadow: Sheet;
  texture: THREE.Texture;
}

export interface Fall {
  /** Lays the cards for `f` (0..1). `px` is how many screen pixels one world unit is. */
  update(f: number, px: number): void;
  dispose(): void;
}

export function createFall(scene: THREE.Scene, textures: THREE.Texture[]): Fall {
  const cards: Card[] = textures.map((texture) => {
    const sheet = createPictureSheet(texture, [0, 0, 1, 1]);
    const shadow = createShadowSheet();
    // the vertices are moved in the shader, so the flat plane's own bounds say nothing about where the card is
    sheet.mesh.frustumCulled = false;
    shadow.mesh.frustumCulled = false;
    sheet.resize(WIDTH, HEIGHT);
    shadow.resize(WIDTH * 1.1, HEIGHT * 1.1);
    shadow.mesh.position.set(WIDTH * 0.085, -HEIGHT * 0.04, -0.1);
    const group = new THREE.Group();
    group.add(shadow.mesh, sheet.mesh);
    group.visible = false;
    scene.add(group);
    return { group, sheet, shadow, texture };
  });
  const step = (1 - LENGTH) / Math.max(cards.length - 1, 1); // the beat

  return {
    update(f, px) {
      cards.forEach((card, i) => {
        const u = clamp01((f - i * step) / LENGTH);
        if (u <= 0 || u >= 1) {
          card.group.visible = false;
          return;
        }
        card.group.visible = true;
        const fromX = -19 + (i % 3) * 1.4;
        const fromY = 17 + (i % 3) * 1.2;
        const fromZ = -3 + (i % 3) * 3;
        const toX = 3 + (i % 4) * 2.2;
        const toZ = (i % 3) * 2;
        const fall = Math.pow(u, 1.5); // it gathers speed
        const sway = Math.sin(u * Math.PI * 2.5 + i) * 1.4;
        card.group.position.set(fromX + (toX - fromX) * u + sway, fromY + (TO - fromY) * fall, fromZ + (toZ - fromZ) * u);
        const tumble = (i % 2 ? -1 : 1) * (0.9 + (i % 3) * 0.3);
        card.group.rotation.set(0.5 * Math.sin(u * 7 + i), 0, tumble * (1 - 0.5 * u));
        const q = 1 - Math.pow(1 - Math.min(u * 2, 1), 2.4); // it turns over in the first half of the fall and then stays flat
        const state = { hinge: -1 as const, angle: Math.PI * (1 - q), curl: (TURN / WIDTH) * Math.sin(Math.PI * q), opacity: clamp01(u / 0.1) };
        card.sheet.setCrop(coverWindow(textureRatio(card.texture), WIDTH / HEIGHT));
        card.sheet.setScreenSize(WIDTH * px, HEIGHT * px, RADIUS);
        card.sheet.apply(state);
        card.shadow.apply({ ...state, opacity: 0.5 * state.opacity });
      });
    },
    dispose() {
      cards.forEach((c) => {
        scene.remove(c.group);
        c.sheet.dispose();
        c.shadow.dispose();
      });
    },
  };
}
