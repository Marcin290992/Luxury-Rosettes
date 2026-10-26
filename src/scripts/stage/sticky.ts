// On touch screens a GSAP pin switches the element to position:fixed on the main thread, which visibly jitters when the
// pin starts and while the page is scrolled by the compositor. Instead the element sits in a tall box and sticks with
// CSS (position: sticky), which the compositor handles on its own; GSAP only reads the scroll position.
export function stickIn(el: HTMLElement, screens: number) {
  const box = document.createElement('div');
  box.dataset.stick = '';
  box.style.cssText = `position:relative;height:calc(100lvh * ${screens})`;
  el.parentNode!.insertBefore(box, el);
  box.appendChild(el);
  el.style.position = 'sticky';
  el.style.top = '0';
  return box;
}
export function unstick(el: HTMLElement, box: HTMLElement) {
  box.parentNode?.insertBefore(el, box);
  box.remove();
  el.style.position = '';
  el.style.top = '';
}

