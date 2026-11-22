// The photos of the Luxury Rosettes spiral as textures, cropped to cover.
// The canvas stays invisible until every photo is loaded, decoded and uploaded to the GPU, and then fades in. On a first visit (nothing cached) the
// nine 1200px photos used to be decoded and uploaded all at once in the first frames, and on a phone that heavy moment showed as a blurred, doubled
// picture. So each photo is decoded off the main thread and the uploads are one per frame.

import * as THREE from 'three';
import { ASPECT } from './luxuryrosettes-spiral-common';

export interface Photos {
  textures: THREE.Texture[];
  /** One crop per photo, filled in as the photos load (uniform objects, shared with the materials). */
  crops: Array<{ value: THREE.Vector4 }>;
  dispose(): void;
}

/** `onReady` is called once, when every photo is on the GPU (or after a long safety delay, for a request that never finishes). */
export function loadPhotos(renderer: THREE.WebGLRenderer, urls: string[], onReady: () => void): Photos {
  const crops = urls.map(() => ({ value: new THREE.Vector4(1, 1, 0, 0) }));
  const setCrop = (i: number, img: { width: number; height: number }) => {
    const photo = img.width / img.height;
    const want = 1 / ASPECT;
    if (photo > want) crops[i].value.set(want / photo, 1, (1 - want / photo) / 2, 0);
    else crops[i].value.set(1, photo / want, 0, (1 - photo / want) / 2);
  };

  let gone = false; // set when the scene is taken down: nothing may touch the renderer after that
  let ready = false;
  const ready1 = () => {
    if (ready || gone) return;
    ready = true;
    onReady();
  };
  // Safety only: it must be much longer than the photos can take on a slow mobile connection (nine photos of ~150 KB on a first visit). With
  // 1.5 s here the canvas came up on a phone before the photos had arrived, and they popped in over each other.
  const safety = window.setTimeout(ready1, 10000);

  const upload = (list: THREE.Texture[]) => {
    let i = 0;
    const step = () => {
      if (gone) return;
      if (i >= list.length) return ready1();
      try {
        renderer.initTexture(list[i++]); // uploads this one texture now, so the first real frame has nothing left to upload
      } catch {
        /* it is drawn (and uploaded) by the first frame instead */
      }
      requestAnimationFrame(step);
    };
    step();
  };

  const textures: THREE.Texture[] = [];
  let waiting = urls.length;
  const loader = new THREE.TextureLoader();
  urls.forEach((url, i) => {
    const done = () => {
      if (--waiting === 0) upload(textures);
    };
    const texture = loader.load(
      url,
      (t) => {
        const img = t.image as HTMLImageElement;
        setCrop(i, img);
        Promise.resolve(img.decode?.()).catch(() => {}).then(done); // decoded off the main thread before it is uploaded
      },
      undefined,
      done,
    );
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    textures[i] = texture;
  });

  return {
    textures,
    crops,
    dispose() {
      gone = true;
      window.clearTimeout(safety);
      textures.forEach((t) => t.dispose());
    },
  };
}
