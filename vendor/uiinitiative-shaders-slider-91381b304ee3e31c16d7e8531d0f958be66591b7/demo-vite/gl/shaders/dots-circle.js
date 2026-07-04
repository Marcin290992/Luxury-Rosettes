import { fragmentCommon } from './shadersCommon';

export const dotsCircle = {
  uniforms: {},
  fragment: /* glsl */ `
    ${fragmentCommon}
    const float SQRT_2 = 1.414213562373;
    // Center should be 0.5, 0.5 for UV space
    const vec2 center = vec2(0.5, 0.5);
    const float dots = 20.0;// = 20.0;

    vec4 getFromColor(vec2 p) {
      return texture2D(texture1, p);
    }

    vec4 getToColor(vec2 p) {
      return texture2D(texture2, p);
    }

    void main()	{
      float aspect = resolution.x / resolution.y;
      // Screen-corrected UVs for dot pattern calculation (makes dots appear square on screen)
      vec2 screenUV = (vUv - center) * vec2(aspect, 1.0) + center;

      // Aspect-corrected UVs for texture sampling (using resolution uniform)
      vec2 newUV = (vUv - vec2(0.5))*resolution.zw + vec2(0.5);

      // Calculate overall distance threshold using original vUv for a circular boundary
      float dist = distance(vUv, center); // center is (0.5, 0.5)

      // Calculate dot pattern distance using screen-corrected UVs for screen-square dots
      float dotPatternDist = distance(fract(screenUV * dots), vec2(0.5, 0.5));

      // Compare dot pattern distance (screen-square dots) with circular threshold boundary
      bool nextImage = dotPatternDist < ( progress / dist );

      // Sample textures using aspect-corrected newUV
      gl_FragColor = nextImage ? getToColor(newUV) : getFromColor(newUV);
    }

  `,
};
