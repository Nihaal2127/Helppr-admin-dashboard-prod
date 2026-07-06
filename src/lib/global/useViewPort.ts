import { useState, useEffect } from "react";

const RESIZE_THROTTLE_MS = 150;

const useViewport = () => {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 0
  );

  useEffect(() => {
    let rafId = 0;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    const applyWidth = () => {
      rafId = 0;
      setWidth(window.innerWidth);
    };

    const handleWindowResize = () => {
      if (throttleTimer != null) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        if (rafId) return;
        rafId = window.requestAnimationFrame(applyWidth);
      }, RESIZE_THROTTLE_MS);
    };

    window.addEventListener("resize", handleWindowResize, { passive: true });
    return () => {
      window.removeEventListener("resize", handleWindowResize);
      if (throttleTimer != null) clearTimeout(throttleTimer);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return {
    width,
    /** Kept for callers that destructure height; avoids resize-driven re-renders. */
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  };
};

export { useViewport };
