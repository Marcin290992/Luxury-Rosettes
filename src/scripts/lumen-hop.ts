// One sheet of paper that carries a picture from one rectangle to another: a photo opening large from its tile, and flying back to it. It lifts off
// towards the viewer, bends a little on the way and settles, with a shadow under it, in the language of the intro's sheets (lumen-arrive.ts).
// The sheet is drawn on the shared layer over the page; the page's own picture is shown under it in the frame it lands, and the sheet goes two
// frames later, so nothing jumps. Both rectangles are asked for at every frame, so the sheet lands exactly on a tile that moves a little.

import * as THREE from 'three';
import { getLayer, loadTexture, textureRatio, coverWindow } from './lumen-layer';
import { createPictureSheet, createShadowSheet } from './lumen-sheet';

export type Rect = { left: number; top: number; width: number; height: number };

const LIFT = 0.3; // world units the sheet rises towards the viewer at the middle of the flight
const CURL = 0.45; // radians it bends through at the most
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

export interface Hop {
  /** Stops at once and takes the sheet away. */
  kill(): void;
  /** True until the sheet has landed or been killed. */
  active(): boolean;
  /** Where the sheet is on the screen now. */
  rect(): Rect;
}

export interface HopOptions {
  from: () => Rect;
  to: () => Rect;
  duration: number;
  /** Seconds to wait before the sheet appears (the page does something else first). */
  delay?: number;
  /** In the frame the sheet is first drawn: hide whatever it replaces. */
  onFirstFrame?: () => void;
  /** In the frame the sheet is down: show whatever it stands for. */
  onLand: () => void;
}

export async function hopSheet(src: string, radius: number, o: HopOptions): Promise<Hop> {
  const layer = getLayer('top', 900);
  const tex = await loadTexture(src);
  const ratio = textureRatio(tex);
  const sheet = createPictureSheet(tex, [0, 0, 1, 1]);
  const shadow = createShadowSheet();
  sheet.mesh.renderOrder = 1;
  const group = new THREE.Group();
  group.add(shadow.mesh, sheet.mesh);
  group.visible = false;
  layer.scene.add(group);

  let time = 0;
  let waited = 0;
  let started = false;
  let alive = true;
  let landedAt = 0;
  let frame = 0;
  let current: Rect = o.from();
  let stop = () => {};

  const cleanup = () => {
    if (!alive) return;
    alive = false;
    stop();
    layer.scene.remove(group);
    sheet.dispose();
    shadow.dispose();
  };

  stop = layer.every((dt) => {
    if (!alive) return;
    frame++;
    if (landedAt) {
      if (frame - landedAt >= 2) cleanup();
      return;
    }
    if (!started) {
      waited += dt;
      if (waited < (o.delay ?? 0)) return;
      started = true;
      o.onFirstFrame?.();
    } else time += dt;
    const from = o.from();
    const to = o.to();
    const u = clamp01(time / o.duration);
    const e = inOutCubic(u);
    const rect = {
      left: from.left + (to.left - from.left) * e,
      top: from.top + (to.top - from.top) * e,
      width: from.width + (to.width - from.width) * e,
      height: from.height + (to.height - from.height) * e,
    };
    current = rect;
    const box = layer.fromDom(rect);
    sheet.resize(box.width, box.height);
    sheet.setCrop(coverWindow(ratio, rect.width / rect.height));
    sheet.setScreenSize(rect.width, rect.height, radius);
    const lift = Math.sin(Math.PI * u);
    group.visible = true;
    group.position.set(box.x, box.y, LIFT * lift);
    group.rotation.set(0, 0, 0.02 * lift * Math.sign(to.left - from.left || 1));
    const state = { hinge: -1 as const, angle: 0, curl: (CURL / box.width) * lift, opacity: 1 };
    sheet.apply(state);
    shadow.resize(box.width * 1.1, box.height * 1.1);
    shadow.mesh.position.set(box.width * 0.062, -box.height * 0.035, -0.03);
    shadow.apply({ ...state, opacity: 0.9 * lift });
    if (u >= 1) {
      landedAt = frame;
      o.onLand();
    }
  });

  return { kill: cleanup, active: () => alive && !landedAt, rect: () => current };
}
