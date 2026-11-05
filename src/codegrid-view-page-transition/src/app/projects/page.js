"use client";

import { ReactLenis } from "lenis/react";

const Projects = () => {
  return (
    <ReactLenis className="projects" options={{ wrapper: undefined }}>
      <div className="projects-container">
        <div className="images">
          <img src="/img1.jpeg" alt="" />
          <img src="/img2.jpeg" alt="" />
          <img src="/img3.jpeg" alt="" />
          <img src="/img4.jpeg" alt="" />
        </div>
      </div>
    </ReactLenis>
  );
};

export default Projects;
