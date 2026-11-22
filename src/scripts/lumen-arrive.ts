// Pictures of the grid page that move as sheets of paper, in the language of the intro's spiral (the sheets are drawn on the shared layer over the
// page; the page's own picture is shown under a sheet in the frame it lands, and the sheet goes two frames later, so nothing jumps).
//
// Two kinds of move, decided when the flight starts, from where the picture is and where its tile is:
//  - arrival: the picture was not on screen. It comes up from below, turned over on a hinge at its outer edge, curls flat as it swings open and
//    lands on its tile (the two large pictures that open the page, and the pictures that enter as the grid forms);
//  - glide: the picture was on screen. The sheet slides from where it was to its new place, lifting towards the viewer and bending a little on the
//    way, with a shadow under it that grows and fades again. Size and proportions change along the way (the crop follows).
// Sheets are measured against their pictures at every frame, so they land on them whatever the screen.

import * as THREE from 'three';
import { getLayer, loadTexture, textureRatio, coverWindow } from './lumen-layer';
import { createPictureSheet, createShadowSheet, type Sheet } from './lumen-sheet';

const RISE = 0.75; // how far below its place an arriving sheet starts, in screen heights
const DEPTH = 7; // world units behind its place an arriving sheet starts
const CURL = 2.2; // radians an arriving sheet is bent through at the most (the same as the intro's)
const GLIDE_STAGGER = 0.035; // s between neighbours leaving on a glide
const GLIDE_LIFT = 0.18; // world units a gliding sheet rises at the most
const GLIDE_CURL = 0.28; // radians a gliding sheet bends through at the most

export interface FlightOptions {
  /** Seconds an arriving sheet takes, the delay before the first one leaves and the gap between two. */
  arrive: { duration: number; delay: number; stagger: number; soft?: boolean };
  /** Seconds a gliding sheet takes. */
  glide: number;
}

export interface FlightHooks {
  /** Called in the frame the flight starts, before anything is measured: change the layout here and hide the pictures that are moving. */
  start?: () => void;
  /** Called in the frame sheet `index` lands: show the page's picture then. */
  tile: (index: number) => void;
  /** Called when every sheet is down. */
  done?: () => void;
}

export interface Flight {
  play(hooks: FlightHooks): void;
  dispose(): void;
}

interface Flyer {
  img: HTMLImageElement;
  from: DOMRect | null; // where the picture stood before (null: it was not on screen)
  group: THREE.Group;
  sheet: Sheet;
  shadow: Sheet;
  ratio: number;
  active: boolean;
  glide: boolean;
  hinge: -1 | 1;
  delay: number;
  duration: number;
  landedAt: number; // frame number the sheet landed on (0: still flying)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const inOutQuart = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
const order = (a: DOMRect, b: DOMRect) => Math.round(a.top / 60) - Math.round(b.top / 60) || a.left - b.left;

/**
 * `from[i]` is where picture i stood before the move (or null). Textures load first (pictures already on the page are cached), so the flight
 * can start in one frame.
 */
export async function createFlight(images: HTMLImageElement[], from: Array<DOMRect | null>, radius: number, options: FlightOptions): Promise<Flight> {
  const layer = getLayer('top', 900);
  const textures = await Promise.all(images.map((img) => loadTexture(img.currentSrc || img.src)));

  const flyers: Flyer[] = textures.map((tex, i) => {
    const sheet = createPictureSheet(tex, [0, 0, 1, 1]);
    const shadow = createShadowSheet();
    sheet.mesh.renderOrder = 1;
    const group = new THREE.Group();
    group.add(shadow.mesh, sheet.mesh);
    group.visible = false;
    layer.scene.add(group);
    return { img: images[i], from: from[i], group, sheet, shadow, ratio: textureRatio(tex), active: false, glide: false, hinge: -1, delay: 0, duration: 1, landedAt: 0 };
  });

  let hooks: FlightHooks | undefined;
  let prepared = false;
  let time = 0;
  let frame = 0;
  let ended = false;

  const soft = !!options.arrive.soft;
  const seen = (r: DOMRect | null) => !!r && r.width > 1 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;

  // decides, once the layout is final, which pictures fly and how
  const prepare = () => {
    hooks?.start?.();
    const vw = window.innerWidth;
    const arriving: Array<{ f: Flyer; to: DOMRect }> = [];
    const gliding: Array<{ f: Flyer; to: DOMRect }> = [];
    flyers.forEach((f) => {
      const to = f.img.getBoundingClientRect();
      f.active = seen(f.from) || seen(to);
      f.glide = seen(f.from);
      f.hinge = to.left + to.width / 2 < vw / 2 ? -1 : 1;
      if (f.active) (f.glide ? gliding : arriving).push({ f, to });
    });
    arriving.sort((a, b) => order(a.to, b.to));
    arriving.forEach(({ f }, rank) => {
      f.duration = options.arrive.duration;
      f.delay = options.arrive.delay + rank * options.arrive.stagger;
    });
    gliding.sort((a, b) => order(a.to, b.to));
    gliding.forEach(({ f }, rank) => {
      f.duration = options.glide;
      f.delay = rank * GLIDE_STAGGER;
    });
  };

  const stopFrames = layer.every((dt) => {
    if (!hooks) return;
    if (!prepared) {
      prepared = true;
      prepare();
    }
    frame++;
    time += dt;
    const view = layer.visibleSize();
    let waiting = false;
    flyers.forEach((f, i) => {
      if (!f.active) return;
      if (f.landedAt) {
        if (frame - f.landedAt >= 2) f.group.visible = false; // two frames after the page's picture has appeared under it
        return;
      }
      waiting = true;
      const to = f.img.getBoundingClientRect();
      const u = clamp01((time - f.delay) / f.duration);
      if (!f.glide && u <= 0) {
        f.group.visible = false;
        return;
      }
      f.group.visible = true;

      let rect: { left: number; top: number; width: number; height: number } = to;
      if (f.glide && f.from) {
        const e = inOutQuart(u);
        rect = {
          left: f.from.left + (to.left - f.from.left) * e,
          top: f.from.top + (to.top - f.from.top) * e,
          width: f.from.width + (to.width - f.from.width) * e,
          height: f.from.height + (to.height - f.from.height) * e,
        };
      }
      const box = layer.fromDom(rect);
      f.sheet.resize(box.width, box.height);
      f.sheet.setCrop(coverWindow(f.ratio, rect.width / rect.height));
      f.sheet.setScreenSize(rect.width, rect.height, radius);

      let state;
      let shadow;
      if (f.glide) {
        const lift = Math.sin(Math.PI * u);
        f.group.position.set(box.x, box.y, GLIDE_LIFT * lift);
        f.group.rotation.set(0, 0, 0);
        state = { hinge: -1 as const, angle: 0, curl: (GLIDE_CURL / box.width) * lift, opacity: 1 };
        shadow = lift * 0.9;
        f.shadow.resize(box.width * 1.1, box.height * 1.1);
        f.shadow.mesh.position.set(box.width * 0.05 + box.width * 0.012, -box.height * 0.035, -0.03);
      } else {
        // the turning over comes to rest softly; the rise from below and the depth die away with it
        // (soft: the tiles that enter as the grid forms only slide up a little, barely turned, so they never pile up over their neighbours)
        const k = soft ? 0.3 : 1;
        const q = 1 - Math.pow(1 - u, 2.4);
        const away = Math.pow(1 - u, 3);
        // a soft one starts entirely below the screen (even one whose tile is at the very bottom), so it slides in and never appears from nowhere
        const below = soft ? Math.max(window.innerHeight * 0.22, window.innerHeight - to.top + 30) * (view.height / window.innerHeight) : view.height * RISE;
        f.group.position.set(box.x, box.y - below * away, -DEPTH * k * away * (1 - u));
        f.group.rotation.set(0, 0, 0.18 * k * f.hinge * Math.sin(Math.PI * u) * (1 - u));
        state = { hinge: f.hinge, angle: Math.PI * (1 - q) * k, curl: (CURL * k / box.width) * Math.sin(Math.PI * q), opacity: clamp01(u / (soft ? 0.05 : 0.14)) };
        shadow = 0.9 * Math.pow(1 - u, 1.4) * state.opacity;
        // the shadow sheet is a little larger, so its hinge edge lies a little further out: moved back
        f.shadow.resize(box.width * 1.14, box.height * 1.14);
        f.shadow.mesh.position.set(-f.hinge * box.width * 0.07 + box.width * 0.015, -box.height * 0.04, -0.03);
      }
      f.sheet.apply(state);
      f.shadow.apply({ ...state, opacity: shadow });

      if (u >= 1) {
        f.landedAt = frame;
        hooks?.tile(i);
      }
    });
    if (!waiting && !ended) {
      ended = true; // once (the sheets that have landed still go, two frames after)
      hooks.done?.();
    }
  });

  return {
    play(h) {
      hooks = h;
      prepared = false;
      ended = false;
      time = 0;
      frame = 0;
    },
    dispose() {
      stopFrames();
      flyers.forEach((f) => {
        layer.scene.remove(f.group);
        f.sheet.dispose();
        f.shadow.dispose();
      });
    },
  };
}
