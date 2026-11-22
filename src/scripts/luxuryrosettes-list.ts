// Awards list: one pinned screen scrubbed by the scroll. A counter stands top left, a column of photos rises through the middle (the one on
// the middle line is bright, the rest dim), the award names roll up on the right and the words of the current award sit on the left.
// After the Codegrid "PrototypeStudio Scroll Animation".
// The scroll is smoothed once and everything is drawn from that one number, so counter, photos, names and words always agree.
// On entering, the photos open from the bottom edge and the text rises out of masks; scrolling back undoes it.
// initLuxuryRosettesList(root) returns destroy(). Wide screens with motion only; otherwise the CSS shows a plain list. Markup: LuxuryRosettesList.astro.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { LUXURY_ROSETTES_LIST } from './settings';

gsap.registerPlugin(ScrollTrigger, SplitText);

const clamp = gsap.utils.clamp;
const pad2 = (n: number) => String(n).padStart(2, '0');

export function initLuxuryRosettesList(root: HTMLElement, o = LUXURY_ROSETTES_LIST) {
  const mm = gsap.matchMedia();

  // every width: on a laptop the three columns, on a tablet and a phone the same pinned screen laid out upright (see LuxuryRosettesList.astro)
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const pin = root.querySelector<HTMLElement>('.al-pin')!;
    const index = root.querySelector<HTMLElement>('.al-index')!;
    const num = root.querySelector<HTMLElement>('.al-num')!;
    const imagesBox = root.querySelector<HTMLElement>('.al-images')!;
    const images = Array.from(root.querySelectorAll<HTMLElement>('.al-img'));
    const namesBox = root.querySelector<HTMLElement>('.al-names')!;
    const names = Array.from(namesBox.children) as HTMLElement[];
    const details = Array.from(root.querySelectorAll<HTMLElement>('.al-detail'));
    const roll = root.querySelector<HTMLElement>('.al-roll')!;
    const nameLabels = Array.from(root.querySelectorAll<HTMLElement>('.al-name'));
    const count = images.length;

    root.dataset.live = '';
    root.style.setProperty('--al-length', String(o.length));
    gsap.set(imagesBox, { xPercent: -50 });

    // ---- the measures: the screen, the column of photos, the counter and the names, in px ----
    let H = 0; // the height of the pinned screen
    let first = 0; // where the middle of the first photo is in the column
    let startY = 0; // where the column stands when the first photo is at the middle line
    let endY = 0; // and where when the last one is
    let moveNames = 0; // how far a name goes (up) while it is the current one
    const measure = () => {
      const margin = parseFloat(getComputedStyle(index).top) || 32; // the space round the edge, as in the CSS
      H = pin.clientHeight;
      const mid = parseFloat(getComputedStyle(root).getPropertyValue('--al-mid')) || 0.5; // where the middle line is: the share of the screen from the top
      first = images[0].offsetTop + images[0].offsetHeight / 2;
      const lastPhoto = images[count - 1];
      startY = H * mid - first; // the first photo is at the middle line from the first moment of the pin: no scrolling is spent getting to it
      endY = H * mid - (lastPhoto.offsetTop + lastPhoto.offsetHeight / 2); // and the last one is there at the end
      moveNames = H - margin * 2 - namesBox.offsetHeight;
    };

    // everything is drawn from p, the scroll position of the pinned part (0..1)
    const draw = (whole: number) => {
      const p = whole; // the list's own progress (0..1): when it is over the pin ends and the page scrolls on normally to the last screen
      gsap.set(imagesBox, { y: startY + p * (endY - startY) });
      // the current award, as a number of awards: 0 when the first photo is the one at the middle line, 1 when the second is, ...
      const at = p * (count - 1);

      num.textContent = pad2(Math.round(at) + 1);

      images.forEach((img, i) => {
        const away = Math.abs(i - at);
        img.style.opacity = (1 - (1 - o.dim) * Math.min(1, away / 0.9)).toFixed(3);
      });

      names.forEach((name, i) => {
        // the name rises while its award is the current one; the first one has only the half step after the start, the last one only the
        // half step before the end, so at the end every name, the last included, has come up to the others
        const moving =
          i === 0 ? clamp(0, 1, at / 0.5) : i === count - 1 ? clamp(0, 1, (at - (count - 1.5)) / 0.5) : clamp(0, 1, at - i + 0.5);
        gsap.set(name, { y: -moving * moveNames });
        name.classList.toggle('is-current', Math.round(at) === i);
      });

      details.forEach((detail, i) => {
        const shown = clamp(0, 1, 1 - Math.abs(i - at) * o.detailFade);
        detail.style.opacity = shown.toFixed(3);
        detail.style.visibility = shown > 0 ? 'visible' : 'hidden';
        detail.style.transform = `translateY(${((i - at) * o.detailShift).toFixed(1)}px)`;
        detail.setAttribute('aria-hidden', String(Math.abs(i - at) > 0.5));
      });
    };

    measure();
    const state = { p: 0 };
    draw(0);
    gsap.to(state, {
      p: 1,
      ease: 'none',
      onUpdate: () => draw(state.p),
      scrollTrigger: {
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        scrub: o.scrub,
        invalidateOnRefresh: true,
        onRefresh: () => {
          measure();
          draw(state.p);
        },
      },
    });
    const watch = new ResizeObserver(() => {
      measure();
      draw(state.p);
    });
    watch.observe(pin);

    // ---- the way in: it plays when the section comes up, and goes back when the section is scrolled out below ----
    const firstWords = details[0].querySelectorAll<HTMLElement>('.al-meta, h3, .al-text');
    const words = SplitText.create(Array.from(firstWords), { type: 'lines', mask: 'lines' });
    const photos = images.map((img) => img.querySelector('img')!);
    const entrance = gsap
      .timeline({
        defaults: { ease: 'power3.out' },
        scrollTrigger: { trigger: root, start: o.enterAt, toggleActions: 'play none none reverse' },
        onComplete: () => {
          gsap.set([...images, ...photos], { clearProps: 'clipPath,scale' });
          words.revert(); // the words go back to flowing as plain text (the masks were only for the way in)
        },
      })
      .fromTo(images, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, stagger: 0.1, ease: 'power3.inOut' }, 0)
      .from(photos, { scale: 1.25, duration: 1.4, stagger: 0.1 }, 0)
      .from(roll, { yPercent: 110, duration: 1 }, 0.15)
      .from(nameLabels, { yPercent: 110, duration: 0.9, stagger: 0.06 }, 0.3)
      .from(words.lines, { yPercent: 110, duration: 0.9, stagger: 0.08 }, 0.5);

    return () => {
      entrance.scrollTrigger?.kill();
      entrance.kill();
      words.revert();
      gsap.set([...images, ...photos, roll, ...nameLabels], { clearProps: 'all' });
      watch.disconnect();
      delete root.dataset.live;
      root.style.removeProperty('--al-length');
      [imagesBox, index, ...images, ...names, ...details].forEach((el) => el.removeAttribute('style'));
      names.forEach((name) => name.classList.remove('is-current'));
    };
  });

  return () => mm.revert();
}
