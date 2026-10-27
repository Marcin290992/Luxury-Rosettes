import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CATS, CLIP, MEDIA, RISE, ZOOM_IN } from '../settings';

gsap.registerPlugin(ScrollTrigger);

const REVEAL_EASE = 'power3.out';
const SETTLE_EASE = 'power2.out';
const ARRIVE_EASE = 'power2.inOut';

/** Laptops and wider: the pinned row of cats slides sideways, ending on the closing panel with a hold. */
export function initDesktop() {
  const mm = gsap.matchMedia();
  mm.add(MEDIA.laptop, () => {
    const cover = document.querySelector<HTMLElement>('.cats-cover')!;
    const section = document.getElementById('cats')!;
    const sheet = section.querySelector<HTMLElement>('.cats-sheet')!; // animated; the section only gets pinned
    const track = section.querySelector<HTMLElement>('.cats-track')!;
    const cards = gsap.utils.toArray<HTMLElement>('.cat', section);
    const photos = gsap.utils.toArray<HTMLElement>('.cat-photo img', section);
    const intro = gsap.utils.toArray<HTMLElement>('.cats-intro > *', section);
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth); // sideways travel
    const arrival = () => window.innerHeight; // scroll spent sliding the sheet in
    const hold = () => window.innerHeight * CATS.hold;
    let ctx: gsap.Context | undefined;
    let cancelled = false;

    section.dataset.pinned = '';
    cover.dataset.pinned = '';

    // After fonts, so widths are final; registered after the stage's own build (same event, later listener)
    document.fonts.ready.then(() => {
      if (cancelled) return;
      ctx = gsap.context(() => {
        // One pin holds the chapter for the whole time. Nothing here moves with the raw scroll position:
        // the sheet's arrival and the sideways travel are both scrubbed, like everything before them.
        const pin = ScrollTrigger.create({
          trigger: section,
          start: 'top top',
          end: () => `+=${arrival() + distance() + hold()}`,
          pin: true,
          invalidateOnRefresh: true,
        });
        const at = (offset = 0) => () => pin.start + offset;
        const scrubbed = (start: () => number, end: () => number) => ({
          trigger: section,
          start,
          end,
          scrub: CATS.smooth,
          invalidateOnRefresh: true,
        });

        // 1. Arrival: the sheet rises over the expanding photo (photo drifts up and dims)
        const before = cover.previousElementSibling as HTMLElement | null;
        const stage = before?.querySelector<HTMLElement>('.se-stage');
        const dim = before?.querySelector<HTMLElement>('.se-dim');
        // Held below the screen until the arrival begins (otherwise it would sit in its natural spot, then jump)
        gsap.set(sheet, { yPercent: 100 });
        const arrive = gsap.timeline({
          defaults: { immediateRender: false },
          scrollTrigger: scrubbed(at(), () => pin.start + arrival()),
        });
        arrive.fromTo(sheet, { yPercent: 100 }, { yPercent: 0, ease: ARRIVE_EASE }, 0);
        if (stage && dim) {
          arrive
            .fromTo(stage, { y: 0 }, { y: () => -window.innerHeight * CATS.arrivalExit.stage, ease: ARRIVE_EASE }, 0)
            .fromTo(dim, { opacity: 0 }, { opacity: CATS.arrivalExit.dim, ease: ARRIVE_EASE }, 0);
        }

        // 2. Sideways travel (this tween is also the "scroller" the cards react to)
        const range = scrubbed(at(arrival()), () => pin.end - hold());
        const move = gsap.to(track, { x: () => -distance(), ease: 'none', scrollTrigger: range });
        gsap.fromTo(photos, { xPercent: CATS.photoDrift }, { xPercent: -CATS.photoDrift, ease: 'none', scrollTrigger: range });
        gsap.fromTo('.cats-fill', { clipPath: CLIP.closedX }, { clipPath: CLIP.open, ease: 'none', scrollTrigger: range });

        // 3. Each photo is revealed like in the story chapter: a mask opens while the image settles from a slow zoom
        const hide = (card: HTMLElement) => {
          gsap.set(card.querySelector('.cat-photo'), { clipPath: CLIP.closedX });
          gsap.set(card.querySelector('img'), { scale: ZOOM_IN });
          gsap.set(card.querySelectorAll('h3, p'), { autoAlpha: 0, y: RISE.text });
        };
        const reveal = (card: HTMLElement) =>
          gsap
            .timeline({ paused: true, defaults: { ease: REVEAL_EASE } })
            .to(card.querySelector('.cat-photo'), { clipPath: CLIP.open, duration: CATS.card.mask }, 0)
            .to(card.querySelector('img'), { scale: 1, duration: CATS.card.img, ease: SETTLE_EASE }, 0)
            .to(
              card.querySelectorAll('h3, p'),
              { autoAlpha: 1, y: 0, duration: CATS.card.text, stagger: CATS.card.textStagger },
              CATS.card.textAt,
            );

        // the closing panel: heading first, then the pillars one by one, then the buttons
        const panel = section.querySelector<HTMLElement>('.fin')!;
        const finHead = gsap.utils.toArray<HTMLElement>('.fin-head > *', panel);
        const finPillars = gsap.utils.toArray<HTMLElement>('.fin-pillar', panel);
        const finFoot = gsap.utils.toArray<HTMLElement>('.fin-foot > *', panel);
        const fin = CATS.finale;
        gsap.set(finHead, { autoAlpha: 0, y: RISE.block });
        gsap.set(finPillars, { autoAlpha: 0, y: RISE.card });
        gsap.set(finFoot, { autoAlpha: 0, y: RISE.text });
        const finReveal = gsap
          .timeline({ paused: true, defaults: { ease: REVEAL_EASE } })
          .to(finHead, { autoAlpha: 1, y: 0, duration: fin.head.dur, stagger: fin.head.stagger }, 0)
          .to(finPillars, { autoAlpha: 1, y: 0, duration: fin.pillars.dur, stagger: fin.pillars.stagger }, fin.pillars.at)
          .to(finFoot, { autoAlpha: 1, y: 0, duration: fin.foot.dur, stagger: fin.foot.stagger }, fin.foot.at);
        // while the pin holds on the panel, a gold line draws over each pillar, one after another: the page is
        // still "doing" something, so the scroll that remains is clearly part of this screen
        const lines = gsap.utils.toArray<HTMLElement>('.fin-line', panel);
        gsap.set(lines, { clipPath: CLIP.closedX });
        const draw = gsap.timeline({
          defaults: { ease: 'none', immediateRender: false },
          scrollTrigger: scrubbed(() => pin.end - hold(), () => pin.end),
        });
        lines.forEach((l, i) =>
          draw.fromTo(l, { clipPath: CLIP.closedX }, { clipPath: CLIP.open, duration: fin.line.dur }, i * fin.line.step),
        );
        ScrollTrigger.create({
          trigger: panel,
          containerAnimation: move,
          start: CATS.finaleStart,
          animation: finReveal,
          toggleActions: 'play none none reverse',
        });

        gsap.set(intro, { autoAlpha: 0, y: RISE.block });
        const visibleAtStart = cards.filter((c) => c.getBoundingClientRect().left < window.innerWidth * CATS.visibleAtStart);
        const later = cards.filter((c) => !visibleAtStart.includes(c));
        cards.forEach(hide);

        // the ones already on screen when the row starts moving play together once the sheet is mostly in
        const first = gsap.timeline({ paused: true });
        first.to(intro, { autoAlpha: 1, y: 0, duration: CATS.intro.dur, stagger: CATS.intro.stagger, ease: REVEAL_EASE }, 0);
        visibleAtStart.forEach((c, i) => first.add(reveal(c).play(0), CATS.firstCards.at + i * CATS.firstCards.step));
        ScrollTrigger.create({
          trigger: section,
          start: () => pin.start + arrival() * CATS.firstShare,
          animation: first,
          toggleActions: 'play none none reverse',
        });

        // the rest play as they slide into view from the right
        later.forEach((c) => {
          ScrollTrigger.create({
            trigger: c,
            containerAnimation: move,
            start: CATS.laterStart,
            animation: reveal(c),
            toggleActions: 'play none none reverse',
          });
        });
      }, section);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
      delete section.dataset.pinned;
      delete cover.dataset.pinned;
    };
  });
  return () => mm.revert();
}
