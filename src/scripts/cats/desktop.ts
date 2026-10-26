import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** Laptops and wider: the pinned row of cats slides sideways, ending on the breeding calendar with a hold. */
export function initDesktop() {
  const mm = gsap.matchMedia();
  mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
    const cover = document.querySelector<HTMLElement>('.cats-cover')!;
    const section = document.getElementById('cats')!;
    const sheet = section.querySelector<HTMLElement>('.cats-sheet')!; // animated; the section only gets pinned
    const track = section.querySelector<HTMLElement>('.cats-track')!;
    const cards = gsap.utils.toArray<HTMLElement>('.cat', section);
    const photos = gsap.utils.toArray<HTMLElement>('.cat-photo img', section);
    const intro = gsap.utils.toArray<HTMLElement>('.cats-intro > *', section);
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth); // sideways travel
    const arrival = () => window.innerHeight; // scroll spent sliding the sheet in
    const hold = () => window.innerHeight * 0.5; // scroll spent resting on the calendar, so it can't be skimmed past
    const SMOOTH = 1.2; // same "cinematic lag" feel as the stage before it
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

        // 1. Arrival: the sheet rises over the expanding photo (photo drifts up and dims)
        const before = cover.previousElementSibling as HTMLElement | null;
        const stage = before?.querySelector<HTMLElement>('.se-stage');
        const dim = before?.querySelector<HTMLElement>('.se-dim');
        // Held below the screen until the arrival begins (otherwise it would sit in its natural spot, then jump)
        gsap.set(sheet, { yPercent: 100 });
        const arrive = gsap.timeline({
          defaults: { immediateRender: false },
          scrollTrigger: { trigger: section, start: at(), end: () => pin.start + arrival(), scrub: SMOOTH, invalidateOnRefresh: true },
        });
        arrive.fromTo(sheet, { yPercent: 100 }, { yPercent: 0, ease: 'power2.inOut' }, 0);
        if (stage && dim) {
          arrive
            .fromTo(stage, { y: 0 }, { y: () => -window.innerHeight * 0.18, ease: 'power2.inOut' }, 0)
            .fromTo(dim, { opacity: 0 }, { opacity: 0.7, ease: 'power2.inOut' }, 0);
        }

        // 2. Sideways travel (this tween is also the "scroller" the cards react to)
        const range = { trigger: section, start: at(arrival()), end: () => pin.end - hold(), scrub: SMOOTH, invalidateOnRefresh: true };
        const move = gsap.to(track, { x: () => -distance(), ease: 'none', scrollTrigger: range });
        gsap.fromTo(photos, { xPercent: 7 }, { xPercent: -7, ease: 'none', scrollTrigger: range });
        gsap.fromTo(
          '.cats-fill',
          { clipPath: 'inset(0% 100% 0% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none', scrollTrigger: range },
        );

        // 3. Each photo is revealed like in the story chapter: a mask opens while the image settles from a slow zoom
        const hide = (card: HTMLElement) => {
          gsap.set(card.querySelector('.cat-photo'), { clipPath: 'inset(0% 100% 0% 0%)' });
          gsap.set(card.querySelector('img'), { scale: 1.3 });
          gsap.set(card.querySelectorAll('h3, p'), { autoAlpha: 0, y: 16 });
        };
        const reveal = (card: HTMLElement) =>
          gsap
            .timeline({ paused: true, defaults: { ease: 'power3.out' } })
            .to(card.querySelector('.cat-photo'), { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3 }, 0)
            .to(card.querySelector('img'), { scale: 1, duration: 2, ease: 'power2.out' }, 0)
            .to(card.querySelectorAll('h3, p'), { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.1 }, 0.5);

        // the calendar panel: heading, then the month columns draw in one by one, then the legend and button
        const panel = section.querySelector<HTMLElement>('.cal')!;
        const calHead = gsap.utils.toArray<HTMLElement>('.cal-head > *', panel);
        const calMonths = gsap.utils.toArray<HTMLElement>('.cal-month', panel);
        const calFoot = gsap.utils.toArray<HTMLElement>('.cal-foot > *', panel);
        gsap.set(calHead, { autoAlpha: 0, y: 24 });
        gsap.set(calMonths, { autoAlpha: 0, y: 28 });
        gsap.set(calFoot, { autoAlpha: 0, y: 16 });
        const calReveal = gsap
          .timeline({ paused: true, defaults: { ease: 'power3.out' } })
          .to(calHead, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.12 }, 0)
          .to(calMonths, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.1 }, 0.3)
          .to(calFoot, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.12 }, 0.9);
        // while the pin holds on the calendar, a line draws across the months — the page is "doing" something,
        // and the scroll that remains is clearly part of this screen rather than dead space
        const lines = gsap.utils.toArray<HTMLElement>('.cal-line', panel);
        gsap.set(lines, { clipPath: 'inset(0% 100% 0% 0%)' });
        const draw = gsap.timeline({
          defaults: { ease: 'none', immediateRender: false },
          scrollTrigger: { trigger: section, start: () => pin.end - hold(), end: () => pin.end, scrub: SMOOTH, invalidateOnRefresh: true },
        });
        lines.forEach((l, i) =>
          draw.fromTo(l, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5 }, i * 0.5),
        ); // one after another

        ScrollTrigger.create({
          trigger: panel,
          containerAnimation: move,
          start: 'left 80%',
          animation: calReveal,
          toggleActions: 'play none none reverse',
        });

        gsap.set(intro, { autoAlpha: 0, y: 24 });
        const visibleAtStart = cards.filter((c) => c.getBoundingClientRect().left < window.innerWidth * 0.98);
        const later = cards.filter((c) => !visibleAtStart.includes(c));
        cards.forEach(hide);

        // the ones already on screen when the row starts moving play together once the sheet is mostly in
        const first = gsap.timeline({ paused: true });
        first.to(intro, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out' }, 0);
        visibleAtStart.forEach((c, i) => first.add(reveal(c).play(0), 0.25 + i * 0.22));
        ScrollTrigger.create({
          trigger: section,
          start: () => pin.start + arrival() * 0.55,
          animation: first,
          toggleActions: 'play none none reverse',
        });

        // the rest play as they slide into view from the right
        later.forEach((c) => {
          ScrollTrigger.create({
            trigger: c,
            containerAnimation: move,
            start: 'left 92%',
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

}
