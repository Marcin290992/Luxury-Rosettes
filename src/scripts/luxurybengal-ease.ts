// The three curves the "Luxury Bengal" pieces use everywhere (cubic-bezier control points). Importing this module registers them with GSAP;
// use the exported names wherever GSAP takes an `ease`.

import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);

CustomEase.create('luxuryBengalQuart', '0.77,0,0.18,1');
CustomEase.create('luxuryBengalSine', '0.45,0.05,0.55,0.95');
CustomEase.create('luxuryBengalCubic', '0.65,0.05,0.36,1');

export const QUART = 'luxuryBengalQuart';
export const SINE = 'luxuryBengalSine';
export const CUBIC = 'luxuryBengalCubic';
