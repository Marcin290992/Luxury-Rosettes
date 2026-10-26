import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** Phones and tablets: the row is pinned with CSS sticky, one cat per screen; the calendar follows as a vertical block. */
export function initMobile() {
  // ---- phones and tablets (< 1024px) ----------------------------------------------------------------------------------
  // The row is pinned (CSS sticky, so the compositor does it: no jitter) and swiping up slides it sideways, one cat per
  // screen. The photo of each cat opens with a mask as it arrives, drifts against its card, and the scroll settles on
  // the nearest cat. The breeding calendar is a normal vertical block after the row (six columns do not fit on a phone).
  const small = gsap.matchMedia();
  small.add('(max-width: 1023px) and (prefers-reduced-motion: no-preference)', () => {
    const cover = document.querySelector<HTMLElement>('.cats-cover')!;
    const section = document.getElementById('cats')!;
    const sheet = section.querySelector<HTMLElement>('.cats-sheet')!;
    const track = section.querySelector<HTMLElement>('.cats-track')!;
    const cal = section.querySelector<HTMLElement>('.cal')!;
    const fill = section.querySelector<HTMLElement>('.cats-fill')!;
    const count = section.querySelector<HTMLElement>('.cats-count')!;
    const items = gsap.utils.toArray<HTMLElement>(':scope > .cats-intro, :scope > .cat', track);
    const cats = items.slice(1);
    const n = items.length;
    const PER = 0.75; // screens of swiping per cat
    const pad = (i: number) => String(i).padStart(2, '0');

    cover.dataset.mobile = '';
    section.dataset.mobile = '';

    // the calendar leaves the row and follows it as a normal block
    cover.appendChild(cal);

    // the sheet sits in a tall box and sticks with CSS
    const box = document.createElement('div');
    box.dataset.stick = '';
    box.style.cssText = `position:relative;height:calc(100lvh * ${1 + PER * (n - 1)})`;
    sheet.parentNode!.insertBefore(box, sheet);
    box.appendChild(sheet);

    const ctx = gsap.context(() => {
      const imgs = cats.map((c) => c.querySelector<HTMLElement>('img')!);
      // the photos are simply there (no mask, no zoom): while the row slides the photo must not also be "appearing"
      gsap.set(imgs, { scale: 1.12 });
      gsap.set(fill, { clipPath: 'inset(0% 100% 0% 0%)' });

      const tl = gsap.timeline({
        defaults: { immediateRender: false },
        scrollTrigger: {
          trigger: box,
          start: 'top top',
          end: () => `+=${box.offsetHeight - sheet.offsetHeight}`,
          invalidateOnRefresh: true,
          scrub: 0.6,
          snap: { snapTo: 1 / (n - 1), duration: { min: 0.15, max: 0.45 }, delay: 0.12, ease: 'power2.inOut' },
          onUpdate: (self) => {
            const i = Math.round(self.progress * (n - 1));
            count.textContent = i ? `${pad(i)} / ${pad(n - 1)}` : '';
          },
        },
      });
      // one unit of time = one screen: item i is centred at time i
      tl.fromTo(track, { x: 0 }, { x: () => -(n - 1) * window.innerWidth, ease: 'none', duration: n - 1 }, 0);
      tl.fromTo(fill, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none', duration: n - 1 }, 0);
      cats.forEach((_, j) => {
        const t = j + 1; // its item index
        const end = n - 1; // nothing may run past the last screen, or the whole row would be stretched
        // the only effect left: the photo drifts against its card (depth). Names and captions are simply there.
        tl.fromTo(imgs[j], { xPercent: 5 }, { xPercent: -5, duration: Math.min(2, end - (t - 1)), ease: 'none' }, t - 1);
      });
      tl.set({}, {}, n - 1);

      // the calendar, now a vertical block: months draw in as it is reached
      const months = gsap.utils.toArray<HTMLElement>('.cal-month', cal);
      const lines = gsap.utils.toArray<HTMLElement>('.cal-line', cal);
      const head = gsap.utils.toArray<HTMLElement>('.cal-head > *', cal);
      const foot = gsap.utils.toArray<HTMLElement>('.cal-foot > *', cal);
      gsap.set([head, months, foot].flat(), { autoAlpha: 0, y: 24 });
      gsap.set(lines, { clipPath: 'inset(0% 100% 0% 0%)' });
      gsap
        .timeline({ scrollTrigger: { trigger: cal, start: 'top 80%', toggleActions: 'play none none reverse' }, defaults: { ease: 'power3.out' } })
        .to(head, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.1 }, 0)
        .to(months, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.08 }, 0.25)
        .to(lines, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, stagger: 0.08, ease: 'power3.inOut' }, 0.4)
        .to(foot, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.1 }, 0.9);
    }, cover);

    document.fonts.ready.then(() => ScrollTrigger.refresh());

    return () => {
      ctx.revert();
      sheet.style.cssText = '';
      box.parentNode?.insertBefore(sheet, box);
      box.remove();
      track.appendChild(cal);
      track.insertBefore(cal, track.querySelector('.cats-end'));
      gsap.set([track, ...items], { clearProps: 'all' });
      delete cover.dataset.mobile;
      delete section.dataset.mobile;
    };
  });
}
