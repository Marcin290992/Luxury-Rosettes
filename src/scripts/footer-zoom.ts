// The closing photo and the footer under it.
// The photo drifts slowly (parallax). As the footer rises, the photo is clipped inward (clip-path inset) and the footer's content
// scales from 75% to 100% while it fades in; both follow the scroll (scrub). Reduced motion: no effect, the footer simply follows the photo.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function initFooterZoom(): () => void {
  const root = document.querySelector<HTMLElement>('.ending');
  const clipped = root?.querySelector<HTMLElement>('[data-footer-clip]');
  const photo = root?.querySelector<HTMLElement>('[data-footer-photo]');
  const footer = root?.querySelector<HTMLElement>('[data-footer]');
  const content = root?.querySelector<HTMLElement>('[data-footer-content]');
  if (!root || !clipped || !photo || !footer || !content) return () => {};

  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    root.dataset.fx = ''; // turns on the overlap (see index.astro)
    const wide = matchMedia('(min-width: 992px)').matches;
    gsap.fromTo(photo, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: clipped, start: 'top bottom', end: 'bottom top', scrub: 0.5 } });
    gsap
      .timeline({ scrollTrigger: { trigger: footer, start: 'top 70%', end: 'top top', scrub: 0.5 } })
      .fromTo(clipped, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: wide ? 'inset(8% 22% 8% 22%)' : 'inset(4% 20% 4% 20%)', ease: 'none' }, 0)
      .fromTo(content, { opacity: 0, scale: 0.75 }, { opacity: 1, scale: 1, ease: 'none' }, 0);
    return () => {
      delete root.dataset.fx;
    };
  });
  return () => mm.revert();
}
