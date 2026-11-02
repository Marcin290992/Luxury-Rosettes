// Award orbit: the awards on a ring in 3D that turns, the one that faces you shown big in the middle with the words of its award under
// it. When the section comes up the photos sweep in one behind the other along a ribbon through the screen, then draw together and form the ring. The section is pinned; a scroll
// gesture (wheel, swipe or arrow key) turns the ring by one photo and it settles there; at the first and the last award the gesture is
// not taken: the page moves on. The whole scene leans a little towards the pointer.
//
// Adapted from the Codegrid "3D Orbit Slider" to Vanilla TS for this site (see docs/SCRIPTING.md, section 3):
//  - it is a pinned section of the page (it was the whole screen) and the gesture is taken only while it fills the screen; it has a
//    first and a last award (the original turns freely), and past them the scroll goes on,
//  - the ring settles on one photo after each gesture, and the big photo is a stack of all the photos that is cross-faded (the original
//    swaps the file, which blinks); the words move with the same position as the ring, so they never lag or blink,
//  - the photos sweep in along a ribbon when the section comes up (the original has them standing in the ring from the start),
//  - sizes are for a 900px high screen and scaled to the real one; the smoothing is by time, not by frame; with reduced motion the
//    flight, the leaning and the easing are left out,
//  - initAwardOrbit(root) is `init` and returns destroy(); everything is looked up inside `root`; it only moves while on screen.
//
// Expected markup (see AwardOrbit.astro): root > .ao-pin > .ao-stage > .ao-orbit > (.ao-panel x n, .ao-preview > img x n),
// .ao-entries > .ao-entry x n, .ao-progress > .ao-line > .ao-fill.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getLenis } from './lenis';
import { smoothstep } from './math';
import { AWARD_ORBIT } from './settings';

gsap.registerPlugin(ScrollTrigger);

const clamp = gsap.utils.clamp;

export function initAwardOrbit(root: HTMLElement, o = AWARD_ORBIT) {
  const pin = root.querySelector<HTMLElement>('.ao-pin')!;
  const stage = root.querySelector<HTMLElement>('.ao-stage')!;
  const orbit = root.querySelector<HTMLElement>('.ao-orbit')!;
  const panels = Array.from(root.querySelectorAll<HTMLElement>('.ao-panel'));
  const preview = root.querySelector<HTMLElement>('.ao-preview')!;
  const previews = Array.from(preview.querySelectorAll<HTMLElement>('img'));
  const entriesBox = root.querySelector<HTMLElement>('.ao-entries')!;
  const entries = Array.from(root.querySelectorAll<HTMLElement>('.ao-entry'));
  const fill = root.querySelector<HTMLElement>('.ao-fill')!;
  const count = panels.length;
  const last = count - 1;
  const step = 360 / count; // degrees between two photos on the ring
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.dataset.live = '';

  // ---- size: the sizes in the settings are for a 900px high screen; k scales them to the real one (and to a narrow one) ----
  let k = 1;
  const measure = () => {
    k = Math.max(0.45, Math.min(pin.clientHeight / 900, pin.clientWidth / 800));
    root.style.setProperty('--k', k.toFixed(3));
  };

  // ---- the state: where the ring is (`position`) and where it is going (`target`), in photos ----
  let position = 0;
  let target = 0;
  let direction = 1;
  let settleTimer = 0;
  let ready = false; // the photos have flown in: now the ring takes gestures

  // ---- the flight in: `clock.t` (0..1) runs the whole intro; each photo is on its own stretch of it, one behind the other ----
  const clock = { t: reduced ? 1 : 0 };
  const along = gsap.parseEase(o.intro.ease);
  const last2 = Math.max(1, last);
  const place = (i: number) => {
    const el = panels[i];
    const radius = o.radius * k;
    const slot = ((i * step + 180) % 360) - 180; // where this photo stands on the ring, as an angle in -180..180
    if (clock.t >= 1) {
      el.style.transform = `translate3d(0, 0, 0) rotateY(${(i * step).toFixed(2)}deg) translateZ(${radius.toFixed(1)}px)`;
      el.style.visibility = 'visible';
      return;
    }
    const share = 1 - o.intro.spread * last2; // the part of the whole time one photo's run takes
    const u = clamp(0, 1, (clock.t - i * o.intro.spread) / share);
    el.style.visibility = u > 0 ? 'visible' : 'hidden';
    if (u <= 0) return;

    const r = o.intro.ribbon;
    const s = along(u); // how far along the ribbon
    const side = 1 - 2 * s; // +1 at the start of the ribbon, -1 at its end
    const bend = Math.sin(2 * Math.PI * s);
    // the ribbon: in from the lower right, swinging through the middle of the screen, out to the upper left, towards you in the middle
    const ribbon = {
      x: r.x * side,
      y: r.y * side - r.bow * bend,
      z: r.z * Math.sin(Math.PI * s) + r.zBase,
      turn: r.tilt * side,
      lean: r.roll * side,
    };
    // then the photo leaves the ribbon and closes into its place on the ring
    const w = smoothstep(o.intro.gather[0], o.intro.gather[1], u);
    const mix = (a: number, b: number) => a + (b - a) * w;
    const x = mix(ribbon.x * k, radius * Math.sin((slot * Math.PI) / 180));
    const y = mix(ribbon.y * k, 0);
    const z = mix(ribbon.z * k, radius * Math.cos((slot * Math.PI) / 180));
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${mix(ribbon.turn, slot).toFixed(2)}deg) rotateZ(${((1 - w) * ribbon.lean).toFixed(2)}deg) scale(${(1 + (1 - w) * r.lift).toFixed(3)})`;
  };

  // ---- the leaning towards the pointer ----
  let tiltX = 0;
  let tiltY = 0;
  let wantX = 0;
  let wantY = 0;
  const onMove = (e: PointerEvent) => {
    if (reduced || e.pointerType === 'touch') return;
    wantY = (e.clientX / window.innerWidth - 0.5) * o.maxTilt * 2;
    wantX = -(e.clientY / window.innerHeight - 0.5) * o.maxTilt * 2;
  };
  const onLeave = () => {
    wantX = 0;
    wantY = 0;
  };

  // ---- drawing ----
  const render = () => {
    const turn = -position * step;
    orbit.style.transform = `translate(-50%, -50%) rotateY(${turn.toFixed(3)}deg)`;
    preview.style.transform = `translate(-50%, -50%) rotateY(${(-turn).toFixed(3)}deg)`; // it turns back, so it always faces you
    stage.style.transform = `rotateX(${tiltX.toFixed(3)}deg) rotateY(${tiltY.toFixed(3)}deg)`;
    // the photo that faces you gives way to the big one in the middle, which shows the same picture (else a small copy hangs in front of it)
    panels.forEach((panel, i) => {
      const away = Math.abs(i - position);
      panel.style.opacity = clamp(0, 1, Math.min(away, count - away) * 1.6).toFixed(3);
    });
    const front = Math.round(position);
    previews.forEach((img, i) => img.classList.toggle('is-on', i === front));
    // the words of a photo come up as the ring turns to it and go as it turns away
    entries.forEach((entry, i) => {
      const distance = Math.abs(i - position);
      const shown = clamp(0, 1, 1 - distance * o.textFade * 0.5);
      entry.style.opacity = shown.toFixed(3);
      entry.style.visibility = shown > 0 ? 'visible' : 'hidden';
      entry.style.transform = `translateY(${((i - position) * 14).toFixed(1)}px)`;
      entry.setAttribute('aria-hidden', String(distance > 0.5));
    });
    fill.style.clipPath = `inset(0% ${((1 - position / Math.max(1, last)) * 100).toFixed(2)}% 0% 0%)`;
  };
  const renderAll = () => {
    measure();
    panels.forEach((_, i) => place(i));
    render();
  };

  // ---- the motion: the ring eases towards the target, the scene towards the pointer; by time ----
  const tick = () => {
    const ratio = gsap.ticker.deltaRatio(60);
    const share = (amount: number) => (reduced ? 1 : 1 - Math.pow(1 - amount, ratio));
    let changed = false;
    if (position !== target) {
      position += (target - position) * share(o.smoothing);
      if (Math.abs(target - position) < 0.001) position = target;
      changed = true;
    }
    if (tiltX !== wantX || tiltY !== wantY) {
      tiltX += (wantX - tiltX) * share(o.tiltSmoothing);
      tiltY += (wantY - tiltY) * share(o.tiltSmoothing);
      if (Math.abs(wantX - tiltX) < 0.01 && Math.abs(wantY - tiltY) < 0.01) {
        tiltX = wantX;
        tiltY = wantY;
      }
      changed = true;
    }
    if (changed) render();
  };

  // ---- input: a gesture moves the target; a moment after the last one the ring settles on a photo ----
  const settle = () => {
    const out = direction > 0 ? Math.floor(target) : Math.ceil(target);
    const moved = Math.abs(target - out);
    target = clamp(0, last, moved < o.swapThreshold ? out : out + direction);
  };
  const move = (amount: number) => {
    if (!amount) return;
    direction = Math.sign(amount);
    target = clamp(0, last, target + amount);
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settle, o.snapDelay);
  };

  // While the section fills the screen it takes the gestures (during the flight in it only holds them, so the page does not run away
  // under it), except at the ends, where the page takes them and moves on.
  const pinned = () => {
    const box = root.getBoundingClientRect();
    return box.top <= 1 && box.bottom >= window.innerHeight - 1;
  };
  const takes = (dir: number) => pinned() && !(ready && dir > 0 && target >= last) && !(ready && dir < 0 && target <= 0);

  const onWheel = (e: WheelEvent) => {
    const dir = Math.sign(e.deltaY);
    if (e.ctrlKey || !dir || !takes(dir)) return;
    e.preventDefault();
    e.stopPropagation(); // the smooth scroll listens higher up: it must not see this one
    if (ready) move(clamp(-o.maxWheelDelta, o.maxWheelDelta, e.deltaY) * o.wheelSensitivity);
  };
  let touchY = 0;
  const onTouchStart = (e: TouchEvent) => {
    touchY = e.touches[0].clientY;
  };
  const onTouchMove = (e: TouchEvent) => {
    const y = e.touches[0].clientY;
    const dy = touchY - y;
    if (takes(Math.sign(dy)) && e.cancelable) {
      e.preventDefault();
      if (ready) move(dy * o.touchSensitivity);
    }
    touchY = y;
  };
  const onKey = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp' ? -1 : 0;
    if (!dir || !takes(dir)) return;
    e.preventDefault();
    if (!ready) return;
    direction = dir;
    target = clamp(0, last, Math.round(target) + dir);
  };
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('touchstart', onTouchStart, { passive: true });
  root.addEventListener('touchmove', onTouchMove, { passive: false });
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerleave', onLeave);
  document.addEventListener('keydown', onKey);

  // ---- the flight in: when the section comes up, the photos sweep in along the ribbon and form the ring ----
  let intro: gsap.core.Tween | undefined;
  const play = () => {
    intro?.kill();
    ready = false;
    intro = gsap.to(clock, {
      t: 1,
      duration: o.intro.duration,
      ease: 'none',
      onUpdate: () => panels.forEach((_, i) => place(i)),
      onComplete: () => {
        ready = true;
        // the big photo and the words come up once the ring is formed
        gsap.to([preview, entriesBox], { opacity: 1, duration: 0.8, ease: 'power2.out' });
      },
    });
  };
  const reset = () => {
    intro?.kill();
    ready = false;
    clock.t = 0;
    panels.forEach((_, i) => place(i));
    gsap.set([preview, entriesBox], { opacity: 0 });
  };
  const arrive = (to: number, y: number) => {
    position = target = to;
    render();
    const lenis = getLenis();
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  };

  renderAll();
  if (reduced) {
    ready = true;
    gsap.set([preview, entriesBox], { opacity: 1 });
  } else {
    reset();
  }

  const comes = ScrollTrigger.create({
    trigger: root,
    start: o.intro.startAt,
    onEnter: () => !reduced && play(),
    onLeaveBack: () => !reduced && reset(),
  });
  // the first photo when the section is entered from above, the last one when from below; the scroll is put exactly on the pin, so a
  // flick into the section does not eat the run of scrolling that is left after the ends
  const edge = ScrollTrigger.create({
    trigger: root,
    start: 'top top',
    end: 'bottom bottom',
    invalidateOnRefresh: true,
    onEnter: (self) => arrive(0, self.start),
    onEnterBack: (self) => arrive(last, self.end),
  });

  // ---- it moves only while it is on screen ----
  const onScreen = new IntersectionObserver(([entry]) => {
    gsap.ticker.remove(tick);
    if (!entry.isIntersecting) return;
    gsap.ticker.add(tick);
    render();
  });
  onScreen.observe(root);

  window.addEventListener('resize', renderAll);

  return () => {
    gsap.ticker.remove(tick);
    window.clearTimeout(settleTimer);
    intro?.kill();
    gsap.killTweensOf([preview, entriesBox]);
    onScreen.disconnect();
    comes.kill();
    edge.kill();
    window.removeEventListener('resize', renderAll);
    root.removeEventListener('wheel', onWheel);
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchmove', onTouchMove);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('keydown', onKey);
    [stage, orbit, preview, entriesBox, ...panels, ...entries, ...previews].forEach((el) => {
      el.removeAttribute('style');
      el.classList.remove('is-on');
    });
    fill.style.clipPath = '';
    root.style.removeProperty('--k');
    delete root.dataset.live;
  };
}
