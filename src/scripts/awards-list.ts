// Awards list: one pinned screen, scrubbed by the scroll.
//
// It starts where the spiral before it ends (scripts/awards-spiral.ts): the first award's photo is the one the spiral has just grown to
// the whole screen (the same picture). While the list slides up over the spiral that photo is held still on the screen (so it is the
// spiral's own photo, not a copy that moves), and when the list has arrived the photo settles into a large frame. A huge counter ("03/10")
// stands at the left with the words of the current award (where, when, the story), and the names of the awards stand in a list at the
// right (the current one is gold). Every next award is one large photo that is OPENED over the one before from the bottom edge (a mask),
// settling from a slight zoom, while the counter, the words and the names move on.
//
// Everything is drawn from one number, the scroll position of the pin (0..1), so the picture, the counter, the words and the names always
// agree and scrolling back puts everything back.
//
//  - initAwardsList(root) is `init` and returns destroy(); everything is looked up inside `root`; it runs wherever motion is allowed (on a
//    phone and a tablet the CSS lays it out in one column); otherwise the CSS shows a plain list of the awards,
//  - the pin is CSS sticky inside a tall track (as in the other chapters),
//  - when the section comes up, the counter, the names and the words of the first award rise out of masks (and go back when it is scrolled
//    out below).
//
// Expected markup (see AwardsList.astro): root > .al-pin > .al-index > .al-mask > .al-roll (> .al-num, .al-total), .al-slot, .al-images >
// .al-img x n, .al-names > li > .al-name x n, .al-details > .al-detail x n.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { AWARDS_LIST } from './settings';

gsap.registerPlugin(ScrollTrigger, SplitText);

const clamp = gsap.utils.clamp;
const pad2 = (n: number) => String(n).padStart(2, '0');
const settle = gsap.parseEase('power3.inOut');
const open = gsap.parseEase('power2.inOut');

export function initAwardsList(root: HTMLElement, o = AWARDS_LIST) {
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const pin = root.querySelector<HTMLElement>('.al-pin')!;
    const index = root.querySelector<HTMLElement>('.al-index')!;
    const num = root.querySelector<HTMLElement>('.al-num')!;
    const slot = root.querySelector<HTMLElement>('.al-slot')!;
    const frame = root.querySelector<HTMLElement>('.al-images')!;
    const images = Array.from(root.querySelectorAll<HTMLElement>('.al-img'));
    const photos = images.map((img) => img.querySelector('img')!);
    const namesBox = root.querySelector<HTMLElement>('.al-names')!;
    const names = Array.from(namesBox.children) as HTMLElement[];
    const detailsBox = root.querySelector<HTMLElement>('.al-details')!;
    const details = Array.from(root.querySelectorAll<HTMLElement>('.al-detail'));
    const roll = root.querySelector<HTMLElement>('.al-roll')!;
    const nameLabels = Array.from(root.querySelectorAll<HTMLElement>('.al-name'));
    const count = images.length;

    root.dataset.live = '';
    root.style.setProperty('--al-length', String(o.length));

    // ---- the measures: the frame's place, the names' travel, in px ----
    let W = 0;
    let H = 0;
    let rest = { left: 0, top: 0, width: 0, height: 0 };
    let moveNames = 0; // how far a name goes (up) while it is the current one
    const measure = () => {
      W = pin.clientWidth;
      H = pin.clientHeight;
      rest = { left: slot.offsetLeft, top: slot.offsetTop, width: slot.offsetWidth, height: slot.offsetHeight };
      const margin = parseFloat(getComputedStyle(index).top) || 32; // the space round the edge, as in the CSS
      moveNames = H - margin * 2 - namesBox.offsetHeight;
    };

    // Until the pin has arrived the frame is the whole screen and is held still on it: the list is sliding up over the spiral, and its first
    // photo must stay exactly where the spiral's photo is. (The list's top is 100% of the screen below the top of the screen at the start of
    // its slide and 0 at the end.)
    const hold = ScrollTrigger.create({
      trigger: root,
      start: 'top bottom',
      end: 'top top',
      onUpdate: (self) => {
        gsap.set(frame, { y: -(1 - self.progress) * (pin.clientHeight || window.innerHeight) });
      },
      onLeave: () => gsap.set(frame, { y: 0 }),
      onLeaveBack: () => gsap.set(frame, { y: -(pin.clientHeight || window.innerHeight) }),
    });

    // everything is drawn from p, the scroll position of the pinned part (0..1)
    let framed = -1; // the last settling value drawn for the frame (-1: never)
    const draw = (p: number) => {
      // 1. the first photo settles from the whole screen into its frame
      const s = settle(clamp(0, 1, p / (o.intro * 0.85)));
      if (s !== framed) {
        framed = s;
        frame.style.left = `${rest.left * s}px`;
        frame.style.top = `${rest.top * s}px`;
        frame.style.width = `${W + (rest.width - W) * s}px`;
        frame.style.height = `${H + (rest.height - H) * s}px`;
        frame.style.borderRadius = `${4 * s}px`;
      }
      // the words of the page come in once the photo has begun to settle
      const chrome = clamp(0, 1, (p - o.intro * 0.2) / (o.intro * 0.8));
      index.style.opacity = String(chrome);
      namesBox.style.opacity = String(chrome);

      // 2. the current award, as a number of awards: 0 when the first photo is the one shown, 1 when the second is, ...
      const at = clamp(0, 1, (p - o.intro) / (1 - o.intro)) * (count - 1);
      num.textContent = pad2(Math.round(at) + 1);

      images.forEach((img, i) => {
        if (i === 0) return;
        // image i opens over the one before it during its own segment (the first part of it; then it rests)
        const r = clamp(0, 1, (at - (i - 1)) / o.reveal);
        const e = open(r);
        img.style.visibility = r <= 0 ? 'hidden' : 'visible'; // (a closed mask can still leave a hairline at its edge)
        img.style.clipPath = r <= 0 ? 'inset(100% 0% 0% 0%)' : r >= 1 ? 'none' : `inset(${((1 - e) * 100).toFixed(2)}% 0% 0% 0%)`;
        photos[i].style.transform = `scale(${(1 + 0.14 * (1 - e)).toFixed(4)})`;
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
        const shown = clamp(0, 1, 1 - Math.abs(i - at) * o.detailFade) * chrome;
        detail.style.opacity = shown.toFixed(3);
        detail.style.visibility = shown > 0 ? 'visible' : 'hidden';
        detail.style.transform = `translateY(${((i - at) * o.detailShift).toFixed(1)}px)`;
        detail.setAttribute('aria-hidden', String(Math.abs(i - at) > 0.5));
      });
    };

    // the first photo covers the screen until the list's own scroll begins
    gsap.set(images.slice(1), { clipPath: 'inset(100% 0% 0% 0%)' });
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
          framed = -1;
          draw(state.p);
        },
      },
    });
    const watch = new ResizeObserver(() => {
      measure();
      framed = -1;
      draw(state.p);
    });
    watch.observe(pin);

    // ---- the way in: the counter, the names and the words of the first award rise out of their masks when the section comes up ----
    const firstWords = details[0].querySelectorAll<HTMLElement>('.al-meta, h3, .al-text');
    const words = SplitText.create(Array.from(firstWords), { type: 'lines', mask: 'lines' });
    const entrance = gsap
      .timeline({
        defaults: { ease: 'power3.out' },
        scrollTrigger: { trigger: root, start: o.enterAt, toggleActions: 'play none none reverse' },
        onComplete: () => words.revert(), // the words go back to flowing as plain text (the masks were only for the way in)
      })
      .from(roll, { yPercent: 110, duration: 1 }, 0.15)
      .from(nameLabels, { yPercent: 110, duration: 0.9, stagger: 0.06 }, 0.3)
      .from(words.lines, { yPercent: 110, duration: 0.9, stagger: 0.08 }, 0.5);

    return () => {
      hold.kill();
      entrance.scrollTrigger?.kill();
      entrance.kill();
      words.revert();
      gsap.set([roll, ...nameLabels, frame, ...images, ...names], { clearProps: 'all' });
      watch.disconnect();
      delete root.dataset.live;
      root.style.removeProperty('--al-length');
      [frame, index, namesBox, ...images, ...photos, ...names, ...details].forEach((el) => el.removeAttribute('style'));
      names.forEach((name) => name.classList.remove('is-current'));
      void detailsBox;
    };
  });

  return () => mm.revert();
}
