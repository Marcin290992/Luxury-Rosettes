// The gallery intro: 21 paper sheets with the gallery's photos fly up out of the bottom of the screen along a spiral and pass the camera one
// after another, each curling flat as it turns over. They start 0.2 s apart, so the whole flight takes about 6.5 s; play() calls back at 4.7 s,
// when the page should start to bring in the grid.

import * as THREE from 'three';
import gsap from 'gsap';
import { getLayer, loadTexture, textureRatio, coverWindow } from './lumen-layer';
import { createPictureSheet, createShadowSheet, type Sheet } from './lumen-sheet';

const COUNT = 21;
const STAGGER = 0.2; // s between two sheets leaving
const LIFE = 2.5; // s a sheet is on its way
const CALLBACK_AT = 4.7; // s into the flight
const SHEET_W = 1.5;
const SHEET_H = 1.9;
const SHADOW_GROW = 1.2;

// the path: depth towards the camera, how wide the spiral is, how many turns it makes, and how far below the screen it starts
const DEPTH = { from: -24, to: 3.6 };
const RADIUS = { from: 0.8, to: 5.4 };
const TURNS = 1.1;
const RISE_FROM = 26;
const LEVEL = -0.4; // world y of the axis of the spiral once it has come up

export interface Spiral {
  /** Starts the flight; `onLand` is called when the page should bring in what follows. */
  play(onLand?: () => void): void;
  dispose(): void;
}

interface Flyer {
  group: THREE.Group;
  sheet: Sheet;
  shadow: Sheet;
  phase: number; // where on the circle this sheet starts
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => t * t * (3 - 2 * t);

export async function createSpiral(sources: string[]): Promise<Spiral> {
  const layer = getLayer('top', 900);
  const wanted = Array.from({ length: COUNT }, (_, i) => sources[i % sources.length]);
  const textures = await Promise.all(wanted.map((src) => loadTexture(src)));

  const flyers: Flyer[] = textures.map((tex, i) => {
    const sheet = createPictureSheet(tex, coverWindow(textureRatio(tex), SHEET_W / SHEET_H));
    sheet.resize(SHEET_W, SHEET_H);
    const shadow = createShadowSheet();
    shadow.resize(SHEET_W * SHADOW_GROW, SHEET_H * SHADOW_GROW);
    shadow.mesh.position.set(0.06, -0.1, -0.03);
    sheet.mesh.renderOrder = 1;
    const group = new THREE.Group();
    group.add(shadow.mesh, sheet.mesh);
    group.visible = false;
    layer.scene.add(group);
    return { group, sheet, shadow, phase: i * 2.399963 }; // the golden angle: neighbours never line up
  });

  const clock = { t: 0 };
  let timeline: gsap.core.Timeline | undefined;

  const stopFrames = layer.every(() => {
    flyers.forEach((f, i) => {
      const u = (clock.t - STAGGER * i) / LIFE;
      if (u <= 0 || u >= 1) {
        f.group.visible = false;
        return;
      }
      f.group.visible = true;
      const travel = ease(u) * 0.55 + u * 0.45;
      const angle = f.phase + Math.PI * 2 * TURNS * travel;
      const radius = RADIUS.from + (RADIUS.to - RADIUS.from) * Math.pow(u, 1.25);
      const z = DEPTH.from + (DEPTH.to - DEPTH.from) * Math.pow(u, 1.8);
      const rise = RISE_FROM * Math.pow(1 - u, 3);
      f.group.position.set(Math.cos(angle) * radius * 1.3, Math.sin(angle) * radius * 0.7 + LEVEL - rise, z);
      f.group.rotation.set(0, 0, 0.32 * Math.sin(angle)); // upright, with only a sway: the photos stay readable

      const q = ease(clamp01(u / 0.6)); // the turning over takes the first part of the flight
      const state = {
        hinge: -1 as const,
        angle: Math.PI * (1 - q),
        curl: (2.2 / SHEET_W) * Math.sin(Math.PI * q),
        opacity: clamp01(u / 0.12) * clamp01((1 - u) / 0.18),
      };
      f.sheet.apply(state);
      f.shadow.apply({ ...state, opacity: state.opacity * 0.9 });
    });
  });

  return {
    play(onLand) {
      timeline?.kill();
      clock.t = 0;
      const total = STAGGER * (COUNT - 1) + LIFE;
      timeline = gsap.timeline();
      timeline.to(clock, { t: total, duration: total, ease: 'none' }, 0);
      if (onLand) timeline.call(onLand, [], CALLBACK_AT);
    },
    dispose() {
      timeline?.kill();
      stopFrames();
      flyers.forEach((f) => {
        layer.scene.remove(f.group);
        f.sheet.dispose();
        f.shadow.dispose();
      });
    },
  };
}
