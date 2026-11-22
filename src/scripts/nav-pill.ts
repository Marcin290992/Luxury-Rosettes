// The glass menu bar and its full-screen menu. Markup and styles: NavPill.astro.
  import { navigate } from 'astro:transitions/client';
  import { prefetch } from 'astro:prefetch';
  import { mount } from './lifecycle';
  import { glassSurface } from './glass-surface';
  import { getLenis } from './lenis';
  import { getScrollY, onPageScroll, scrollBox } from './scroller';
  import { NAV_SCROLLED_AT as SCROLLED_AT } from './settings';

  const BORDERS = 2; // px: the pill's top and bottom border
  const AT_TOP = 40; // px: scrolled less than this counts as the top of the page
  const TAP_MS = 440; // on a touch screen (no hover) the chosen link plays its hover (see .chosen below) before the page transition starts: a letter's slide plus the longest stagger

  mount(() => {
    const nav = document.getElementById('main-nav')!;
    const btn = nav.querySelector<HTMLElement>('#menu-btn')!;
    const word = nav.querySelector<HTMLElement>('#menu-text .nav-word')!;
    const panel = nav.querySelector<HTMLElement>('#nav-panel')!;
    const logo = nav.querySelector<HTMLElement>('.nav-logo')!;
    const header = nav.querySelector<HTMLElement>('.nav-header')!;

    // The glass layer (see .nav-glass) is as tall as the open pill and only revealed down to the pill's height. The refraction at its edge
    // (Chromium only, see glass-surface.ts) follows the shape that is revealed now: the closed pill or the open one.
    const glass = glassSurface(nav.querySelector<HTMLElement>('.nav-glass')!);
    let openHeight = 0;
    const shapeGlass = () => {
      const closedHeight = header.offsetHeight + BORDERS;
      const radius = parseFloat(getComputedStyle(nav).getPropertyValue('--radius')); // the target one: a custom property does not animate
      glass.shape(nav.classList.contains('expanded') ? openHeight : closedHeight, radius);
    };
    // the open pill: header + panel (its content, at most its max-height) + the borders
    const measureOpen = () => {
      const max = parseFloat(getComputedStyle(panel).maxHeight);
      const body = Number.isFinite(max) ? Math.min(panel.scrollHeight, max) : panel.scrollHeight;
      openHeight = header.offsetHeight + BORDERS + body;
      nav.style.setProperty('--open-h', `${openHeight}px`);
      shapeGlass();
    };
    measureOpen();
    window.addEventListener('resize', measureOpen);
    document.fonts?.ready.then(measureOpen);

    // the letters' timing is a global CSS token (--hover-time, --hover-stagger, see Layout.astro); the script only needs it in ms
    const cssMs = (name: string) => {
      const v = getComputedStyle(nav).getPropertyValue(name).trim();
      return parseFloat(v) * (v.endsWith('ms') ? 1 : 1000);
    };
    const letterMs = cssMs('--hover-time');
    const staggerMs = cssMs('--hover-stagger');

    // one span per letter, like the server-rendered label, so the hover effect works on both words
    // (cloned, so the letters keep Astro's scoped-style attribute)
    const proto = word.firstElementChild!.cloneNode(false) as HTMLElement;
    const letter = (ch: string, n: number) => {
      const el = proto.cloneNode(false) as HTMLElement;
      el.style.setProperty('--n', String(n));
      el.dataset.ch = ch; // the gold copy that slides in from below on a hover
      el.textContent = ch;
      return el;
    };
    const letters = (text: string) => [...text].map((ch, n) => letter(ch, n));
    const labelBox = word.parentElement!; // clips the words that slide in and out
    let label = word.textContent ?? 'Menu'; // the label that is shown, or that the running roll is going to
    let rollTimer = 0;
    const setLabel = (next: string) => {
      window.clearTimeout(rollTimer);
      label = next;
      labelBox.querySelectorAll('.nav-word.out').forEach((old) => old.remove());
      labelBox.style.minWidth = '';
      word.classList.remove('enter', 'settle');
      word.replaceChildren(...letters(next));
    };
    // Menu <-> Close: the old word slides up and out, the new one comes in from below, letter after letter like a hover. Each is a whole word
    // with its own letter widths: if the new letters sat in the old word's places, the spacing would jump when the plain word replaces them.
    const rollLabel = (next: string) => {
      if (next === label) return;
      setLabel(label); // a roll that is still running is finished first
      const out = word.cloneNode(true) as HTMLElement;
      out.classList.add('out');
      labelBox.style.minWidth = `${labelBox.offsetWidth}px`; // the old word keeps its room until it has left
      labelBox.append(out);
      word.replaceChildren(...letters(next));
      word.classList.add('enter'); // below its place, whatever the pointer does to the letters
      void word.offsetWidth;
      word.classList.replace('enter', 'settle');
      out.classList.add('go');
      rollTimer = window.setTimeout(() => setLabel(next), letterMs + Math.max(label.length, next.length) * staggerMs + 60);
      label = next;
    };

    // While the menu is open the page behind it does not scroll (phone, tablet, laptop): Lenis stops, and html.menu-open (see Layout.astro)
    // takes away the native scrolling of the window and of #scroll-root too
    const lockScroll = (on: boolean) => {
      document.documentElement.classList.toggle('menu-open', on);
      const lenis = getLenis();
      if (on) lenis?.stop();
      else lenis?.start();
    };
    const setOpen = (open: boolean) => {
      nav.classList.toggle('expanded', open);
      shapeGlass();
      btn.setAttribute('aria-expanded', String(open));
      rollLabel(open ? 'Close' : 'Menu');
      panel.toggleAttribute('inert', !open);
      lockScroll(open);
      // the scenes that follow the scroll hold still while the menu is open (see `nav-menu` in luxuryrosettes-spiral.ts)
      document.dispatchEvent(new CustomEvent('nav-menu', { detail: { open, leaving: false } }));
    };

    // While the menu is open the pages it links to are fetched in the background (the click then only swaps them in: on a phone the
    // download used to start at the tap and the transition waited for it)
    const warm = () => {
      panel.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
        const u = new URL(a.href, location.href);
        if (u.origin === location.origin && u.pathname !== location.pathname) prefetch(u.pathname + u.search, { ignoreSlowConnection: true });
      });
    };
    let warmTimer = 0;
    const onToggle = () => {
      const open = !nav.classList.contains('expanded');
      setOpen(open);
      // the pages are fetched once the menu has nearly finished opening, not while it animates: the downloads competed with the animation on a phone
      window.clearTimeout(warmTimer);
      if (open) warmTimer = window.setTimeout(warm, 800);
    };
    // Close on outside click, Escape, or after choosing a link
    const onOutsideClick = (e: MouseEvent) => {
      // the path, not the target: clicking the Menu button swaps its letters, so the target is already detached by now
      if (!e.composedPath().includes(nav)) setOpen(false);
    };
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && nav.classList.contains('expanded')) {
        setOpen(false);
        btn.focus();
      }
    };
    // A link in the menu or the logo starts the page transition at once, with the menu as it is. It is not folded first: the new page builds
    // its own menu, closed, and the old one leaves with the old page (a menu that started to fold at the tap would be caught half-folded in the
    // picture of the old page, which is taken a moment later). A link to the page you are already on, from a scrolled page, plays the same
    // transition (to a fresh copy of the page, at its top) instead of scrolling back; from the top of the page it does nothing.
    let giveUp = 0;
    let go = 0;
    const leave = (href: string, link: HTMLElement) => {
      // everything that is still animating in the menu (the letters of a hover, the links coming in one after another) finishes at once, in
      // its final state, so that the picture of the old page is never taken with a half-done animation; the chosen link shows its finished hover
      nav.classList.add('leaving');
      link.classList.add('chosen');
      document.dispatchEvent(new CustomEvent('nav-menu', { detail: { open: false, leaving: true } })); // stays held until the page is gone
      // if the page never changes (no connection), the menu closes after all
      window.clearTimeout(giveUp);
      giveUp = window.setTimeout(() => {
        nav.classList.remove('leaving');
        link.classList.remove('chosen');
        setOpen(false);
      }, 6000);
      // a touch screen has no hover to have been seen: the chosen link plays it now (the letters slide up, the gold copy comes in), and the page
      // transition starts when it has finished. With a mouse the hover has been on the link already, so the transition starts at once.
      const plays = !window.matchMedia('(hover: hover)').matches && link.querySelector('.nav-char');
      go = window.setTimeout(() => navigate(href), plays ? TAP_MS : 0);
    };
    const onLinkClick = (e: MouseEvent) => {
      const link = (e.target as Element).closest('a'); // a click on an icon inside a link counts as the link
      if (!link) return;
      const url = new URL(link.href, location.href);
      const sameOrigin = url.origin === location.origin && !link.target && !link.hasAttribute('download');
      const samePage = url.pathname === location.pathname && url.search === location.search;
      const plain = !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const transition = sameOrigin && plain && !reduced && (samePage ? !url.hash && getScrollY() > AT_TOP : true);
      if (transition) {
        e.preventDefault();
        leave(url.href, link);
        return;
      }
      // everything else: the menu simply folds
      setOpen(false);
      if (!sameOrigin || !plain || !samePage) return; // another page with reduced motion (the router goes there itself), an external link, a new tab
      if (url.hash) return; // an anchor on this page: the browser scrolls to it
      e.preventDefault();
      if (reduced && getScrollY() > AT_TOP) {
        const lenis = getLenis();
        if (lenis) lenis.scrollTo(0, { immediate: true });
        else (scrollBox() ?? window).scrollTo({ top: 0 });
      }
    };
    // Inquire: close menu, let the contact modal (when added) listen for this event
    const onNavClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-contact-trigger]')) return;
      setOpen(false);
      document.dispatchEvent(new CustomEvent('open-contact-modal'));
    };
    // Stronger glass once the page scrolls (readability over light sections)
    const onScroll = () => nav.classList.toggle('is-scrolled', getScrollY() > SCROLLED_AT);

    btn.addEventListener('click', onToggle);
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onKeydown);
    panel.addEventListener('click', onLinkClick);
    // the page of a link is fetched the moment the finger is on it, ~100ms before the click: if it was not fetched yet, the transition waits for it
    const onLinkDown = (e: Event) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!a) return;
      const u = new URL(a.href, location.href);
      if (u.origin === location.origin && u.pathname !== location.pathname) prefetch(u.pathname + u.search, { ignoreSlowConnection: true });
    };
    panel.addEventListener('pointerdown', onLinkDown);
    logo.addEventListener('click', onLinkClick);
    nav.addEventListener('click', onNavClick);
    const offScroll = onPageScroll(onScroll);
    onScroll();

    return () => {
      window.removeEventListener('resize', measureOpen);
      glass.destroy();
      btn.removeEventListener('click', onToggle);
      document.removeEventListener('click', onOutsideClick);
      document.removeEventListener('keydown', onKeydown);
      panel.removeEventListener('click', onLinkClick);
      panel.removeEventListener('pointerdown', onLinkDown);
      logo.removeEventListener('click', onLinkClick);
      window.clearTimeout(rollTimer);
      window.clearTimeout(giveUp);
      window.clearTimeout(go);
      window.clearTimeout(warmTimer);
      nav.removeEventListener('click', onNavClick);
      offScroll();
      lockScroll(false);
    };
  });
