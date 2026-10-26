// Every tunable number of the scroll sequences, in one place. Times are in timeline seconds (one unit of a
// scrubbed timeline is "one beat" of scrolling), distances in px / vw / screens as named.

// ---- shared ----------------------------------------------------------------------------------------------------------
export const MEDIA = {
  laptop: '(min-width: 1024px) and (prefers-reduced-motion: no-preference)',
  phone: '(max-width: 1023px) and (prefers-reduced-motion: no-preference)',
};
export const CLIP = {
  open: 'inset(0% 0% 0% 0%)',
  closedX: 'inset(0% 100% 0% 0%)', // opens from the left towards the right
  closedY: 'inset(100% 0% 0% 0%)', // opens from the bottom upwards
};
export const WORD_HIDDEN = 115; // yPercent of a heading word waiting below (or gone above) its mask
export const RISE = { text: 16, block: 24, card: 28, count: 12, leave: 40 }; // px things travel while fading in or out
export const ZOOM_IN = 1.3; // scale a photo starts at before it settles to 1
export const LAYER_ZOOM_IN = 1.12; // same, for a layer arriving in a step transition
export const LEAVE = { duration: 0.9, ease: 'power2.in' }; // the hero's opening text going away
export const SMOOTH_WHEEL = { duration: 2, wheelMultiplier: 0.85 }; // Lenis: how long one wheel notch glides, and how far

// ---- story stage: the timeline layout shared by the laptop and the phone versions -----------------------------------------
export const PX_PER_SEC = 520; // higher = the whole sequence is spread over more scrolling (slower)
export const ZOOM = 2.4; // zoom into the eye
export const WASH = 1.7; // cream wash starts (ends with the zoom)
export const INTRO = ZOOM + 0.25; // photos + text enter only once the screen is fully cream — never over the eye, in either direction
export const FIRST_STEP = 4.2; // when step 01 → 02 starts
export const STEP_GAP = 2.4; // distance between transitions
export const STEP_DUR = 1.6;
export const HOLD_END = 9; // step 03 stays until here; the last screen of the pin is the next section covering it

// ---- story stage on laptops ------------------------------------------------------------------------------------------
export const STAGE_DESKTOP = {
  scrub: 1, // how long the animation trails behind the scroll position
  navHeight: 122, // px reserved at the top for the nav pill
  bottomPad: 28, // px kept free at the bottom
  textShift: 0.51, // share of the width the text and the progress line travel between the even and the odd layout
  diveScale: 7,
  diveEase: 'power3.inOut',
  washEase: 'power1.in',
  nextOverlap: '-100vh', // the section after the stage starts one screen early and slides over it
  coverParallax: { story: 0.22, dim: 0.5 }, // while it is covered: share of a screen the story drifts up, final dim opacity
  fillAt: 1.5, // after INTRO
  progressAt: 0.9, // after INTRO
  progressFade: 0.8,
  lead: 0.25, // the photo in front travels first, so the two never overlap while they trade places
  // entrance, relative to INTRO
  entrance: {
    bigMask: 1.4,
    bigImg: 2.2,
    smallDelay: 0.15,
    smallMask: 1.3,
    smallImg: 2,
    eyebrowAt: 0.05,
    eyebrowDur: 0.8,
    wordsAt: 0.12,
    wordsDur: 0.9,
    lineDelay: 0.14,
    buttonAfterWords: 0.35,
    buttonDur: 0.8,
  },
};
// Photo boxes per layout: left/width in vw, top/height as a fraction of the free height. The two photos swap roles:
// one grows while the other shrinks, and they trade places. [left, top, width, height] for steps 01, 02, 03.
export const BOXES_DESKTOP = {
  big: [[65, 0, 32, 1], [27, 0, 15, 0.46], [58, 0.1, 38, 0.88]],
  small: [[46.5, 0.54, 16.5, 0.46], [3, 0.2, 28, 0.78], [45.5, 0.04, 16.5, 0.44]],
};

// ---- story stage on phones -------------------------------------------------------------------------------------------
export const STAGE_PHONE = {
  scrubHero: 0.7,
  scrubStory: 0.7, // the animation eases towards the finger: how far you scroll is how far the story goes
  pinScreens: 3, // screens of swiping: the dive takes the first part, the entrance of the story the rest
  enterAfterZoom: 0.1, // the story is shown once the screen is fully cream
  entranceLength: 1.55, // the hero timeline ends right after the entrance (the last bit of an ease-out is not visible)
  storyScreens: 3.2, // screens of swiping the three steps take: about a screen per step
  eyeFallbackWidth: 0.12, // share of the screen width, when the hero could not measure the eye
  eyeFill: 0.9, // the eye should fill this much of the short side of the screen
  scaleMin: 3.5,
  scaleMax: 8,
  storyZ: 2,
  first: 0.15, // the first transition starts almost at once: no stretch of scrolling where nothing happens
  gap: 1.8,
  duration: 1.4,
  settled: 1.9, // after this many time units a step's words and button are all in place
  endPad: 0.15,
  leadBig: 0.12, // the photo in front travels first
  // left edge of each photo per step, as a share of the width (sizes and tops are plain CSS in svh units)
  left: { big: [0.34, 0.04, 0.34], small: [0.04, 0.59, 0.04] },
  entrance: {
    showDur: 0.01,
    bigMask: 1.1,
    bigImg: 1.6,
    smallDelay: 0.12,
    smallMask: 1,
    smallImg: 1.5,
    eyebrowAt: 0.1,
    eyebrowDur: 0.6,
    wordsAt: 0.2,
    wordsDur: 0.8,
    wordsStagger: 0.03,
    buttonAt: 0.9,
    buttonDur: 0.6,
    progressAt: 0.8,
    progressDur: 0.6,
  },
};

// How a step hands over to the next one. Offsets are from the start of the transition; same keys on both devices.
export interface StepTiming {
  duration: number;
  wordsOut: number;
  wordsOutStagger: number;
  extrasOut: number;
  hideAt: number; // the old step is hidden
  showAt: number; // the new step is shown
  wordsInAt: number;
  wordsIn: number;
  wordsInStagger: number;
  extrasInAt: number;
  extrasIn: number;
  extrasInStagger: number;
  layerOut: number;
  layerShorter: number; // the incoming layer and the morph run this much shorter than the transition
  countOut: number;
  countIn: number;
  countInAt: number;
}
export const STEP_DESKTOP: StepTiming = {
  duration: STEP_DUR,
  wordsOut: 0.5,
  wordsOutStagger: 0.015,
  extrasOut: 0.35,
  hideAt: 0.6,
  showAt: 0.05,
  wordsInAt: 1,
  wordsIn: 0.9,
  wordsInStagger: 0.04,
  extrasInAt: 1.5,
  extrasIn: 0.8,
  extrasInStagger: 0.1,
  layerOut: 0.9,
  layerShorter: 0.3,
  countOut: 0.4,
  countIn: 0.5,
  countInAt: 0.2,
};
export const STEP_PHONE: StepTiming = {
  duration: STAGE_PHONE.duration,
  wordsOut: 0.5,
  wordsOutStagger: 0.012,
  extrasOut: 0.35,
  hideAt: 0.55,
  showAt: 0.05,
  wordsInAt: 0.7,
  wordsIn: 0.8,
  wordsInStagger: 0.03,
  extrasInAt: 1.1,
  extrasIn: 0.7,
  extrasInStagger: 0.1,
  layerOut: 0.8,
  layerShorter: 0.2,
  countOut: 0.4,
  countIn: 0.5,
  countInAt: 0.2,
};
export const SHAPE_EASE = 'power3.inOut';
export const INSTANT = 0.01; // a visibility flip: effectively instant, but still part of a timeline

// ---- cats row (chapter 4) --------------------------------------------------------------------------------------------
export const CATS = {
  smooth: 1.2, // scrub lag on laptops: same "cinematic" feel as the stage before it
  hold: 0.5, // screens of scrolling spent resting on the calendar, so it can't be skimmed past
  arrivalExit: { stage: 0.18, dim: 0.7 }, // the photo behind the arriving sheet: share of a screen it drifts up, final dim
  photoDrift: 7, // % the photos drift against their card while the row slides
  firstShare: 0.55, // share of the arrival after which the cats already on screen play
  visibleAtStart: 0.98, // a card counts as on screen when its left edge is left of this share of the width
  laterStart: 'left 92%',
  calendarStart: 'left 80%',
  card: { mask: 1.3, img: 2, textAt: 0.5, text: 0.8, textStagger: 0.1 },
  intro: { dur: 0.9, stagger: 0.12 },
  firstCards: { at: 0.25, step: 0.22 },
  calendar: {
    head: { dur: 0.9, stagger: 0.12 },
    months: { at: 0.3, dur: 0.9, stagger: 0.1 },
    foot: { at: 0.9, dur: 0.8, stagger: 0.12 },
    line: { dur: 1.5, step: 0.5 }, // the month lines draw one after another while the pin holds
  },
};
export const CATS_PHONE = {
  screensPerCat: 0.75, // screens of swiping per cat
  scrub: 0.6,
  photoScale: 1.12, // the photos are simply there (no mask, no zoom)
  drift: 5, // % the photo drifts against its card
  driftSpan: 2, // in screens
  snap: { duration: { min: 0.15, max: 0.45 }, delay: 0.12, ease: 'power2.inOut' },
  calendarStart: 'top 80%',
  calendar: {
    head: { dur: 0.8, stagger: 0.1 },
    months: { at: 0.25, dur: 0.8, stagger: 0.08 },
    lines: { at: 0.4, dur: 1.2, stagger: 0.08, ease: 'power3.inOut' },
    foot: { at: 0.9, dur: 0.7, stagger: 0.1 },
  },
};

// ---- photo corridor --------------------------------------------------------------------------------------------------
// Phones and tablets show the seven strongest photos: six screens of swiping would be too many on a phone.
export const CORRIDOR_PHONE_KEEP = [0, 1, 3, 4, 5, 6, 9];
export const CORRIDOR_SPACING = 600; // depth between photos, in px
export const CORRIDOR_LEAD = 2;
export const CORRIDOR_PX_PER_STEP = { laptop: 560, phone: 400 }; // page scroll per photo

// ---- expanding photo -------------------------------------------------------------------------------------------------
export const EXPAND_PHONE_BOX_WIDTH = 0.74; // phone start square: share of the width (also capped at half the visible height)

// ---- the cat's eye (where the dive zooms to) when the hero has not measured it yet ---------------------------------------
export const EYE_FALLBACK = {
  laptop: { ox: 37, oy: 48, w: 0 },
  phone: { ox: 40, oy: 40, w: 0 },
};

// ---- hero opening sequence -------------------------------------------------------------------------------------------
export const HERO = {
  maxWait: 1800, // ms: never wait longer than this for the web font and the photo
  fitWidth: 0.94, // the name spans this share of the screen width ...
  fitHeight: 0.12, // ... but is never taller than this share of the hero
  photoFallback: { w: 2000, h: 1334 }, // px, when the photo does not say its own size
  // Where the cat sits, as fractions of the photo: the left eye, and the middle between both eyes
  eye: { x: 0.371, y: 0.442, mid: 0.46 },
  eyeAtHeight: 0.4, // the vertical crop puts the eyes at this share of the hero's height
  eyeWidth: 0.075, // the eye is about this share of the photo's width
  railRise: 14, // px the keyword rail rises while fading in
  mediaZoom: 1.18, // the photo settles from this scale
  timeline: {
    zoom: 2.8,
    chars: { at: 0.45, dur: 1.3, stagger: 0.05 },
    rail: { at: 1.7, dur: 1 },
    nav: { at: 1.2, dur: 1 },
  },
};

// ---- photo corridor: camera, finale and colours ----------------------------------------------------------------------
export const CORRIDOR = {
  colors: { ink: [26, 26, 26], paper: [250, 248, 243], white: [255, 255, 255], black: [0, 0, 0] },
  // Finale, in steps from the first photo (items = number of photos): first the words arrive on the paper, then they
  // turn white as the kittens photo fades in and everything goes dark.
  textIn: [-0.5, 0.2], // relative to items
  darken: [0.7, 1.8],
  endAfter: 2.7,
  ctaFrom: 0.6, // the buttons arrive once this share of the darkening is done
  ctaPad: 0.2,
  interactiveAt: 0.6, // text and buttons accept clicks once this visible
  gate: [-1.3, -0.7], // the title leaves first; only then do the photos fade in, so the two never overlap
  intro: { fadeStart: 0.2, fadeEnd: -1.4, grow: 1.5, scale: 0.5 }, // the title fades from -LEAD + fadeStart to fadeEnd, in steps
  rise: { copy: 22, ctas: 14 },
  finale: { zoom: 0.15, scrim: 0.65 },
  // phones: tall, narrow photos that alternate sides; the one nearest the camera grows huge and runs off the edge of the
  // screen while the next one stands small on the other side
  dolly: {
    laptop: { maxWidth: 380, height: 0.42, spread: 1.75, scatter: 0.12, revealRange: 3, passRange: 0.35, passHold: 0 },
    phone: { width: 0.5, height: 0.3, aspectRatio: 0.56, perspective: 900, spread: 0.62, scatter: 0.05, revealRange: 3.6, passRange: 0.8, passHold: 0.15 },
  },
};

// ---- nav pill ---------------------------------------------------------------------------------------------------------
export const NAV_SCROLLED_AT = 40; // px of scrolling after which the glass gets stronger
