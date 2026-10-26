import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initLenis } from '../lenis';
import { bigShapes, smallShapes } from './shapes';
import { splitWords } from './text';
import { stickIn, unstick } from './sticky';
import { readEye, originOf } from './eye';
import {
  ZOOM, WASH, STAGE_PHONE as S, STEP_PHONE as STEP, MEDIA, CLIP, WORD_HIDDEN, RISE, ZOOM_IN, LAYER_ZOOM_IN, LEAVE,
  SHAPE_EASE, INSTANT, EYE_FALLBACK,
} from '../settings';

gsap.registerPlugin(ScrollTrigger);

/**
 * Phones and tablets: the hero is pinned (CSS sticky) with the story's entrance, then the story's three steps.
 *
 * The story's pinned layout is made for wide screens, so below 1024px only the HERO is pinned: its whole sequence stays
 * (the dive into the eye, the cream wash, the opening text leaving) and then hands over to the story in a portrait layout.
 * The wash ends on the page colour, so the hand-over has no seam.
 */
export function initMobile() {
  const small = gsap.matchMedia();
  small.add(MEDIA.phone, () => {
    initLenis();
    const hero = document.getElementById('hero')!;
    const heroImg = hero.querySelector<HTMLElement>('.hero-img')!;
    const fade = hero.querySelector<HTMLElement>('.hero-fade')!;
    const storyEl = document.getElementById('story')!;
    // One pin for the dive AND the story's entrance. The story is pinned in the very same place from the start (hidden under
    // the zoom), so it never travels in from below: the cream wash completes, then its content arrives where it stands.
    const enterAt = ZOOM + S.enterAfterZoom;
    const total = enterAt + S.entranceLength;
    const screens = 1 + S.pinScreens;
    const heroBox = stickIn(hero, screens);
    const eye = () => readEye(heroImg, EYE_FALLBACK.phone);
    const origin = () => originOf(eye());
    // the eye should end up filling most of the short side of the screen (a laptop zooms further; a phone needs less)
    const scale = () => {
      const w = eye().w || window.innerWidth * S.eyeFallbackWidth;
      return Math.min(S.scaleMax, Math.max(S.scaleMin, (S.eyeFill * Math.min(window.innerWidth, window.innerHeight)) / w));
    };

    const tl = gsap.timeline({
      defaults: { immediateRender: false },
      scrollTrigger: {
        trigger: heroBox,
        start: 'top top',
        end: () => `+=${heroBox.offsetHeight - hero.offsetHeight}`,
        invalidateOnRefresh: true,
        scrub: S.scrubHero,
      },
    });
    tl.fromTo(
      heroImg,
      { scale: 1, xPercent: 0, yPercent: 0, transformOrigin: origin },
      { scale, xPercent: () => 50 - eye().ox, yPercent: () => 50 - eye().oy, transformOrigin: origin, duration: ZOOM, ease: 'power3.inOut' },
      0,
    )
      .fromTo(fade, { opacity: 0 }, { opacity: 1, duration: ZOOM - WASH, ease: 'power1.in' }, WASH)
      .fromTo('.hero-content', { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -RISE.leave, ...LEAVE }, 0);
    tl.set({}, {}, total); // the dive takes the first part of the pin; the entrance of the story the rest

    // the story is pinned in the same place and starts when this pin ends (created in page order; line widths do not
    // matter here, so no waiting for fonts)
    const storyCleanup = buildStoryMobile(storyEl, tl, enterAt, screens);
    document.fonts.ready.then(() => ScrollTrigger.refresh());

    return () => {
      storyCleanup();
      unstick(hero, heroBox);
      tl.scrollTrigger?.kill();
      tl.kill();
      gsap.set([heroImg, fade, hero.querySelector('.hero-content')], { clearProps: 'all' });
    };
  });
}

// ---- the story on tablets and phones (< 1024px) ----------------------------------------------------
// Same three steps as on a laptop, in a portrait layout: two photos on top (in the same morphing shapes; they trade
// sides at every step), the words below, the progress line at the bottom. It is pinned right after the dive into the
// eye; step 01 is already in place while the story rises over the cream, so there is never an empty page.
function buildStoryMobile(story: HTMLElement, heroTl: gsap.core.Timeline, enterAt: number, overlap: number) {
  story.dataset.mobile = '';
  // The box starts where the hero's box starts (negative margin = the hero's height) and reaches to the end of the story,
  // so the sticky story is stuck in place for the whole time and is simply revealed after the dive.
  const storyBox = stickIn(story, overlap + S.storyScreens);
  storyBox.style.marginTop = `calc(-100lvh * ${overlap})`;
  storyBox.style.zIndex = String(S.storyZ);
  const q = <T extends HTMLElement>(sel: string) => gsap.utils.toArray<T>(sel, story);
  const steps = q('.step');
  const bigLayers = q('.big .layer');
  const smallLayers = q('.small .layer');
  const nums = q('.num');
  const bigShape = story.querySelector<HTMLElement>('.big')!;
  const smallShape = story.querySelector<HTMLElement>('.small')!;
  const bigPath = story.querySelector('#clipBig path')!;
  const smallPath = story.querySelector('#clipSmall path')!;
  const words = steps.map((s) => splitWords(s.querySelector<HTMLElement>('.heading')!));
  const extras = steps.map((s) => gsap.utils.toArray<HTMLElement>('.eyebrow, .cta', s));
  const last = steps.length - 1;

  // Sizes and vertical positions of the photos are plain CSS (svh units: they do NOT change when the mobile address
  // bar slides away, so nothing can jump at the first swipe). The only thing that moves is `left`, which depends
  // on the width alone.
  const lefts = (shares: number[]) => shares.map((l) => ({ left: () => l * window.innerWidth }));
  const LAYOUT = { big: lefts(S.left.big), small: lefts(S.left.small) };
  const place = () => {
    gsap.set(bigShape, LAYOUT.big[0]);
    gsap.set(smallShape, LAYOUT.small[0]);
  };
  const onRefreshInit = () => {
    if ('mobile' in story.dataset) place();
  };
  ScrollTrigger.addEventListener('refreshInit', onRefreshInit);

  // the story waits, invisible, under the dive; step 01 is built up in the hero's timeline (below), in place
  const progressEl = story.querySelector<HTMLElement>('.progress')!;
  const firstImgs = [bigLayers[0], smallLayers[0]].map((l) => l.querySelector('img')!);
  bigPath.setAttribute('d', bigShapes[0]);
  smallPath.setAttribute('d', smallShapes[0]);
  place();
  gsap.set(story, { autoAlpha: 0 });
  gsap.set(steps, { autoAlpha: 0 });
  gsap.set(steps[0], { autoAlpha: 1 });
  gsap.set(words.flat(), { yPercent: WORD_HIDDEN });
  gsap.set(extras.flat(), { autoAlpha: 0, y: RISE.text });
  gsap.set([bigLayers.slice(1), smallLayers.slice(1)], { autoAlpha: 0 });
  gsap.set(bigLayers[0], { clipPath: CLIP.closedX });
  gsap.set(smallLayers[0], { clipPath: CLIP.closedY });
  gsap.set(firstImgs, { scale: ZOOM_IN });
  gsap.set(nums.slice(1), { autoAlpha: 0, y: RISE.count });
  gsap.set(progressEl, { autoAlpha: 0 });
  gsap.set('.fill', { clipPath: CLIP.closedX });

  // the entrance, as on a laptop: photo masks open while the images settle, the words rise, then the button and the progress line
  const E = S.entrance;
  heroTl
    .fromTo(story, { autoAlpha: 0 }, { autoAlpha: 1, duration: E.showDur }, enterAt)
    .fromTo(bigLayers[0], { clipPath: CLIP.closedX }, { clipPath: CLIP.open, duration: E.bigMask, ease: 'power3.out' }, enterAt)
    .fromTo(firstImgs[0], { scale: ZOOM_IN }, { scale: 1, duration: E.bigImg, ease: 'power2.out' }, enterAt)
    .fromTo(smallLayers[0], { clipPath: CLIP.closedY }, { clipPath: CLIP.open, duration: E.smallMask, ease: 'power3.out' }, enterAt + E.smallDelay)
    .fromTo(firstImgs[1], { scale: ZOOM_IN }, { scale: 1, duration: E.smallImg, ease: 'power2.out' }, enterAt + E.smallDelay)
    .fromTo(extras[0][0], { autoAlpha: 0, y: RISE.text }, { autoAlpha: 1, y: 0, duration: E.eyebrowDur, ease: 'power3.out' }, enterAt + E.eyebrowAt)
    .fromTo(words[0], { yPercent: WORD_HIDDEN }, { yPercent: 0, duration: E.wordsDur, stagger: E.wordsStagger, ease: 'power3.out' }, enterAt + E.wordsAt)
    .fromTo(extras[0][1], { autoAlpha: 0, y: RISE.text }, { autoAlpha: 1, y: 0, duration: E.buttonDur, ease: 'power3.out' }, enterAt + E.buttonAt)
    .fromTo(progressEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: E.progressDur, ease: 'none' }, enterAt + E.progressAt);

  // `last` steps means `last` transitions, the last one starting at S.first + S.gap * (last - 1); the timeline ends right after it settles
  const end = S.first + S.gap * (last - 1) + S.settled + S.endPad;
  const tl = gsap.timeline({
    defaults: { immediateRender: false },
    scrollTrigger: {
      trigger: storyBox,
      start: () => heroTl.scrollTrigger!.end, // the steps begin where the hero's pin ends
      end: 'bottom bottom', // the sticky story lets go at the bottom of its box
      invalidateOnRefresh: true,
      scrub: S.scrubStory,
    },
  });
  tl.fromTo('.fill', { clipPath: CLIP.closedX }, { clipPath: CLIP.open, duration: end - S.first, ease: 'none' }, S.first);

  const arriving = STEP.duration - STEP.layerShorter;
  for (let i = 0; i < last; i++) {
    const s = S.first + i * S.gap;
    const n = i + 1;
    tl.fromTo(words[i], { yPercent: 0 }, { yPercent: -WORD_HIDDEN, duration: STEP.wordsOut, stagger: STEP.wordsOutStagger, ease: 'power2.in' }, s)
      .fromTo(extras[i], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -RISE.count, duration: STEP.extrasOut }, s)
      .fromTo(steps[i], { autoAlpha: 1 }, { autoAlpha: 0, duration: INSTANT }, s + STEP.hideAt)
      .fromTo(steps[n], { autoAlpha: 0 }, { autoAlpha: 1, duration: INSTANT }, s + STEP.showAt)
      .fromTo(words[n], { yPercent: WORD_HIDDEN }, { yPercent: 0, duration: STEP.wordsIn, stagger: STEP.wordsInStagger, ease: 'power3.out' }, s + STEP.wordsInAt)
      .fromTo(extras[n], { autoAlpha: 0, y: RISE.text }, { autoAlpha: 1, y: 0, duration: STEP.extrasIn, stagger: STEP.extrasInStagger }, s + STEP.extrasInAt);
    [bigLayers, smallLayers].forEach((layers) => {
      tl.fromTo(layers[i], { autoAlpha: 1 }, { autoAlpha: 0, duration: STEP.layerOut, ease: 'power1.inOut' }, s)
        .fromTo(layers[n], { autoAlpha: 0, scale: LAYER_ZOOM_IN }, { autoAlpha: 1, scale: 1, duration: arriving, ease: 'power2.out' }, s);
    });
    const glide = { duration: STEP.duration, ease: SHAPE_EASE };
    tl.fromTo(bigPath, { attr: { d: bigShapes[i] } }, { attr: { d: bigShapes[n] }, duration: arriving, ease: SHAPE_EASE }, s)
      .fromTo(smallPath, { attr: { d: smallShapes[i] } }, { attr: { d: smallShapes[n] }, duration: arriving, ease: SHAPE_EASE }, s)
      // the photos glide to the opposite sides (the one in front first)
      .fromTo(bigShape, LAYOUT.big[i], { ...LAYOUT.big[n], ...glide }, s + S.leadBig)
      .fromTo(smallShape, LAYOUT.small[i], { ...LAYOUT.small[n], ...glide }, s)
      .fromTo(nums[i], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -RISE.count, duration: STEP.countOut }, s)
      .fromTo(nums[n], { autoAlpha: 0, y: RISE.count }, { autoAlpha: 1, y: 0, duration: STEP.countIn }, s + STEP.countInAt);
  }
  tl.set({}, {}, end); // the last step rests before the page moves on

  return () => {
    ScrollTrigger.removeEventListener('refreshInit', onRefreshInit);
    tl.scrollTrigger?.kill();
    tl.kill();
    unstick(story, storyBox);
    delete story.dataset.mobile;
    gsap.set(
      [steps, bigShape, smallShape, bigLayers, smallLayers, nums, words.flat(), extras.flat(), story.querySelector('.fill')],
      { clearProps: 'all' },
    );
  };
}
