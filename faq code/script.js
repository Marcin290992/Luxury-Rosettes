import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis();
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

document.querySelectorAll(".faq-message").forEach((message) => {
  const faqRow = message.parentElement;
  const typingIndicator = message.querySelector(".typing-indicator");
  const messageCopy = message.querySelectorAll(".faq-content p");

  const expandedWidth = message.offsetWidth;
  message.style.width = `${expandedWidth}px`;
  const expandedHeight = message.offsetHeight;
  faqRow.style.minHeight = `${expandedHeight}px`;

  gsap.set(message, {
    width: 64,
    height: 64,
    borderRadius: "50%",
    padding: 0,
    scale: 0,
  });

  let collapseWhenDone = false;

  const enterTimeline = gsap.timeline({ paused: true });

  enterTimeline.to(message, {
    scale: 1,
    duration: 0.3,
    ease: "power2.out",
  });

  const expandTimeline = gsap.timeline({
    paused: true,
    onReverseComplete: () => {
      if (collapseWhenDone) {
        collapseWhenDone = false;
        enterTimeline.reverse();
      }
    },
  });

  expandTimeline
    .to(typingIndicator, {
      autoAlpha: 0,
      duration: 0.2,
    })

    .to(message, {
      width: expandedWidth,
      borderRadius: "2rem",
      paddingLeft: "2rem",
      paddingRight: "2rem",
      duration: 0.4,
      ease: "power3.inOut",
    })

    .to(
      message,
      {
        height: expandedHeight,
        paddingTop: "1.5rem",
        paddingBottom: "1.5rem",
        duration: 0.4,
        ease: "power3.inOut",
      },
      "-=0.2",
    )

    .to(
      messageCopy,
      {
        opacity: 1,
        duration: 0.3,
        stagger: 0.05,
      },
      "-=0.25",
    );

  ScrollTrigger.create({
    trigger: message,
    start: "top 85%",
    onEnter: () => {
      collapseWhenDone = false;
      enterTimeline.play();
    },
    onLeaveBack: () => {
      if (expandTimeline.progress() > 0) {
        collapseWhenDone = true;
      } else {
        enterTimeline.reverse();
      }
    },
  });

  ScrollTrigger.create({
    trigger: message,
    start: "top 75%",
    onEnter: () => expandTimeline.play(),
    onLeaveBack: () => expandTimeline.reverse(),
  });
});
