"use client";

import { useEffect } from "react";

/**
 * Sets the body background to the SWM dark navy for all routes in the (swm)
 * layout group. This overrides the white body color from globals.css so that
 * scrolling past content or during page transitions never flashes white.
 */
export function SwmBodyColor() {
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#0F1E30";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);
  return null;
}
