// Luxury Rosettes spiral (the opening of the page of the champions): photos fall out of the screen as loose sheets, then ride a spiral ribbon up the screen (three.js) while two huge words slide in
// from the sides; then six photos arrive as sheets and land in a grid, a line is drawn between the rows and stripes rise to cover the scene. After a "photo vortex" demo.
// A sticky screen in a tall track; ScrollTrigger gives the progress (0..1), which is smoothed here. Photos are cropped to cover.
// Numbers are in settings.ts (LUXURY_ROSETTES_SPIRAL). initLuxuryRosettesSpiral(root) returns destroy(). Markup: LuxuryRosettesSpiral.astro.
// The pieces: the falling sheets (-fall.ts), the spiral ribbon (-path.ts), the grid (-grid.ts), the photos as textures (-photos.ts), the words and stripes
// (-words.ts), the still picture during a page transition (luxuryrosettes-freeze.ts), the shared shader (-common.ts).

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import * as THREE from 'three';
import { LUXURY_ROSETTES_SPIRAL, WEBGL_ENABLED } from './settings';
import { clamp01 } from './luxuryrosettes-spiral-common';
import { loadPhotos } from './luxuryrosettes-spiral-photos';
import { createFall } from './luxuryrosettes-spiral-fall';
import { createSpiral } from './luxuryrosettes-spiral-path';
import { createGrid } from './luxuryrosettes-spiral-grid';
import { createWords } from './luxuryrosettes-spiral-words';
import { freezeOnLeave } from './luxuryrosettes-freeze';

gsap.registerPlugin(ScrollTrigger, SplitText);

const FALL_SHARE = 0.26; // the first part of the opening, as a share of it: the photos fall (the rest is the spiral and the grid)

export function initLuxuryRosettesSpiral(root: HTMLElement, o = LUXURY_ROSETTES_SPIRAL) {
  if (!WEBGL_ENABLED) return; // WebGL is switched off (settings.ts): the plain words, line and grid stay
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const area = root.querySelector<HTMLElement>('.sp-scene')!;
    const canvas = root.querySelector<HTMLCanvasElement>('.sp-canvas')!;
    const top = root.querySelector<HTMLElement>('.sp-top')!;
    const bottom = root.querySelector<HTMLElement>('.sp-bottom')!;
    const line = root.querySelector<HTMLElement>('.sp-line')!;
    const stripes = Array.from(root.querySelectorAll<HTMLElement>('.sp-stripes div'));
    const urls = (root.dataset.photos ?? '').split('|').filter(Boolean);
    if (urls.length < 2) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return; // no WebGL: the page stays as the plain words, line and grid
    }

    const total = o.spinScreens + o.exitScreens;
    root.dataset.live = '';
    root.style.setProperty('--sp-length', String(total));

    const words = createWords(root, top, bottom, line, stripes);

    // ---- three.js ----
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);
    const fit = () => {
      const w = area.clientWidth;
      const h = area.clientHeight;
      const phone = w < 768;
      const tablet = w >= 768 && w < 1200;
      camera.fov = phone ? 58 : tablet ? 54 : 52;
      camera.position.set(0, 0, phone ? 28 : tablet ? 24 : 22);
      camera.lookAt(0, 0, 0);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    fit();

    // The canvas stays invisible until every photo is on the GPU AND the page transition is over (the same moment as the big words), and then fades
    // in. During the transition the page is scaled (it grows from 85% to full size), and a canvas that comes up in the middle of that is rasterised
    // small and then enlarged: it looked slightly soft for a moment, once, on the way back to the page.
    canvas.style.opacity = '0';
    let gone = false; // set when the scene is taken down: nothing may touch the renderer after that
    let frozen = false; // the still picture is on the canvas (see luxuryrosettes-freeze.ts): the scene stops, so the two are always the same picture
    const photos = loadPhotos(renderer, urls, () => {
      void words.afterTransition.then(() => {
        // two frames: one to draw, one so that the picture is on the screen before it is shown
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (gone || frozen) return; // the page is already leaving: the still picture is on screen
            canvas.style.transition = 'opacity 0.3s ease-out';
            canvas.style.opacity = '1';
          }),
        );
      });
    });

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xc29a2e });
    const fall = createFall(scene, photos.textures);
    const spiral = createSpiral(scene, photos.textures, photos.crops, lineMaterial);
    const grid = createGrid(scene, camera, area, photos.textures, o.grid, lineMaterial);

    // Only a real change of the scene's size rebuilds it. On a phone or tablet the address bar sliding in or out (it does that when a page transition
    // starts) fires a resize too, and rebuilding the grid then reset the photos' state: the spiral and the grid jumped.
    let sceneW = area.clientWidth;
    let sceneH = area.clientHeight;
    const onResize = () => {
      if (area.clientWidth === sceneW && area.clientHeight === sceneH) return;
      sceneW = area.clientWidth;
      sceneH = area.clientHeight;
      fit();
      grid.rebuild();
    };
    window.addEventListener('resize', onResize);

    // ---- the mouse: the photo under it grows ----
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let over = false;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      over = true;
    };
    const onLeave = () => (over = false);
    area.addEventListener('pointermove', onMove);
    area.addEventListener('pointerleave', onLeave);

    // ---- the scroll: ScrollTrigger gives 0..1 over the track, smoothed here ----
    let target = 0;
    let shown = 0;
    let near = true;
    const trigger = ScrollTrigger.create({
      trigger: root,
      start: 'top top',
      end: 'bottom bottom',
      invalidateOnRefresh: true,
      onUpdate: (self) => (target = self.progress),
      onRefresh: (self) => (target = shown = self.progress),
    });
    const range = new IntersectionObserver(([entry]) => (near = entry.isIntersecting), { rootMargin: '100% 0px' });
    range.observe(root);
    ScrollTrigger.refresh(); // the track has just grown, so the triggers after it need their places again

    // While the menu is open, and from the tap on a link until the page is gone, the scene holds still. On a phone the browser may shift the scroll
    // position by the height of its address bar when the menu or the transition starts; the spiral follows the scroll (the rest of the scene is
    // pinned), so it was the one thing that visibly moved.
    let hold = false;
    let release = 0;
    const onMenu = (e: Event) => {
      const { open, leaving } = (e as CustomEvent<{ open: boolean; leaving: boolean }>).detail;
      window.clearTimeout(release);
      hold = open || leaving;
      if (leaving) release = window.setTimeout(() => (hold = false), 5000); // the navigation never happened
    };
    document.addEventListener('nav-menu', onMenu);
    const unfreeze = freezeOnLeave({ canvas, render: () => renderer.render(scene, camera), isNear: () => near, onFrozen: (on) => (frozen = on) });

    const draw = () => {
      if (!near || hold || frozen) return;
      const dt = Math.min(gsap.ticker.deltaRatio(60) / 60, 0.05);
      const k = 1 - Math.pow(0.001, dt);
      shown += (target - shown) * k;

      const vh = area.clientHeight;
      const spinPart = o.spinScreens / total;
      const whole = Math.min(shown / spinPart, 1); // 0..1 through the cards: first they fall, then the spiral, then the grid
      const exit = clamp01((shown - spinPart) / (1 - spinPart));
      const spin = clamp01((whole - FALL_SHARE) / (1 - FALL_SHARE)); // the spiral and the grid, as they were in the original
      const P = Math.min(1, spin / (2 / 3));
      const H = clamp01((spin - spiral.endOfSpin) / (1 - spiral.endOfSpin)); // 0..1: how far the grid is laid

      fall.update(clamp01(whole / FALL_SHARE), area.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.position.z));
      spiral.update(P);

      // the photo under the mouse grows
      let hovered: THREE.Object3D | null = null;
      if (over) {
        ray.setFromCamera(mouse, camera);
        const hit = ray.intersectObjects(spiral.ribbons.filter((m) => m.visible), false);
        if (hit.length) hovered = hit[0].object;
      }
      spiral.ribbons.forEach((m) => {
        m.userData.scale += ((m === hovered ? o.hover : 1) - m.userData.scale) * k;
      });

      grid.update(H);
      words.draw(shown * vh * total, vh, Math.max(0, 1 - 4 * H), exit, Math.max(0, 1 - 3 * H)); // the line and the words fade out as the grid arrives

      if (!document.hidden) renderer.render(scene, camera); // a page that is not on the screen is not drawn (a white canvas on iOS Safari)
    };
    gsap.ticker.add(draw);

    return () => {
      gone = true;
      unfreeze();
      document.removeEventListener('nav-menu', onMenu);
      window.clearTimeout(release);
      gsap.ticker.remove(draw);
      window.removeEventListener('resize', onResize);
      area.removeEventListener('pointermove', onMove);
      area.removeEventListener('pointerleave', onLeave);
      trigger.kill();
      range.disconnect();
      words.dispose();
      grid.dispose();
      spiral.dispose();
      fall.dispose();
      lineMaterial.dispose();
      photos.dispose();
      renderer.dispose();
      delete root.dataset.live;
      root.style.removeProperty('--sp-length');
    };
  });

  // the words are shown (or the plain fallback is) once the scene is built and the fonts are in, so that nothing flashes unstyled
  const lift = () => document.documentElement.classList.remove('sp-pending');
  Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2500))]).then(lift);

  return () => {
    lift();
    mm.revert();
  };
}
