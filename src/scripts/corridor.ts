// The corridor of photos on the home page. Markup and styles: Corridor.astro.
  import { createDolly, type Dolly } from './dolly-gallery';
  import { clamp, smoothstep as smooth } from './math';
  import { mount } from './lifecycle';
  import { onPageScroll } from './scroller';
  import { CORRIDOR_SPACING, CORRIDOR_LEAD, CORRIDOR_PX_PER_STEP, CORRIDOR as C } from './settings';


  mount(() => {
    const section = document.getElementById('corridor')!;
    const stage = section.querySelector<HTMLElement>('.cor-stage')!;
    const allTiles = Array.from(section.querySelectorAll<HTMLElement>('.cor-item'));
    const intro = section.querySelector<HTMLElement>('.cor-intro')!;
    const fill = section.querySelector<HTMLElement>('.cor-fill')!;
    const progress = section.querySelector<HTMLElement>('.cor-progress')!;
    const fin = section.querySelector<HTMLElement>('.cor-finale')!;
    const finImg = section.querySelector<HTMLElement>('.cor-finale-img')!;
    const finScrim = section.querySelector<HTMLElement>('.cor-finale-scrim')!;
    const finCopy = section.querySelector<HTMLElement>('.cor-finale-copy')!;
    const finCtas = section.querySelector<HTMLElement>('.cor-ctas')!;

    const SPACING = CORRIDOR_SPACING;
    const LEAD = CORRIDOR_LEAD;
    const { ink: INK, paper: PAPER, white: WHITE, black: BLACK } = C.colors;

    let dolly: Dolly | undefined;
    let onScroll: (() => void) | undefined;
    let offScroll: (() => void) | undefined;

    // Plain sticky pin: the section is taller than the screen and the stage sticks while the page scrolls past.
    // The scroll position only sets the camera target; the dolly eases towards it.
    const start = (phone: boolean) => {
      const tiles = allTiles;
      const items = tiles.length;
      const PX_PER_STEP = phone ? CORRIDOR_PX_PER_STEP.phone : CORRIDOR_PX_PER_STEP.laptop;
      // Finale, in steps from the first photo (the last photo is in place at items - 1): first the words arrive on the
      // paper, then they turn white as the kittens photo fades in and everything goes dark.
      const TEXT_IN = C.textIn.map((v) => items + v);
      const DARKEN = C.darken.map((v) => items + v);
      const END_AT = items + C.endAfter;
      const dollyLook = phone ? C.dolly.phone : C.dolly.laptop;
      const MIN = -LEAD * SPACING;
      const MAX = END_AT * SPACING;

      const travel = (END_AT + LEAD) * PX_PER_STEP;
      section.style.setProperty('--cor-travel', `${travel}px`);
      section.dataset.pinned = '';
      if (phone) section.dataset.phone = '';

      dolly = createDolly(stage, tiles, {
        // phones: the photo is as wide as the screen allows and no taller than ~half of what is visible
        itemWidth: 'width' in dollyLook
          ? Math.min(window.innerWidth * dollyLook.width, window.innerHeight * dollyLook.height)
          : Math.min(dollyLook.maxWidth, window.innerHeight * dollyLook.height),
        ...('aspectRatio' in dollyLook ? { aspectRatio: dollyLook.aspectRatio, perspective: dollyLook.perspective } : {}), // (undefined would overwrite the engine's defaults)
        spacing: SPACING,
        spread: dollyLook.spread,
        scatter: dollyLook.scatter,
        revealRange: dollyLook.revealRange, // phones: the upcoming photo is nearly solid, not a ghost
        passRange: dollyLook.passRange, // phones: the photo that has passed the camera is gone quickly ...
        passHold: dollyLook.passHold,
        lead: LEAD,
        tail: END_AT - (items - 1),
        grayscale: 0,
        // the title leaves first; only then do the photos fade in, so the two never overlap
        gate: (offset) => smooth(C.gate[0], C.gate[1], offset / SPACING),
        onFrame: (offset) => {
          const e = offset / SPACING;
          intro.style.opacity = (1 - smooth(-LEAD + C.intro.fadeStart, C.intro.fadeEnd, e)).toFixed(3);
          intro.style.transform = `scale(${(1 + clamp((e + LEAD) / C.intro.grow, 0, 1) * C.intro.scale).toFixed(3)})`;
          fill.style.clipPath = `inset(0% ${((1 - clamp((offset - MIN) / (MAX - MIN), 0, 1)) * 100).toFixed(2)}% 0% 0%)`;
          const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',');
          const at = offset / SPACING;
          const textIn = smooth(TEXT_IN[0], TEXT_IN[1], at);
          const dark = smooth(DARKEN[0], DARKEN[1], at);
          // the words first, in ink on the paper...
          fin.style.visibility = textIn > 0 ? 'visible' : 'hidden';
          finCopy.style.opacity = textIn.toFixed(3);
          finCopy.style.transform = `translate3d(0, ${((1 - textIn) * C.rise.copy).toFixed(1)}px, 0)`;
          finCopy.style.pointerEvents = textIn > C.interactiveAt ? 'auto' : 'none';
          // ...then they turn white while the photo fades in and the lights go down
          finCopy.style.setProperty('--fg', `rgb(${mix(INK, WHITE, dark)})`);
          finCopy.style.setProperty('--inv', `rgb(${mix(WHITE, INK, dark)})`);
          // the buttons only arrive once the photo is there
          const ctaIn = smooth(DARKEN[0] + C.ctaFrom * (DARKEN[1] - DARKEN[0]), DARKEN[1] + C.ctaPad, at);
          finCtas.style.opacity = ctaIn.toFixed(3);
          finCtas.style.transform = `translate3d(0, ${((1 - ctaIn) * C.rise.ctas).toFixed(1)}px, 0)`;
          finCtas.style.pointerEvents = ctaIn > C.interactiveAt ? 'auto' : 'none';
          finImg.style.opacity = dark.toFixed(3);
          finImg.style.transform = `scale(${(1 + C.finale.zoom * (1 - dark)).toFixed(4)})`;
          finScrim.style.opacity = (C.finale.scrim * dark).toFixed(3);
          stage.style.backgroundColor = `rgb(${mix(PAPER, BLACK, dark)})`;
          progress.style.opacity = (1 - smooth(TEXT_IN[0], TEXT_IN[1], at)).toFixed(3);
        },
      });

      onScroll = () => {
        const d = dolly!;
        const rect = section.getBoundingClientRect();
        const p = clamp(-rect.top / travel, 0, 1);
        d.setTarget(d.min + p * (d.max - d.min));
        // parallax: while the paper slides up over the pinned finale, the finale drifts up a little, slower than the paper
        const covered = clamp((-rect.top - travel) / window.innerHeight, 0, 1);
        stage.style.transform = covered > 0 ? `translate3d(0, ${(-covered * window.innerHeight * 0.18).toFixed(1)}px, 0)` : '';
      };
      offScroll = onPageScroll(onScroll);
      window.addEventListener('resize', onScroll);
      onScroll();
    };

    const stop = () => {
      if (onScroll) {
        offScroll?.();
        offScroll = undefined;
        window.removeEventListener('resize', onScroll);
      }
      dolly?.destroy();
      dolly = undefined;
      onScroll = undefined;
      delete section.dataset.pinned;
      delete section.dataset.phone;
      allTiles.forEach((t) => (t.hidden = false));
      section.style.removeProperty('--cor-travel');
      [stage, intro, fill, progress, fin, finImg, finScrim, finCopy, finCtas].forEach((el) => el.removeAttribute('style'));
    };

    // The corridor runs whenever motion is allowed: the full version on laptops, a portrait version on phones and tablets.
    // With reduced motion the photos simply stack.
    const motion = window.matchMedia('(prefers-reduced-motion: no-preference)');
    const wide = window.matchMedia('(min-width: 1024px)');
    let mode: 'wide' | 'phone' | null = null;
    const sync = () => {
      const next = motion.matches ? (wide.matches ? 'wide' : 'phone') : null;
      if (next === mode) return;
      stop();
      mode = next;
      if (mode) start(mode === 'phone');
    };
    motion.addEventListener('change', sync);
    wide.addEventListener('change', sync);
    sync();

    return () => {
      motion.removeEventListener('change', sync);
      wide.removeEventListener('change', sync);
      stop();
    };
  }, '#corridor');
