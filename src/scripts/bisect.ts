// TEMPORARY, for finding which part of a page breaks the page transition on a phone (delete when found).
// Open the page once with ?off=dome (or hero, stripes, footer, lines, several with commas, or all): the choice is kept for the visit, so the
// transition can then be tried with the menu. ?off=none clears it. The part that is switched off is simply not started (the page shows it still).
const KEY = 'lroff';
try {
  const q = new URLSearchParams(location.search).get('off');
  if (q === 'none') sessionStorage.removeItem(KEY);
  else if (q) sessionStorage.setItem(KEY, q);
} catch {
  /* no storage */
}
export const off = (part: string) => {
  try {
    const v = (sessionStorage.getItem(KEY) ?? '').split(',');
    return v.includes(part) || v.includes('all');
  } catch {
    return false;
  }
};

// CSS parts are switched off by a class on <html> (lroff-<part>), put back after every swap (the router rewrites <html>'s classes):
// herofx = the opening without its clip-path, zoom and will-change; heroimg = the opening's photo hidden; imgs = the floating photos and
// the wall's photo grid hidden; wallhtml = the whole wall section hidden (markup and all); wallbox = the wall's photo viewer and its plate
// hidden. `all` switches these off too.
const CSS_PARTS = ['herofx', 'heroimg', 'imgs', 'wallhtml', 'wallbox'];
export const offList = () => {
  try {
    return sessionStorage.getItem(KEY) || 'none';
  } catch {
    return '?';
  }
};
export function markOff() {
  const html = document.documentElement;
  CSS_PARTS.forEach((p) => html.classList.toggle(`lroff-${p}`, off(p)));
}
