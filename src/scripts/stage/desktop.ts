import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initLenis } from '../lenis';
import { bigShapes, smallShapes } from './shapes';
import { splitWords, wordDelays } from './text';
import { PX_PER_SEC, ZOOM, WASH, INTRO, FIRST_STEP, STEP_GAP, STEP_DUR, HOLD_END } from './config';

gsap.registerPlugin(ScrollTrigger);

/** The pinned stage for laptops and wider: hero and story in one scroll-scrubbed timeline. */
export function initDesktop() {
  const mm = gsap.matchMedia();
  mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
    initLenis(); // smooth wheel only — it never changes where the page is

    const stage = document.getElementById('stage')!;
    const story = document.getElementById('story')!;
    let ctx: gsap.Context | undefined;
    let cancelled = false;

    stage.dataset.stage = '';
    story.dataset.pinned = '';

    // Line breaks depend on the web font, so build once fonts are ready
    document.fonts.ready.then(() => {
      if (cancelled) return;
      ctx = gsap.context(() => build(stage, story), stage);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
      delete stage.dataset.stage;
      delete story.dataset.pinned;
    };
  });

}

function build(stage: HTMLElement, story: HTMLElement) {
  const q = <T extends HTMLElement>(sel: string) => gsap.utils.toArray<T>(sel, story);

  const heroImg = stage.querySelector<HTMLElement>('.hero-img')!;
  const fade = stage.querySelector<HTMLElement>('.hero-fade')!;
  const steps = q('.step');
  const bigLayers = q('.big .layer');
  const smallLayers = q('.small .layer');
  const nums = q('.num');
  const bigPath = story.querySelector('#clipBig path')!;
  const smallPath = story.querySelector('#clipSmall path')!;
  const words = steps.map((s) => splitWords(s.querySelector<HTMLElement>('.heading')!));
  const extras = steps.map((s) => gsap.utils.toArray<HTMLElement>('.eyebrow, .cta', s));
  const firstImgs = [bigLayers[0], smallLayers[0]].map((l) => l.querySelector('img')!);
  const last = steps.length - 1;
  const bigShape = story.querySelector<HTMLElement>('.big')!;
  const smallShape = story.querySelector<HTMLElement>('.small')!;
  const progressEl = story.querySelector<HTMLElement>('.progress')!;
  // Layout alternates every step: even = text left / photos right, odd = photos left / text right.
  // Offsets (vw) from the even layout to the odd one.
  // Everything in px (functions, re-measured on resize) so the photos always clear the nav pill and the
  // bottom edge, whatever the screen height.
  const NAV = 122; // px reserved at the top for the nav pill
  const PAD = 28; // px kept free at the bottom
  const areaH = () => window.innerHeight - NAV - PAD;
  const textShift = () => window.innerWidth * 0.51;
  // Photo boxes per layout: left/width in vw, top/height as a fraction of the free height.
  // The two swap roles: one grows while the other shrinks, and they trade places.
  const box = (l: number, t: number, w: number, h: number) => ({
    left: () => (l * window.innerWidth) / 100,
    top: () => NAV + t * areaH(),
    width: () => (w * window.innerWidth) / 100,
    height: () => h * areaH(),
  });
  const LAYOUT = {
    big: [box(65, 0, 32, 1), box(27, 0, 15, 0.46), box(58, 0.1, 38, 0.88)],
    small: [box(46.5, 0.54, 16.5, 0.46), box(3, 0.2, 28, 0.78), box(45.5, 0.04, 16.5, 0.44)],
  };

  // ---- starting state (everything the timeline animates *from*) ----
  bigPath.setAttribute('d', bigShapes[0]);
  smallPath.setAttribute('d', smallShapes[0]);
  // the spot of the eye on screen is worked out by the hero (it depends on how the photo is cropped)
  const eye = () => JSON.parse(heroImg.dataset.eye ?? '{"ox":37,"oy":48}') as { ox: number; oy: number };
  gsap.set(heroImg, { transformOrigin: () => `${eye().ox}% ${eye().oy}%` });
  gsap.set(steps, { autoAlpha: 0 });
  gsap.set(steps[0], { autoAlpha: 1 });
  const placeStart = () => {
    gsap.set(bigShape, { ...LAYOUT.big[0], right: 'auto', bottom: 'auto' });
    gsap.set(smallShape, { ...LAYOUT.small[0], right: 'auto', bottom: 'auto' });
  };
  placeStart();
  // px values go stale on resize: re-place before ScrollTrigger re-measures (the timeline then re-renders them)
  ScrollTrigger.addEventListener('refreshInit', () => {
    if ('stage' in stage.dataset) placeStart();
  });
  steps.forEach((st, i) => gsap.set(st, { x: () => (i % 2 ? textShift() : 0) }));
  gsap.set(words.flat(), { yPercent: 115 });
  gsap.set(extras.flat(), { autoAlpha: 0, y: 16 });
  gsap.set([bigLayers.slice(1), smallLayers.slice(1)], { autoAlpha: 0 });
  gsap.set(bigLayers[0], { clipPath: 'inset(0% 100% 0% 0%)' });
  gsap.set(smallLayers[0], { clipPath: 'inset(100% 0% 0% 0%)' });
  gsap.set(firstImgs, { scale: 1.3 });
  gsap.set(nums, { autoAlpha: 0, y: 12 });
  gsap.set(nums[0], { autoAlpha: 1, y: 0 }); // the counter rides in with the progress line
  gsap.set('.progress', { autoAlpha: 0 });
  gsap.set('.fill', { clipPath: 'inset(0% 100% 0% 0%)' });

  // First real section after the stage (Astro can put <script>/<style> tags in between). Found before the
  // pin exists — pinning wraps the stage in a spacer element. It starts one screen early (margin-top: -100vh)
  // so that it slides over the last step instead of following it.
  let next = stage.nextElementSibling as HTMLElement | null;
  while (next && /^(SCRIPT|STYLE|LINK)$/.test(next.tagName)) next = next.nextElementSibling as HTMLElement | null;
  if (next) gsap.set(next, { marginTop: '-100vh' });

  // pin length = the sequence + one screen of scrolling during which the next section covers the stage
  const total = HOLD_END + window.innerHeight / PX_PER_SEC;

  const tl = gsap.timeline({
    defaults: { immediateRender: false },
    scrollTrigger: {
      trigger: stage,
      start: 'top top',
      end: `+=${total * PX_PER_SEC}`,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true, // the eye's spot depends on the window size
      scrub: 1, // how long the animation trails behind the scroll position
    },
  });

  // 1. Zoom into the eye, then the screen turns cream
  tl.fromTo(
    heroImg,
    { scale: 1, xPercent: 0, yPercent: 0, transformOrigin: () => `${eye().ox}% ${eye().oy}%` },
    {
      scale: 7,
      xPercent: () => 50 - eye().ox,
      yPercent: () => 50 - eye().oy,
      transformOrigin: () => `${eye().ox}% ${eye().oy}%`,
      duration: ZOOM,
      ease: 'power3.inOut',
    },
    0,
  ).fromTo(fade, { opacity: 0 }, { opacity: 1, duration: ZOOM - WASH, ease: 'power1.in' }, WASH);

  // the opening text and scroll cue leave as soon as the dive begins
  tl.fromTo('.hero-content', { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -40, duration: 0.9, ease: 'power2.in' }, 0);

  // 2. Entrance: masks open, images settle from a slow zoom, heading rises line by line
  tl.fromTo(bigLayers[0], { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'power3.out' }, INTRO)
    .fromTo(firstImgs[0], { scale: 1.3 }, { scale: 1, duration: 2.2, ease: 'power2.out' }, INTRO)
    .fromTo(smallLayers[0], { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'power3.out' }, INTRO + 0.15)
    .fromTo(firstImgs[1], { scale: 1.3 }, { scale: 1, duration: 2, ease: 'power2.out' }, INTRO + 0.15)
    .fromTo(extras[0][0], { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8 }, INTRO + 0.05);
  const intro = wordDelays(words[0]);
  words[0].forEach((w, i) =>
    tl.fromTo(w, { yPercent: 115 }, { yPercent: 0, duration: 0.9, ease: 'power3.out' }, INTRO + 0.12 + intro.delays[i]),
  );
  tl.fromTo(extras[0][1], { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out' }, INTRO + 0.12 + intro.lines * 0.14 + 0.35)
    .fromTo('.progress', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, ease: 'none' }, INTRO + 0.9);

  // progress line fills across all steps
  tl.fromTo(
    '.fill',
    { clipPath: 'inset(0% 100% 0% 0%)' },
    { clipPath: 'inset(0% 0% 0% 0%)', duration: HOLD_END - (INTRO + 1.5), ease: 'none' },
    INTRO + 1.5,
  );

  // 3. Step transitions 01→02→03: text swaps, photos cross-fade, shapes morph, counter flips
  for (let i = 0; i < last; i++) {
    const s = FIRST_STEP + i * STEP_GAP;
    const next = i + 1;
    // text
    tl.fromTo(words[i], { yPercent: 0 }, { yPercent: -115, duration: 0.5, stagger: 0.015, ease: 'power2.in' }, s)
      .fromTo(extras[i], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -12, duration: 0.35 }, s)
      .fromTo(steps[i], { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.01 }, s + 0.6)
      .fromTo(steps[next], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, s + 0.05)
      .fromTo(words[next], { yPercent: 115 }, { yPercent: 0, duration: 0.9, stagger: 0.04, ease: 'power3.out' }, s + 1.0)
      .fromTo(extras[next], { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.1 }, s + 1.5);
    // photos
    [bigLayers, smallLayers].forEach((layers) => {
      tl.fromTo(layers[i], { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.9, ease: 'power1.inOut' }, s)
        .fromTo(layers[next], { autoAlpha: 0, scale: 1.12 }, { autoAlpha: 1, scale: 1, duration: STEP_DUR - 0.3, ease: 'power2.out' }, s);
    });
    tl.fromTo(bigPath, { attr: { d: bigShapes[i] } }, { attr: { d: bigShapes[next] }, duration: STEP_DUR - 0.3, ease: 'power3.inOut' }, s)
      .fromTo(smallPath, { attr: { d: smallShapes[i] } }, { attr: { d: smallShapes[next] }, duration: STEP_DUR - 0.3, ease: 'power3.inOut' }, s);
    // layout swap: photos glide left (or back right), the new text appears on the opposite side
    const toOdd = next % 2 === 1;
    const [from, to] = [i, next];
    // the photo in front travels first, so at the halfway point the two have a gap between them —
    // that is when their layers trade places, where it can't be seen
    const lead = 0.25;
    tl.fromTo(bigShape, LAYOUT.big[from], { ...LAYOUT.big[to], duration: STEP_DUR, ease: 'power3.inOut' }, s + (toOdd ? lead : 0))
      .fromTo(smallShape, LAYOUT.small[from], { ...LAYOUT.small[to], duration: STEP_DUR, ease: 'power3.inOut' }, s + (toOdd ? 0 : lead))
      .fromTo(progressEl, { x: () => (toOdd ? 0 : textShift()) }, { x: () => (toOdd ? textShift() : 0), duration: STEP_DUR, ease: 'power3.inOut' }, s);
    // the smaller photo always lies on top: layers trade places once the two are about the same size
    tl.set(bigShape, { zIndex: toOdd ? 3 : 1 }, s + lead / 2 + STEP_DUR * 0.5);
    // counter
    tl.fromTo(nums[i], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -12, duration: 0.4 }, s)
      .fromTo(nums[next], { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5 }, s + 0.2);
  }

  // The timeline simply holds on step 03 for the last screen of the pin — that is where the next section
  // slides over the stage (it has margin-top: -100vh, see ScrollExpand). The parallax below is tied 1:1 to
  // that section's position (no scrub lag), so the stage drifts up and dims exactly as it is being covered.
  tl.set({}, {}, total);

  if (next) {
    gsap
      .timeline({ scrollTrigger: { trigger: next, start: 'top bottom', end: 'top top', scrub: true } })
      .fromTo(story, { y: 0 }, { y: -window.innerHeight * 0.22, ease: 'none' }, 0)
      .fromTo('.stage-dim', { opacity: 0 }, { opacity: 0.5, ease: 'none' }, 0);
  }
}
