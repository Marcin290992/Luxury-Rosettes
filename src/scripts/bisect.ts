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
