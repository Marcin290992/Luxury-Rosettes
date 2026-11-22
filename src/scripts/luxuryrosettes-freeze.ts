// When a page transition starts while a WebGL scene is on screen, the live canvas is replaced by a still picture of its last frame: a canvas inside
// the transition's snapshot is composited on its own (wrong height on phones, a blink on iOS). The order matters:
//  1. all in the same task as the event, while the buffer still holds the frame;
//  2. the picture goes over the canvas, and the canvas is hidden only once the picture is decoded;
//  3. wait one more frame so it is painted before the old page is captured;
//  4. the scene stops moving from then on (`onFrozen(true)`), or it keeps easing and shows under the picture as a shifted copy.

export interface FreezeOptions {
  canvas: HTMLCanvasElement;
  /** Draws the scene once more (so that the buffer holds the last frame). */
  render: () => void;
  /** Only a scene that is on the screen needs it. */
  isNear: () => boolean;
  /** True while the still picture is on screen: the scene must not move. */
  onFrozen: (frozen: boolean) => void;
}

/** Returns a function that takes the listener away (and puts the live canvas back). */
export function freezeOnLeave(o: FreezeOptions): () => void {
  const { canvas } = o;
  let still: HTMLImageElement | undefined;
  let timer = 0;

  const thaw = () => {
    window.clearTimeout(timer);
    o.onFrozen(false);
    still?.remove();
    still = undefined;
    canvas.style.opacity = '1';
    canvas.style.pointerEvents = '';
  };

  const freeze = (event: Event) => {
    if (!o.isNear() || still) return;
    try {
      o.render();
      o.onFrozen(true);
      const img = new Image();
      img.alt = '';
      img.src = canvas.toDataURL('image/webp', 0.92);
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;';
      canvas.after(img);
      canvas.style.pointerEvents = 'none';
      still = img;
      const nav = event as Event & { loader: () => Promise<void> };
      const original = nav.loader;
      nav.loader = async () => {
        await img.decode().catch(() => {});
        if (still === img) canvas.style.opacity = '0';
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await original();
      };
      timer = window.setTimeout(thaw, 5000); // the navigation never happened (cancelled): the live canvas comes back
    } catch {
      thaw();
    }
  };

  document.addEventListener('astro:before-preparation', freeze);
  return () => {
    document.removeEventListener('astro:before-preparation', freeze);
    thaw();
  };
}
