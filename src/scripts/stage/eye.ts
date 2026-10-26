// Where the cat's eye is on screen. The hero measures it (it depends on how the photo is cropped) and leaves it on the image.

export interface Eye {
  ox: number; // origin of the zoom, in % of the photo
  oy: number;
  w: number; // width of the eye in px, 0 when not measured
}

/** The eye as the hero measured it, or `fallback` when the hero has not published one yet. */
export const readEye = (heroImg: HTMLElement, fallback: Eye): Eye =>
  heroImg.dataset.eye ? { ...fallback, ...JSON.parse(heroImg.dataset.eye) } : fallback;

export const originOf = (eye: Eye) => `${eye.ox}% ${eye.oy}%`;
