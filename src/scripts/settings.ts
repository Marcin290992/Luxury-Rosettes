// Every tunable number of the scroll sequences, in one place. Times are in timeline seconds (one unit of a
// scrubbed timeline is "one beat" of scrolling), distances in px / vw / screens as named.

// TEMPORARY: false = the WebGL scenes (awards spiral) are off and their plain fallbacks show. Used to test whether
// WebGL causes the flicker at the start of the page transition on iPhone. Set back to true to turn them on.
export const WEBGL_ENABLED = true;

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
export const SMOOTH_WHEEL = { duration: 2.4, wheelMultiplier: 0.4 }; // Lenis: how long one wheel notch glides, and how far (shorter and less far = more control; longer = a heavier page)
// the same weight for a finger (phones, tablets): Lenis follows the finger with this much lag. Lower = heavier (its default is 0.075); touchMultiplier < 1 = the page moves less than the finger
export const SMOOTH_TOUCH = { syncTouch: true, syncTouchLerp: 0.05, touchMultiplier: 0.8 };

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
  hold: 0.5, // screens of scrolling spent resting on the last cat, so the row doesn't end abruptly
  arrivalExit: { stage: 0.18, dim: 0.7 }, // the photo behind the arriving sheet: share of a screen it drifts up, final dim
  photoDrift: 7, // % the photos drift against their card while the row slides
  firstShare: 0.55, // share of the arrival after which the cats already on screen play
  visibleAtStart: 0.98, // a card counts as on screen when its left edge is left of this share of the width
  laterStart: 'left 92%',
  card: { mask: 2.2, img: 3.2, textAt: 0.9, text: 0.8, textStagger: 0.1 },
  intro: { dur: 0.9, stagger: 0.12 },
  firstCards: { at: 0.25, step: 0.22 },
  finaleStart: 'left 80%',
  // the closing panel: heading, then the three pillars, then the buttons; the lines draw while the pin holds
  finale: {
    head: { dur: 0.9, stagger: 0.12 },
    pillars: { at: 0.3, dur: 0.9, stagger: 0.15 },
    foot: { at: 1, dur: 0.8, stagger: 0.12 },
    line: { dur: 1.5, step: 0.5 },
  },
};
export const CATS_PHONE = {
  screensPerCat: 0.75, // screens of swiping per cat
  endHold: 0.5, // screens of swiping the last cat rests for, so the page cannot be flung past it
  scrub: 0.6, // the row follows the finger; no snapping, which tugs the scroll while the finger is still moving
  photoScale: 1.12, // the photos are simply there (no mask, no zoom)
  drift: 5, // % the photo drifts against its card
  driftSpan: 2, // in screens
  finaleStart: 'top 80%',
  finale: {
    head: { dur: 0.8, stagger: 0.1 },
    pillars: { at: 0.25, dur: 0.8, stagger: 0.12 },
    lines: { at: 0.4, dur: 1.2, stagger: 0.15, ease: 'power3.inOut' },
    foot: { at: 1, dur: 0.7, stagger: 0.1 },
  },
};

// ---- photo corridor --------------------------------------------------------------------------------------------------
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

// ---- scroll stack (the "Before you decide" steps: cards that arrive over each other) -----------------------------------------
export const SCROLL_STACK = {
  variant: 'stack' as const, // 'stack' | 'deck' | 'fade' | 'flip' | 'zoom' | 'reveal': 'stack' slides each card up from the bottom over the last ('reveal' opens it in place with a clip-path, which looks like it morphs)
  scrollLength: 1, // screens of scrolling given to each card
  peek: 26, // px a covered card slides up so its edge shows above the next one
  scaleStep: 0.07, // how much a covered card shrinks per step
  blur: 3, // px, covered cards
  dim: 0.3, // how far covered cards darken
  smooth: 0.16, // 0 = follows the scroll exactly, 1 = very loose
  depth: 3, // covered cards kept painted behind the front one
  borderRadius: 18, // px
  perspective: 1400, // px, for the turning variants
};

// ---- tile reveal (photo tiles fly in, the grid zooms past the camera, the tiles part and leave the headline) -----------
// Ported from React Bits' TileReveal; the numbers are its props. The timeline is in "units": one unit is the flight of
// one tile (stagger and overlap are shares of a unit), the whole thing is scrubbed by the scroll position.
export const TILE_REVEAL = {
  columns: 3,
  gap: 20, // px between tiles
  gridWidth: 760, // max width of the grid before it zooms (px)
  tileAspect: 0.8, // width / height of a tile
  direction: 'alternate' as 'alternate' | 'top' | 'bottom', // which side the tiles of each column fly in from
  stagger: 0.12, // delay between tiles of a column
  overlap: 0.6, // how much of the last flight the zoom overlaps
  zoom: 2.4, // how big the grid grows before the tiles part
  spread: 0.4, // minimum travel of a tile when it steps aside (share of its own size)
  scrollLength: 2, // screens of scrolling the whole sequence takes
  smooth: 0.18, // seconds the picture takes to catch up with the scroll
  contentGap: 28, // px between the headline and the text under it
};

// ---- line reveal (headings and paragraphs: each line rises out of a mask as it scrolls into view) -------------------------
export const LINE_REVEAL = {
  start: 'top 88%', // the line starts when the text is this far up the screen
  duration: 1.1, // s
  stagger: 0.09, // s between lines
  ease: 'power3.out',
};

// ---- preloader (every real load of the home page: a counter, a frame of cycling photos that opens to the hero) --------
export const PRELOADER = {
  words: ['Bengal', 'Rosettes', 'Champion', 'Family', 'Home'], // the line that changes while it counts
  waitMax: 2.5, // s the longest it waits (dark) for the fonts and the first photos before it shows itself anyway
  fadeIn: 1.2, // s the dark takes to clear and the words and the frame take to come in, before the count starts
  count: 2.2, // s the counter and the photos take
  holdBefore: 0.25, // s between the end of the count and the frame opening
  open: 1.1, // s the frame takes to grow to the full screen
  fade: 0.6, // s the preloader takes to melt away over the hero
  rounds: 1.5, // how many times the photos go round while counting
  frame: { width: 240, height: 300 }, // px, the small frame
};

// ---- shrink intro (a pinned hero scrubbed by the scroll: the headline leaves, the words light up, the photo shrinks to a tile, the photos drift) ---
// After the Codegrid "Waabi Scroll Animation". The pinned part is `length` screens long; the other numbers are places on it (0..1).
export const SHRINK_INTRO = {
  length: 3.5, // screens of scrolling the pinned part takes
  overlap: 0.75, // screens of the pinned part during which the next section is already rising under it
  headerEnd: 0.29, // the headline has left the screen by here
  words: [0.29, 0.5], // the second line lights up word by word between these
  copyHideAt: 0.64, // and goes out here (over `copyFade`)
  copyFade: 0.04,
  shrink: [0.71, 1], // the photo shrinks to its tile between these
  tile: { wide: 150, narrow: 100 }, // px, the side of the tile
  radius: 10, // px, the rounding the tile ends with
  scrub: 1, // seconds the picture takes to catch up with the scroll
  // the four columns of photos: where each starts and ends (px), so they drift at different speeds
  columns: [
    { x: 0, from: 1000, to: -500 },
    { x: -225, from: 500, to: -250 },
    { x: 225, from: 500, to: -250 },
    { x: 0, from: 1000, to: -500 },
  ],
};

// ---- award orbit (the awards on a ring that turns; the front one is shown big in the middle with its words under it) -----------
// After the Codegrid "3D Orbit Slider". The sizes are for a screen 900px high and are scaled with the height of the real one.
export const AWARD_ORBIT = {
  radius: 400, // px, of the ring
  panel: { width: 100, height: 125 }, // px, of a photo on the ring
  preview: { width: 250, height: 325 }, // px, of the big one in the middle
  perspective: 2000, // px
  centre: 44, // % of the screen height at which the middle of the ring is (the words go under it)
  maxTilt: 14, // degrees the whole scene leans towards the pointer
  tiltSmoothing: 0.05,
  smoothing: 0.06, // how much of the way to the target the ring covers each frame (lower = softer, heavier)
  wheelSensitivity: 0.005, // photos per unit of wheel (100 = half a photo, which already counts as one: a notch is a photo)
  touchSensitivity: 0.0075, // photos per px of a swipe
  maxWheelDelta: 200, // a single wheel event counts for no more than this
  snapDelay: 250, // ms without input after which the ring settles on a photo
  swapThreshold: 0.5, // how far past a photo (0..1) the ring has to be turned to go on to the next one, not back
  textFade: 2.2, // how fast the words of a photo fade as the ring turns away from it (higher = faster)
  exit: 0.6, // screens of scrolling left after the last award (and before the first) before the page moves on
  intro: {
    // the photos come in one behind the other along a ribbon that sweeps through the screen (after the trionn.com "Design in motion"),
    // big and tilted, and as they reach the end of it they draw together into the ring and shrink to its size
    duration: 3.8, // s, the whole of it
    spread: 0.05, // share of that time between one photo's start and the next one's
    ease: 'power2.inOut', // of a photo along the ribbon
    startAt: 'top 40%', // when the section is this far up the screen the photos come in
    ribbon: {
      x: 1000, // px: the ribbon runs from this far right of the middle to this far left
      y: 380, // px: from this far below the middle to this far above it
      bow: 170, // px: how far the ribbon swings out of that straight line
      z: 520, // px: how far it comes towards you in the middle of its run
      zBase: -200, // px: where it is at its ends (negative = far)
      tilt: 35, // degrees the photos are turned along the ribbon
      roll: 14, // degrees they lean
      lift: 1.5, // how much bigger than on the ring they are on the ribbon (1.5 = 2.5 times)
    },
    gather: [0.6, 1], // the part of a photo's run in which it leaves the ribbon and closes into the ring
  },
};

// ---- awards list (the awards as a spotlight: the counter goes down, the photos go up, the names roll, the words of the front one change) ---
// After the Codegrid "PrototypeStudio Scroll Animation". The pinned part is `length` screens long.
export const AWARDS_LIST = {
  length: 5, // screens of scrolling the whole list takes
  dim: 0.35, // opacity of a photo that is not the one at the middle of the screen
  detailFade: 2.2, // how fast the words of an award fade as the list moves on from it (higher = faster)
  detailShift: 24, // px the words of an award travel while they come in and go out
  scrub: 1, // seconds the picture takes to catch up with the scroll
  enterAt: 'top 70%', // when the section is this far up the screen everything arrives
};

// ---- FAQ chat (each question and answer is a bubble: a dot with typing dots that opens into the message) --------------
export const FAQ_CHAT = {
  dot: 56, // px: the size of the bubble while it is still a dot
  popAt: 'top 88%', // the dot pops in when the bubble is this far up the screen
  openAt: 'top 78%', // and opens into the message here
  pop: 0.35, // s
  fade: 0.2, // s the typing dots take to fade
  widen: 0.5, // s the bubble takes to widen
  heighten: 0.45, // s and to grow tall
  text: 0.35, // s each paragraph takes to appear
  textStagger: 0.08,
};

// ---- nav pill ---------------------------------------------------------------------------------------------------------
export const NAV_SCROLLED_AT = 40; // px of scrolling after which the glass gets stronger

// ---- awards spiral (the intro of the awards page: photos ride a spiral ribbon, then fly into a grid, then stripes cover the screen) ----
export const AWARDS_SPIRAL = {
  spinScreens: 5, // screens of scrolling the spiral takes
  exitScreens: 1.5, // screens the stripes take to cover the scene
  hover: 1.12, // how much a photo grows under the mouse
  grid: [0, 1, 4, 2, 7, 6], // which of the photos (counted from 0) land in the grid at the end
  stripes: 5, // stripes that cover the scene at the end
};
