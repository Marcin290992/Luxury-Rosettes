"use client";

import { ViewTransition } from "react";

export default function Template({ children }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
