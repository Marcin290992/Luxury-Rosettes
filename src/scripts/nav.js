import { navigate } from 'astro:transitions/client';
import { getLenis } from './lenis';
import gsap from 'gsap';

let isInitialized = false;
let scrollCleanup = () => {};

const MENU_CLOSE_NAV_DELAY = 420;
const MOBILE_LINK_HOVER_DELAY = 360;

function isTouchDevice() {
  return window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

function isDesktopMode() {
  return window.matchMedia('(min-width: 1024px)').matches && !isTouchDevice();
}

function shouldBypassMenuNavigation(event, href) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    !href ||
    href === '#'
  );
}

function isCurrentPageTarget(href) {
  const targetUrl = new URL(href, window.location.href);

  return (
    targetUrl.origin === window.location.origin &&
    targetUrl.pathname === window.location.pathname &&
    targetUrl.search === window.location.search &&
    !targetUrl.hash
  );
}

export function initLuxuryNav() {
  // Reset on page transitions
  if (isInitialized) {
    return;
  }

  const floatingNav = document.getElementById('floatingNav');
  const menuBtn = document.getElementById('menuBtn');
  const fullscreenMenu = document.getElementById('fullscreenMenu');

  if (!floatingNav || !menuBtn || !fullscreenMenu) {
    return;
  }

  isInitialized = true;

  const body = document.body;
  let menuOpen = false;
  let isAnimating = false;
  let pendingNavigationTimeout = 0;
  let linksCleanup = () => {};
  let hoverCleanup = () => {};

  const closeMenu = () => {
    if (isAnimating) {
      return;
    }

    isAnimating = true;
    menuOpen = false;
    menuBtn.classList.remove('active');
    floatingNav.classList.remove('menu-open');

    document.querySelectorAll('.menu-link.mobile-hover').forEach((link) => {
      link.classList.remove('mobile-hover');
    });

    const anchors = fullscreenMenu.querySelectorAll('.menu-link-anchor');
    gsap.killTweensOf(anchors);
    gsap.to(anchors, {
      y: '-25%',
      opacity: 0,
      duration: 0.22,
      stagger: 0.025,
      ease: 'power2.in',
    });

    gsap.killTweensOf(fullscreenMenu);
    gsap.to(fullscreenMenu, {
      clipPath: 'inset(0 0 100% 0)',
      duration: 0.7,
      ease: 'power3.inOut',
      delay: 0.08,
      onComplete: () => {
        gsap.set(fullscreenMenu, { visibility: 'hidden' });
        fullscreenMenu.classList.remove('active');
        body.style.paddingRight = '';
        floatingNav.style.paddingRight = '';
        body.classList.remove('no-scroll');
        const lenis = getLenis();
        if (lenis) lenis.start();
        isAnimating = false;
      },
    });
  };

  window.closeLuxuryMenu = closeMenu;

  const openMenu = () => {
    if (isAnimating) {
      return;
    }

    isAnimating = true;

    const lenis = getLenis();
    if (lenis) lenis.stop();

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.paddingRight = `${scrollbarWidth}px`;
    floatingNav.style.paddingRight = `${scrollbarWidth}px`;
    body.classList.add('no-scroll');

    menuOpen = true;
    menuBtn.classList.add('active');
    floatingNav.classList.add('menu-open');
    fullscreenMenu.classList.add('active');

    // Curtain drop
    gsap.killTweensOf(fullscreenMenu);
    gsap.set(fullscreenMenu, { visibility: 'visible', clipPath: 'inset(0 0 100% 0)' });
    gsap.to(fullscreenMenu, {
      clipPath: 'inset(0 0 0% 0)',
      duration: 0.85,
      ease: 'power3.inOut',
      onComplete: () => { isAnimating = false; },
    });

    // Mask reveal — links slide up from behind overflow:hidden parent
    const anchors = fullscreenMenu.querySelectorAll('.menu-link-anchor');
    gsap.killTweensOf(anchors);
    gsap.set(anchors, { y: '105%', opacity: 1 });
    gsap.to(anchors, {
      y: '0%',
      duration: 0.7,
      stagger: 0.07,
      ease: 'power3.out',
      delay: 0.48,
    });
  };

  const setupMenuLinks = () => {
    linksCleanup();

    const controller = new AbortController();
    const signal = controller.signal;
    const menuLinks = document.querySelectorAll('.menu-link');

    menuLinks.forEach((menuLink) => {
      const link = menuLink.querySelector('a');
      if (!link) {
        return;
      }

      link.addEventListener(
        'click',
        (event) => {
          const href = link.getAttribute('href');
          if (shouldBypassMenuNavigation(event, href)) {
            event.preventDefault();
            return;
          }

          if (isCurrentPageTarget(href)) {
            event.preventDefault();
            closeMenu();
            return;
          }

          event.preventDefault();

          window.clearTimeout(pendingNavigationTimeout);

          const runNavigation = () => {
            pendingNavigationTimeout = window.setTimeout(() => {
              navigate(href);
            }, MENU_CLOSE_NAV_DELAY);
          };

          if (isDesktopMode()) {
            closeMenu();
            runNavigation();
            return;
          }

          menuLink.classList.add('mobile-hover');

          window.setTimeout(() => {
            closeMenu();
            runNavigation();
          }, MOBILE_LINK_HOVER_DELAY);
        },
        { signal }
      );
    });

    linksCleanup = () => controller.abort();
  };

  const setupImageHover = () => {
    hoverCleanup();

    if (!isDesktopMode()) {
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;
    const menuItems = document.querySelectorAll('.menu-link');
    const bgImages = document.querySelectorAll('.menu-bg-image');

    menuItems.forEach((item) => {
      item.addEventListener(
        'mouseenter',
        () => {
          const imageIndex = Number(item.getAttribute('data-image'));
          bgImages.forEach((img) => img.classList.remove('active'));

          if (Number.isInteger(imageIndex) && bgImages[imageIndex]) {
            bgImages[imageIndex].classList.add('active');
          }
        },
        { signal }
      );
    });

    hoverCleanup = () => controller.abort();
  };

  menuBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (menuOpen) {
      closeMenu();
      return;
    }

    openMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuOpen) {
      closeMenu();
    }
  });

  fullscreenMenu.addEventListener(
    'wheel',
    (event) => {
      if (isDesktopMode()) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  fullscreenMenu.addEventListener(
    'touchmove',
    (event) => {
      if (isDesktopMode()) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  let resizeTimeout = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(() => {
      setupMenuLinks();
      setupImageHover();
    }, 180);
  });

  setupMenuLinks();
  setupImageHover();

  // Nav: transparent over any dark hero (data-nav-dark), cream once scrolled past it
  scrollCleanup();
  const darkHero = document.querySelector('[data-nav-dark]');

  if (darkHero) {
    const handleNavScroll = () => {
      const heroStillCoversNav = darkHero.getBoundingClientRect().bottom > 60;
      floatingNav.classList.toggle('is-scrolled', !heroStillCoversNav);
    };
    window.addEventListener('scroll', handleNavScroll, { passive: true });
    handleNavScroll();
    scrollCleanup = () => window.removeEventListener('scroll', handleNavScroll);
  } else {
    floatingNav.classList.add('is-scrolled');
    scrollCleanup = () => {};
  }
}

// Handle page transitions - reset initialization flag
document.addEventListener('astro:page-load', () => {
  isInitialized = false;
  initLuxuryNav();
});

// Export globally for inline scripts
if (typeof window !== 'undefined') {
  window.initLuxuryNav = initLuxuryNav;
}
