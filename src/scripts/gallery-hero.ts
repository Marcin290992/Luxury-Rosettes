// Gallery hero: a photo that is a small window (clip-path) in the middle of the screen opens to the whole screen as you scroll while it
// zooms out, then fades away; below it photos float up at their own speeds (parallax) and shrink and fade as they leave.
// Adapted from a React + Framer Motion scroll hero to Vanilla TS + GSAP ScrollTrigger for this site (docs/SCRIPTING.md):
//  - no React, no second Lenis: the page's own smooth scroll drives it, everything is scrubbed by ScrollTrigger,
//  - the opening is a clip-path `inset()` and a transform scale (the original animated background-size: that is layout work every frame),
//  - phone and desktop have their own lengths (settings.ts GALLERY_HERO): on a phone the same pixels are a much longer thumb-swipe,
//  - the photos' movement is on the <img> inside a still figure, so what is measured never moves with the animation,
//  - initGalleryHero(root) is `init` and returns destroy(); everything is looked up inside `root`. Reduced motion: the CSS shows the open
//    photo and the photos at rest.
//
// Expected markup (see GalleryHero.astro): root > .gh-center > (.gh-media > img, .gh-title), .gh-imgs > figure.gh-img[data-from][data-to] > img.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { GALLERY_HERO } from './settings';

gsap.registerPlugin(ScrollTrigger);

export function initGalleryHero(root: HTMLElement, o = GALLERY_HERO): () => void {
  const center = root.querySelector<HTMLElement>('.gh-center');
  const media = root.querySelector<HTMLElement>('.gh-media');
  const title = root.querySelector<HTMLElement>('.gh-title');
  const figures = Array.from(root.querySelectorAll<HTMLElement>('.gh-img'));
  if (!center || !media) return () => {};

  const mm = gsap.matchMedia();
  const play = (cfg: { section: number; fade: number; zoom: number; parallax: number }) => {
    // the section is as long as the opening takes, plus a screen: the photo sticks for that scroll
    root.style.setProperty('--gh-section', `${cfg.section}px`);
    const u = 1 / 1000; // one second of the timeline is 1000px of scroll
    const open = `inset(${o.window}% ${o.window}% ${o.window}% ${o.window}%)`;
    gsap
      .timeline({
        scrollTrigger: { trigger: root, start: 'top top', end: `+=${cfg.section + cfg.fade}`, scrub: o.scrub, invalidateOnRefresh: true },
        defaults: { ease: 'none' },
      })
      .fromTo(center, { clipPath: open }, { clipPath: 'inset(0% 0% 0% 0%)', duration: cfg.section * u }, 0)
      .fromTo(media, { scale: cfg.zoom }, { scale: 1, duration: (cfg.section + cfg.fade) * u }, 0)
      .fromTo(center, { opacity: 1 }, { opacity: 0, duration: cfg.fade * u }, cfg.section * u);
    if (title) gsap.to(title, { opacity: 0, y: -40, ease: 'none', scrollTrigger: { trigger: root, start: 'top top', end: `+=${cfg.section * 0.35}`, scrub: o.scrub } });

    figures.forEach((fig) => {
      const img = fig.querySelector<HTMLElement>('img');
      if (!img) return;
      const from = (parseFloat(fig.dataset.from ?? '0') || 0) * cfg.parallax;
      const to = (parseFloat(fig.dataset.to ?? '0') || 0) * cfg.parallax;
      gsap
        .timeline({
          // the original's offset: [`${start}px end`, `end ${-end}px`]: it begins when the photo's top plus `start` px reaches the bottom of the
          // screen, and is over when its bottom reaches `-end` px from the top of the screen
          scrollTrigger: {
            trigger: fig,
            start: `top bottom${from <= 0 ? '+=' : '-='}${Math.abs(from)}`,
            end: `bottom top${to >= 0 ? '-=' : '+='}${Math.abs(to)}`,
            scrub: o.scrub,
            invalidateOnRefresh: true,
          },
          defaults: { ease: 'none' },
        })
        .fromTo(img, { y: from }, { y: to, duration: 1 }, 0)
        .to(img, { opacity: 0, scale: 0.85, duration: 0.25 }, 0.75); // gone as the last quarter of its way
    });
  };

  mm.add('(prefers-reduced-motion: no-preference) and (min-width: 769px)', () => play(o.desktop));
  mm.add('(prefers-reduced-motion: no-preference) and (max-width: 768px)', () => play(o.phone));
  return () => {
    mm.revert();
    root.style.removeProperty('--gh-section');
  };
}
