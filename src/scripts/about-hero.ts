// About hero: a statement whose letters rise out of their masks, then photos arrive around it in random order (some sharp, some faint),
// drift at their own speeds while the page scrolls and lean towards the pointer. Uses the house curve (house-ease.ts).
// initAboutHero(root) returns destroy(). With reduced motion the CSS shows everything in place.
// Markup: AboutHero.astro (root > .ah-copy, .ah-slot[data-reveal][data-opacity][data-scale] > .ah-drift > .ah-mouse[data-mouse] > .ah-pic).

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ABOUT_HERO as O } from './settings';
import { HOUSE } from './house-ease';
import { transitionDone } from './lifecycle';

gsap.registerPlugin(ScrollTrigger, SplitText);

export function initAboutHero(root: HTMLElement): () => void {
  const eyebrow = root.querySelector<HTMLElement>('.ah-eyebrow');
  const title = root.querySelector<HTMLElement>('.ah-title');
  const slots = Array.from(root.querySelectorAll<HTMLElement>('.ah-slot'));
  if (!title) return () => {};

  const mm = gsap.matchMedia();
  const splits: SplitText[] = [];

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const phone = matchMedia('(max-width: 768px)').matches;
    const pics = slots.map((s) => s.querySelector<HTMLElement>('.ah-pic')!);
    const target = (slot: HTMLElement) => Number(slot.dataset.opacity ?? 1);

    // before anything: the photos are away (the CSS hides them from the first frame, this puts them where they start)
    slots.forEach((slot, i) => {
      const from = slot.dataset.reveal ?? 'center';
      gsap.set(pics[i], { autoAlpha: 0, scale: slot.dataset.scale !== 'false' ? 0.1 : 1, x: from === 'left' ? -O.slide : from === 'right' ? O.slide : 0 });
    });

    // the statement: letters rise out of their lines
    let intro: gsap.core.Timeline | undefined;
    const play = () => {
      const lines = SplitText.create(title, { type: 'lines,chars', mask: 'lines' });
      splits.push(lines);
      gsap.set(title, { visibility: 'visible' });
      gsap.set(lines.chars, { yPercent: 110 });
      intro = gsap.timeline({ delay: O.delay, defaults: { ease: HOUSE } });
      if (eyebrow) intro.fromTo(eyebrow, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: O.title.duration * 0.7 }, 0);
      intro.to(lines.chars, { yPercent: 0, duration: O.title.duration, stagger: O.title.stagger }, 0.15);
      // then the photos, one by one in a random order, each to its own faintness
      gsap.utils.shuffle(slots.map((_, k) => k)).forEach((k, n) => {
        const slot = slots[k];
        intro!.to(
          pics[k],
          { autoAlpha: target(slot), ...(slot.dataset.scale !== 'false' ? { scale: 1 } : {}), x: 0, duration: O.photos.duration },
          O.photos.from + n * O.photos.stagger,
        );
      });
    };
    let cancelled = false;
    // it starts when the fonts are there and the page transition is nearly over (the new page stands in place ~1 s into it): not under the slide-in
    Promise.all([document.fonts?.ready ?? Promise.resolve(), transitionDone()]).then(() => {
      if (!cancelled) play();
    });

    // the photos drift up while the page scrolls: the bigger the photo, the farther
    const widths = slots.map((s) => s.offsetWidth || 1);
    const min = Math.min(...widths);
    const max = Math.max(...widths);
    const lo = phone ? O.drift.phoneLo : O.drift.lo;
    const hi = phone ? O.drift.phoneHi : O.drift.hi;
    const drifts = slots.map((slot, i) => {
      const w = widths[i];
      const d = max <= min ? hi : lo + Math.min(1, Math.max(0, (w - min) / (max - min))) * (hi - lo);
      return gsap.fromTo(
        slot.querySelector('.ah-drift'),
        { y: 0 },
        { y: -d, ease: 'none', scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: O.scrub, invalidateOnRefresh: true } },
      );
    });
    // the text moves less, so the photos seem to be in front of it
    const copy = gsap.fromTo(root.querySelector('.ah-copy'), { y: 0 }, { y: -O.copyDrift, ease: 'none', scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: O.scrub, invalidateOnRefresh: true } });

    // the pointer: each photo leans a little, by its own weight
    let offMouse: (() => void) | undefined;
    if (matchMedia('(pointer: fine)').matches && !phone) {
      const movers = slots.map((slot) => {
        const node = slot.querySelector<HTMLElement>('.ah-mouse')!;
        return { k: Number(node.dataset.mouse ?? 1) || 1, x: gsap.quickTo(node, 'x', { duration: 0.85, ease: 'power3.out' }), y: gsap.quickTo(node, 'y', { duration: 0.85, ease: 'power3.out' }) };
      });
      const move = (e: PointerEvent) => {
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        movers.forEach((m) => {
          m.x(nx * O.mouse * m.k);
          m.y(ny * O.mouse * m.k);
        });
      };
      window.addEventListener('pointermove', move, { passive: true });
      offMouse = () => window.removeEventListener('pointermove', move);
    }

    return () => {
      cancelled = true;
      intro?.kill();
      offMouse?.();
      drifts.forEach((d) => {
        d.scrollTrigger?.kill();
        d.kill();
      });
      copy.scrollTrigger?.kill();
      copy.kill();
      splits.splice(0).forEach((s) => s.revert());
      gsap.set([...pics, title, ...(eyebrow ? [eyebrow] : [])], { clearProps: 'all' });
    };
  });

  return () => mm.revert();
}
