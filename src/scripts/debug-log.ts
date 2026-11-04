// A small on-screen log for looking at what a phone really does (there is no console there). Off by default.
// Turn it on by opening any page with ?debug=1 (it stays on for the visit, across page transitions), off with ?debug=off.
// The last lines are kept in sessionStorage and drawn over the bottom of the screen, so they are still there after the page is swapped.

declare const __BUILD__: string;
const ON = 'lrdebug';
const LOG = 'lrdebug-log';

export const debugOn = () => {
  try {
    return sessionStorage.getItem(ON) === '1';
  } catch {
    return false;
  }
};

export function paintDebug() {
  if (!debugOn()) return;
  let box = document.getElementById('lr-debug');
  if (!box) {
    box = document.createElement('pre');
    box.id = 'lr-debug';
    box.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;margin:0;padding:4px 6px;z-index:2147483647;pointer-events:none;' +
      'background:rgba(0,0,0,.82);color:#7CFC00;font:9px/1.25 monospace;white-space:pre-wrap;max-height:45vh;overflow:hidden;';
    document.documentElement.appendChild(box);
  }
  try {
    box.textContent = (JSON.parse(sessionStorage.getItem(LOG) || '[]') as string[]).join('\n');
  } catch {
    /* ignore */
  }
}

export function dbg(msg: string) {
  if (!debugOn()) return;
  try {
    const lines: string[] = JSON.parse(sessionStorage.getItem(LOG) || '[]');
    lines.push(`${Math.round(performance.now())} ${msg}`);
    sessionStorage.setItem(LOG, JSON.stringify(lines.slice(-18)));
  } catch {
    /* ignore */
  }
  paintDebug();
}

// On every page: from the start of a page transition for a few seconds, a line each time any of these changes:
// the window's height (what the page can see), the visual viewport, the scroll position and where a fixed element (the nav pill) and the first screen sit.
function watchTransition() {
  let until = 0;
  let last = '';
  const sample = (tag = '') => {
    const nav = document.getElementById('main-nav')?.getBoundingClientRect();
    const first = document.querySelector('#hero, .sp-scene, main, body > *')?.getBoundingClientRect();
    const vv = window.visualViewport;
    const sig = [
      `inner ${innerHeight}`,
      `vv ${Math.round(vv?.height ?? 0)}/${Math.round(vv?.offsetTop ?? 0)}`,
      `client ${document.documentElement.clientHeight}`,
      `scrollY ${Math.round(scrollY)}`,
      `nav ${nav ? Math.round(nav.top) : '-'}`,
      `first ${first ? Math.round(first.top) + '/' + Math.round(first.height) : '-'}`,
    ].join(' | ');
    if (sig !== last) {
      last = sig;
      dbg(`${tag}${sig}`);
    }
  };
  const tick = () => {
    if (performance.now() > until) return;
    sample();
    requestAnimationFrame(tick);
  };
  const start = (why: string) => {
    last = '';
    until = performance.now() + 3500;
    dbg(`--- ${why}`);
    sample();
    requestAnimationFrame(tick);
  };
  document.addEventListener('astro:before-preparation', () => start('before-preparation'));
  document.addEventListener('astro:before-swap', () => dbg('--- before-swap'));
  document.addEventListener('astro:after-swap', () => start('after-swap'));

  // The window at the moment the page is captured, and the browser's own units (lvh = address bar hidden, svh = shown), so the
  // log can be read against the transition's layers below: CAP is what the page looked like, VT is where the snapshot was put.
  const unit = document.createElement('div');
  unit.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100lvh;visibility:hidden;pointer-events:none;';
  const unitS = document.createElement('div');
  unitS.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none;';
  document.addEventListener('astro:before-preparation', () => {
    document.body.append(unit, unitS);
    const vv = window.visualViewport;
    dbg(
      `CAP inner ${innerHeight} lvh ${unit.offsetHeight} svh ${unitS.offsetHeight} vv ${Math.round(vv?.height ?? 0)}/${Math.round(vv?.offsetTop ?? 0)} scrollY ${Math.round(scrollY)}`,
    );
    unit.remove();
    unitS.remove();
  });

  // The transition's own layers: how big the snapshot is and where it sits, against the window (inner).
  const layers = (n: number) => {
    const el = document.documentElement;
    const css = (pseudo: string) => {
      const c = getComputedStyle(el, pseudo);
      return `${c.width}x${c.height} top ${c.top} tr ${c.transform === 'none' ? '-' : c.transform.replace(/\s/g, '').slice(0, 40)}`;
    };
    const nav = document.getElementById('main-nav')?.getBoundingClientRect();
    const scb = `scb ${el.style.getPropertyValue('--vt-scb') || '-'} stored ${sessionStorage.getItem('lr-scb') ?? '-'}`;
    dbg(
      `VT#${n} ${scb} inner ${innerHeight} scrollY ${Math.round(scrollY)} navtop ${nav ? Math.round(nav.top) : '-'} | vt ${css('::view-transition')} | group ${css('::view-transition-group(root)')} | old ${css('::view-transition-old(root)')} | navgrp ${css('::view-transition-group(navbar)')}`,
    );
  };
  document.addEventListener('astro:after-swap', () => {
    [0, 120, 400].forEach((ms, i) => setTimeout(() => layers(i), ms));
  });
}

// ?vtlab=1: the page transition is FROZEN for 4 seconds right at its first frame, with the layers outlined (blue = the group, red =
// the old page's picture, green = the new page's picture), so a screenshot shows exactly where the browser puts the snapshot against
// the screen. It turns the log on too. ?vtlab=0 turns it off. (The outlines are in Layout.astro, under html.vt-lab.)
const LAB = 'lrvtlab';
const applyLab = () => {
  try {
    document.documentElement.classList.toggle('vt-lab', sessionStorage.getItem(LAB) === '1');
  } catch {
    /* ignore */
  }
};

export function initDebug() {
  try {
    const lab = new URLSearchParams(location.search).get('vtlab');
    if (lab === '1') {
      sessionStorage.setItem(LAB, '1');
      sessionStorage.setItem(ON, '1');
    }
    if (lab === '0') sessionStorage.removeItem(LAB);
  } catch {
    /* ignore */
  }
  applyLab();
  document.addEventListener('astro:after-swap', applyLab); // the router rewrites <html>'s classes on a swap
  try {
    const q = new URLSearchParams(location.search).get('debug');
    if (q === '1') sessionStorage.setItem(ON, '1');
    if (q === 'off') {
      sessionStorage.removeItem(ON);
      sessionStorage.removeItem(LOG);
      document.getElementById('lr-debug')?.remove();
    }
  } catch {
    /* ignore */
  }
  if (debugOn()) {
    // always at least this line, so it is clear that the log is on (and the bar is not just an empty strip)
    dbg(`DEBUG ON build ${typeof __BUILD__ === 'string' ? __BUILD__ : '?'} ${location.pathname} inner ${innerWidth}x${innerHeight} vv ${Math.round(window.visualViewport?.height ?? 0)} dpr ${devicePixelRatio}`);
  }
  if (debugOn()) watchTransition();
  paintDebug();
  document.addEventListener('astro:after-swap', paintDebug);
}
