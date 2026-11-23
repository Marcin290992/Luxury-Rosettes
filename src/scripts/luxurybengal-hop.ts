// One sheet of paper that carries a picture from one rectangle to another: a photo opening large from its tile, and flying back to it. It lifts off
// towards the viewer, bends a little on the way and settles, with a shadow under it, in the language of the intro's sheets (luxurybengal-arrive.ts).
// The sheet is drawn on the shared layer over the page; the page's own picture is shown under it in the frame it lands, and the sheet goes two
// frames later, so nothing jumps. Both rectangles are asked for at every frame, so the sheet lands exactly on a tile that moves a little.

import * as THREE from 'three';
import { getLayer, loadTexture, textureRatio, coverWindow } from './luxurybengal-layer';
import { createPictureSheet, createShadowSheet } from './luxurybengal-sheet';

export type Rect = { left: number; top: number; width: number; height: number };

const LIFT = 0.1; // world units the sheet rises towards the viewer at the middle of the flight (small: the perspective must not make it swell on top of its real growth)
const CURL = 0.45; // radians it bends through at the most
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

// gentle departure, quick middle, a long soft tail (half in-out cubic, half out-quart: no hard stop and no stiff, symmetric slide)
const softFlight = (t: number) => 0.55 * inOutCubic(t) + 0.45 * (1 - (1 - t) ** 4);

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
  let span = 0; // the flight's length in seconds, fixed when it starts (it depends on the distance)
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
    // The flight is not a straight, symmetric slide: it takes longer the further it goes (and a little longer on a big screen), the position leaves
    // gently and has a long soft tail, the size follows a beat behind, and the path bows to one side like a sheet carried through the air.
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const dist = Math.hypot(dx, dy);
    if (!span) {
      const reach = clamp01(dist / Math.hypot(window.innerWidth, window.innerHeight));
      span = o.duration * (0.85 + 0.55 * reach) * Math.min(Math.max(window.innerWidth / 1600, 1), 1.3);
    }
    const u = clamp01(time / span);
    const e = softFlight(u);
    // the size is the final one before the sheet arrives (at 55 % of the flight): the last part is only a glide into place, never a resize
    const s = clamp01(u / 0.55);
    const eSize = 0.35 * (0.5 - 0.5 * Math.cos(Math.PI * s)) + 0.65 * (1 - (1 - s) ** 3);
    // the bow: perpendicular to the way, always bulging upwards, nothing at either end
    const bow = Math.min(dist * 0.1, 90) * Math.sin(Math.PI * e);
    const nx = dist ? -dy / dist : 0;
    const ny = dist ? dx / dist : 0;
    const side = ny > 0 ? -1 : 1;
    const rect = {
      left: from.left + (to.left - from.left) * e + nx * bow * side,
      top: from.top + (to.top - from.top) * e + ny * bow * side,
      width: from.width + (to.width - from.width) * eSize,
      height: from.height + (to.height - from.height) * eSize,
    };
    // the centre follows the position, not the size: keeps the sheet's middle on its path while the size catches up
    rect.left += ((from.width + (to.width - from.width) * e) - rect.width) / 2;
    rect.top += ((from.height + (to.height - from.height) * e) - rect.height) / 2;
    current = rect;
    const box = layer.fromDom(rect);
    sheet.resize(box.width, box.height);
    sheet.setCrop(coverWindow(ratio, rect.width / rect.height));
    sheet.setScreenSize(rect.width, rect.height, radius);
    // the rise towards the viewer (and the bend) is over before the end, so the perspective cannot change the size at the landing
    const lift = Math.sin(Math.PI * clamp01(u / 0.65)) ** 1.5;
    group.visible = true;
    group.position.set(box.x, box.y, LIFT * lift);
    // a tilt that follows the bow and a small sway that dies away as the sheet settles
    const sway = Math.sin(u * Math.PI * 2.2) * (1 - u) ** 2;
    group.rotation.set(0, 0, 0.035 * lift * Math.sign(dx || 1) + 0.03 * sway);
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

// ---- warming up: the first sheet of a page costs a shader to compile and a picture to upload to the GPU, and that must not happen in the frame where
// a flight starts (on a phone it showed as a stutter). `warmSheet` draws a sheet that cannot be seen (fully transparent) for a moment, so the shader is
// compiled and the picture is on the GPU before it is needed; a sheet that is kept alive holds the compiled shader for the life of the layer. ----

let keeper: { layer: ReturnType<typeof getLayer>; group: THREE.Group } | undefined;

export async function warmSheet(src: string): Promise<void> {
  try {
    const layer = getLayer('top', 900);
    const tex = await loadTexture(src);
    const make = () => {
      const sheet = createPictureSheet(tex, [0, 0, 1, 1]);
      const shadow = createShadowSheet();
      sheet.apply({ hinge: -1, angle: 0, curl: 0, opacity: 0 });
      shadow.apply({ hinge: -1, angle: 0, curl: 0, opacity: 0 });
      sheet.mesh.frustumCulled = false;
      shadow.mesh.frustumCulled = false;
      const group = new THREE.Group();
      group.add(shadow.mesh, sheet.mesh);
      layer.scene.add(group);
      return { group, sheet, shadow };
    };
    if (!keeper || keeper.layer !== layer) {
      // the kept sheet stays in the scene (hidden after its first frame) so the compiled shader is never let go
      const k = make();
      keeper = { layer, group: k.group };
      let frames = 0;
      const stop = layer.every(() => {
        if (++frames >= 2) {
          k.group.visible = false;
          stop();
        }
      });
      return;
    }
    const w = make();
    let frames = 0;
    const stop = layer.every(() => {
      if (++frames < 2) return;
      stop();
      layer.scene.remove(w.group);
      w.sheet.dispose();
      w.shadow.dispose();
    });
  } catch {
    /* it is only a head start */
  }
}
