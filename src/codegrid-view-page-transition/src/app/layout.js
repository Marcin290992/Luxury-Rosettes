import "./globals.css";
import ReactLenis from "lenis/react";

import Navbar from "@/components/Navbar";

export const metadata = {
  title: "View Transition API | Codegrid",
  description: "View Transition API | Codegrid",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ReactLenis root />
        <Navbar />
        {children}
      </body>
    </html>
  );
}
