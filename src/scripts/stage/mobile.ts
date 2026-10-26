import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initLenis } from '../lenis';
import { bigShapes, smallShapes } from './shapes';
import { splitWords } from './text';
import { stickIn, unstick } from './sticky';
import { ZOOM, WASH } from './config';

gsap.registerPlugin(ScrollTrigger);

/** Phones and tablets: the hero is pinned (CSS sticky) with the story's entrance, then the story's three steps. */
export function initMobile() {
  // ---- tablets and phones --------------------------------------------------------------------------
  // The story's pinned layout is made for wide screens, so below 1024px only the HERO is pinned: its whole
  // sequence stays (the dive into the eye, the cream wash, the opening text leaving) and then hands over to the
  // normal, stacked story. The wash ends on the page colour, so the hand-over has no seam.
  const small = gsap.matchMedia();
  small.add('(max-width: 1023px) and (prefers-reduced-motion: no-preference)', () => {
    initLenis();
    const hero = document.getElementById('hero')!;
    const heroImg = hero.querySelector<HTMLElement>('.hero-img')!;
    const fade = hero.querySelector<HTMLElement>('.hero-fade')!;
    const storyEl = document.getElementById('story')!;
    // One pin for the dive AND the story's entrance. The story is pinned in the very same place from the start (hidden under
    // the zoom), so it never travels in from below: the cream wash completes, then its content arrives where it stands.
    const PIN = 3; // screens of swiping: the dive takes the first part, the entrance of the story the rest
    const ENTER_AT = ZOOM + 0.1; // the story is shown once the screen is fully cream
    const TOTAL = ENTER_AT + 1.55; // ends right after the entrance (the last bit of an ease-out is not visible)
    const heroBox = stickIn(hero, 1 + PIN);
    const eye = () => JSON.parse(heroImg.dataset.eye ?? '{"ox":40,"oy":40,"w":0}') as { ox: number; oy: number; w: number };
    const origin = () => `${eye().ox}% ${eye().oy}%`;
    // the eye should end up filling most of the short side of the screen (7 on a laptop; a phone needs less)
    const scale = () => {
      const w = eye().w || window.innerWidth * 0.12;
      return Math.min(8, Math.max(3.5, (0.9 * Math.min(window.innerWidth, window.innerHeight)) / w));
    };

    const tl = gsap.timeline({
      defaults: { immediateRender: false },
      scrollTrigger: {
        trigger: heroBox,
        start: 'top top',
        end: () => `+=${heroBox.offsetHeight - hero.offsetHeight}`,
        invalidateOnRefresh: true,
        scrub: 0.7,
      },
    });
    tl.fromTo(
      heroImg,
      { scale: 1, xPercent: 0, yPercent: 0, transformOrigin: origin },
      { scale, xPercent: () => 50 - eye().ox, yPercent: () => 50 - eye().oy, transformOrigin: origin, duration: ZOOM, ease: 'power3.inOut' },
      0,
    )
      .fromTo(fade, { opacity: 0 }, { opacity: 1, duration: ZOOM - WASH, ease: 'power1.in' }, WASH)
      .fromTo('.hero-content', { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -40, duration: 0.9, ease: 'power2.in' }, 0);
    tl.set({}, {}, TOTAL); // the dive takes the first part of the pin; the entrance of the story the rest

    // the story is pinned in the same place and starts when this pin ends (created in page order; line widths do not
    // matter here, so no waiting for fonts)
    const storyCleanup = buildStoryMobile(storyEl, tl, ENTER_AT, 1 + PIN);
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
  const STORY_SCREENS = 3.2; // screens of swiping the three steps take: about a screen per step, fully controlled by the finger
  // The box starts where the hero's box starts (negative margin = the hero's height) and reaches to the end of the story,
  // so the sticky story is stuck in place for the whole time and is simply revealed after the dive.
  const storyBox = stickIn(story, overlap + STORY_SCREENS);
  storyBox.style.marginTop = `calc(-100lvh * ${overlap})`;
  storyBox.style.zIndex = '2';
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
  const LAYOUT = {
    big: [0.34, 0.04, 0.34].map((l) => ({ left: () => l * window.innerWidth })),
    small: [0.04, 0.59, 0.04].map((l) => ({ left: () => l * window.innerWidth })),
  };
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
  gsap.set(words.flat(), { yPercent: 115 });
  gsap.set(extras.flat(), { autoAlpha: 0, y: 16 });
  gsap.set([bigLayers.slice(1), smallLayers.slice(1)], { autoAlpha: 0 });
  gsap.set(bigLayers[0], { clipPath: 'inset(0% 100% 0% 0%)' });
  gsap.set(smallLayers[0], { clipPath: 'inset(100% 0% 0% 0%)' });
  gsap.set(firstImgs, { scale: 1.3 });
  gsap.set(nums.slice(1), { autoAlpha: 0, y: 12 });
  gsap.set(progressEl, { autoAlpha: 0 });
  gsap.set('.fill', { clipPath: 'inset(0% 100% 0% 0%)' });

  // the entrance, as on a laptop: photo masks open while the images settle, the words rise, then the button and the progress line
  heroTl
    .fromTo(story, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, enterAt)
    .fromTo(bigLayers[0], { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'power3.out' }, enterAt)
    .fromTo(firstImgs[0], { scale: 1.3 }, { scale: 1, duration: 1.6, ease: 'power2.out' }, enterAt)
    .fromTo(smallLayers[0], { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1, ease: 'power3.out' }, enterAt + 0.12)
    .fromTo(firstImgs[1], { scale: 1.3 }, { scale: 1, duration: 1.5, ease: 'power2.out' }, enterAt + 0.12)
    .fromTo(extras[0][0], { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out' }, enterAt + 0.1)
    .fromTo(words[0], { yPercent: 115 }, { yPercent: 0, duration: 0.8, stagger: 0.03, ease: 'power3.out' }, enterAt + 0.2)
    .fromTo(extras[0][1], { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out' }, enterAt + 0.9)
    .fromTo(progressEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'none' }, enterAt + 0.8);

  const FIRST = 0.15; // the first transition starts almost at once: no stretch of scrolling where nothing happens
  const GAP = 1.8;
  const DUR = 1.4;
  const SETTLED = 1.9; // after this many time units a step's words and button are all in place
  // `last` steps means `last` transitions, the last one starting at FIRST + GAP * (last - 1); the timeline ends right after it settles
  const END = FIRST + GAP * (last - 1) + SETTLED + 0.15;
  const tl = gsap.timeline({
    defaults: { immediateRender: false },
    scrollTrigger: {
      trigger: storyBox,
      start: () => heroTl.scrollTrigger!.end, // the steps begin where the hero's pin ends
      end: 'bottom bottom', // the sticky story lets go at the bottom of its box
      invalidateOnRefresh: true,
      scrub: 0.7, // the animation eases towards the finger: how far you scroll is how far the story goes
    },
  });
  tl.fromTo('.fill', { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: END - FIRST, ease: 'none' }, FIRST);

  for (let i = 0; i < last; i++) {
    const s = FIRST + i * GAP;
    const n = i + 1;
    tl.fromTo(words[i], { yPercent: 0 }, { yPercent: -115, duration: 0.5, stagger: 0.012, ease: 'power2.in' }, s)
      .fromTo(extras[i], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -12, duration: 0.35 }, s)
      .fromTo(steps[i], { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.01 }, s + 0.55)
      .fromTo(steps[n], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, s + 0.05)
      .fromTo(words[n], { yPercent: 115 }, { yPercent: 0, duration: 0.8, stagger: 0.03, ease: 'power3.out' }, s + 0.7)
      .fromTo(extras[n], { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.1 }, s + 1.1);
    [bigLayers, smallLayers].forEach((layers) => {
      tl.fromTo(layers[i], { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.8, ease: 'power1.inOut' }, s)
        .fromTo(layers[n], { autoAlpha: 0, scale: 1.12 }, { autoAlpha: 1, scale: 1, duration: DUR - 0.2, ease: 'power2.out' }, s);
    });
    tl.fromTo(bigPath, { attr: { d: bigShapes[i] } }, { attr: { d: bigShapes[n] }, duration: DUR - 0.2, ease: 'power3.inOut' }, s)
      .fromTo(smallPath, { attr: { d: smallShapes[i] } }, { attr: { d: smallShapes[n] }, duration: DUR - 0.2, ease: 'power3.inOut' }, s)
      // the photos glide to the opposite sides (the one in front first)
      .fromTo(bigShape, LAYOUT.big[i], { ...LAYOUT.big[n], duration: DUR, ease: 'power3.inOut' }, s + 0.12)
      .fromTo(smallShape, LAYOUT.small[i], { ...LAYOUT.small[n], duration: DUR, ease: 'power3.inOut' }, s)
      .fromTo(nums[i], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -12, duration: 0.4 }, s)
      .fromTo(nums[n], { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5 }, s + 0.2);
  }
  tl.set({}, {}, END); // the last step rests before the page moves on

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

