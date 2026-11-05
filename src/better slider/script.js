const totalSlides = 10;
const slideImages = Array.from(
  { length: totalSlides },
  (_, i) => `/img${i + 1}.jpg`,
);
const slideTitles = [
  "Silent Bloom",
  "Tin Vessel",
  "Iris Study",
  "The Observer",
  "Soft Static",
  "Blue Descent",
  "Still Life No.7",
  "Nape",
  "Voltage",
  "Distant Wall",
];

const slider = document.querySelector(".slider");
const stage = document.querySelector(".stage");
const orbit = document.querySelector(".orbit");
const previewBox = document.querySelector(".preview");
const titleTag = document.querySelector(".title");

const orbitRadius = 400;
const angleBetweenSlides = 360 / totalSlides;

slideImages.forEach((imageSrc, slideNumber) => {
  const slide = document.createElement("div");
  slide.className = "panel";
  slide.innerHTML = `<img src="${imageSrc}" alt="" />`;
  const angle = slideNumber * angleBetweenSlides;
  slide.style.transform = `rotateY(${angle}deg) translateZ(${orbitRadius}px)`;
  orbit.appendChild(slide);
});

const previewImage = document.createElement("img");
previewImage.className = "preview-img";
previewImage.src = slideImages[0];
previewBox.appendChild(previewImage);

const lerp = (from, to, amount) => from + (to - from) * amount;
const smoothing = 0.05;

let targetRotation = 0;
let currentRotation = 0;

window.addEventListener(
  "wheel",
  (e) => {
    targetRotation -= e.deltaY * 0.2;
  },
  { passive: true },
);

let shownIndex = 0;

function showActiveSlide() {
  const steps = Math.round(-currentRotation / angleBetweenSlides);
  const activeIndex = ((steps % totalSlides) + totalSlides) % totalSlides;

  if (activeIndex !== shownIndex) {
    shownIndex = activeIndex;
    previewImage.src = slideImages[activeIndex];
    titleTag.textContent = slideTitles[activeIndex];
  }
}

const maxTilt = 30;
let targetTiltX = 0;
let targetTiltY = 0;
let currentTiltX = 0;
let currentTiltY = 0;

slider.addEventListener("mousemove", (e) => {
  const distanceFromCenterX = e.clientX / window.innerWidth - 0.5;
  const distanceFromCenterY = e.clientY / window.innerHeight - 0.5;
  targetTiltY = distanceFromCenterX * maxTilt;
  targetTiltX = -distanceFromCenterY * maxTilt;
});

slider.addEventListener("mouseleave", () => {
  targetTiltX = 0;
  targetTiltY = 0;
});

function updateTilt() {
  currentTiltX = lerp(currentTiltX, targetTiltX, smoothing);
  currentTiltY = lerp(currentTiltY, targetTiltY, smoothing);
  stage.style.transform = `rotateX(${currentTiltX}deg) rotateY(${currentTiltY}deg)`;
}

function animate() {
  currentRotation = lerp(currentRotation, targetRotation, smoothing);
  orbit.style.transform = `translate(-50%, -50%) rotateY(${currentRotation}deg)`;
  previewBox.style.transform = `translate(-50%, -50%) rotateY(${-currentRotation}deg)`;
  showActiveSlide();
  updateTilt();
  requestAnimationFrame(animate);
}

animate();
