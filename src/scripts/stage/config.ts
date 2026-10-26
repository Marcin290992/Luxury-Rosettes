// Timeline layout of the story stage, shared by the laptop and the phone versions.

// ---- timeline layout (seconds; the scroll distance is PX_PER_SEC × total length) -----------------
export const PX_PER_SEC = 520; // higher = the whole sequence is spread over more scrolling (slower)
export const ZOOM = 2.4; // zoom into the eye
export const WASH = 1.7; // cream wash starts (ends with the zoom)
export const INTRO = ZOOM + 0.25; // photos + text enter only once the screen is fully cream — never over the eye, in either direction
export const FIRST_STEP = 4.2; // when step 01 → 02 starts
export const STEP_GAP = 2.4; // distance between transitions
export const STEP_DUR = 1.6;
export const HOLD_END = 9; // step 03 stays until here; the last screen of the pin is the next section covering it

