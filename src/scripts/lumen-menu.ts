// The gallery chooser's behaviour (markup: LumenMenu.astro).
//  - open(): the layer fades in (0.6 s), the heading comes in, then each cover turns over onto the page in WebGL (foldIn, 1.4 s, the second one
//    0.4 s later). The backdrop only closes the menu once both covers are down.
//  - desktop hover: the cover under the pointer grows to 110 % and slides 20 % towards the middle, the other shrinks to 80 % and fades to 20 %; the
//    whole screen takes the gallery's colour and a "WELCOME to ..." line slides in. Moving to the other cover waits 800 ms, so the two moves
//    never overlap.
//  - a tap/click: the welcome line slides out, and 0.5 s later the page goes to the gallery (through the router, so the page transition plays).
// initLumenMenu(root, { onOpen, onClose }) returns the handle { open, close, isOpen, destroy }.

import gsap from 'gsap';
import { navigate } from 'astro:transitions/client';
import { QUART, CUBIC } from './lumen-ease';
import { foldIn } from './lumen-fold';
import { drawSvg } from './lumen-draw';
import { disposeLayer } from './lumen-layer';

const ASPECT = 3 / 4; // cover width / height

// as large as fits, keeping the 3:4 shape: side by side when there is room (>= 1024 px wide), stacked otherwise
function fitCards(width: number, height: number) {
  const isLg = width >= 1024;
  const gap = isLg ? 80 : 20;
  if (width <= 0 || height <= 0) return { width: 0, height: 0, isLg, gap };
  if (isLg) {
    const usable = Math.min(width, 0.5 * width) - gap;
    const half = usable / 2;
    const cardW = half / ASPECT <= height ? half : Math.min(height * ASPECT, usable / 2);
    return { width: Math.round(2 * cardW + gap), height: Math.round(cardW / ASPECT), isLg, gap };
  }
  const fullH = width / ASPECT;
  if (2 * fullH + gap <= height) return { width: Math.round(width), height: Math.round(2 * fullH + gap), isLg, gap };
  const cardW = Math.min(((height - gap) / 2) * ASPECT, width);
  return { width: Math.round(cardW), height: Math.round((cardW / ASPECT) * 2 + gap), isLg, gap };
}

export interface LumenMenu {
  open(): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

export function initLumenMenu(root: HTMLElement, hooks: { onOpen?: () => void; onClose?: () => void } = {}): LumenMenu {
  const backdrop = root.querySelector<HTMLButtonElement>('.lm-backdrop')!;
  const closeX = root.querySelector<HTMLButtonElement>('.lm-x');
  const heading = root.querySelector<HTMLElement>('.lm-heading')!;
  const area = root.querySelector<HTMLElement>('.lm-area')!;
  const grid = root.querySelector<HTMLElement>('.lm-grid')!;
  const cards = Array.from(root.querySelectorAll<HTMLElement>('.lm-card'));
  const welcomes = Array.from(root.querySelectorAll<HTMLElement>('.lm-welcome'));
  const atTop = root.dataset.text !== 'bottom';
  const desktop = matchMedia('(min-width: 1024px) and (hover: hover)');

  let opened = false;
  let cardsReady = false;
  let folded = 0;
  let hovered = -1;
  let clicked = false;
  let handover: number | undefined;
  let leaving: number | undefined;
  let frame = 0;
  let firstOpen = true;
  const disposers: Array<() => void> = [];
  const draws: Array<{ cancel: () => void }> = [];

  // ---- sizes ----
  const size = () => {
    frame = 0;
    const r = area.getBoundingClientRect();
    const fit = fitCards(r.width, r.height);
    if (!fit.width || !fit.height) return;
    grid.style.width = `${fit.width}px`;
    grid.style.height = `${fit.height}px`;
    grid.style.gap = `${fit.gap}px`;
    grid.classList.toggle('is-lg', fit.isLg);
  };
  const onSize = () => {
    if (!frame) frame = requestAnimationFrame(size);
  };
  const resizer = new ResizeObserver(onSize);

  // ---- the screen's colour follows the hovered cover ----
  const paint = (index: number) => {
    const card = cards[index];
    gsap.to(root, { backgroundColor: card ? card.dataset.bg! : '#ffffff', color: card ? card.dataset.accent! : '#000000', duration: 0.6, ease: QUART, overwrite: 'auto' });
  };

  const showWelcome = (index: number) => {
    const block = welcomes[index];
    if (!block) return;
    const lines = block.querySelectorAll<HTMLElement>('.lm-line');
    const fromLeft = index === 0;
    gsap.set(block, { visibility: 'visible' });
    gsap.fromTo(lines[0], { opacity: 0, filter: 'blur(6px)', xPercent: fromLeft ? -30 : 30 }, { opacity: 1, filter: 'blur(0px)', xPercent: 0, duration: 0.8, ease: CUBIC });
    gsap.fromTo(lines[1], { opacity: 0, filter: 'blur(6px)', xPercent: fromLeft ? 30 : -30 }, { opacity: 1, filter: 'blur(0px)', xPercent: 0, duration: 0.8, ease: CUBIC });
    const to = block.querySelector<HTMLElement>('.lm-to');
    if (to) draws.push(drawSvg(to, { delay: index === 0 ? 0.1 : 0.5 }));
  };
  const hideWelcome = (index: number, towards = false) => {
    const block = welcomes[index];
    if (!block) return;
    const lines = block.querySelectorAll<HTMLElement>('.lm-line');
    const fromLeft = index === 0;
    gsap.to(lines, {
      opacity: 0,
      filter: 'blur(6px)',
      xPercent: (i) => (towards ? ((i === 0) === fromLeft ? -30 : 30) : 0),
      duration: towards ? 0.8 : 0.5,
      ease: CUBIC,
      overwrite: 'auto',
      onComplete: () => gsap.set(block, { visibility: 'hidden' }),
    });
  };

  // ---- hover (desktop) ----
  const applyHover = (index: number) => {
    cards.forEach((card, i) => {
      const shift = i === 0 ? 20 : -20;
      const to = index === -1 ? { scale: 1, xPercent: 0, opacity: 1 } : i === index ? { scale: 1.1, xPercent: shift, opacity: 1 } : { scale: 0.8, xPercent: shift, opacity: 0.2 };
      gsap.to(card, { ...to, duration: 0.8, ease: QUART, overwrite: 'auto' });
      card.style.zIndex = i === index ? '1' : '0';
    });
    gsap.to(heading, { opacity: index === -1 ? 1 : 0, filter: index === -1 ? 'blur(0px)' : 'blur(6px)', duration: 0.8, ease: QUART, overwrite: 'auto' });
  };

  const hover = (index: number) => {
    if (!desktop.matches || !cardsReady || clicked || hovered === index) return;
    if (handover) return; // the two moves never overlap
    if (hovered !== -1) {
      const previous = hovered;
      hovered = -1;
      hideWelcome(previous);
      applyHover(-1);
      handover = window.setTimeout(() => {
        handover = undefined;
        hovered = index;
        applyHover(index);
        paint(index);
        showWelcome(index);
      }, 800);
      return;
    }
    hovered = index;
    applyHover(index);
    paint(index);
    showWelcome(index);
  };
  const leave = () => {
    if (!desktop.matches || clicked) return;
    window.clearTimeout(handover);
    handover = undefined;
    if (hovered !== -1) hideWelcome(hovered);
    hovered = -1;
    applyHover(-1);
    paint(-1);
  };

  const enters = cards.map((_, i) => () => hover(i));
  cards.forEach((card, i) => card.addEventListener('pointerenter', enters[i]));
  grid.addEventListener('pointerleave', leave);

  // ---- choosing ----
  const onCardClick = (event: MouseEvent) => {
    const link = (event.currentTarget as HTMLElement).querySelector('a');
    const card = event.currentTarget as HTMLElement;
    if (!link || !cardsReady || clicked) return;
    event.preventDefault();
    clicked = true;
    const index = Number(card.dataset.index);
    if (hovered === index) hideWelcome(index, true);
    leaving = window.setTimeout(() => {
      // the page takes the gallery's colour first, so the next one appears without a flash of another colour
      document.documentElement.style.backgroundColor = card.dataset.bg ?? '';
      navigate(card.dataset.href!);
    }, 500);
  };
  const clicks = cards.map(() => onCardClick);
  cards.forEach((card, i) => card.addEventListener('click', clicks[i]));

  // ---- open / close ----
  const open = () => {
    if (opened) return;
    opened = true;
    hooks.onOpen?.();
    cardsReady = false;
    folded = 0;
    clicked = false;
    root.hidden = false;
    backdrop.disabled = true;
    resizer.observe(area);
    size();
    gsap.set(root, { opacity: 0, backgroundColor: '#ffffff', color: '#000000' });
    gsap.to(root, { opacity: 1, duration: 0.6, ease: QUART });
    gsap.fromTo(
      heading,
      { opacity: 0, filter: 'blur(6px)', y: atTop ? -20 : 20 },
      { opacity: 1, filter: 'blur(0px)', y: 0, duration: firstOpen ? 1.2 : 0.8, delay: firstOpen ? 0.5 : 0.2, ease: QUART },
    );
    firstOpen = false;
    grid.removeAttribute('data-hidden');
    gsap.fromTo(grid, { opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.4, ease: CUBIC });
    gsap.set(cards, { scale: 1, xPercent: 0, opacity: 1 });
    cards.forEach((card, i) => {
      card.style.visibility = 'hidden';
      const img = card.querySelector('img')!;
      const run = async () => {
        if (!img.complete) await new Promise((r) => img.addEventListener('load', r, { once: true }));
        if (!opened) return;
        const dispose = await foldIn({
          container: card,
          image: img,
          direction: -i,
          delay: 0.4 * i,
          onComplete: () => {
            card.style.visibility = 'visible';
            if (++folded === cards.length) {
              cardsReady = true;
              backdrop.disabled = !closeX;
            }
          },
        });
        if (opened) disposers.push(dispose);
        else dispose();
      };
      void run();
    });
  };

  const close = () => {
    if (!opened) return;
    opened = false;
    hooks.onClose?.();
    cardsReady = false;
    window.clearTimeout(handover);
    handover = undefined;
    hovered = -1;
    disposers.splice(0).forEach((d) => d());
    gsap.to(root, {
      opacity: 0,
      duration: 0.6,
      ease: QUART,
      onComplete: () => {
        if (!opened) {
          root.hidden = true;
          resizer.disconnect();
        }
      },
    });
  };
  const onBackdrop = () => {
    if (cardsReady) close();
  };
  backdrop.addEventListener('click', onBackdrop);
  closeX?.addEventListener('click', close);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && closeX) close();
  };
  document.addEventListener('keydown', onKey);

  return {
    open,
    close,
    isOpen: () => opened,
    destroy() {
      opened = false;
      window.clearTimeout(handover);
      window.clearTimeout(leaving);
      if (frame) cancelAnimationFrame(frame);
      resizer.disconnect();
      disposers.splice(0).forEach((d) => d());
      draws.splice(0).forEach((d) => d.cancel());
      gsap.killTweensOf([root, heading, grid, ...cards, ...welcomes]);
      cards.forEach((card, i) => {
        card.removeEventListener('pointerenter', enters[i]);
        card.removeEventListener('click', clicks[i]);
      });
      grid.removeEventListener('pointerleave', leave);
      backdrop.removeEventListener('click', onBackdrop);
      closeX?.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
      disposeLayer('top');
    },
  };
}
