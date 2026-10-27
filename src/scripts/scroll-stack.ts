// A stack of cards pinned to the screen: scrolling moves through them, the next card arriving over the last.
//
// Adapted from React Bits' ScrollStack to Vanilla TS for this site (see docs/SCRIPTING.md, section 3):
//  - no React: initScrollStack(root, options) is `init` and returns `destroy`,
//  - every element is looked up inside `root` (.stack-pin, .stack-frame, .stack-slot, .stack-fill),
//  - named listeners, all removed in destroy(); the observer is disconnected; the animation frame is cancelled,
//  - the card face is plain markup (the Astro component renders it), so the React-only parts (custom children, item
//    props, the counter state) are gone. The six variants of the original are kept.
//
// How it works: the section is taller than the screen (one screen plus `scrollLength` screens per extra card) and its
// .stack-pin sticks while the section scrolls past. Scroll position gives a fractional "progress" through the cards (0 = the
// first is in front, 1 = the second, ...); every card is posed from `progress - its index`. The shown value follows the real
// one with a little damping, in a requestAnimationFrame loop that goes to sleep when it has caught up.

export type StackVariant = 'stack' | 'deck' | 'fade' | 'flip' | 'zoom' | 'reveal';

export interface StackOptions {
  variant: StackVariant;
  scrollLength: number; // screens of scrolling given to each card
  peek: number; // px a covered card slides up so its edge peeks out
  scaleStep: number; // how much a covered card shrinks per step
  blur: number; // max blur (px) on covered cards
  dim: number; // how far covered cards darken, 0..1
  smooth: number; // damping of the follow: 0 = instant, 1 = very loose
  depth: number; // how many covered cards stay painted behind the front one
  borderRadius: number; // px
  perspective: number; // px, for the turning variants
}

interface Shot {
  transform: string;
  opacity: number;
  filter: string;
  clip: string;
}

interface Recipe {
  peek: number;
  scaleStep: number;
  blur: number;
  dim: number;
  radius: number;
  enter: number; // how far below the frame a card waits before it arrives, % of its height
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const glide = (t: number) => t * t * (3 - 2 * t);

const shade = (v: number, dim: number, blur: number) => {
  const parts: string[] = [];
  if (blur > 0.01) parts.push(`blur(${(v * blur).toFixed(2)}px)`);
  if (dim > 0.001) parts.push(`brightness(${(1 - v * dim).toFixed(3)})`);
  return parts.length ? parts.join(' ') : 'none';
};

// How a card looks at `offset`: negative = still arriving (-1 = not there yet, 0 = in front), positive = covered by the next
// cards (1 = one card behind).
const pose = (variant: StackVariant, offset: number, index: number, cfg: Recipe): Shot => {
  const full = `inset(0 0 0 0 round ${cfg.radius}px)`;
  const lean = index % 2 === 0 ? 1 : -1;

  if (offset < 0) {
    const u = clamp(offset + 1, 0, 1);
    const e = glide(u);
    switch (variant) {
      case 'fade':
        return { transform: `translate3d(0,0,0) scale(${(1.06 - 0.06 * e).toFixed(4)})`, opacity: e, filter: 'none', clip: full };
      case 'flip':
        return {
          transform: `translate3d(0,${((1 - e) * 26).toFixed(2)}%,0) rotateX(${((1 - e) * -72).toFixed(2)}deg)`,
          opacity: clamp(e * 1.6, 0, 1),
          filter: 'none',
          clip: full,
        };
      case 'zoom':
        return {
          transform: `translate3d(0,0,0) scale(${(0.52 + 0.48 * e).toFixed(4)})`,
          opacity: clamp(e * 1.4, 0, 1),
          filter: cfg.blur > 0.01 ? `blur(${((1 - e) * cfg.blur).toFixed(2)}px)` : 'none',
          clip: full,
        };
      case 'reveal': // the card is already in place and a clip-path opens it from the bottom edge upwards
        return { transform: 'translate3d(0,0,0)', opacity: 1, filter: 'none', clip: `inset(${((1 - u) * 100).toFixed(2)}% 0 0 0 round ${cfg.radius}px)` };
      case 'deck':
        return {
          transform: `translate3d(0,${((1 - u) * (cfg.enter + 6)).toFixed(2)}%,0) rotate(${((1 - e) * 4 * lean).toFixed(2)}deg)`,
          opacity: 1,
          filter: 'none',
          clip: full,
        };
      default:
        return { transform: `translate3d(0,${((1 - u) * cfg.enter).toFixed(2)}%,0)`, opacity: 1, filter: 'none', clip: full };
    }
  }

  const v = offset;
  const e = glide(clamp(v, 0, 1));
  switch (variant) {
    case 'fade':
      return { transform: `translate3d(0,0,0) scale(${(1 - e * 0.06).toFixed(4)})`, opacity: 1 - e, filter: shade(e, cfg.dim, cfg.blur), clip: full };
    case 'flip':
      return {
        transform: `translate3d(0,${(-e * 26).toFixed(2)}%,0) rotateX(${(e * 72).toFixed(2)}deg)`,
        opacity: 1 - e,
        filter: shade(e, cfg.dim, 0),
        clip: full,
      };
    case 'zoom':
      return {
        transform: `translate3d(0,0,0) scale(${(1 + e * 0.42).toFixed(4)})`,
        opacity: 1 - e,
        filter: cfg.blur > 0.01 ? `blur(${(e * cfg.blur * 1.4).toFixed(2)}px)` : 'none',
        clip: full,
      };
    case 'reveal':
      return {
        transform: `translate3d(0,${(-v * cfg.peek * 0.5).toFixed(2)}px,0) scale(${(1 - v * cfg.scaleStep * 0.7).toFixed(4)})`,
        opacity: 1,
        filter: shade(v, cfg.dim, cfg.blur),
        clip: full,
      };
    case 'deck':
      return {
        transform: `translate3d(0,${(-v * cfg.peek * 0.75).toFixed(2)}px,0) rotate(${(v * 4.5 * lean).toFixed(2)}deg) scale(${(1 - v * cfg.scaleStep * 0.85).toFixed(4)})`,
        opacity: 1,
        filter: shade(v, cfg.dim, cfg.blur),
        clip: full,
      };
    default:
      return {
        transform: `translate3d(0,${(-v * cfg.peek).toFixed(2)}px,0) scale(${(1 - v * cfg.scaleStep).toFixed(4)})`,
        opacity: 1,
        filter: shade(v, cfg.dim, cfg.blur),
        clip: full,
      };
  }
};

/** Starts the stack inside `root` (the .stack section). Returns the function that stops it and removes what it added. */
export function initScrollStack(root: HTMLElement, options: StackOptions): () => void {
  const pin = root.querySelector<HTMLElement>('.stack-pin')!;
  const frame = root.querySelector<HTMLElement>('.stack-frame')!;
  const fill = root.querySelector<HTMLElement>('.stack-fill');
  const slots = Array.from(root.querySelectorAll<HTMLElement>('.stack-slot'));
  const count = slots.length;
  const keep = Math.max(1, Math.round(options.depth));
  const ease = clamp(options.smooth, 0, 0.95);

  const recipe: Recipe = {
    peek: Math.max(0, options.peek),
    scaleStep: clamp(options.scaleStep, 0, 0.4),
    blur: Math.max(0, options.blur),
    dim: clamp(options.dim, 0, 1),
    radius: Math.max(0, options.borderRadius),
    enter: 100,
  };

  // the section is one screen plus the scrolling given to every card after the first; the radius is shared with the CSS
  root.style.setProperty('--runway', String(100 + Math.max(0, count - 1) * Math.max(0.2, options.scrollLength) * 100));
  root.style.setProperty('--stack-radius', `${recipe.radius}px`);
  pin.style.perspective = `${Math.max(200, options.perspective)}px`;
  slots.forEach((slot, i) => {
    slot.style.zIndex = String(i);
  });

  let shown = 0;
  let beat = 0;
  let spin = 0;
  let live = false;

  // A card waits just below the screen, out of sight: how far down that is depends on where the frame sits in the pin (it is not
  // always in the middle: there can be a heading above it) and on its height, as a share of the card's own height.
  const readSize = () => {
    const f = frame.getBoundingClientRect();
    const p = pin.getBoundingClientRect();
    recipe.enter = ((p.bottom - f.top) / Math.max(1, f.height)) * 100 + 3;
  };

  // scroll position -> how many cards deep we are (0 .. count - 1)
  const measure = () => {
    if (count < 1) return 0;
    const box = root.getBoundingClientRect();
    const span = box.height - pin.clientHeight;
    if (span <= 0) return 0;
    return clamp(-box.top / span, 0, 1) * (count - 1);
  };

  const paint = (progress: number) => {
    for (let i = 0; i < count; i += 1) {
      const slot = slots[i];
      const offset = progress - i;
      if (offset < -1.0005 || offset > keep) {
        if (slot.style.visibility !== 'hidden') slot.style.visibility = 'hidden';
        continue;
      }
      if (slot.style.visibility === 'hidden') slot.style.visibility = '';
      const shot = pose(options.variant, offset, i, recipe);
      slot.style.transform = shot.transform;
      slot.style.opacity = shot.opacity.toFixed(4);
      slot.style.filter = shot.filter;
      slot.style.clipPath = shot.clip;
    }
    if (fill && count > 1) {
      const ratio = clamp(progress / (count - 1), 0, 1);
      fill.style.clipPath = `inset(0 ${((1 - ratio) * 100).toFixed(2)}% 0 0)`;
    }
    root.dataset.front = String(clamp(Math.round(progress), 0, count - 1));
  };

  const step = (stamp: number) => {
    const last = beat || stamp;
    const delta = Math.min(0.05, Math.max(0, (stamp - last) / 1000));
    beat = stamp;

    const target = measure();
    const pull = ease > 0 ? 1 - Math.pow(1 - ease, delta * 60) : 1;
    shown += (target - shown) * pull;
    paint(shown);

    if (Math.abs(target - shown) > 0.0004) {
      spin = requestAnimationFrame(step);
    } else {
      shown = target;
      paint(target);
      live = false; // caught up: sleep until the next scroll
    }
  };

  const wake = () => {
    if (live) return;
    live = true;
    beat = 0;
    spin = requestAnimationFrame(step);
  };

  const onResize = () => {
    readSize();
    wake();
  };

  readSize();
  shown = measure();
  paint(shown);

  window.addEventListener('scroll', wake, { passive: true });
  window.addEventListener('resize', onResize);
  const observer = new ResizeObserver(onResize);
  observer.observe(root);

  return () => {
    cancelAnimationFrame(spin);
    live = false;
    window.removeEventListener('scroll', wake);
    window.removeEventListener('resize', onResize);
    observer.disconnect();
    slots.forEach((slot) => slot.removeAttribute('style'));
    if (fill) fill.style.clipPath = '';
    pin.style.perspective = '';
    root.style.removeProperty('--runway');
    root.style.removeProperty('--stack-radius');
    delete root.dataset.front;
  };
}
