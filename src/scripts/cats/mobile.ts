import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CATS_PHONE as C, CLIP, MEDIA, RISE } from '../settings';

gsap.registerPlugin(ScrollTrigger);

const pad = (i: number) => String(i).padStart(2, '0');

/**
 * Phones and tablets: the row is pinned with CSS sticky, one cat per screen; the calendar follows as a vertical block.
 *
 * The row is pinned (CSS sticky, so the compositor does it: no jitter) and swiping up slides it sideways, one cat per
 * screen. The photo of each cat drifts against its card and the scroll settles on the nearest cat. The breeding
 * calendar is a normal vertical block after the row (six columns do not fit on a phone).
 */
export function initMobile() {
  const small = gsap.matchMedia();
  small.add(MEDIA.phone, () => {
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
    const last = n - 1; // transitions between items; one unit of timeline time = one cat
    const hold = C.endHold / C.screensPerCat; // the same rest on the last cat, in timeline units
    const total = last + hold;

    cover.dataset.mobile = '';
    section.dataset.mobile = '';

    // the calendar leaves the row and follows it as a normal block
    cover.appendChild(cal);

    // the sheet sits in a tall box and sticks with CSS
    const box = document.createElement('div');
    box.dataset.stick = '';
    box.style.cssText = `position:relative;height:calc(100lvh * ${1 + C.screensPerCat * total})`;
    sheet.parentNode!.insertBefore(box, sheet);
    box.appendChild(sheet);

    const ctx = gsap.context(() => {
      const imgs = cats.map((c) => c.querySelector<HTMLElement>('img')!);
      // the photos are simply there (no mask, no zoom): while the row slides the photo must not also be "appearing"
      gsap.set(imgs, { scale: C.photoScale });
      gsap.set(fill, { clipPath: CLIP.closedX });

      const tl = gsap.timeline({
        defaults: { immediateRender: false },
        scrollTrigger: {
          trigger: box,
          start: 'top top',
          end: () => `+=${box.offsetHeight - sheet.offsetHeight}`,
          invalidateOnRefresh: true,
          scrub: C.scrub,
          onUpdate: (self) => {
            const i = Math.min(last, Math.round(self.progress * total));
            count.textContent = i ? `${pad(i)} / ${pad(last)}` : '';
          },
        },
      });
      // item i is centred at time i
      tl.fromTo(track, { x: 0 }, { x: () => -last * window.innerWidth, ease: 'none', duration: last }, 0);
      tl.fromTo(fill, { clipPath: CLIP.closedX }, { clipPath: CLIP.open, ease: 'none', duration: last }, 0);
      // the only effect left: the photo drifts against its card (depth). Names and captions are simply there.
      // Nothing may run past the last screen, or the whole row would be stretched.
      imgs.forEach((img, j) => {
        tl.fromTo(img, { xPercent: C.drift }, { xPercent: -C.drift, duration: Math.min(C.driftSpan, last - j), ease: 'none' }, j);
      });
      tl.set({}, {}, total); // the last cat rests for a while before the page moves on to the calendar

      // the calendar, now a vertical block: months draw in as it is reached
      const months = gsap.utils.toArray<HTMLElement>('.cal-month', cal);
      const lines = gsap.utils.toArray<HTMLElement>('.cal-line', cal);
      const head = gsap.utils.toArray<HTMLElement>('.cal-head > *', cal);
      const foot = gsap.utils.toArray<HTMLElement>('.cal-foot > *', cal);
      const k = C.calendar;
      gsap.set([head, months, foot].flat(), { autoAlpha: 0, y: RISE.block });
      gsap.set(lines, { clipPath: CLIP.closedX });
      gsap
        .timeline({ scrollTrigger: { trigger: cal, start: C.calendarStart, toggleActions: 'play none none reverse' }, defaults: { ease: 'power3.out' } })
        .to(head, { autoAlpha: 1, y: 0, duration: k.head.dur, stagger: k.head.stagger }, 0)
        .to(months, { autoAlpha: 1, y: 0, duration: k.months.dur, stagger: k.months.stagger }, k.months.at)
        .to(lines, { clipPath: CLIP.open, duration: k.lines.dur, stagger: k.lines.stagger, ease: k.lines.ease }, k.lines.at)
        .to(foot, { autoAlpha: 1, y: 0, duration: k.foot.dur, stagger: k.foot.stagger }, k.foot.at);
    }, cover);

    document.fonts.ready.then(() => ScrollTrigger.refresh());

    return () => {
      ctx.revert();
      sheet.style.cssText = '';
      box.parentNode?.insertBefore(sheet, box);
      box.remove();
      track.insertBefore(cal, track.querySelector('.cats-end'));
      gsap.set([track, ...items], { clearProps: 'all' });
      delete cover.dataset.mobile;
      delete section.dataset.mobile;
    };
  });
  return () => small.revert();
}
