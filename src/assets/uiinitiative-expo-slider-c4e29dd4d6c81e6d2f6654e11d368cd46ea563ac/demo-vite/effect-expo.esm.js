import { effectInit } from 'swiper/effect-utils';

if (typeof window !== 'undefined' && window.SwiperElementRegisterParams) {
  window.SwiperElementRegisterParams(['expoEffect']);
}

export default function EffectExpo({ swiper, on, extendParams }) {
  extendParams({
    expoEffect: {
      imageScale: 1.125,
      imageOffset: 1.25,
      scale: 1.25,
      rotate: 0,
      grayscale: true,
    },
  });

  const setTranslate = () => {
    const { slides, rtlTranslate: rtl } = swiper;
    const spv = swiper.params.slidesPerView;
    const isHorizontal = swiper.isHorizontal();
    let translateOffset = 0.5;
    const params = swiper.params.expoEffect;
    const imageOffset = Math.max(1.25, params.imageOffset);
    if (spv > 1.5) {
      const minTranslateOffset = (imageOffset - 1) / 2 / imageOffset;
      translateOffset = Math.max(minTranslateOffset, 0.5 - (spv - 1.5));
    }
    const imageScale = Math.max(1.125, params.imageScale);
    const scale = Math.max(1.25, params.scale);
    const rtlMultiplier = rtl ? -1 : 1;

    for (let i = 0; i < slides.length; i += 1) {
      const slideEl = slides[i];
      const contentWrapEl = slideEl.querySelector('.expo-container');
      const contentEl = slideEl.querySelector('.expo-content');
      const imageEl = slideEl.querySelector('.expo-image');
      const progress = slideEl.progress;
      const progressLimited = Math.max(Math.min(progress, 1), -1);

      if (imageEl) {
        imageEl.style.transform = `translate${isHorizontal ? 'X' : 'Y'}(${
          progressLimited * translateOffset * 100 * rtlMultiplier
        }%) scale(${1 + (imageScale - 1) * Math.abs(progressLimited)})`;
        if (params.grayscale) {
          imageEl.style.filter = `grayscale(${Math.abs(progressLimited)})`;
        }
      }
      const sides = isHorizontal
        ? rtl
          ? ['right', 'left']
          : ['left', 'right']
        : ['top', 'bottom'];
      if (Math.abs(progress) > 0.01) {
        if (imageEl) {
          imageEl.style.transformOrigin = progress > 0 ? sides[0] : sides[1];
        }
        if (contentWrapEl) {
          contentWrapEl.style.transformOrigin =
            progress > 0 ? sides[1] : sides[0];
        }
      }
      if (contentWrapEl) {
        contentWrapEl.style.transform = `scale(${
          1 + (scale - 1) * Math.abs(progressLimited)
        }) rotate${isHorizontal ? 'Y' : 'X'}(${
          params.rotate *
          progressLimited *
          (isHorizontal ? 1 : -1) *
          rtlMultiplier
        }deg)`;
      }
      if (contentEl) {
        contentEl.style.transform = `translate${isHorizontal ? 'X' : 'Y'}(${
          progressLimited * 100 * rtlMultiplier
        }%)`;
        contentEl.style.opacity = 1 - Math.abs(progressLimited) * 2;
      }
    }
  };

  const setTransition = (duration) => {
    const { slides } = swiper;
    for (let i = 0; i < slides.length; i += 1) {
      const slideEl = slides[i];
      [
        ...slideEl.querySelectorAll(
          '.expo-container, .expo-image, .expo-content',
        ),
      ].forEach((el) => {
        el.style.transitionDuration = `${duration}ms`;
      });
    }
  };
  const setSize = () => {
    const box = swiper.el.getBoundingClientRect();
    const size = swiper.isHorizontal() ? box.height : box.width;
    const { rotate, scale, imageOffset } = swiper.params.expoEffect;
    swiper.el.style.setProperty('--expo-image-offset', imageOffset);
    const currentValue = swiper.el.style.getPropertyValue('--expo-padding');
    const currentValueNumber = parseInt(currentValue, 10) || 0;

    const activeSlideSize = size / scale;
    let newValue = (size - activeSlideSize) / 2;
    if (rotate) {
      newValue = newValue * 1.35;
    }
    newValue = Math.round(newValue);

    if (currentValue && !Number.isNaN(currentValueNumber)) {
      if (Math.abs(newValue - currentValueNumber) < 5) return;
    }

    swiper.el.style.setProperty('--expo-padding', `${newValue}px`);
  };

  on('init', setSize);
  on('resize', setSize);
  on('update', setSize);

  effectInit({
    effect: 'expo',
    swiper,
    on,
    setTranslate,
    setTransition,
    perspective: () => true,
    overwriteParams: () => ({
      // resizeObserver: false,
      centeredSlides: true,
      slidesPerGroup: 1,
      watchSlidesProgress: true,
    }),
  });
}
