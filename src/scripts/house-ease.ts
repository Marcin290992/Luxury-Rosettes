// The site's own signature curve for the About page: it starts slowly, picks up hard and settles for a long time. One curve for every reveal of a page
// makes the whole page feel like one hand (the idea, not the code, of a page whose easing was measured: see settings.ts HOUSE_EASE).
// Importing this module registers it; use the exported name wherever GSAP takes an `ease`.

import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { HOUSE_EASE } from './settings';

gsap.registerPlugin(CustomEase);
CustomEase.create(HOUSE_EASE.name, HOUSE_EASE.curve);

export const HOUSE = HOUSE_EASE.name;
