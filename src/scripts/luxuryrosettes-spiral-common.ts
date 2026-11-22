// Small things shared by the pieces of the Luxury Rosettes spiral (luxuryrosettes-spiral.ts): the shape of a card, and the ribbon's shader.
// The photos are cropped to cover: `uCrop` = (scale x, scale y, offset x, offset y) in the photo's own uv.

export const ASPECT = 568 / 812; // height / width of a photo in the grid (and of the ribbon)

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export const FRAG_RIBBON = `
uniform sampler2D map; uniform vec4 uCrop; varying vec2 vUv;
void main(){
  vec2 uv = vUv;
  if (gl_FrontFacing) uv.x = 1.0 - uv.x;
  gl_FragColor = texture2D(map, uv * uCrop.xy + uCrop.zw);
}`;
