// The Why Bengals chapter: the pinned opening (two tiles, the word BENGALS, the stripes), the heading, the scenes and the breed guide. Markup and styles: WhyBengals.astro.
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { mount } from './lifecycle';
  import { drawStripes } from './stripes';
  import { KITTEN_EXPAND as K } from './settings';

  gsap.registerPlugin(ScrollTrigger);

  mount(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const section = document.getElementById('why-bengals')!;
      const track = section.querySelector<HTMLElement>('.why-track')!;
      const stage = section.querySelector<HTMLElement>('.why-stage')!;
      const img = section.querySelector<HTMLElement>('.why-img')!;
      const halfL = section.querySelector<HTMLElement>('.why-half--l')!;
      const halfR = section.querySelector<HTMLElement>('.why-half--r')!;

      section.dataset.live = '';

      const H = () => stage.clientHeight;
      const W = () => window.innerWidth;

      // start: the left tile lower, the right one higher, and a small gap between them
      gsap.set(halfL, { x: () => -W() * 0.007, y: () => H() * 0.06 });
      gsap.set(halfR, { x: () => W() * 0.007, y: () => -H() * 0.06 });

      // A sticky stage inside a tall track: the scroll position scrubs the timeline (no GSAP pin: on touch screens it
      // would switch the stage to position:fixed on the main thread and jitter).
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        // refreshPriority: this chapter is far down the page, below pins that are made later (the stage, the cats row). A lower
        // priority makes it measure itself after them, so their spacers are counted in its start and end.
        scrollTrigger: { trigger: track, start: 'top top', end: 'bottom bottom', scrub: 1, invalidateOnRefresh: true, refreshPriority: -1 },
      });

      // 1. the tiles level out
      tl.to([halfL, halfR], { y: 0, duration: 1, ease: 'power2.inOut' }, 0);
      // 2. then the gap closes: one photo
      tl.to([halfL, halfR], { x: 0, duration: 0.8, ease: 'power2.inOut' }, 0.9);
      // 3. the finished photo grows to fill the whole screen (the width and height are animated, so the photo re-crops
      //    instead of stretching)
      tl.to(img, { width: () => stage.clientWidth, height: () => stage.clientHeight, duration: 1.4, ease: 'power2.inOut' }, 1.7);
      // 4. the paper closes in around the word: the letters start so big that the whole screen is inside them, then shrink
      //    to the width of the screen, so the photo ends up only in the letters.
      //    The word is placed at the centre of the stage and scaled around that centre by hand (a matrix on the <g>): GSAP's own
      //    transform origin needs a bounding box, and elements inside a <mask> have none, so it scaled from the corner.
      const knock = section.querySelector<SVGElement>('.why-knock')!;
      const word = knock.querySelector<SVGGElement>('.why-knock-word')!;
      const text = knock.querySelector<SVGTextElement>('.why-knock-text')!;
      const zoom = { s: 8 };
      const place = () => {
        const cx = stage.clientWidth / 2;
        const cy = stage.clientHeight / 2;
        text.setAttribute('x', String(cx));
        text.setAttribute('y', String(cy));
        word.setAttribute('transform', `translate(${cx * (1 - zoom.s)} ${cy * (1 - zoom.s)}) scale(${zoom.s})`);
      };
      place();
      ScrollTrigger.addEventListener('refresh', place); // sizes can change; the centre is read again each time

      gsap.set(knock, { opacity: 0 });

      // 5. the stripes. When the word has settled, five stripes in the colour of the dark page rise from the bottom one after another
      //    and cover it, like the stripes of the awards page, and the heading of the dark page rises on top of them. They are the scroll
      //    position: scrub back and they go down again.
      const copy = section.querySelector<HTMLElement>('.why-copy')!;
      // The heading of the dark page lives on the pinned stage while the script runs: it rises into its lines in place, on the dark screen the stripes
      // have just closed (it does not scroll in from below). It goes back to .why-more when the script is reverted.
      const more0 = section.querySelector<HTMLElement>('.why-more')!;
      stage.appendChild(copy);
      // Phones and tablets: the first scene (photo, statement, caption) lives on the pinned stage too, right under the heading, and appears
      // there in place (no sliding up from the bottom, no gap). The following scenes scroll as usual. It goes back to .why-more on revert.
      const compact = window.innerWidth < 1024;
      const firstScene = compact ? more0.querySelector<HTMLElement>('.why-scene') : null;
      if (firstScene) stage.appendChild(firstScene);
      const eyebrow = copy.querySelector<HTMLElement>('.eyebrow')!;
      const headLines = gsap.utils.toArray<HTMLElement>('.why-line > span', copy);
      const stripes = gsap.utils.toArray<HTMLElement>('.why-stripes > div', stage);
      const cover = { p: 0 }; // 0 = no stripe, 1 = all of them closed

      gsap.set(eyebrow, { autoAlpha: 0, y: 12 });
      gsap.set(headLines, { yPercent: 115, autoAlpha: 0 }); // each line waits below its own window

      tl.to({}, { duration: 0.3 }); // a beat on the full-screen photo
      tl.to(knock, { opacity: 1, duration: 0.6 }, '>');
      tl.to(zoom, { s: 1, duration: 1.5, ease: 'power3.inOut', onUpdate: place, immediateRender: false }, '<');
      tl.to({}, { duration: 0.4 }); // a beat on the finished word
      tl.addLabel('cover');
      tl.to(cover, { p: 1, duration: 2, onUpdate: () => drawStripes(stripes, cover.p) }, 'cover');
      // The pinned chapter ends on a full dark screen, and the heading that follows is pulled up into its last stretch (see .why-more: a
      // negative margin), so there is never an empty dark screen between the stripes and the heading. The stripes must be closed before the
      // heading's block starts to rise over the stage, so the timeline gets a short tail of the same length in scrolling.
      const more = section.querySelector<HTMLElement>('.why-more')!;
      const pullUp = -parseFloat(getComputedStyle(more).marginTop) || 0;
      const scrollLen = Math.max(1, track.offsetHeight - stage.clientHeight);
      const share = Math.min(0.6, pullUp / scrollLen);
      // the heading rises into its lines once the stripes have closed (scrubbed with the scroll, so scrolling back puts it away again)
      // It arrives slowly, as the next sentence of a story, not as a slam: a moment of the closed dark screen first, then the small line, then the
      // two words one after the other, each rising and fading in over a long stretch of scrolling.
      tl.fromTo(eyebrow, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out', immediateRender: false }, 'cover+=1.7');
      tl.fromTo(headLines, { yPercent: 115, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 1.5, stagger: 0.35, ease: 'power2.out', immediateRender: false }, 'cover+=1.8');
      tl.to({}, { duration: 0.3 }); // a beat on the finished heading before the first photo rises
      tl.to({}, { duration: (tl.duration() * share) / (1 - share) });

      // 6. the long scroll. Each scene is a photo cut to the shape of a spot of the coat, beside one trait. The spot grows
      //    from a small spot in the middle of its frame to its full size as the scene arrives (as on the Available kittens page); the spot drifts against the page while it passes
      //    (each at its own speed, a little turned) and the picture inside drifts the other way; a thin ring around it turns
      //    slowly the opposite way, like the outline of a rosette; the statement rises in word by word, its gold line draws and the caption fades in.
      const CLOSED = 'inset(0% 100% 0% 0%)';
      const OPEN = 'inset(0% 0% 0% 0%)';
      // both ends in full (fromTo): the browser shortens "inset(0% 44% 0% 44%)" to "inset(0% 44%)" when GSAP reads it back,
      // and the two strings would then no longer line up value by value
      // (closed to nothing: a photo that has only just entered at the bottom of the screen must not show even a sliver)
      const SLIT = 'inset(0% 50% 0% 50%)';
      const scenes = gsap.utils.toArray<HTMLElement>('.why-scene', section);
      scenes.forEach((scene) => {
        const spot = scene.querySelector<HTMLElement>('.why-spot')!;
        const fig = scene.querySelector<HTMLElement>('.why-fig')!;
        const ring = scene.querySelector<SVGElement>('.why-ring')!;
        const pic = fig.querySelector<HTMLElement>('img')!;
        const words = gsap.utils.toArray<HTMLElement>('.why-statement .w > span', scene);
        const by = scene.querySelector<HTMLElement>('.why-by')!;
        const line = scene.querySelector<HTMLElement>('.trait-line')!;
        const speed = Number(spot.dataset.speed) || 1;
        const tilt = Number(spot.dataset.tilt) || 0;
        // refreshPriority: see the main timeline above; these also sit below the pins that are made later
        const through = { trigger: scene, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true, refreshPriority: -1 };
        const arrive = { trigger: scene.querySelector('.why-text'), start: 'top 85%', toggleActions: 'play none none reverse', refreshPriority: -1 };

        gsap.set(spot, { rotation: tilt });
        gsap.set(pic, { scale: 1.3 * K.mediaZoom }); // zoomed in while the spot is small; it settles to 1.3 as the spot opens
        gsap.set(ring, { autoAlpha: 0 });
        gsap.set(words, { yPercent: 115 }); // each word waits below its own window
        gsap.set(by, { autoAlpha: 0, y: 16 });
        gsap.set(line, { clipPath: CLOSED });

        // The photo appears as on the Available kittens page: the spot starts as a small spot in the middle of its frame and grows to its full
        // size (the thin ring round it with it). `grow.p` runs 0..1 and is eased by the tween that drives it.
        const shape = scene.querySelector<HTMLElement>('.why-shape')!;
        const clipPath = document.querySelector<SVGPathElement>(`#${shape.dataset.clip} path`);
        const ringPath = scene.querySelector<SVGPathElement>('.why-ring path');
        const grow = { p: 0 };
        const applyGrow = () => {
          const sx = (K.startWidth + (100 - K.startWidth) * grow.p) / 100;
          const sy = (K.startHeight + (100 - K.startHeight) * grow.p) / 100;
          const t = `translate(0.5 0.5) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(-0.5 -0.5)`;
          clipPath?.setAttribute('transform', t);
          ringPath?.setAttribute('transform', t);
        };
        applyGrow();

        if (scene === firstScene) {
          // on the pinned stage: it opens in place, after the heading, as part of the main timeline
          // it lives on the pinned stage from the first moment of the chapter, so it is hidden until its turn (a small spot would hang over the
          // chapter's photo and the word); the timeline shows it at the label, and hides it again when scrolled back past it
          gsap.set(fig, { autoAlpha: 0 });
          tl.addLabel('photo');
          tl.to(fig, { autoAlpha: 1, duration: 0.01 }, 'photo');
          tl.fromTo(grow, { p: 0 }, { p: 1, duration: 1.4, ease: 'power2.inOut', immediateRender: false, onUpdate: applyGrow }, 'photo');
          tl.fromTo(pic, { scale: 1.3 * K.mediaZoom, yPercent: -6 }, { scale: 1.1, yPercent: 3, duration: 1.8, ease: 'power2.out', immediateRender: false }, 'photo');
          tl.to(ring, { autoAlpha: 1, duration: 1, ease: 'power2.out' }, 'photo+=0.6');
          tl.to(words, { yPercent: 0, duration: 1, stagger: 0.05, ease: 'power3.out' }, 'photo+=0.7');
          tl.to(line, { clipPath: OPEN, duration: 1, ease: 'power3.inOut' }, 'photo+=1.4');
          tl.to(by, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 'photo+=1.6');
          tl.to({}, { duration: 0.6 }); // a beat on the finished scene before the pin lets go
          return;
        }
        const opening = { trigger: scene, start: 'top 78%', end: 'top 30%', scrub: 0.8, refreshPriority: -1 };
        gsap.fromTo(grow, { p: 0 }, { p: 1, ease: 'power2.inOut', onUpdate: applyGrow, scrollTrigger: opening });
        gsap.fromTo(pic, { scale: 1.3 * K.mediaZoom }, { scale: 1.3, ease: 'power2.inOut', scrollTrigger: opening });
        gsap.fromTo(spot, { y: () => 90 * speed }, { y: () => -90 * speed, ease: 'none', scrollTrigger: through });
        gsap.fromTo(pic, { yPercent: -9 }, { yPercent: 9, ease: 'none', scrollTrigger: through });
        gsap.fromTo(ring, { rotation: 10 }, { rotation: -10, ease: 'none', scrollTrigger: through });
        gsap.to(ring, { autoAlpha: 1, duration: 1.2, ease: 'power2.out', scrollTrigger: arrive });
        gsap.to(words, { yPercent: 0, duration: 1.1, stagger: 0.045, ease: 'power3.out', scrollTrigger: arrive });
        gsap.to(by, { autoAlpha: 1, y: 0, duration: 0.9, delay: 0.5, ease: 'power2.out', scrollTrigger: arrive });
        gsap.to(line, { clipPath: OPEN, duration: 1.1, ease: 'power3.inOut', scrollTrigger: arrive });
      });

      // 7. the breed guide. The same language as the scenes above: headings rise out of their own window, the gold dashed lines draw in,
      //    the photos open from a slit with the picture drifting inside, the rest rises and fades in one after another. All of it plays
      //    when the part arrives and plays back when the page is scrolled up past it.
      const guide = section.querySelector<HTMLElement>('.guide');
      if (guide) {
        const at = (trigger: Element, start = 'top 85%') => ({ trigger, start, toggleActions: 'play none none reverse', refreshPriority: -1 });

        guide.querySelectorAll<HTMLElement>('.guide-head, .colours-head').forEach((head) => {
          const eyebrow = head.querySelector('.eyebrow');
          const title = head.querySelector('.gl > span');
          const lead = head.querySelector('.guide-lead');
          gsap.set(eyebrow, { autoAlpha: 0, y: 12 });
          gsap.set(title, { yPercent: 115 });
          gsap.set(lead, { autoAlpha: 0, y: 24 });
          gsap.to(eyebrow, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out', scrollTrigger: at(head) });
          gsap.to(title, { yPercent: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: at(head) });
          gsap.to(lead, { autoAlpha: 1, y: 0, duration: 1, delay: 0.35, ease: 'power2.out', scrollTrigger: at(head) });
        });

        // the four facts: the dashed line draws in (a custom property, read by the line's clip), then the label, the figure and the note
        const facts = gsap.utils.toArray<HTMLElement>('.fact', guide);
        facts.forEach((f) => {
          gsap.set(f, { '--draw': 0 });
          gsap.set(f.children, { autoAlpha: 0, y: 22 });
        });
        const factsBox = guide.querySelector<HTMLElement>('.facts')!;
        gsap.to(facts, { '--draw': 1, duration: 1.1, stagger: 0.14, ease: 'power3.inOut', scrollTrigger: at(factsBox) });
        facts.forEach((f, i) => {
          gsap.to(f.children, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.1, delay: 0.25 + i * 0.14, ease: 'power2.out', scrollTrigger: at(factsBox) });
        });

        // the three lists: the small title, then the lines one by one
        guide.querySelectorAll<HTMLElement>('.list').forEach((list, i) => {
          const title = list.querySelector('h4');
          const items = list.querySelectorAll('li');
          gsap.set(title, { autoAlpha: 0, y: 12 });
          gsap.set(items, { autoAlpha: 0, y: 20 });
          gsap.to(title, { autoAlpha: 1, y: 0, duration: 0.8, delay: i * 0.12, ease: 'power2.out', scrollTrigger: at(list, 'top 88%') });
          gsap.to(items, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.1, delay: 0.2 + i * 0.12, ease: 'power2.out', scrollTrigger: at(list, 'top 88%') });
        });

        // the colour cards: the photo opens from a slit (scrubbed, like the scenes) while the picture drifts; the caption rises in after it
        guide.querySelectorAll<HTMLElement>('.colour').forEach((card) => {
          const photo = card.querySelector<HTMLElement>('.colour-photo')!;
          const pic = photo.querySelector<HTMLElement>('img')!;
          const cap = card.querySelectorAll('figcaption > *');
          gsap.set(pic, { scale: 1.25 });
          gsap.set(cap, { autoAlpha: 0, y: 18 });
          gsap.fromTo(photo, { clipPath: SLIT }, { clipPath: OPEN, ease: 'power2.inOut', scrollTrigger: { trigger: card, start: 'top 88%', end: 'top 40%', scrub: 0.8, refreshPriority: -1 } });
          gsap.fromTo(pic, { yPercent: -7 }, { yPercent: 7, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true, refreshPriority: -1 } });
          gsap.to(cap, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.12, ease: 'power2.out', scrollTrigger: at(card, 'top 60%') });
        });

        const note = guide.querySelector('.guide-note');
        gsap.set(note, { autoAlpha: 0, y: 14 });
        gsap.to(note, { autoAlpha: 0.6, y: 0, duration: 0.9, ease: 'power2.out', scrollTrigger: at(note!, 'top 95%') });
      }
      return () => {
        if (firstScene) more0.prepend(firstScene);
        more0.prepend(copy);
        ScrollTrigger.removeEventListener('refresh', place);
        delete section.dataset.live;
      };
    });
    return () => mm.revert();
  }, '#why-bengals');
