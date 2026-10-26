// Splitting headings into masked words, and the delays that make them rise line by line.

// Wrap every word in a masked span so it can slide up out of a clip
export const splitWords = (el: HTMLElement) => {
  const words = (el.textContent ?? '').trim().split(/\s+/);
  el.setAttribute('aria-label', words.join(' '));
  el.innerHTML = words
    .map((w) => `<span class="w" aria-hidden="true"><span class="wi">${w}</span></span>`)
    .join(' ');
  return Array.from(el.querySelectorAll<HTMLElement>('.wi'));
};
// Delay per word: lines cascade, words cascade a little within each line
const lineOf = (el: HTMLElement) => el.parentElement!.offsetTop;
export const wordDelays = (words: HTMLElement[], perLine = 0.14, perWord = 0.035) => {
  const tops = [...new Set(words.map(lineOf))].sort((a, b) => a - b);
  return {
    lines: tops.length,
    delays: words.map((w, i) => {
      const first = words.findIndex((x) => lineOf(x) === lineOf(w));
      return tops.indexOf(lineOf(w)) * perLine + (i - first) * perWord;
    }),
  };
};

