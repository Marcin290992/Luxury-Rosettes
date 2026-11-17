// Draws an inline SVG's strokes as if by hand: each <path> gets a dash as long as the path itself, pushed fully out of view (dashoffset = length),
// and the Web Animations API brings the offset to 0. Duration = path length x speed; with `sequential` each path starts when the one before ends.
// Returns { done, cancel }: `done` resolves when the last stroke is finished.

interface DrawOptions {
  speed?: number; // seconds per unit of path length
  delay?: number; // seconds
  sequential?: boolean;
}

export function drawSvg(host: Element, { speed = 0.006, delay = 0, sequential = true }: DrawOptions = {}) {
  const paths = Array.from(host.querySelectorAll<SVGPathElement>('path'));
  const lengths = paths.map((p) => p.getTotalLength());
  paths.forEach((p, i) => {
    p.style.strokeDasharray = `${lengths[i]}`;
    p.style.strokeDashoffset = `${lengths[i]}`;
  });
  let at = 0;
  const animations = paths.map((p, i) => {
    const duration = lengths[i] * speed;
    const start = sequential ? at : i * 0.2;
    at += duration;
    return p.animate([{ strokeDashoffset: `${lengths[i]}` }, { strokeDashoffset: '0' }], {
      duration: duration * 1000,
      delay: (start + delay) * 1000,
      easing: 'ease-in-out',
      fill: 'forwards',
    });
  });
  return {
    done: Promise.all(animations.map((a) => a.finished)).then(() => undefined, () => undefined),
    cancel: () => animations.forEach((a) => a.cancel()),
  };
}
