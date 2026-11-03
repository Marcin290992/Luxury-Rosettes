// A small on-screen log for looking at what a phone really does (there is no console there). Off by default.
// Turn it on by opening any page with ?debug=1 (it stays on for the visit, across page transitions), off with ?debug=off.
// The last lines are kept in sessionStorage and drawn over the bottom of the screen, so they are still there after the page is swapped.

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
}

export function initDebug() {
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
    dbg(`DEBUG ON ${location.pathname} inner ${innerWidth}x${innerHeight} vv ${Math.round(window.visualViewport?.height ?? 0)} dpr ${devicePixelRatio}`);
  }
  if (debugOn()) watchTransition();
  paintDebug();
  document.addEventListener('astro:after-swap', paintDebug);
}
