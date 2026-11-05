"use client";
import { useRef } from "react";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SplitText } from "gsap/all";

gsap.registerPlugin(useGSAP, SplitText);

const Info = () => {
  const container = useRef();

  useGSAP(
    () => {
      const split = new SplitText(".info p", {
        type: "lines",
        mask: "lines",
        linesClass: "line",
      });

      gsap.set(".line", { y: 400 });

      gsap.to(".line", {
        y: 0,
        duration: 2,
        stagger: 0.1,
        ease: "power4.out",
        delay: 0.5,
      });
    },
    { scope: container },
  );

  return (
    <div className="info" ref={container}>
      <div className="col">
        <img src="/portrait.jpeg" alt="" />
      </div>
      <div className="col">
        <p>
          Kaelon is a portrait photographer who captures striking and artistic
          images. His work focuses on light, shadow, and movement, creating
          portraits that feel both modern and timeless. With a minimal and moody
          style, he brings out raw emotion and unique beauty in every subject.
        </p>
      </div>
    </div>
  );
};

export default Info;
