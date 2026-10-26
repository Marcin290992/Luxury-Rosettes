import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initLenis } from '../lenis';
import { bigShapes, smallShapes } from './shapes';
import { splitWords, wordDelays } from './text';
import { readEye, originOf } from './eye';
import {
  PX_PER_SEC, ZOOM, WASH, INTRO, FIRST_STEP, STEP_GAP, HOLD_END,
  STAGE_DESKTOP as S, STEP_DESKTOP as STEP, BOXES_DESKTOP, MEDIA, CLIP, WORD_HIDDEN, RISE, ZOOM_IN, LAYER_ZOOM_IN,
  LEAVE, SHAPE_EASE, INSTANT, EYE_FALLBACK,
} from '../settings';

gsap.registerPlugin(ScrollTrigger);

/** The pinned stage for laptops and wider: hero and story in one scroll-scrubbed timeline. */
export function initDesktop() {
  const mm = gsap.matchMedia();
  mm.add(MEDIA.laptop, () => {
    initLenis(); // smooth wheel only — it never changes where the page is

    const stage = document.getElementById('stage')!;
    const story = document.getElementById('story')!;
    let ctx: gsap.Context | undefined;
    let release: (() => void) | undefined;
    let cancelled = false;

    stage.dataset.stage = '';
    story.dataset.pinned = '';

    // Line breaks depend on the web font, so build once fonts are ready
    document.fonts.ready.then(() => {
      if (cancelled) return;
      ctx = gsap.context(() => {
        release = build(stage, story);
      }, stage);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
      release?.();
      delete stage.dataset.stage;
      delete story.dataset.pinned;
    };
  });
  return () => mm.revert();
}

/** Builds the stage timeline; returns what to undo outside the GSAP context (the global refresh listener). */
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
  const areaH = () => window.innerHeight - S.navHeight - S.bottomPad;
  const textShift = () => window.innerWidth * S.textShift;
  // Photo boxes per layout: left/width in vw, top/height as a fraction of the free height.
  // The two swap roles: one grows while the other shrinks, and they trade places.
  const box = ([l, t, w, h]: number[]) => ({
    left: () => (l * window.innerWidth) / 100,
    top: () => S.navHeight + t * areaH(),
    width: () => (w * window.innerWidth) / 100,
    height: () => h * areaH(),
  });
  const LAYOUT = { big: BOXES_DESKTOP.big.map(box), small: BOXES_DESKTOP.small.map(box) };

  // ---- starting state (everything the timeline animates *from*) ----
  bigPath.setAttribute('d', bigShapes[0]);
  smallPath.setAttribute('d', smallShapes[0]);
  // the spot of the eye on screen is worked out by the hero (it depends on how the photo is cropped)
  const eye = () => readEye(heroImg, EYE_FALLBACK.laptop);
  const origin = () => originOf(eye());
  gsap.set(heroImg, { transformOrigin: origin });
  gsap.set(steps, { autoAlpha: 0 });
  gsap.set(steps[0], { autoAlpha: 1 });
  const placeStart = () => {
    gsap.set(bigShape, { ...LAYOUT.big[0], right: 'auto', bottom: 'auto' });
    gsap.set(smallShape, { ...LAYOUT.small[0], right: 'auto', bottom: 'auto' });
  };
  placeStart();
  // px values go stale on resize: re-place before ScrollTrigger re-measures (the timeline then re-renders them)
  const onRefreshInit = () => {
    if ('stage' in stage.dataset) placeStart();
  };
  ScrollTrigger.addEventListener('refreshInit', onRefreshInit);
  steps.forEach((st, i) => gsap.set(st, { x: () => (i % 2 ? textShift() : 0) }));
  gsap.set(words.flat(), { yPercent: WORD_HIDDEN });
  gsap.set(extras.flat(), { autoAlpha: 0, y: RISE.text });
  gsap.set([bigLayers.slice(1), smallLayers.slice(1)], { autoAlpha: 0 });
  gsap.set(bigLayers[0], { clipPath: CLIP.closedX });
  gsap.set(smallLayers[0], { clipPath: CLIP.closedY });
  gsap.set(firstImgs, { scale: ZOOM_IN });
  gsap.set(nums, { autoAlpha: 0, y: RISE.count });
  gsap.set(nums[0], { autoAlpha: 1, y: 0 }); // the counter rides in with the progress line
  gsap.set('.progress', { autoAlpha: 0 });
  gsap.set('.fill', { clipPath: CLIP.closedX });

  // First real section after the stage (Astro can put <script>/<style> tags in between). Found before the
  // pin exists — pinning wraps the stage in a spacer element. It starts one screen early (margin-top: -100vh)
  // so that it slides over the last step instead of following it.
  let next = stage.nextElementSibling as HTMLElement | null;
  while (next && /^(SCRIPT|STYLE|LINK)$/.test(next.tagName)) next = next.nextElementSibling as HTMLElement | null;
  if (next) gsap.set(next, { marginTop: S.nextOverlap });

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
      scrub: S.scrub,
    },
  });

  // 1. Zoom into the eye, then the screen turns cream
  tl.fromTo(
    heroImg,
    { scale: 1, xPercent: 0, yPercent: 0, transformOrigin: origin },
    {
      scale: S.diveScale,
      xPercent: () => 50 - eye().ox,
      yPercent: () => 50 - eye().oy,
      transformOrigin: origin,
      duration: ZOOM,
      ease: S.diveEase,
    },
    0,
  ).fromTo(fade, { opacity: 0 }, { opacity: 1, duration: ZOOM - WASH, ease: S.washEase }, WASH);

  // the opening text and scroll cue leave as soon as the dive begins
  tl.fromTo('.hero-content', { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -RISE.leave, ...LEAVE }, 0);

  // 2. Entrance: masks open, images settle from a slow zoom, heading rises line by line
  const E = S.entrance;
  const wordsAt = INTRO + E.wordsAt;
  tl.fromTo(bigLayers[0], { clipPath: CLIP.closedX }, { clipPath: CLIP.open, duration: E.bigMask, ease: 'power3.out' }, INTRO)
    .fromTo(firstImgs[0], { scale: ZOOM_IN }, { scale: 1, duration: E.bigImg, ease: 'power2.out' }, INTRO)
    .fromTo(smallLayers[0], { clipPath: CLIP.closedY }, { clipPath: CLIP.open, duration: E.smallMask, ease: 'power3.out' }, INTRO + E.smallDelay)
    .fromTo(firstImgs[1], { scale: ZOOM_IN }, { scale: 1, duration: E.smallImg, ease: 'power2.out' }, INTRO + E.smallDelay)
    .fromTo(extras[0][0], { autoAlpha: 0, y: RISE.text }, { autoAlpha: 1, y: 0, duration: E.eyebrowDur }, INTRO + E.eyebrowAt);
  const intro = wordDelays(words[0], E.lineDelay);
  words[0].forEach((w, i) =>
    tl.fromTo(w, { yPercent: WORD_HIDDEN }, { yPercent: 0, duration: E.wordsDur, ease: 'power3.out' }, wordsAt + intro.delays[i]),
  );
  tl.fromTo(
    extras[0][1],
    { autoAlpha: 0, y: RISE.text },
    { autoAlpha: 1, y: 0, duration: E.buttonDur, ease: 'power3.out' },
    wordsAt + intro.lines * E.lineDelay + E.buttonAfterWords,
  ).fromTo('.progress', { autoAlpha: 0 }, { autoAlpha: 1, duration: S.progressFade, ease: 'none' }, INTRO + S.progressAt);

  // progress line fills across all steps
  tl.fromTo(
    '.fill',
    { clipPath: CLIP.closedX },
    { clipPath: CLIP.open, duration: HOLD_END - (INTRO + S.fillAt), ease: 'none' },
    INTRO + S.fillAt,
  );

  // 3. Step transitions 01→02→03: text swaps, photos cross-fade, shapes morph, counter flips
  for (let i = 0; i < last; i++) {
    const s = FIRST_STEP + i * STEP_GAP;
    const next = i + 1;
    // text
    tl.fromTo(words[i], { yPercent: 0 }, { yPercent: -WORD_HIDDEN, duration: STEP.wordsOut, stagger: STEP.wordsOutStagger, ease: 'power2.in' }, s)
      .fromTo(extras[i], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -RISE.count, duration: STEP.extrasOut }, s)
      .fromTo(steps[i], { autoAlpha: 1 }, { autoAlpha: 0, duration: INSTANT }, s + STEP.hideAt)
      .fromTo(steps[next], { autoAlpha: 0 }, { autoAlpha: 1, duration: INSTANT }, s + STEP.showAt)
      .fromTo(words[next], { yPercent: WORD_HIDDEN }, { yPercent: 0, duration: STEP.wordsIn, stagger: STEP.wordsInStagger, ease: 'power3.out' }, s + STEP.wordsInAt)
      .fromTo(extras[next], { autoAlpha: 0, y: RISE.text }, { autoAlpha: 1, y: 0, duration: STEP.extrasIn, stagger: STEP.extrasInStagger }, s + STEP.extrasInAt);
    // photos
    const arriving = STEP.duration - STEP.layerShorter;
    [bigLayers, smallLayers].forEach((layers) => {
      tl.fromTo(layers[i], { autoAlpha: 1 }, { autoAlpha: 0, duration: STEP.layerOut, ease: 'power1.inOut' }, s)
        .fromTo(layers[next], { autoAlpha: 0, scale: LAYER_ZOOM_IN }, { autoAlpha: 1, scale: 1, duration: arriving, ease: 'power2.out' }, s);
    });
    tl.fromTo(bigPath, { attr: { d: bigShapes[i] } }, { attr: { d: bigShapes[next] }, duration: arriving, ease: SHAPE_EASE }, s)
      .fromTo(smallPath, { attr: { d: smallShapes[i] } }, { attr: { d: smallShapes[next] }, duration: arriving, ease: SHAPE_EASE }, s);
    // layout swap: photos glide left (or back right), the new text appears on the opposite side
    const toOdd = next % 2 === 1;
    // the photo in front travels first, so at the halfway point the two have a gap between them —
    // that is when their layers trade places, where it can't be seen
    const glide = { duration: STEP.duration, ease: SHAPE_EASE };
    tl.fromTo(bigShape, LAYOUT.big[i], { ...LAYOUT.big[next], ...glide }, s + (toOdd ? S.lead : 0))
      .fromTo(smallShape, LAYOUT.small[i], { ...LAYOUT.small[next], ...glide }, s + (toOdd ? 0 : S.lead))
      .fromTo(progressEl, { x: () => (toOdd ? 0 : textShift()) }, { x: () => (toOdd ? textShift() : 0), ...glide }, s);
    // the smaller photo always lies on top: layers trade places once the two are about the same size
    tl.set(bigShape, { zIndex: toOdd ? 3 : 1 }, s + S.lead / 2 + STEP.duration / 2);
    // counter
    tl.fromTo(nums[i], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -RISE.count, duration: STEP.countOut }, s)
      .fromTo(nums[next], { autoAlpha: 0, y: RISE.count }, { autoAlpha: 1, y: 0, duration: STEP.countIn }, s + STEP.countInAt);
  }

  // The timeline simply holds on step 03 for the last screen of the pin — that is where the next section
  // slides over the stage (it has margin-top: -100vh, see ScrollExpand). The parallax below is tied 1:1 to
  // that section's position (no scrub lag), so the stage drifts up and dims exactly as it is being covered.
  tl.set({}, {}, total);

  if (next) {
    gsap
      .timeline({ scrollTrigger: { trigger: next, start: 'top bottom', end: 'top top', scrub: true } })
      .fromTo(story, { y: 0 }, { y: -window.innerHeight * S.coverParallax.story, ease: 'none' }, 0)
      .fromTo('.stage-dim', { opacity: 0 }, { opacity: S.coverParallax.dim, ease: 'none' }, 0);
  }

  return () => ScrollTrigger.removeEventListener('refreshInit', onRefreshInit);
}
