// FAQ chat: every question and answer is a bubble. It appears as a small dot with typing dots, and as it scrolls up the
// screen it opens into the full message. Scrubbing back up closes it again.
//
// Adapted from a Codegrid demo to Vanilla TS for this site (see docs/SCRIPTING.md, section 3):
//  - initFaqChat(root) is `init` and returns destroy(); everything is looked up inside `root`,
//  - the smooth scroll is the site's own Lenis (scripts/lenis.ts), not a second one,
//  - the bubbles are measured at their full size, so they are built again when the width of the list changes.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FAQ_CHAT as F } from './settings';

gsap.registerPlugin(ScrollTrigger);

export function initFaqChat(root: HTMLElement) {
  const list = root.querySelector<HTMLElement>('.faq-list')!;
  let ctx: gsap.Context | undefined;
  let width = 0;

  const build = () => {
    width = list.clientWidth;
    ctx = gsap.context(() => {
      list.querySelectorAll<HTMLElement>('.faq-message').forEach((message) => {
        const row = message.parentElement!;
        const dots = message.querySelector<HTMLElement>('.typing-indicator');
        const copy = message.querySelectorAll<HTMLElement>('.faq-content p');

        // the full size first (the row keeps it, so the page does not jump as the bubble grows)
        const style = getComputedStyle(message);
        const padX = [style.paddingLeft, style.paddingRight];
        const padY = [style.paddingTop, style.paddingBottom];
        const radius = style.borderRadius;
        const fullWidth = message.offsetWidth;
        message.style.width = `${fullWidth}px`;
        const fullHeight = message.offsetHeight;
        row.style.minHeight = `${fullHeight}px`;

        gsap.set(message, { width: F.dot, height: F.dot, borderRadius: '50%', padding: 0, scale: 0 });
        gsap.set(copy, { opacity: 0 });

        let collapseWhenDone = false;
        const enter = gsap.timeline({ paused: true });
        enter.to(message, { scale: 1, duration: F.pop, ease: 'power2.out' });

        const open = gsap.timeline({
          paused: true,
          onReverseComplete: () => {
            if (collapseWhenDone) {
              collapseWhenDone = false;
              enter.reverse();
            }
          },
        });
        open
          .to(dots, { autoAlpha: 0, duration: F.fade })
          .to(message, { width: fullWidth, borderRadius: radius, paddingLeft: padX[0], paddingRight: padX[1], duration: F.widen, ease: 'power3.inOut' })
          .to(message, { height: fullHeight, paddingTop: padY[0], paddingBottom: padY[1], duration: F.heighten, ease: 'power3.inOut' }, '-=0.25')
          .to(copy, { opacity: 1, duration: F.text, stagger: F.textStagger }, '-=0.3');

        ScrollTrigger.create({
          trigger: message,
          start: F.popAt,
          onEnter: () => {
            collapseWhenDone = false;
            enter.play();
          },
          onLeaveBack: () => {
            if (open.progress() > 0) collapseWhenDone = true;
            else enter.reverse();
          },
        });
        ScrollTrigger.create({
          trigger: message,
          start: F.openAt,
          onEnter: () => open.play(),
          onLeaveBack: () => open.reverse(),
        });
      });
    }, list);
    ScrollTrigger.refresh();
  };

  const clear = () => {
    ctx?.revert();
    ctx = undefined;
    list.querySelectorAll<HTMLElement>('.faq-message').forEach((message) => {
      message.removeAttribute('style');
      message.parentElement!.style.minHeight = '';
    });
  };

  // a different width wraps the text differently, so the bubbles are measured again (the height alone changing is ignored:
  // the rows hold their own height)
  const resize = new ResizeObserver(() => {
    if (Math.abs(list.clientWidth - width) < 2) return;
    clear();
    build();
  });

  document.fonts.ready.then(() => {
    if (!ctx) build();
  });
  resize.observe(list);

  return () => {
    resize.disconnect();
    clear();
  };
}
