/// <reference types="astro/client" />

declare module 'swiper' {
	import Swiper from 'swiper/types';
	export default Swiper;
	export * from 'swiper/types';
}

declare module 'swiper/modules' {
	export { Navigation, Pagination, Autoplay, EffectFade, EffectCube, EffectCoverflow, EffectFlip, EffectCreative, EffectCards, Scrollbar, Thumbs, FreeMode, Grid, Manipulation, Parallax, Zoom, Controller, A11y, History, HashNavigation, Virtual, Keyboard, Mousewheel } from 'swiper/types';
}

declare module 'swiper/css' {
	const css: string;
	export default css;
}

declare module 'swiper/css/navigation' {
	const css: string;
	export default css;
}

declare module 'swiper/css/pagination' {
	const css: string;
	export default css;
}
