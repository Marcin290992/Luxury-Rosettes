// The three curves the "Lumen" pieces use everywhere (cubic-bezier control points). Importing this module registers them with GSAP;
// use the exported names wherever GSAP takes an `ease`.

import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);

CustomEase.create('lumenQuart', '0.77,0,0.18,1');
CustomEase.create('lumenSine', '0.45,0.05,0.55,0.95');
CustomEase.create('lumenCubic', '0.65,0.05,0.36,1');

export const QUART = 'lumenQuart';
export const SINE = 'lumenSine';
export const CUBIC = 'lumenCubic';
