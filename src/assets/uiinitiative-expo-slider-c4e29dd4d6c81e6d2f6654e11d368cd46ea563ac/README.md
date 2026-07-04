# Expo Slider

Expo Slider is a parallax & scale effects slider template (based on [Swiper](https://swiperjs.com)).

It can be easily integrated into your [Framework7](https://framework7.io) or [Ionic](https://ionicframework.com) app as Swiper already integrated into these frameworks.

## Features

- it is based on [Swiper](https://swiperjs.com), so it supports all Swiper features
- any content can be placed within slides
- can be actually any size (aspect ratio)
- designed mostly to be used with at least `slidesPerView: 1.5` (like in the demo) but other values are also supported

## Known Limitations

- `slidesPerView: "auto"` is not supported with this effect
- effects forces `centeredSlides` to be enabled (like in the demo)

## Package

In the package you will find:

- static demo - using plain HTML, CSS, and JS
- modules demo - project using ES modules created with Vite
- all required extra styles
- all required JavaScript to make it work
- instructions on how to build, run and preview the project

## Swiper Studio

This effect is also available in [Swiper Studio](https://studio.swiperjs.com)

<!-- STORE_END -->

## Project Structure

This project uses [Vite](https://vitejs.dev) for development and bundling the production build.

- `/demo-static/` - folder with static demo using plain HTML, CSS and JS files
- `/demo-vite/` - folder with `.html`, `.js`, `.css` source files. These files are processed by Vite during development, and will be bundled on production build.
- `/dist/` - folder with Expo Effect scripts and sources
- `/assets/` - folder with static assets (usually images) which are not processed by Vite during development, but still will be bundled on production build.
- `/www/` - folder with production build bundled with Vite (this folder will appear when you run a command to create production build).

## Usage

### HTML Layout

Check `./demo-vite/index.html` (or `./demo-static/index.html`) for required HTML layout

### In Browser Environment

You need to include Expo Effect scripts and styles in addition to Swiper scripts and styles from the (`./dist/` folder), e.g.

```html
<head>
  <!-- Swiper styles -->
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/swiper@12/swiper-bundle.min.css"
  />
  <!-- Expo Effect styles -->
  <link rel="stylesheet" href="path/to/effect-expo.min.css" />
</head>

<body>
  <div id="app">
    <!-- Expo slider -->
    <div class="swiper">
      <!-- ... -->
    </div>
  </div>
  <!-- Swiper script -->
  <script src="https://cdn.jsdelivr.net/npm/swiper@12/swiper-bundle.min.js"></script>
  <!-- Expo effect script -->
  <script src="path/to/effect-expo.min.js"></script>
</body>
```

### In ESM Environment

In environment with ES modules support (webpack, Vite, rollup, etc.), you can just import `effect-expo.esm.js` and `effect-expo.css` (or `effect-expo.css`) from the `./dist/` folder, e.g.:

```js
// import Expo effect module
import EffectExpo from './effect-expo.esm.js';
// import Expo effect styles
import './effect-expo.css';
```

### Initialization

After you included (or imported) required Expo Effect scripts and styles and have the required layout, you need to pass Expo Effect module to Swiper constructor and set effect to `'expo'`:

In browser environment:

```html
<head>
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/swiper@12/swiper-bundle.min.css"
  />
  <link rel="stylesheet" href="path/to/effect-expo.min.css" />
</head>

<body>
  <div id="app">
    <!-- Expo slider -->
    <div class="swiper">
      <!-- ... -->
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/swiper@12/swiper-bundle.min.js"></script>
  <script src="path/to/effect-expo.min.js"></script>
  <!-- Init Expo Effect -->
  <script>
    const swiper = new Swiper({
      // pass EffectExpo module to modules
      modules: [EffectExpo],
      // specify "expo" effect
      effect: 'expo',
      // expo effect parameters
      expoEffect: {
        rotate: 30,
      },
      // other parameters
    });
  </script>
</body>
```

In ESM environment:

```js
import Swiper, { Autoplay, Navigation, Pagination } from 'swiper';
import EffectExpo from './effect-expo.esm.js';
import './effect-expo.css';
import './main.css';

// Init Expo Effect
const swiper = new Swiper({
  // pass EffectExpo module to modules
  modules: [Autoplay, Navigation, Pagination, EffectExpo],
  // specify "expo" effect
  effect: 'expo',
  // expo effect parameters
  expoEffect: {
    rotate: 30,
  },
  // other parameters
});
```

## Expo Effect Parameters

You can pass Expo effect parameters in the `expoEffect` object in Swiper parameters. There are following parameters available:

| Property    | Type    | Default | Description                                                                                       |
| ----------- | ------- | ------- | ------------------------------------------------------------------------------------------------- |
| imageScale  | Number  | `1.125` | Image scale multiplier, `1.125` is minimum                                                        |
| imageOffset | Number  | `1.25`  | image offset multiplier, recommended to increase for slidesPerView > 2 for better parallax effect |
| scale       | Number  | `1.25`  | side slides scale multiplier, `1.25` is the minimum                                               |
| rotate      | Number  | `0`     | side slides rotate angle (in degrees)                                                             |
| grayscale   | Boolean | `true`  | side slides grayscale effect                                                                      |

## Dependencies

First of all, we need to install all dependencies, run in terminal:

```
npm i
```

## Development

To launch development server (with hot reload), run the following command in terminal:

```
npm run dev
```

And the project will be available at [http://localhost:3000](http://localhost:3000)

## Production Build

To create a production build, run the following command in terminal:

```
npm run build
```

And production-ready project will be available in `/dist/` folder.

## Connect to Git

It is possible to connect this project folder to the new repository. For example for GitHub:

1. Create new GitHub repository at https://github.com/new

2. Initialize Git. In terminal run:

   ```
   git init
   ```

3. Add remote origin. Replace $USERNAME and $REPOSITORY with your GitHub username and newly created repository name:
   ```
   git remote add origin https://github.com/$USERNAME/$REPOSITORY.git
   ```

That is all, after that you can track, commit and push/pull to repo, for example:

```
git add .
git commit -m "initial commit"
git push origin master
```
